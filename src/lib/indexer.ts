import { createPublicClient, http, parseAbi, parseAbiItem, type Log } from "viem";
import { robinhoodChain } from "@/lib/wagmi";
import { db, query, isDatabaseConfigured } from "@/server/db/client";
import {
  activeEndpoint as activeRpcEndpoint,
  clampToServableRange,
  isArchiveRefusal,
  ArchiveRangeRefused,
} from "@/server/market-data/providers/rpc";
import { WINDOW_MS, WINDOWS } from "@/config/site";
import { fromBaseUnits } from "@/lib/format";

const TRANSFER_EVENT = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const ERC20_ABI = parseAbi([
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
]);

/**
 * A contract whose own name() carries this marker LOOKS like a Robinhood Stock
 * Token. It is not proof: anyone can deploy an ERC-20 called
 * "NVIDIA • Robinhood Token". A match makes a contract a CANDIDATE, never
 * VERIFIED — see registerCandidate below.
 */
const STOCK_TOKEN_NAME_MARKER = "robinhood token";

/**
 * Logs accepted per sub-range before the range is split.
 *
 * This is a splitting threshold, not a truncation limit. The previous code did
 * `logs.slice(0, 500)` and then advanced the cursor to the end of the range,
 * which silently discarded every log past the five hundredth while claiming the
 * range had been processed. A cursor that has passed unprocessed data is worse
 * than no cursor at all.
 */
const SPLIT_THRESHOLD = 400;
/** Guards against pathological splitting on a single very busy block. */
const MIN_CHUNK_BLOCKS = 1;
const MAX_DISCOVERY_PER_RUN = 3;
/** Addresses per window written to flow_windows. Ranked by observed value moved. */
const FLOW_TOP_N = 200;

/**
 * Rows per INSERT statement.
 *
 * Postgres accepts at most 65535 bound parameters in one statement, and every
 * value here is bound rather than spliced into the text. Chunking keeps the
 * parameter count far below that ceiling no matter how dense a block range
 * turns out to be.
 */
const INSERT_CHUNK_ROWS = 500;

type TransferLog = Log<bigint, number, false, typeof TRANSFER_EVENT>;
type Client = ReturnType<typeof createPublicClient>;

/** An asset as the indexer needs it: identity, address, and its unit scale. */
type KnownAsset = { id: string; contract_address: string; decimals: number };

export type IndexerResult = {
  status: "INDEXED" | "NOTHING_SERVABLE";
  requestedFrom: number;
  fromBlock: number;
  /** The last block that is FULLY processed. The cursor never passes this. */
  toBlock: number;
  head: number;
  /** Blocks abandoned because a free endpoint will not serve their logs. */
  gapBlocks: number;
  logQueryError: string | null;
  chunks: number;
  logs: number;
  inserted: number;
  discovered: number;
  /** Transfers recovered for a contract discovered during this run. */
  backfilled: number;
  flows: { windows: number; addresses: number; skipped: boolean };
};

/* ------------------------------------------------------------ sql utilities */

/**
 * Placeholders for a multi-row VALUES list: `($1, $2, ...), ($3, $4, ...)`.
 *
 * The generated text contains only positions. Every actual value travels in the
 * params array, so there is no path here by which a chain-supplied address or
 * amount could become SQL text.
 */
function valuesPlaceholders(rowCount: number, columnCount: number): string {
  const tuples: string[] = [];
  for (let r = 0; r < rowCount; r += 1) {
    const cells: string[] = [];
    for (let c = 0; c < columnCount; c += 1) cells.push(`$${r * columnCount + c + 1}`);
    tuples.push(`(${cells.join(", ")})`);
  }
  return tuples.join(", ");
}

function chunkRows<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/* -------------------------------------------------------------- log reading */

/**
 * Read logs across a range, splitting until every sub-range is small enough to
 * come back whole.
 *
 * The contract this upholds: either a sub-range is returned completely, or it
 * is not returned at all. Nothing is ever half-read, because the caller uses
 * the last complete sub-range to place the cursor.
 */
async function readLogsComplete(
  client: Client,
  addresses: `0x${string}`[],
  from: bigint,
  to: bigint,
  depth = 0,
): Promise<{ logs: TransferLog[]; lastComplete: bigint; chunks: number; error: string | null }> {
  if (!addresses.length) return { logs: [], lastComplete: to, chunks: 0, error: null };

  try {
    const logs = (await client.getLogs({ address: addresses, event: TRANSFER_EVENT, fromBlock: from, toBlock: to })) as TransferLog[];

    // A dense range is split rather than truncated, so no log is lost.
    if (logs.length > SPLIT_THRESHOLD && to > from && depth < 8) {
      const mid = from + (to - from) / 2n;
      const left = await readLogsComplete(client, addresses, from, mid, depth + 1);
      if (left.error) return left;
      const right = await readLogsComplete(client, addresses, mid + 1n, to, depth + 1);
      return {
        logs: [...left.logs, ...right.logs],
        lastComplete: right.error ? left.lastComplete : right.lastComplete,
        chunks: left.chunks + right.chunks,
        error: right.error,
      };
    }

    return { logs, lastComplete: to, chunks: 1, error: null };
  } catch (error) {
    if (isArchiveRefusal(error)) {
      return { logs: [], lastComplete: from - 1n, chunks: 0, error: "archive range refused" };
    }
    // A single very busy block cannot be split further; surface it rather than
    // pretending the range was read.
    if (to - from < BigInt(MIN_CHUNK_BLOCKS)) {
      return {
        logs: [],
        lastComplete: from - 1n,
        chunks: 0,
        error: error instanceof Error ? error.message.split("\n")[0].slice(0, 140) : "log query failed",
      };
    }
    const mid = from + (to - from) / 2n;
    const left = await readLogsComplete(client, addresses, from, mid, depth + 1);
    if (left.error) return left;
    const right = await readLogsComplete(client, addresses, mid + 1n, to, depth + 1);
    return {
      logs: [...left.logs, ...right.logs],
      lastComplete: right.error ? left.lastComplete : right.lastComplete,
      chunks: left.chunks + right.chunks,
      error: right.error,
    };
  }
}

/**
 * Block header times for every block that carries an accepted log.
 *
 * Every one, not a capped sample: a log whose block time is unknown cannot be
 * indexed, and if the cursor advanced past it that transfer would be lost for
 * good. So the resolved set decides how far the cursor may go.
 */
async function resolveBlockTimes(
  client: Client,
  blocks: bigint[],
): Promise<{ times: Map<string, string>; unresolved: bigint[] }> {
  const times = new Map<string, string>();
  const unresolved: bigint[] = [];
  const unique = [...new Set(blocks.map((b) => b.toString()))].map((b) => BigInt(b));

  for (let i = 0; i < unique.length; i += 25) {
    const batch = unique.slice(i, i + 25);
    await Promise.all(
      batch.map(async (bn) => {
        try {
          const block = await client.getBlock({ blockNumber: bn });
          times.set(bn.toString(), new Date(Number(block.timestamp) * 1000).toISOString());
        } catch {
          unresolved.push(bn);
        }
      }),
    );
  }
  return { times, unresolved };
}

/* ---------------------------------------------------------------- discovery */

/**
 * Register a contract that looks like a Stock Token.
 *
 * It is recorded as a CANDIDATE. Promotion to VERIFIED requires an
 * authoritative source confirming this exact contract address on this chain,
 * which no wired source currently provides — so nothing is promoted here, and
 * `verified` stays false.
 */
async function registerCandidate(
  client: Client,
  address: string,
): Promise<{ registered: boolean; assetId: string | null }> {
  const sql = db();
  if (!sql) return { registered: false, assetId: null };

  try {
    const [symbol, name] = await Promise.all([
      client.readContract({ address: address as `0x${string}`, abi: ERC20_ABI, functionName: "symbol" }).catch(() => null),
      client.readContract({ address: address as `0x${string}`, abi: ERC20_ABI, functionName: "name" }).catch(() => null),
    ]);
    if (!symbol || !name) return { registered: false, assetId: null };
    if (!String(name).toLowerCase().includes(STOCK_TOKEN_NAME_MARKER)) return { registered: false, assetId: null };

    const decimals = await client
      .readContract({ address: address as `0x${string}`, abi: ERC20_ABI, functionName: "decimals" })
      .catch(() => 18);

    /**
     * Not verified. A name is not an identity.
     *
     * `verified` is deliberately absent from this insert: the database derives
     * it from verification_status in a trigger, so there is one source of truth
     * for the claim rather than two that can disagree.
     *
     * DO NOTHING rather than DO UPDATE — an address already registered keeps
     * whatever verification it has earned; a rediscovery must never demote a
     * VERIFIED asset back to CANDIDATE.
     */
    const inserted = (await sql`
      insert into assets (
        chain_id, contract_address, symbol, name, asset_type,
        verification_status, verification_source, verification_evidence, source, decimals
      ) values (
        ${robinhoodChain.id},
        ${address},
        ${String(symbol).toUpperCase()},
        ${String(name)},
        ${"stock_token"},
        ${"CANDIDATE"},
        ${"on-chain metadata heuristic"},
        ${"The contract's own name() contains the Robinhood Token marker. String similarity is not proof of issuer, so this stays a candidate until an authoritative contract list confirms the address."},
        ${"Discovered on-chain from a Transfer log; identity read from contract metadata."},
        ${Number(decimals) || 18}
      )
      on conflict (chain_id, contract_address) do nothing
      returning id
    `) as { id: string }[];

    const row = inserted[0];
    if (!row) return { registered: false, assetId: null };
    return { registered: true, assetId: String(row.id) };
  } catch {
    return { registered: false, assetId: null };
  }
}

/* ------------------------------------------------------------------ indexer */

export async function runIndexer({
  fromBlock,
  toBlock,
}: {
  fromBlock: bigint;
  toBlock: bigint;
}): Promise<IndexerResult | { error: "DATABASE_NOT_CONFIGURED" }> {
  const sql = db();
  if (!isDatabaseConfigured() || !sql) return { error: "DATABASE_NOT_CONFIGURED" as const };
  const client = createPublicClient({ chain: robinhoodChain, transport: http(activeRpcEndpoint()) });

  const knownAssets = (await sql`
    select id, contract_address, decimals from assets limit 200
  `) as { id: string; contract_address: string; decimals: number | string | null }[];
  const known = new Map<string, KnownAsset>(
    knownAssets.map((a) => [
      String(a.contract_address).toLowerCase(),
      { id: String(a.id), contract_address: String(a.contract_address), decimals: Number(a.decimals ?? 18) },
    ]),
  );

  /**
   * The free endpoint retains roughly 48 blocks of logs and refuses older
   * ranges. A cursor further behind cannot be caught up, so the range is
   * clamped and the abandoned span is reported as an explicit gap rather than
   * the cursor advancing as though it had been read.
   */
  const head = Number(await client.getBlockNumber());
  const servable = clampToServableRange(Number(fromBlock), Number(toBlock), head);
  const gapBlocks = servable.skipped;
  const from = BigInt(servable.from);
  const to = BigInt(servable.to);

  /**
   * Discovery runs BEFORE the main read, and newly registered contracts join
   * the tracked set for this same range.
   *
   * The previous order discovered a contract, inserted it, and advanced the
   * cursor — leaving the very transfer that revealed it behind the cursor,
   * unindexed and now unreachable. Discovering first means that transfer is
   * inside the range that is about to be read.
   */
  let discovered = 0;
  let backfilled = 0;
  const discoveredAddresses: `0x${string}`[] = [];
  try {
    const sample = (await client.getLogs({ event: TRANSFER_EVENT, fromBlock: to, toBlock: to })) as TransferLog[];
    const unknown = [...new Set(sample.map((l) => l.address.toLowerCase()))]
      .filter((a) => !known.has(a))
      .slice(0, MAX_DISCOVERY_PER_RUN);

    for (const address of unknown) {
      const { registered, assetId } = await registerCandidate(client, address);
      if (!registered || !assetId) continue;
      discovered += 1;
      known.set(address, { id: assetId, contract_address: address, decimals: 18 });
      discoveredAddresses.push(address as `0x${string}`);
    }
  } catch {
    /* discovery is best-effort; a failed sample must not fail the run */
  }

  const trackedAddresses = [...known.keys()] as `0x${string}`[];

  // read the range completely, splitting rather than truncating
  const read = await readLogsComplete(client, trackedAddresses, from, to);
  const logQueryError = read.error
    ? read.error === "archive range refused"
      ? `log range refused: ${new ArchiveRangeRefused(servable.from, head).message}`
      : read.error
    : null;

  if (read.lastComplete < from) {
    return {
      status: "NOTHING_SERVABLE",
      requestedFrom: Number(fromBlock),
      fromBlock: Number(from),
      toBlock: Number(from) - 1,
      head,
      gapBlocks,
      logQueryError,
      chunks: read.chunks,
      logs: 0,
      inserted: 0,
      discovered,
      backfilled: 0,
      flows: { windows: 0, addresses: 0, skipped: true },
    };
  }

  // Only logs inside the fully-read span may be accepted.
  const accepted = read.logs.filter((l) => l.blockNumber !== null && l.blockNumber <= read.lastComplete);
  const blocksWithLogs = accepted.map((l) => l.blockNumber!).filter((b) => b !== null);
  const { times, unresolved } = await resolveBlockTimes(client, blocksWithLogs);

  /**
   * The cursor stops before the first block whose time could not be resolved.
   * Those logs are not dropped — they are simply not yet processed, and the
   * next run will read them again.
   */
  const unresolvedFloor = unresolved.length ? unresolved.reduce((m, b) => (b < m ? b : m)) : null;
  const completeThrough = unresolvedFloor !== null ? unresolvedFloor - 1n : read.lastComplete;

  const rows: {
    tx_hash: string;
    log_index: number;
    block_number: number;
    /** The chain a transfer was observed on. A row without it is unattributable. */
    chain_id: number;
    asset_id: string | null;
    from_address: string;
    to_address: string;
    amount: string;
    timestamp: string;
  }[] = [];
  const walletSeen = new Map<string, string>();

  for (const log of accepted) {
    if (log.blockNumber === null || log.transactionHash === null || log.logIndex === null) continue;
    if (log.blockNumber > completeThrough) continue;
    const args = log.args as { from?: string; to?: string; value?: bigint };
    if (!args.from || !args.to || args.value === undefined) continue;
    const ts = times.get(log.blockNumber.toString());
    if (!ts) continue;

    const fromAddr = args.from.toLowerCase();
    const toAddr = args.to.toLowerCase();
    const assetId = known.get(log.address.toLowerCase())?.id ?? null;
    if (discoveredAddresses.includes(log.address.toLowerCase() as `0x${string}`)) backfilled += 1;

    rows.push({
      tx_hash: log.transactionHash,
      log_index: log.logIndex,
      block_number: Number(log.blockNumber),
      chain_id: robinhoodChain.id,
      asset_id: assetId,
      from_address: fromAddr,
      to_address: toAddr,
      amount: args.value.toString(),
      timestamp: ts,
    });
    for (const addr of [fromAddr, toAddr]) {
      const prev = walletSeen.get(addr);
      if (!prev || ts > prev) walletSeen.set(addr, ts);
    }
  }

  /**
   * The cursor moves only after the write is confirmed. A failed write leaves
   * the cursor where it was, so the range is retried rather than skipped.
   *
   * The write is idempotent on (tx_hash, log_index) — the only pair unique for
   * a log — so re-reading a range costs nothing and duplicates nothing. DO
   * NOTHING means a re-read of an already-indexed block returns no rows, and
   * RETURNING is what tells us how many transfers were genuinely new rather
   * than how many were offered.
   */
  let inserted = 0;
  let writeFailed = false;
  if (rows.length) {
    try {
      for (const batch of chunkRows(rows, INSERT_CHUNK_ROWS)) {
        const params: unknown[] = [];
        for (const r of batch) {
          params.push(
            r.tx_hash,
            r.log_index,
            r.block_number,
            r.chain_id,
            r.asset_id,
            r.from_address,
            r.to_address,
            r.amount,
            r.timestamp,
          );
        }
        const written = await query<{ tx_hash: string }>(
          `insert into transfers (
             tx_hash, log_index, block_number, chain_id, asset_id,
             from_address, to_address, amount, "timestamp"
           ) values ${valuesPlaceholders(batch.length, 9)}
           on conflict (tx_hash, log_index) do nothing
           returning tx_hash`,
          params,
        );
        inserted += (written ?? []).length;
      }
    } catch {
      writeFailed = true;
      inserted = 0;
    }
  }

  if (walletSeen.size) {
    try {
      const entries = [...walletSeen];
      for (const batch of chunkRows(entries, INSERT_CHUNK_ROWS)) {
        const params: unknown[] = [];
        for (const [address, lastSeen] of batch) params.push(address, lastSeen);
        await query(
          `insert into wallets (address, last_seen)
           values ${valuesPlaceholders(batch.length, 2)}
           on conflict (address) do update set last_seen = excluded.last_seen`,
          params,
        );
      }
    } catch {
      /* the wallet registry is a convenience index; it never gates the cursor */
    }
  }

  const cursorTo = writeFailed ? from - 1n : completeThrough;

  if (!writeFailed && cursorTo >= from) {
    /**
     * Coverage, so a window can tell the truth about itself.
     *
     * A 7D panel drawn from 40 minutes of index is not a 7D panel, and the only
     * way a reader can know that is if the index says how far back it actually
     * reaches and whether that reach is unbroken.
     *
     * Two different facts are recorded:
     *
     *   earliest_indexed_*  the oldest block this index has ever held. It only
     *                       ever moves backwards, so a later run reading recent
     *                       blocks cannot shrink the claim.
     *   continuous_since    the point after which nothing is missing. A skipped
     *                       range resets it to the start of what was read next,
     *                       because everything before the gap is no longer
     *                       continuous with what follows.
     */
    const earliestAt = rows.length ? rows.reduce((m, r) => (r.timestamp < m ? r.timestamp : m), rows[0].timestamp) : null;
    const nowIso = new Date().toISOString();

    /**
     * "Backwards only" is expressed in the statement itself.
     *
     * LEAST(existing, offered) ignores NULLs, so a first write takes the offered
     * value and every later write can only lower it. Doing it in SQL rather
     * than as a read, compare, write means two runs overlapping cannot read the
     * same prior value and have the later one overwrite the earlier one's
     * older, truer claim.
     */
    const continuousSince = earliestAt ?? nowIso;
    const hasGap = gapBlocks > 0;

    try {
      await sql`
        insert into indexer_state (
          chain_id, last_processed_block, last_finalized_block, updated_at,
          earliest_indexed_block, earliest_indexed_at, continuous_since, gap_blocks, last_gap_at
        ) values (
          ${robinhoodChain.id},
          ${Number(cursorTo)},
          ${Number(cursorTo)},
          ${nowIso},
          ${Number(from)},
          ${earliestAt},
          ${continuousSince},
          ${hasGap ? gapBlocks : 0},
          ${hasGap ? nowIso : null}
        )
        on conflict (chain_id) do update set
          last_processed_block = excluded.last_processed_block,
          last_finalized_block = excluded.last_finalized_block,
          updated_at = excluded.updated_at,
          earliest_indexed_block = least(indexer_state.earliest_indexed_block, excluded.earliest_indexed_block),
          earliest_indexed_at = least(indexer_state.earliest_indexed_at, excluded.earliest_indexed_at),
          continuous_since = case
            when ${hasGap}::boolean then excluded.continuous_since
            else coalesce(indexer_state.continuous_since, excluded.continuous_since)
          end,
          gap_blocks = case when ${hasGap}::boolean then excluded.gap_blocks else indexer_state.gap_blocks end,
          last_gap_at = case when ${hasGap}::boolean then excluded.last_gap_at else indexer_state.last_gap_at end
      `;
    } catch {
      /**
       * A cursor that fails to advance is safe: the same range is read again
       * next run and the write above is idempotent. Failing the whole run here
       * would throw away transfers that are already durably stored.
       */
    }
  }

  const flows = inserted > 0 ? await recomputeAddressFlows() : { windows: 0, addresses: 0, skipped: true };

  return {
    status: "INDEXED",
    requestedFrom: Number(fromBlock),
    fromBlock: Number(from),
    toBlock: Number(cursorTo),
    head,
    gapBlocks,
    logQueryError,
    chunks: read.chunks,
    logs: accepted.length,
    inserted,
    discovered,
    backfilled,
    flows,
  };
}

/**
 * Directional flow, per address AND per asset.
 *
 * Token units are not comparable across assets: one NVDA plus one AAPL is not
 * two of anything. Flow is therefore recorded for an (address, asset) pair, and
 * the only cross-asset figures the product publishes are counts — transfers,
 * counterparties, active assets — which genuinely are comparable.
 *
 * It is also not meaningful per token contract: a transfer moves balance
 * between holders without changing supply, so no asset-level net flow exists.
 */
export async function recomputeAddressFlows() {
  const sql = db();
  if (!isDatabaseConfigured() || !sql) return { windows: 0, addresses: 0, skipped: true };

  /**
   * A failed read degrades to "nothing to recompute", never to a throw.
   * This runs after transfers are already durably written and the cursor has
   * advanced; letting a flow-table hiccup fail the whole run would report an
   * ingestion that actually succeeded as a failure.
   */
  let assetRows: { id: string; decimals: number | string | null }[] = [];
  try {
    assetRows = (await sql`
      select id, decimals from assets limit 200
    `) as { id: string; decimals: number | string | null }[];
  } catch {
    assetRows = [];
  }
  const decimals = new Map(assetRows.map((a) => [String(a.id), Number(a.decimals ?? 18)]));

  const now = Date.now();
  let written = 0;
  let windowsDone = 0;

  for (const window of WINDOWS) {
    const since = new Date(now - WINDOW_MS[window]).toISOString();
    let transfers: { asset_id: string | null; from_address: string; to_address: string; amount: string }[];
    try {
      // `timestamp` is quoted because it is also a type name in Postgres.
      transfers = (await sql`
        select asset_id, from_address, to_address, amount
        from transfers
        where "timestamp" >= ${since}
        limit 5000
      `) as { asset_id: string | null; from_address: string; to_address: string; amount: string }[];
    } catch {
      // A window that could not be read is skipped, not written with zeros.
      continue;
    }
    if (!transfers.length) continue;

    type Acc = { inflow: number; outflow: number; tx: number; cp: Set<string> };
    // keyed by address AND asset — never one bucket for all assets
    const acc = new Map<string, Acc>();
    const key = (address: string, assetId: string) => `${address}|${assetId}`;
    const touch = (address: string, assetId: string) => {
      const k = key(address, assetId);
      let e = acc.get(k);
      if (!e) {
        e = { inflow: 0, outflow: 0, tx: 0, cp: new Set() };
        acc.set(k, e);
      }
      return e;
    };

    for (const t of transfers) {
      if (!t.asset_id) continue; // an amount without an asset has no unit
      const assetId = String(t.asset_id);
      // numeric arrives as a string; fromBaseUnits reads the base units exactly
      const amt = fromBaseUnits(String(t.amount), decimals.get(assetId) ?? 18);
      const f = touch(t.from_address, assetId);
      const to = touch(t.to_address, assetId);
      f.outflow += amt;
      f.tx += 1;
      f.cp.add(t.to_address);
      to.inflow += amt;
      to.tx += 1;
      to.cp.add(t.from_address);
    }

    const ranked = [...acc.entries()]
      .sort((a, b) => b[1].inflow + b[1].outflow - (a[1].inflow + a[1].outflow))
      .slice(0, FLOW_TOP_N);

    if (!ranked.length) continue;

    const calculatedAt = new Date().toISOString();
    const payload = ranked.map(([composite, e]) => {
      const [address, assetId] = composite.split("|");
      return {
        entity_type: "address_asset",
        // the entity is the pair, so a unit is never implied across assets
        entity_id: `${address}:${assetId}`,
        window,
        inflow: e.inflow,
        outflow: e.outflow,
        net_flow: e.inflow - e.outflow,
        transaction_count: e.tx,
        unique_counterparties: e.cp.size,
        calculated_at: calculatedAt,
      };
    });

    try {
      for (const batch of chunkRows(payload, INSERT_CHUNK_ROWS)) {
        const params: unknown[] = [];
        for (const p of batch) {
          params.push(
            p.entity_type,
            p.entity_id,
            p.window,
            p.inflow,
            p.outflow,
            p.net_flow,
            p.transaction_count,
            p.unique_counterparties,
            p.calculated_at,
          );
        }
        // `window` is a reserved word in Postgres, so the column is quoted.
        await query(
          `insert into flow_windows (
             entity_type, entity_id, "window", inflow, outflow, net_flow,
             transaction_count, unique_counterparties, calculated_at
           ) values ${valuesPlaceholders(batch.length, 9)}
           on conflict (entity_type, entity_id, "window") do update set
             inflow = excluded.inflow,
             outflow = excluded.outflow,
             net_flow = excluded.net_flow,
             transaction_count = excluded.transaction_count,
             unique_counterparties = excluded.unique_counterparties,
             calculated_at = excluded.calculated_at`,
          params,
        );
      }
      written += payload.length;
      windowsDone += 1;
    } catch {
      /* a window that failed to write is simply not counted as written */
    }
  }

  // Retire earlier shapes: asset-level rows stored gross volume in net_flow,
  // and address-level rows summed incomparable token units together.
  try {
    await sql`delete from flow_windows where entity_type in (${"asset"}, ${"address"})`;
  } catch {
    /* the legacy sweep is housekeeping; it never fails a recompute */
  }

  return { windows: windowsDone, addresses: written, skipped: false };
}

export async function getCursor(): Promise<{ last_processed_block: number }> {
  const sql = db();
  if (!isDatabaseConfigured() || !sql) return { last_processed_block: 0 };

  // bigint arrives as a string from this driver, so the conversion is explicit.
  const rows = (await sql`
    select last_processed_block from indexer_state where chain_id = ${robinhoodChain.id} limit 1
  `) as { last_processed_block: string | number | null }[];
  return { last_processed_block: Number(rows[0]?.last_processed_block ?? 0) };
}
