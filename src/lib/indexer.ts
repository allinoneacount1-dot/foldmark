import { createPublicClient, http, parseAbi, parseAbiItem, type Log } from "viem";
import { robinhoodChain } from "@/lib/wagmi";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
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

type TransferLog = Log<bigint, number, false, typeof TRANSFER_EVENT>;
type Client = ReturnType<typeof createPublicClient>;

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
  if (!isSupabaseConfigured() || !supabase) return { registered: false, assetId: null };
  const sb = supabase;

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

    const { data, error } = await sb
      .from("assets")
      .insert({
        chain_id: robinhoodChain.id,
        contract_address: address,
        symbol: String(symbol).toUpperCase(),
        name: String(name),
        asset_type: "stock_token",
        // Not verified. A name is not an identity.
        verified: false,
        verification_status: "CANDIDATE",
        verification_source: "on-chain metadata heuristic",
        verification_evidence:
          "The contract's own name() contains the Robinhood Token marker. String similarity is not proof of issuer, so this stays a candidate until an authoritative contract list confirms the address.",
        source: "Discovered on-chain from a Transfer log; identity read from contract metadata.",
        decimals: Number(decimals) || 18,
      })
      .select("id")
      .maybeSingle();

    if (error || !data) return { registered: false, assetId: null };
    return { registered: true, assetId: data.id as string };
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
}): Promise<IndexerResult | { error: "SUPABASE_NOT_CONFIGURED" }> {
  if (!isSupabaseConfigured() || !supabase) return { error: "SUPABASE_NOT_CONFIGURED" as const };
  const sb = supabase;
  const client = createPublicClient({ chain: robinhoodChain, transport: http(activeRpcEndpoint()) });

  const { data: knownAssets } = await sb.from("assets").select("id, contract_address, decimals").limit(200);
  const known = new Map((knownAssets ?? []).map((a) => [String(a.contract_address).toLowerCase(), a]));

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
   */
  let inserted = 0;
  let writeFailed = false;
  if (rows.length) {
    const { error, count } = await sb
      .from("transfers")
      .upsert(rows, { onConflict: "tx_hash,log_index", ignoreDuplicates: true, count: "exact" });
    if (error) writeFailed = true;
    else inserted = count ?? rows.length;
  }

  if (walletSeen.size) {
    await sb.from("wallets").upsert(
      [...walletSeen].map(([address, last_seen]) => ({ address, last_seen })),
      { onConflict: "address" },
    );
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

    const { data: prior } = await sb
      .from("indexer_state")
      .select("earliest_indexed_block, earliest_indexed_at, continuous_since")
      .eq("chain_id", robinhoodChain.id)
      .maybeSingle();

    const priorEarliestBlock =
      prior?.earliest_indexed_block === null || prior?.earliest_indexed_block === undefined
        ? null
        : Number(prior.earliest_indexed_block);
    const priorEarliestAt = (prior?.earliest_indexed_at as string | null) ?? null;
    const priorContinuous = (prior?.continuous_since as string | null) ?? null;

    // Backwards only. A run over recent blocks must not erase older coverage.
    const earliestBlock =
      priorEarliestBlock === null ? Number(from) : Math.min(priorEarliestBlock, Number(from));
    const earliestIndexedAt =
      earliestAt && (!priorEarliestAt || earliestAt < priorEarliestAt) ? earliestAt : priorEarliestAt;

    // A gap breaks continuity: what follows it is the new unbroken start.
    const continuousSince =
      gapBlocks > 0 ? (earliestAt ?? nowIso) : (priorContinuous ?? earliestAt ?? nowIso);

    await sb.from("indexer_state").upsert(
      {
        chain_id: robinhoodChain.id,
        last_processed_block: Number(cursorTo),
        last_finalized_block: Number(cursorTo),
        updated_at: nowIso,
        earliest_indexed_block: earliestBlock,
        continuous_since: continuousSince,
        ...(gapBlocks > 0 ? { gap_blocks: gapBlocks, last_gap_at: nowIso } : {}),
        ...(earliestIndexedAt ? { earliest_indexed_at: earliestIndexedAt } : {}),
      },
      { onConflict: "chain_id" },
    );
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
  if (!isSupabaseConfigured() || !supabase) return { windows: 0, addresses: 0, skipped: true };
  const sb = supabase;

  const { data: assetRows } = await sb.from("assets").select("id, decimals").limit(200);
  const decimals = new Map((assetRows ?? []).map((a) => [a.id as string, (a.decimals as number) ?? 18]));

  const now = Date.now();
  let written = 0;
  let windowsDone = 0;

  for (const window of WINDOWS) {
    const since = new Date(now - WINDOW_MS[window]).toISOString();
    const { data: transfers } = await sb
      .from("transfers")
      .select("asset_id, from_address, to_address, amount")
      .gte("timestamp", since)
      .limit(5000);
    if (!transfers) continue;

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

    for (const t of transfers as { asset_id: string | null; from_address: string; to_address: string; amount: string }[]) {
      if (!t.asset_id) continue; // an amount without an asset has no unit
      const amt = fromBaseUnits(t.amount, decimals.get(t.asset_id) ?? 18);
      const f = touch(t.from_address, t.asset_id);
      const to = touch(t.to_address, t.asset_id);
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

    const { error } = await sb.from("flow_windows").upsert(payload, { onConflict: "entity_type,entity_id,window" });
    if (!error) {
      written += payload.length;
      windowsDone += 1;
    }
  }

  // Retire earlier shapes: asset-level rows stored gross volume in net_flow,
  // and address-level rows summed incomparable token units together.
  await sb.from("flow_windows").delete().in("entity_type", ["asset", "address"]);

  return { windows: windowsDone, addresses: written, skipped: false };
}

export async function getCursor(): Promise<{ last_processed_block: number }> {
  if (!isSupabaseConfigured() || !supabase) return { last_processed_block: 0 };
  const { data } = await supabase
    .from("indexer_state")
    .select("last_processed_block")
    .eq("chain_id", robinhoodChain.id)
    .maybeSingle();
  return { last_processed_block: Number(data?.last_processed_block ?? 0) };
}
