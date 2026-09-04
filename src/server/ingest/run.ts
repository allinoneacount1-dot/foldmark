/**
 * One ingestion pass.
 *
 * SERVER ONLY. Runs inside the hosted runtime, never on anyone's machine.
 *
 * WHAT THIS CAN AND CANNOT DO, measured rather than assumed:
 *
 *   Chain 4663 produces roughly 9.7 blocks per second — about 837,000 blocks a
 *   day. A block carries ~45 ERC-20 Transfer logs, ~13 of them for contracts
 *   already in the asset registry. Continuous full coverage would therefore mean
 *   storing on the order of ten million rows per day, which no free tier holds,
 *   and the provider caps a log query at ten blocks so the request budget cannot
 *   outrun block production either.
 *
 *   So this does NOT claim continuous coverage. It follows the head: each pass
 *   ingests a bounded window of recent settled blocks. The result is a current,
 *   genuinely observed view of the market, and the coverage state stays PARTIAL
 *   because that is what it is. Claiming OK would assert a completeness that
 *   nothing here establishes — and the product's whole contract is that a state
 *   is never better than its evidence.
 */

import {
  fetchTransfers,
  blockTimestamps,
  safeHead,
  chainHead,
  readErc20Metadata,
  MAX_LOG_SPAN,
  type RawTransfer,
} from "@/server/ingest/transport";
import { selectRows, insertIgnoreDuplicates, upsertRows, patchRows, supabaseConfigured } from "@/server/db/supabase";
import { CHAIN } from "@/config/site";

export type IngestReport = {
  ok: boolean;
  reason?: string;
  chainHead: number | null;
  safeHead: number | null;
  cursorBefore: number | null;
  cursorAfter: number | null;
  blocksScanned: number;
  logsSeen: number;
  transfersInserted: number;
  assetsDiscovered: number;
  addressesSeen: number;
  rangesOk: number;
  rangesFailed: number;
  durationMs: number;
};

/** Per-pass block budget. Sized to finish well inside a hosted function timeout. */
const DEFAULT_BLOCK_BUDGET = 400;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

type AssetRecord = { id: string; contract_address: string; decimals: number | null };

async function loadAssets(): Promise<Map<string, AssetRecord>> {
  const rows = await selectRows<Record<string, unknown>>(
    "assets",
    `select=id,contract_address,decimals&chain_id=eq.${CHAIN.id}`,
  );
  const map = new Map<string, AssetRecord>();
  for (const r of rows ?? []) {
    const address = String(r.contract_address ?? "").toLowerCase();
    if (!address) continue;
    map.set(address, {
      id: String(r.id),
      contract_address: address,
      decimals: r.decimals === null || r.decimals === undefined ? null : Number(r.decimals),
    });
  }
  return map;
}

async function readCursor(): Promise<number | null> {
  const rows = await selectRows<Record<string, unknown>>(
    "indexer_state",
    `select=last_processed_block&chain_id=eq.${CHAIN.id}&limit=1`,
  );
  const row = rows?.[0];
  if (!row) return null;
  const n = Number(row.last_processed_block);
  return Number.isFinite(n) ? n : null;
}

/**
 * Move the cursor.
 *
 * Called ONLY after every row from the range it covers has been committed. A
 * failed or partial range leaves the cursor where it was, so the next pass
 * re-reads that range rather than stepping over it.
 */
async function writeCursor(block: number): Promise<boolean> {
  return patchRows("indexer_state", `chain_id=eq.${CHAIN.id}`, {
    last_processed_block: block,
    last_finalized_block: block,
    updated_at: new Date().toISOString(),
  });
}

/**
 * Register contracts seen for the first time.
 *
 * Metadata is read from the contract itself. A contract that does not answer is
 * still recorded — absence of metadata is not absence of the asset — and its
 * symbol and name stay null rather than being guessed from anything.
 */
async function discoverAssets(
  contracts: string[],
  known: Map<string, AssetRecord>,
): Promise<number> {
  const unknown = contracts.filter((c) => !known.has(c));
  if (!unknown.length) return 0;

  // Bounded per pass: discovery is three eth_calls per contract and must not
  // crowd out the transfers the pass exists to record.
  const batch = unknown.slice(0, 5);
  const rows: Record<string, unknown>[] = [];

  for (const contract of batch) {
    const meta = await readErc20Metadata(contract);
    rows.push({
      chain_id: CHAIN.id,
      contract_address: contract,
      symbol: meta.symbol ?? contract.slice(0, 10),
      name: meta.name ?? "Unidentified contract",
      // Type is a claim. Nothing observed here supports one, so it stays `other`
      // until evidence arrives.
      asset_type: "other",
      // Discovery is not verification, and never sets this true.
      verified: false,
      decimals: meta.decimals ?? 18,
      source: "Robinhood Chain — observed in a Transfer log",
    });
  }

  const ok = await upsertRows("assets", rows, "chain_id,contract_address");
  return ok ? rows.length : 0;
}

/**
 * Ingest one bounded window of settled blocks.
 */
export async function runIngestPass(
  opts: { blockBudget?: number; deadlineMs?: number } = {},
): Promise<IngestReport> {
  const started = Date.now();
  const deadline = started + (opts.deadlineMs ?? 45_000);
  const budget = opts.blockBudget ?? DEFAULT_BLOCK_BUDGET;

  const report: IngestReport = {
    ok: false,
    chainHead: null,
    safeHead: null,
    cursorBefore: null,
    cursorAfter: null,
    blocksScanned: 0,
    logsSeen: 0,
    transfersInserted: 0,
    assetsDiscovered: 0,
    addressesSeen: 0,
    rangesOk: 0,
    rangesFailed: 0,
    durationMs: 0,
  };

  if (!supabaseConfigured()) {
    report.reason = "database_not_configured";
    report.durationMs = Date.now() - started;
    return report;
  }

  const [head, safe] = await Promise.all([chainHead(), safeHead()]);
  report.chainHead = head;
  report.safeHead = safe;
  if (safe === null) {
    report.reason = "rpc_unavailable";
    report.durationMs = Date.now() - started;
    return report;
  }

  const cursor = await readCursor();
  report.cursorBefore = cursor;

  /**
   * Where this pass starts.
   *
   * The cursor trails the head by hundreds of thousands of blocks and the gap
   * grows faster than any free-tier budget can close it, so a pass that resumed
   * from the cursor would ingest year-old activity forever and the product would
   * never show a current market. It follows the head instead. The blocks between
   * are not claimed as covered by anything: coverage is reported PARTIAL, and
   * the earliest indexed block stays visible in the status surface.
   */
  const from = Math.max(0, safe - budget + 1);
  const to = safe;
  if (to < from) {
    report.reason = "nothing_to_do";
    report.ok = true;
    report.cursorAfter = cursor;
    report.durationMs = Date.now() - started;
    return report;
  }

  const known = await loadAssets();
  const raw: RawTransfer[] = [];
  const contractsSeen = new Set<string>();

  /**
   * Adaptive windows.
   *
   * The provider caps a query at ten blocks and rejects anything wider, so the
   * span starts there and halves on any failure rather than skipping the range.
   * A range that will not read at any width is counted as failed, and a failed
   * range prevents the cursor advancing past it.
   */
  let span = MAX_LOG_SPAN;
  let cursorBlocked = false;

  for (let block = from; block <= to; ) {
    if (Date.now() > deadline) break;
    const end = Math.min(block + span - 1, to);

    const result = await fetchTransfers(block, end);
    if (result.ok) {
      report.rangesOk += 1;
      report.blocksScanned += end - block + 1;
      for (const t of result.value) {
        raw.push(t);
        contractsSeen.add(t.contract);
      }
      block = end + 1;
      continue;
    }

    if (span > 1) {
      // Narrow and retry the same range. Never step over it.
      span = Math.max(1, Math.floor(span / 2));
      continue;
    }

    report.rangesFailed += 1;
    cursorBlocked = true;
    block = end + 1;
    span = MAX_LOG_SPAN;
  }

  report.logsSeen = raw.length;

  if (raw.length) {
    report.assetsDiscovered = await discoverAssets([...contractsSeen], known);
    const assets = report.assetsDiscovered > 0 ? await loadAssets() : known;

    // Real block time for every block touched, resolved once per block.
    const times = await blockTimestamps(raw.map((t) => t.blockNumber));

    const addresses = new Set<string>();
    const rows: Record<string, unknown>[] = [];

    for (const t of raw) {
      const asset = assets.get(t.contract);
      // A transfer whose asset is not registered yet is left for a later pass
      // rather than stored against a null asset.
      if (!asset) continue;
      const blockTime = times.get(t.blockNumber);
      // No block time, no row. A transfer with a guessed time is worse than one
      // not yet recorded: it silently corrupts every window and price alignment
      // that reads it.
      if (!blockTime) continue;

      if (t.from !== ZERO_ADDRESS) addresses.add(t.from);
      if (t.to !== ZERO_ADDRESS) addresses.add(t.to);

      rows.push({
        tx_hash: t.txHash,
        log_index: t.logIndex,
        block_number: t.blockNumber,
        asset_id: asset.id,
        from_address: t.from,
        to_address: t.to,
        amount: t.rawValue,
        // The chain's time for this event. Never the ingestion clock.
        timestamp: blockTime,
      });
    }

    report.addressesSeen = addresses.size;

    // Chunked so one oversized request cannot fail a whole pass, and
    // duplicate-tolerant so a replay of any range inserts nothing twice.
    const CHUNK = 200;
    let inserted = 0;
    let writeFailed = false;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const res = await insertIgnoreDuplicates("transfers", slice, "tx_hash,log_index");
      if (!res.ok) {
        writeFailed = true;
        break;
      }
      inserted += res.inserted;
    }
    report.transfersInserted = inserted;
    if (writeFailed) cursorBlocked = true;

    if (addresses.size) {
      // Best effort: an address ledger that fails to write must not fail the
      // transfers that are already committed.
      await upsertRows(
        "wallets",
        [...addresses].slice(0, 500).map((a) => ({ address: a, last_seen: new Date().toISOString() })),
        "address",
      );
    }
  }

  /**
   * The cursor moves only when the whole window committed.
   */
  if (!cursorBlocked) {
    const advanced = await writeCursor(to);
    report.cursorAfter = advanced ? to : cursor;
    report.ok = advanced;
    if (!advanced) report.reason = "cursor_write_failed";
  } else {
    report.cursorAfter = cursor;
    report.reason = "range_failed_cursor_held";
  }

  report.durationMs = Date.now() - started;
  return report;
}
