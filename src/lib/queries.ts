/**
 * FOLDMARK read layer.
 *
 * Every function returns Measured<T> or a shape carrying an explicit DataState.
 * When the pipeline has not observed something we return INDEXING / EMPTY /
 * UNAVAILABLE — never a placeholder number.
 *
 * Aggregation happens in JS over bounded row windows: one window of transfers is
 * read once and folded several ways (by asset, by address, into edges), so the
 * folds stay pure and directly testable against a fixed row set. When a window
 * hits its row cap the result is reported as PARTIAL rather than presented as
 * complete.
 */

import { db as sqlClient, isDatabaseConfigured } from "@/server/db/client";
import { ROBINHOOD_CHAIN, getPulse } from "@/lib/chain";
import { WINDOW_MS, type FlowWindow, type AssetType } from "@/config/site";
import { fromBaseUnits } from "@/lib/format";
import { type DataState, type Measured, indexing, measured, unavailable } from "@/lib/data-state";
import type { Movement } from "@/lib/notional";

const RPC = { source: "Robinhood Chain RPC", method: "eth_blockNumber on chain 4663" };
const DB = {
  source: "FOLDMARK indexer",
  method: "Transfer logs read from Robinhood Chain RPC and persisted to Postgres",
};

/** Row cap per aggregation window. Hitting it downgrades the result to PARTIAL. */
const ROW_CAP = 2000;
const BUCKETS = 24;

export type AssetRow = {
  id: string;
  contract_address: string;
  symbol: string;
  name: string;
  asset_type: AssetType;
  verified: boolean;
  decimals: number;
  source: string | null;
};

export type TransferRow = {
  tx_hash: string;
  log_index: number;
  block_number: number;
  asset_id: string | null;
  from_address: string;
  to_address: string;
  amount: string;
  timestamp: string;
};

/**
 * The read connection, or null.
 *
 * Absent configuration stays a state rather than a crash: every caller below
 * returns its own UNAVAILABLE shape when this is null, which is what lets a
 * fresh clone with no secrets build and render.
 */
function db() {
  return isDatabaseConfigured() ? sqlClient() : null;
}

/**
 * Postgres timestamps arrive as Date objects; the REST layer this replaced
 * returned ISO strings. Every consumer in this codebase does Date.parse() or a
 * lexical string comparison on these fields, so the conversion happens here,
 * once, at the edge. A Date leaking through compares as an object and silently
 * never matches — the failure is invisible, which is why it is centralised.
 */
function iso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === "number") return Number.isFinite(value) ? new Date(value).toISOString() : null;
  const text = String(value);
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? text : new Date(parsed).toISOString();
}

/**
 * Postgres returns `numeric` and `bigint` as strings to avoid the precision
 * loss a float64 would introduce. Everything here that is arithmetic must be a
 * real number, so the conversion is explicit rather than assumed — an unparsed
 * string would concatenate where it was meant to add.
 */
function num(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Request-time clock.
 *
 * Kept behind an async boundary so a component body never reads the clock
 * directly — every window is computed against one timestamp captured once per
 * request, which also keeps a page internally consistent.
 */
export async function requestNow(): Promise<number> {
  return Date.now();
}

export function since(window: FlowWindow, now: number): string {
  return new Date(now - WINDOW_MS[window]).toISOString();
}

/* ---------------------------------------------------------------- chain */

export async function getChainHead(): Promise<Measured<number>> {
  const pulse = await getPulse();
  if (pulse.block === null) {
    return unavailable<number>({ ...RPC, source: `Robinhood Chain RPC (${pulse.endpoint})` }, pulse.detail);
  }
  return measured(pulse.block, { ...RPC, source: `Robinhood Chain RPC (${pulse.endpoint})` }, {
    observedAt: pulse.updatedAt,
  });
}

/* -------------------------------------------------------------- indexer */

export type IndexerStatus = {
  lastProcessedBlock: Measured<number>;
  chainHead: Measured<number>;
  lagBlocks: Measured<number>;
  updatedAt: string | null;
};

const LAG = { source: "FOLDMARK indexer + RPC", method: "chain head minus last processed block" };

export async function getIndexerStatus(): Promise<IndexerStatus> {
  const client = db();
  const head = await getChainHead();

  if (!client) {
    return {
      lastProcessedBlock: unavailable<number>(DB, "No database is configured for this deployment"),
      chainHead: head,
      lagBlocks: unavailable<number>(LAG),
      updatedAt: null,
    };
  }

  const rows = await client`
    select last_processed_block, updated_at
      from indexer_state
     where chain_id = ${ROBINHOOD_CHAIN.id}
     limit 1
  `.catch(() => null);

  const row = rows?.[0];
  if (!row) {
    return {
      lastProcessedBlock: indexing<number>(DB, "Indexer cursor not initialised"),
      chainHead: head,
      lagBlocks: indexing<number>(LAG),
      updatedAt: null,
    };
  }

  const last = num(row.last_processed_block);
  const updatedAt = iso(row.updated_at);

  return {
    lastProcessedBlock:
      last > 0 ? measured(last, DB, { observedAt: updatedAt }) : indexing<number>(DB, "Indexer has not committed a block yet"),
    chainHead: head,
    lagBlocks:
      head.value !== null && last > 0
        ? measured(Math.max(0, head.value - last), LAG, { observedAt: updatedAt })
        : indexing<number>(LAG),
    updatedAt,
  };
}

/* --------------------------------------------------------------- assets */

/** `decimals` is a bigint-adjacent integer and `verified` a real boolean; both are normalised once here. */
function toAssetRow(r: Record<string, unknown>): AssetRow {
  return {
    id: r.id as string,
    contract_address: r.contract_address as string,
    symbol: r.symbol as string,
    name: r.name as string,
    asset_type: r.asset_type as AssetType,
    verified: r.verified === true,
    decimals: num(r.decimals, 18),
    source: (r.source as string | null) ?? null,
  };
}

export async function getAssets(): Promise<{ state: DataState; rows: AssetRow[] }> {
  const client = db();
  if (!client) return { state: "UNAVAILABLE", rows: [] };
  const data = await client`
    select id, contract_address, symbol, name, asset_type, verified, decimals, source
      from assets
     where chain_id = ${ROBINHOOD_CHAIN.id}
     order by symbol
  `.catch(() => null);
  if (!data) return { state: "UNAVAILABLE", rows: [] };
  const rows = data.map(toAssetRow);
  return { state: rows.length ? "OK" : "INDEXING", rows };
}

export async function getAssetByAddress(contract: string): Promise<AssetRow | null> {
  const client = db();
  if (!client) return null;
  const data = await client`
    select id, contract_address, symbol, name, asset_type, verified, decimals, source
      from assets
     where contract_address = ${contract.toLowerCase()}
     limit 1
  `.catch(() => null);
  const row = data?.[0];
  return row ? toAssetRow(row) : null;
}

export async function getAssetBySymbolOrAddress(key: string): Promise<AssetRow | null> {
  const byAddress = await getAssetByAddress(key);
  if (byAddress) return byAddress;
  const client = db();
  if (!client) return null;
  // Case-insensitive on symbol, matching the previous `ilike` lookup. The key is
  // bound as a parameter, so it is compared literally — `%` in a URL segment
  // cannot turn this into a wildcard scan.
  const data = await client`
    select id, contract_address, symbol, name, asset_type, verified, decimals, source
      from assets
     where lower(symbol) = lower(${key})
     limit 1
  `.catch(() => null);
  const row = data?.[0];
  return row ? toAssetRow(row) : null;
}

/* ------------------------------------------------------------ transfers */

/**
 * `block_number` is a bigint and `amount` a numeric, so both arrive as strings.
 * The block number is compared and ordered numerically all over this file, so it
 * becomes a Number; the amount stays a string because it is a base-unit integer
 * that `fromBaseUnits` scales by the asset's decimals — putting it through a
 * float first is exactly the precision loss the numeric column exists to avoid.
 */
function toTransferRow(r: Record<string, unknown>): TransferRow {
  return {
    tx_hash: r.tx_hash as string,
    log_index: num(r.log_index),
    block_number: num(r.block_number),
    asset_id: (r.asset_id as string | null) ?? null,
    from_address: r.from_address as string,
    to_address: r.to_address as string,
    amount: String(r.amount ?? "0"),
    timestamp: iso(r.timestamp) ?? "",
  };
}

export async function getTransfersSince(
  isoSince: string,
  opts: { assetId?: string; address?: string; limit?: number } = {},
): Promise<{ state: DataState; rows: TransferRow[]; capped: boolean }> {
  const client = db();
  if (!client) return { state: "UNAVAILABLE", rows: [], capped: false };
  const limit = opts.limit ?? ROW_CAP;
  const assetId = opts.assetId ?? null;
  const address = opts.address ? opts.address.toLowerCase() : null;

  // Written as four whole statements rather than one assembled from fragments.
  // Each is a literal this file owns, every value is bound, and each keeps the
  // predicate shape that lets Postgres use the matching index on `transfers` —
  // an `(x is null or col = x)` catch-all would type-check just as well and
  // then scan the table.
  const read = () => {
    if (assetId && address) {
      return client`
        select tx_hash, log_index, block_number, asset_id, from_address, to_address, amount, "timestamp"
          from transfers
         where "timestamp" >= ${isoSince}
           and asset_id = ${assetId}
           and (from_address = ${address} or to_address = ${address})
         order by block_number desc
         limit ${limit}
      `;
    }
    if (assetId) {
      return client`
        select tx_hash, log_index, block_number, asset_id, from_address, to_address, amount, "timestamp"
          from transfers
         where "timestamp" >= ${isoSince}
           and asset_id = ${assetId}
         order by block_number desc
         limit ${limit}
      `;
    }
    if (address) {
      return client`
        select tx_hash, log_index, block_number, asset_id, from_address, to_address, amount, "timestamp"
          from transfers
         where "timestamp" >= ${isoSince}
           and (from_address = ${address} or to_address = ${address})
         order by block_number desc
         limit ${limit}
      `;
    }
    return client`
      select tx_hash, log_index, block_number, asset_id, from_address, to_address, amount, "timestamp"
        from transfers
       where "timestamp" >= ${isoSince}
       order by block_number desc
       limit ${limit}
    `;
  };

  const data = await read().catch(() => null);
  if (!data) return { state: "UNAVAILABLE", rows: [], capped: false };
  const rows = data.map(toTransferRow);
  const capped = rows.length >= limit;
  return { state: rows.length ? (capped ? "PARTIAL" : "OK") : "EMPTY", rows, capped };
}

export async function getRecentTransfers(limit = 40): Promise<{ state: DataState; rows: TransferRow[] }> {
  const client = db();
  if (!client) return { state: "UNAVAILABLE", rows: [] };
  const data = await client`
    select tx_hash, log_index, block_number, asset_id, from_address, to_address, amount, "timestamp"
      from transfers
     order by block_number desc
     limit ${limit}
  `.catch(() => null);
  if (!data) return { state: "UNAVAILABLE", rows: [] };
  const rows = data.map(toTransferRow);
  return { state: rows.length ? "OK" : "INDEXING", rows };
}

/* ----------------------------------------------------------- aggregates */

/**
 * How far back the index actually reaches.
 *
 * A window is a claim: "this is the last 7 days". If the index only holds 40
 * minutes, that claim is false, and no amount of correct arithmetic over the
 * rows will make it true. Coverage is what lets a window know whether it can
 * make its own claim, so the answer becomes PARTIAL with a stated reach instead
 * of a confident number over a fraction of the period.
 */
export type IndexCoverage = {
  state: DataState;
  /** Oldest block the index has ever held. */
  earliestBlock: number | null;
  /** Time of the oldest indexed transfer. */
  earliestAt: string | null;
  /** The point after which nothing is missing. Resets when a gap is skipped. */
  continuousSince: string | null;
  /** Milliseconds of unbroken coverage as of `now`. */
  continuousMs: number | null;
  /** Blocks the indexer could not read and knowingly skipped. */
  gapBlocks: number;
  lastGapAt: string | null;
};

const COVERAGE_UNKNOWN: IndexCoverage = {
  state: "INDEXING",
  earliestBlock: null,
  earliestAt: null,
  continuousSince: null,
  continuousMs: null,
  gapBlocks: 0,
  lastGapAt: null,
};

export async function getIndexCoverage(now: number): Promise<IndexCoverage> {
  const client = db();
  if (!client) return { ...COVERAGE_UNKNOWN, state: "UNAVAILABLE" };

  const rows = await client`
    select earliest_indexed_block, earliest_indexed_at, continuous_since, gap_blocks, last_gap_at
      from indexer_state
     where chain_id = ${ROBINHOOD_CHAIN.id}
     limit 1
  `.catch(() => null);

  // A deployment whose migration has not run reports INDEXING rather than
  // claiming full coverage it cannot prove.
  const data = rows?.[0];
  if (!data) return COVERAGE_UNKNOWN;

  const continuousSince = iso(data.continuous_since);
  const parsed = continuousSince ? Date.parse(continuousSince) : NaN;

  return {
    state: continuousSince ? "OK" : "INDEXING",
    earliestBlock:
      data.earliest_indexed_block === null || data.earliest_indexed_block === undefined
        ? null
        : num(data.earliest_indexed_block),
    earliestAt: iso(data.earliest_indexed_at),
    continuousSince,
    continuousMs: Number.isNaN(parsed) ? null : Math.max(0, now - parsed),
    gapBlocks: num(data.gap_blocks),
    lastGapAt: iso(data.last_gap_at),
  };
}

/**
 * Whether a window is fully covered by the index.
 *
 * Returns the state the window should report. A window asking for more history
 * than the index holds is PARTIAL — every count inside it is a lower bound over
 * a shorter period than its own label claims.
 */
export function coverageState(
  window: FlowWindow,
  coverage: IndexCoverage,
  base: DataState,
  now: number,
): DataState {
  const windowMs = WINDOW_MS[window];

  // Storage is unreachable. Nothing can be said about coverage or activity.
  if (base === "UNAVAILABLE" || coverage.state === "UNAVAILABLE") return "UNAVAILABLE";

  /**
   * Coverage has not been recorded yet.
   *
   * Zero rows here is unreadable: it could mean nothing happened, or it could
   * mean nothing has been indexed. INDEXING says which of those we know, which
   * is neither. Rows that DO exist are real, but the window still cannot prove
   * it spans its own period, so it is PARTIAL rather than OK.
   */
  if (coverage.continuousMs === null) {
    return base === "EMPTY" ? "INDEXING" : "PARTIAL";
  }

  // The index does not reach back as far as the label claims. Every figure
  // inside it — including a count of zero — describes a shorter period.
  if (coverage.continuousMs < windowMs) return "PARTIAL";

  // A hole inside the requested window means the window is not whole, however
  // far back the index reaches on either side of it.
  if (gapInsideWindow(coverage, windowMs, now)) return "PARTIAL";

  // The full window is known covered and unbroken. Only now does zero rows
  // genuinely mean zero activity.
  return base;
}

/**
 * Whether a known gap falls inside the requested window.
 *
 * A gap from three days ago says nothing about the last hour, so the check is
 * time-scoped. When the index knows it skipped blocks but not when, the answer
 * is yes: an unplaceable hole could be anywhere, including here, and assuming
 * otherwise would be the product guessing in its own favour.
 */
function gapInsideWindow(coverage: IndexCoverage, windowMs: number, now: number): boolean {
  if (coverage.gapBlocks <= 0) return false;
  if (!coverage.lastGapAt) return true;
  const at = Date.parse(coverage.lastGapAt);
  if (Number.isNaN(at)) return true;
  return at >= now - windowMs;
}

/** Human sentence for a window whose index does not reach back far enough. */
export function coverageNote(window: FlowWindow, coverage: IndexCoverage, now: number): string | null {
  if (coverage.state === "UNAVAILABLE") return null;

  if (coverage.continuousMs === null) {
    return "Index coverage is not recorded yet, so this window cannot confirm it spans its full period. A count of zero here means nothing was found in what has been indexed — not that nothing happened.";
  }

  if (coverage.continuousMs >= WINDOW_MS[window] && gapInsideWindow(coverage, WINDOW_MS[window], now)) {
    return `The index spans this ${window} window but skipped ${coverage.gapBlocks} block(s) inside it, so figures here are a lower bound.`;
  }
  const gap = coverage.gapBlocks > 0 ? ` ${coverage.gapBlocks} block(s) were skipped and are not included.` : "";
  if (coverage.continuousMs >= WINDOW_MS[window]) {
    return coverage.gapBlocks > 0 ? `Index covers the full ${window} window.${gap}` : null;
  }
  // Below here the index is shorter than the window, so the sentence must say
  // by how much — a reader cannot judge "PARTIAL" without the actual reach.
  const hours = coverage.continuousMs / 3_600_000;
  const reach = hours >= 1 ? `${hours.toFixed(1)}h` : `${Math.round(coverage.continuousMs / 60_000)}m`;
  return `The index reaches back ${reach} unbroken, less than this ${window} window. Every figure here covers that shorter period and is a lower bound, not a ${window} total.${gap}`;
}

export type WindowActivity = {
  state: DataState;
  window: FlowWindow;
  transfers: number;
  activeAddresses: number;
  activeAssets: number;
  uniquePairs: number;
  capped: boolean;
  /** transfer counts bucketed oldest -> newest, for the activity histogram */
  buckets: number[];
  bucketMinutes: number;
  rows: TransferRow[];
  /** How far the index actually reaches, so the window can qualify itself. */
  coverage: IndexCoverage;
  /** Set when the index does not span the whole window. */
  coverageNote: string | null;
};

export async function getWindowActivity(window: FlowWindow, now: number): Promise<WindowActivity> {
  const [{ state, rows, capped }, coverage] = await Promise.all([
    getTransfersSince(since(window, now)),
    getIndexCoverage(now),
  ]);
  const addresses = new Set<string>();
  const assets = new Set<string>();
  const pairs = new Set<string>();
  const span = WINDOW_MS[window];
  const start = now - span;
  const buckets = new Array<number>(BUCKETS).fill(0);

  for (const r of rows) {
    addresses.add(r.from_address);
    addresses.add(r.to_address);
    if (r.asset_id) assets.add(r.asset_id);
    pairs.add(r.from_address + ">" + r.to_address);
    buckets[bucketIndex(r.timestamp, start, span)] += 1;
  }

  return {
    // A window shorter than its own label is PARTIAL, whatever the row count
    // says — including when it says zero.
    state: coverageState(window, coverage, state, now),
    window,
    transfers: rows.length,
    activeAddresses: addresses.size,
    activeAssets: assets.size,
    uniquePairs: pairs.size,
    capped,
    buckets,
    bucketMinutes: Math.round(span / BUCKETS / 60000),
    rows,
    coverage,
    coverageNote: coverageNote(window, coverage, now),
  };
}

function bucketIndex(iso: string, start: number, span: number): number {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.min(BUCKETS - 1, Math.max(0, Math.floor(((t - start) / span) * BUCKETS)));
}

export type AssetActivity = {
  assetId: string;
  transfers: number;
  counterparties: number;
  volume: number;
  lastBlock: number | null;
  lastSeen: string | null;
  buckets: number[];
};

/** One pass over a window of transfers, folded per asset. Avoids N queries for N assets. */
export function foldByAsset(
  rows: TransferRow[],
  assets: AssetRow[],
  window: FlowWindow,
  now: number,
): Map<string, AssetActivity> {
  const decimals = new Map(assets.map((a) => [a.id, a.decimals]));
  const seenPerAsset = new Map<string, Set<string>>();
  const out = new Map<string, AssetActivity>();
  const span = WINDOW_MS[window];
  const start = now - span;

  for (const r of rows) {
    if (!r.asset_id) continue;
    let entry = out.get(r.asset_id);
    if (!entry) {
      entry = {
        assetId: r.asset_id,
        transfers: 0,
        counterparties: 0,
        volume: 0,
        lastBlock: null,
        lastSeen: null,
        buckets: new Array<number>(BUCKETS).fill(0),
      };
      out.set(r.asset_id, entry);
      seenPerAsset.set(r.asset_id, new Set<string>());
    }
    const seen = seenPerAsset.get(r.asset_id)!;
    seen.add(r.from_address);
    seen.add(r.to_address);
    entry.transfers += 1;
    entry.volume += fromBaseUnits(r.amount, decimals.get(r.asset_id) ?? 18);
    if (entry.lastBlock === null || r.block_number > entry.lastBlock) {
      entry.lastBlock = r.block_number;
      entry.lastSeen = r.timestamp;
    }
    entry.buckets[bucketIndex(r.timestamp, start, span)] += 1;
  }

  for (const [id, entry] of out) entry.counterparties = seenPerAsset.get(id)?.size ?? 0;
  return out;
}

export type FlowEdge = {
  from: string;
  to: string;
  assetId: string | null;
  amount: number;
  transfers: number;
  lastBlock: number;
};

/** Directed value edges between addresses, strongest first. */
export function foldEdges(rows: TransferRow[], assets: AssetRow[], limit = 12): FlowEdge[] {
  const decimals = new Map(assets.map((a) => [a.id, a.decimals]));
  const map = new Map<string, FlowEdge>();
  for (const r of rows) {
    const key = r.from_address + ">" + r.to_address + ">" + (r.asset_id ?? "-");
    const amt = fromBaseUnits(r.amount, decimals.get(r.asset_id ?? "") ?? 18);
    const cur = map.get(key);
    if (cur) {
      cur.amount += amt;
      cur.transfers += 1;
      if (r.block_number > cur.lastBlock) cur.lastBlock = r.block_number;
    } else {
      map.set(key, {
        from: r.from_address,
        to: r.to_address,
        assetId: r.asset_id,
        amount: amt,
        transfers: 1,
        lastBlock: r.block_number,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, limit);
}

/**
 * What an address did in a window.
 *
 * Flow is kept PER ASSET because token units are not comparable across assets:
 * one NVDA plus one AAPL is not two of anything. The only cross-asset figures
 * here are counts — transfers, counterparties, distinct assets — which genuinely
 * are comparable, and those are what cross-asset ranking uses.
 */
export type AssetFlow = {
  assetId: string;
  inbound: number;
  outbound: number;
  net: number;
  transfers: number;
};

export type AddressActivity = {
  address: string;
  /** Comparable across assets. */
  transfers: number;
  counterparties: number;
  assets: number;
  /** Per-asset flow. Never summed together. */
  byAsset: AssetFlow[];
};

export function foldByAddress(rows: TransferRow[], assets: AssetRow[], limit = 12): AddressActivity[] {
  const decimals = new Map(assets.map((a) => [a.id, a.decimals]));
  const flows = new Map<string, Map<string, AssetFlow>>();
  const counts = new Map<string, { transfers: number; cp: Set<string> }>();

  const touchCount = (address: string) => {
    let c = counts.get(address);
    if (!c) {
      c = { transfers: 0, cp: new Set() };
      counts.set(address, c);
    }
    return c;
  };

  const touchFlow = (address: string, assetId: string) => {
    let byAsset = flows.get(address);
    if (!byAsset) {
      byAsset = new Map();
      flows.set(address, byAsset);
    }
    let f = byAsset.get(assetId);
    if (!f) {
      f = { assetId, inbound: 0, outbound: 0, net: 0, transfers: 0 };
      byAsset.set(assetId, f);
    }
    return f;
  };

  for (const r of rows) {
    const from = touchCount(r.from_address);
    const to = touchCount(r.to_address);
    from.transfers += 1;
    from.cp.add(r.to_address);
    to.transfers += 1;
    to.cp.add(r.from_address);

    // An amount without an asset has no unit, so it contributes no flow.
    if (!r.asset_id) continue;
    const amt = fromBaseUnits(r.amount, decimals.get(r.asset_id) ?? 18);
    const sender = touchFlow(r.from_address, r.asset_id);
    const receiver = touchFlow(r.to_address, r.asset_id);
    sender.outbound += amt;
    sender.transfers += 1;
    receiver.inbound += amt;
    receiver.transfers += 1;
  }

  return [...counts.entries()]
    .map(([address, c]) => {
      const byAsset = [...(flows.get(address)?.values() ?? [])].map((f) => ({ ...f, net: f.inbound - f.outbound }));
      return {
        address,
        transfers: c.transfers,
        counterparties: c.cp.size,
        assets: byAsset.length,
        byAsset: byAsset.sort((a, b) => b.transfers - a.transfers),
      };
    })
    // Ranked by transfer count, which is comparable. Ranking by summed token
    // units would order addresses by an arithmetic error.
    .sort((a, b) => b.transfers - a.transfers || b.counterparties - a.counterparties)
    .slice(0, limit);
}

/** One asset's flow for an address, when a single asset is genuinely in scope. */
export function flowForAsset(activity: AddressActivity, assetId: string): AssetFlow | null {
  return activity.byAsset.find((f) => f.assetId === assetId) ?? null;
}

/**
 * The single asset that best characterises an address in a cross-asset list.
 *
 * A cross-asset view still wants to say something about magnitude, and the only
 * honest way to do that is to name one asset and quote the amount in its units.
 * "Most of what this address received was USDG" is a claim that survives
 * inspection; a summed figure across three tokens is not.
 *
 * Selection is by transfer count, then by amount within that one asset — never
 * by amount across assets, which is the comparison that has no meaning.
 */
export function dominantFlow(activity: AddressActivity, side: "inbound" | "outbound"): AssetFlow | null {
  const moving = activity.byAsset.filter((f) => f[side] > 0);
  if (!moving.length) return null;
  return moving.reduce((best, f) =>
    f.transfers !== best.transfers ? (f.transfers > best.transfers ? f : best) : f[side] > best[side] ? f : best,
  );
}

/* ------------------------------------------------------------- structure */

export type StructureChange = {
  state: DataState;
  newRelationships: number;
  retiredRelationships: number;
  currentPairs: number;
  previousPairs: number;
};

/**
 * How much the shape of the market changed.
 *
 * Defined precisely so it is allowed to exist: the number of directed address
 * pairs observed in this window that were absent from the immediately preceding
 * window of equal length, and the number that were present then but not now.
 * It is a count of observed relationships, not a score.
 */
export async function getStructureChange(window: FlowWindow, now: number): Promise<StructureChange> {
  const span = WINDOW_MS[window];
  const [current, previous] = await Promise.all([
    getTransfersSince(new Date(now - span).toISOString()),
    getTransfersSince(new Date(now - span * 2).toISOString()),
  ]);

  if (current.state === "UNAVAILABLE" || previous.state === "UNAVAILABLE") {
    return { state: "UNAVAILABLE", newRelationships: 0, retiredRelationships: 0, currentPairs: 0, previousPairs: 0 };
  }

  const cutoff = now - span;
  const pairsIn = (rows: TransferRow[], from: number, to: number) => {
    const set = new Set<string>();
    for (const r of rows) {
      const t = new Date(r.timestamp).getTime();
      if (t >= from && t < to) set.add(r.from_address + ">" + r.to_address);
    }
    return set;
  };

  const currentPairs = pairsIn(current.rows, cutoff, now);
  const previousPairs = pairsIn(previous.rows, now - span * 2, cutoff);

  let fresh = 0;
  for (const p of currentPairs) if (!previousPairs.has(p)) fresh += 1;
  let retired = 0;
  for (const p of previousPairs) if (!currentPairs.has(p)) retired += 1;

  const state: DataState =
    currentPairs.size === 0 && previousPairs.size === 0
      ? "INDEXING"
      : current.capped || previous.capped
        ? "PARTIAL"
        : "OK";

  return {
    state,
    newRelationships: fresh,
    retiredRelationships: retired,
    currentPairs: currentPairs.size,
    previousPairs: previousPairs.size,
  };
}

/**
 * Exact row count, so a page never reports "10 assets" because it capped at 10.
 *
 * The table is chosen from an allow-list of whole statements rather than
 * interpolated into one. A table name cannot be a bound parameter, so the only
 * way to keep the rule "no caller value ever reaches SQL text" is for the
 * caller to select a statement rather than supply a name — the union type is
 * the allow-list, and TypeScript enforces it at the call site.
 *
 * `count(*)` rather than `count(id)`: `wallets` is keyed by address and has no
 * id column, and counting a nullable column would silently under-count anyway.
 */
export async function countRows(table: "assets" | "transfers" | "wallets"): Promise<Measured<number>> {
  const client = db();
  if (!client) return unavailable<number>(DB, "No database is configured");

  const read = () => {
    switch (table) {
      case "assets":
        return client`select count(*) as n from assets`;
      case "transfers":
        return client`select count(*) as n from transfers`;
      case "wallets":
        return client`select count(*) as n from wallets`;
    }
  };

  const rows = await read().catch(() => null);
  if (!rows) return unavailable<number>(DB, "Count query failed");
  // count() is a bigint, so it arrives as a string and must be converted.
  return measured(num(rows[0]?.n), DB, { observedAt: new Date().toISOString() });
}

/* --------------------------------------------------------------- wallets */

export async function getObservedWallets(
  limit = 24,
): Promise<{ state: DataState; rows: { address: string; last_seen: string | null }[] }> {
  const client = db();
  if (!client) return { state: "UNAVAILABLE", rows: [] };
  const data = await client`
    select address, last_seen
      from wallets
     order by last_seen desc
     limit ${limit}
  `.catch(() => null);
  if (!data) return { state: "UNAVAILABLE", rows: [] };
  const rows = data.map((r) => ({ address: r.address as string, last_seen: iso(r.last_seen) }));
  return { state: rows.length ? "OK" : "INDEXING", rows };
}

/* ------------------------------------------------------------- protocols */

export type ProtocolRow = { id: string; name: string; category: string; verified: boolean; website: string | null };

export async function getProtocols(): Promise<{ state: DataState; rows: ProtocolRow[] }> {
  const client = db();
  if (!client) return { state: "UNAVAILABLE", rows: [] };
  const data = await client`
    select id, name, category, website, verified
      from protocols
     order by name
  `.catch(() => null);
  if (!data) return { state: "UNAVAILABLE", rows: [] };
  const rows = data.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    category: (r.category as string | null) ?? "",
    // Read, not assumed. A protocol is verified when someone confirmed its
    // contracts; the column records whether that happened, and defaults to
    // false so an unreviewed row claims nothing.
    verified: r.verified === true,
    website: (r.website as string | null) ?? null,
  }));
  return { state: rows.length ? "OK" : "INDEXING", rows };
}

export type ContractRow = {
  address: string;
  protocol_id: string | null;
  contract_type: string | null;
  verified: boolean;
};

export async function getContracts(): Promise<{ state: DataState; rows: ContractRow[] }> {
  const client = db();
  if (!client) return { state: "UNAVAILABLE", rows: [] };
  const data = await client`
    select address, protocol_id, contract_type, verified
      from contracts
  `.catch(() => null);
  if (!data) return { state: "UNAVAILABLE", rows: [] };
  const rows = data.map((r) => ({
    address: r.address as string,
    protocol_id: (r.protocol_id as string | null) ?? null,
    contract_type: (r.contract_type as string | null) ?? null,
    verified: r.verified === true,
  }));
  return { state: rows.length ? "OK" : "INDEXING", rows };
}

/* ---------------------------------------------------------------- prices */

export type PriceObservation = { price: number; source: string; observedAt: string };

/**
 * The latest price per asset.
 *
 * Reads canonical_prices — the series where reconciliation has already picked
 * one observation per moment by a stated rule. Reading raw observations here
 * would mean whichever provider answered last wins, which is not a decision,
 * just an ordering.
 *
 * `prices` is the pre-reconciliation table and is consulted only as a fallback,
 * for deployments whose migration has not run yet. Nothing is invented if both
 * are empty: the map comes back empty and every caller renders a state.
 *
 * "Latest per asset" is DISTINCT ON, which is what Postgres has for exactly this
 * question. The previous client could not express it, so it read a page of rows
 * ordered by time and kept the first per asset — correct only while that page
 * happened to contain every asset, and quietly wrong for the assets pushed off
 * the end by a busier one.
 */
export async function getLatestPrices(assetIds: string[]): Promise<Map<string, PriceObservation>> {
  const out = new Map<string, PriceObservation>();
  const client = db();
  if (!client || !assetIds.length) return out;

  const read = async (table: "canonical_prices" | "prices") => {
    const data = await (table === "canonical_prices"
      ? client`
          select distinct on (asset_id) asset_id, price, source, observed_at
            from canonical_prices
           where asset_id = any(${assetIds}::uuid[])
           order by asset_id, observed_at desc
        `
      : client`
          select distinct on (asset_id) asset_id, price, source, observed_at
            from prices
           where asset_id = any(${assetIds}::uuid[])
           order by asset_id, observed_at desc
        `
    ).catch(() => null);
    if (!data) return;
    for (const row of data) {
      const assetId = row.asset_id as string | null;
      if (!assetId) continue;
      // The canonical read runs first; the fallback only fills what it left
      // missing, so a legacy row can never displace a reconciled one.
      if (!out.has(assetId)) {
        out.set(assetId, {
          price: num(row.price),
          source: row.source as string,
          observedAt: iso(row.observed_at) ?? "",
        });
      }
    }
  };

  await read("canonical_prices");
  if (out.size < assetIds.length) await read("prices");
  return out;
}

/* ----------------------------------------------------------------- flows */

/**
 * A precomputed flow row.
 *
 * Net flow is stored per address AND asset, because a net figure only means
 * something inside one unit. `entity_id` is therefore `<address>:<asset_id>`,
 * and `address`/`asset_id` are the parsed halves.
 */
export type FlowWindowRow = {
  entity_type: string;
  entity_id: string;
  address: string;
  asset_id: string | null;
  window: FlowWindow;
  inflow: number;
  outflow: number;
  net_flow: number;
  transaction_count: number;
  unique_counterparties: number;
  calculated_at: string;
};

export async function getFlowWindows(
  window: FlowWindow,
): Promise<{ state: DataState; rows: FlowWindowRow[] }> {
  const client = db();
  if (!client) return { state: "UNAVAILABLE", rows: [] };
  // `window` is a reserved word in Postgres (the OVER clause), so the column has
  // to be quoted everywhere it is named. Unquoted it is a syntax error, not a
  // missing column.
  //
  // Only per-asset rows are readable, which is what the entity_type predicate
  // enforces. Rows written before flow was split by asset summed incomparable
  // units, so they are excluded rather than shown.
  const data = await client`
    select entity_type, entity_id, "window", inflow, outflow, net_flow,
           transaction_count, unique_counterparties, calculated_at
      from flow_windows
     where "window" = ${window}
       and entity_type = 'address_asset'
     order by net_flow desc
     limit 50
  `.catch(() => null);
  if (!data) return { state: "UNAVAILABLE", rows: [] };
  const rows = data.map((r) => {
    const entityId = r.entity_id as string;
    const sep = entityId.lastIndexOf(":");
    return {
      entity_type: r.entity_type as string,
      entity_id: entityId,
      address: sep > 0 ? entityId.slice(0, sep) : entityId,
      asset_id: sep > 0 ? entityId.slice(sep + 1) : null,
      window: r.window as FlowWindow,
      inflow: num(r.inflow),
      outflow: num(r.outflow),
      net_flow: num(r.net_flow),
      transaction_count: num(r.transaction_count),
      unique_counterparties: num(r.unique_counterparties),
      calculated_at: iso(r.calculated_at) ?? "",
    };
  });
  return { state: rows.length ? "OK" : "INDEXING", rows };
}

/**
 * The coverage block every windowed API response carries.
 *
 * A consumer reading `transfers: 412` for a 7D window has no way to know the
 * index only reaches back two hours unless the response says so. This is that
 * sentence, in a shape a machine can act on.
 */
export function coverageBlock(window: FlowWindow, coverage: IndexCoverage, now: number) {
  const windowMs = WINDOW_MS[window];
  const spans = coverage.continuousMs !== null && coverage.continuousMs >= windowMs;
  const holed = gapInsideWindow(coverage, windowMs, now);
  // Covering the window requires BOTH reaching back far enough and having no
  // hole inside it. Either one alone is not coverage.
  const complete = spans && !holed;
  return {
    state: coverage.state,
    /** False when the index reaches back less far than the window asks for. */
    covers_window: complete,
    window_ms: WINDOW_MS[window],
    earliest_indexed_block: coverage.earliestBlock,
    earliest_indexed_time: coverage.earliestAt,
    continuous_since: coverage.continuousSince,
    coverage_duration_ms: coverage.continuousMs,
    gap_blocks: coverage.gapBlocks,
    last_gap_at: coverage.lastGapAt,
    /** True when a skipped range falls inside this window specifically. */
    gap_inside_window: holed,
    note: coverageNote(window, coverage, now),
  };
}

/**
 * Price observations per asset across a window, for point-in-time valuation.
 *
 * Deliberately not "the latest price". Valuing a 24H window needs the price as
 * it was at each moment inside it, so this returns the whole series.
 *
 * The series starts BEFORE the window does, by the alignment tolerance. A
 * transfer in the first minute of the window can only be priced by an
 * observation from before the window opened; without that lead-in the earliest
 * transfers would be unpriceable for no reason other than where the query
 * happened to start.
 *
 * Reads canonical_prices — the reconciled series — and falls back to the legacy
 * `prices` table for deployments whose migration has not run.
 */
export async function getPriceSeries(
  assetIds: string[],
  windowStartIso: string,
  leadInMs: number,
): Promise<Map<string, PriceObservation[]>> {
  const out = new Map<string, PriceObservation[]>();
  const client = db();
  if (!client || !assetIds.length) return out;

  const startMs = Date.parse(windowStartIso);
  const fromIso = Number.isNaN(startMs) ? windowStartIso : new Date(startMs - leadInMs).toISOString();

  const read = async (table: "canonical_prices" | "prices") => {
    // Ordered ascending by time, so each per-asset list is built in the order a
    // point-in-time lookup walks it. The tiebreak on asset_id only makes the
    // row cap deterministic; it does not affect the ordering within an asset.
    const data = await (table === "canonical_prices"
      ? client`
          select asset_id, price, source, observed_at
            from canonical_prices
           where asset_id = any(${assetIds}::uuid[])
             and observed_at >= ${fromIso}
           order by observed_at asc, asset_id
           limit 10000
        `
      : client`
          select asset_id, price, source, observed_at
            from prices
           where asset_id = any(${assetIds}::uuid[])
             and observed_at >= ${fromIso}
           order by observed_at asc, asset_id
           limit 10000
        `
    ).catch(() => null);
    if (!data) return 0;
    for (const row of data) {
      const assetId = row.asset_id as string | null;
      if (!assetId) continue;
      const list = out.get(assetId) ?? [];
      list.push({ price: num(row.price), source: row.source as string, observedAt: iso(row.observed_at) ?? "" });
      out.set(assetId, list);
    }
    return data.length;
  };

  const canonical = await read("canonical_prices");
  if (canonical === 0) await read("prices");
  return out;
}

/**
 * Raw transfers as priceable movements.
 *
 * Each transfer keeps its OWN timestamp. Folding transfers into edges first
 * would sum the amounts and throw those timestamps away, which is what forced
 * the whole window to be valued at one price. A movement has to remember when
 * it happened or it cannot be priced at that moment.
 */
export function movementsFrom(rows: TransferRow[], assets: AssetRow[]): Movement[] {
  const decimals = new Map(assets.map((a) => [a.id, a.decimals]));
  return rows.map((r) => {
    // Every transfer becomes a movement, including the ones that cannot be
    // priced. Skipping them here would remove them from the denominator and
    // make the reported coverage describe a smaller population than the window
    // actually held.
    const d = r.asset_id ? decimals.get(r.asset_id) : undefined;
    return {
      assetId: r.asset_id,
      // fromBaseUnits falls back to 0 rather than NaN on an unparseable amount,
      // so an unknown scale has to be represented as null here — a silent 0
      // would be counted as a priced movement worth nothing.
      amount: d === undefined ? null : fromBaseUnits(r.amount, d),
      at: r.timestamp,
    };
  });
}

/**
 * One precomputed flow row as the API publishes it.
 *
 * Extracted so the rule can be tested directly: an amount is never emitted
 * without the asset it counts. A net_flow of -420 is not a fact — "-420 USDG"
 * is. The row is stored per address AND asset precisely so this can be true,
 * and this is where that pairing survives into the response.
 */
export function describeFlowRow(row: FlowWindowRow, symbols: Map<string, string>) {
  const symbol = row.asset_id ? (symbols.get(row.asset_id) ?? null) : null;
  return {
    // The address alone. The storage key is `<address>:<asset_id>`, which is an
    // implementation detail and is not a resolvable address.
    address: row.address,
    asset: row.asset_id ? { id: row.asset_id, symbol } : null,
    inflow: row.inflow,
    outflow: row.outflow,
    net_flow: row.net_flow,
    unit: symbol,
    transfers: row.transaction_count,
    counterparties: row.unique_counterparties,
    calculated_at: row.calculated_at,
  };
}
