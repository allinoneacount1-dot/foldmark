/**
 * FOLDMARK read layer.
 *
 * Every function returns Measured<T> or a shape carrying an explicit DataState.
 * When the pipeline has not observed something we return INDEXING / EMPTY /
 * UNAVAILABLE — never a placeholder number.
 *
 * Aggregation happens in JS over bounded row windows because the Supabase REST
 * client cannot express GROUP BY. When a window hits its row cap the result is
 * reported as PARTIAL rather than presented as complete.
 */

import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { ROBINHOOD_CHAIN, getPulse } from "@/lib/chain";
import { WINDOW_MS, type FlowWindow, type AssetType } from "@/config/site";
import { fromBaseUnits } from "@/lib/format";
import { type DataState, type Measured, indexing, measured, unavailable } from "@/lib/data-state";

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

function db() {
  return isSupabaseConfigured() && supabase ? supabase : null;
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
      lastProcessedBlock: unavailable<number>(DB, "Supabase is not configured for this deployment"),
      chainHead: head,
      lagBlocks: unavailable<number>(LAG),
      updatedAt: null,
    };
  }

  const { data, error } = await client
    .from("indexer_state")
    .select("last_processed_block, updated_at")
    .eq("chain_id", ROBINHOOD_CHAIN.id)
    .maybeSingle();

  if (error || !data) {
    return {
      lastProcessedBlock: indexing<number>(DB, "Indexer cursor not initialised"),
      chainHead: head,
      lagBlocks: indexing<number>(LAG),
      updatedAt: null,
    };
  }

  const last = Number(data.last_processed_block) || 0;
  const updatedAt = (data.updated_at as string) ?? null;

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

export async function getAssets(): Promise<{ state: DataState; rows: AssetRow[] }> {
  const client = db();
  if (!client) return { state: "UNAVAILABLE", rows: [] };
  const { data, error } = await client
    .from("assets")
    .select("id, contract_address, symbol, name, asset_type, verified, decimals, source")
    .eq("chain_id", ROBINHOOD_CHAIN.id)
    .order("symbol");
  if (error) return { state: "UNAVAILABLE", rows: [] };
  const rows = (data ?? []) as AssetRow[];
  return { state: rows.length ? "OK" : "INDEXING", rows };
}

export async function getAssetByAddress(contract: string): Promise<AssetRow | null> {
  const client = db();
  if (!client) return null;
  const { data } = await client
    .from("assets")
    .select("id, contract_address, symbol, name, asset_type, verified, decimals, source")
    .eq("contract_address", contract.toLowerCase())
    .maybeSingle();
  return (data as AssetRow | null) ?? null;
}

export async function getAssetBySymbolOrAddress(key: string): Promise<AssetRow | null> {
  const byAddress = await getAssetByAddress(key);
  if (byAddress) return byAddress;
  const client = db();
  if (!client) return null;
  const { data } = await client
    .from("assets")
    .select("id, contract_address, symbol, name, asset_type, verified, decimals, source")
    .ilike("symbol", key)
    .limit(1)
    .maybeSingle();
  return (data as AssetRow | null) ?? null;
}

/* ------------------------------------------------------------ transfers */

export async function getTransfersSince(
  isoSince: string,
  opts: { assetId?: string; address?: string; limit?: number } = {},
): Promise<{ state: DataState; rows: TransferRow[]; capped: boolean }> {
  const client = db();
  if (!client) return { state: "UNAVAILABLE", rows: [], capped: false };
  const limit = opts.limit ?? ROW_CAP;

  let q = client
    .from("transfers")
    .select("tx_hash, log_index, block_number, asset_id, from_address, to_address, amount, timestamp")
    .gte("timestamp", isoSince)
    .order("block_number", { ascending: false })
    .limit(limit);

  if (opts.assetId) q = q.eq("asset_id", opts.assetId);
  if (opts.address) {
    const a = opts.address.toLowerCase();
    q = q.or("from_address.eq." + a + ",to_address.eq." + a);
  }

  const { data, error } = await q;
  if (error) return { state: "UNAVAILABLE", rows: [], capped: false };
  const rows = (data ?? []) as TransferRow[];
  const capped = rows.length >= limit;
  return { state: rows.length ? (capped ? "PARTIAL" : "OK") : "EMPTY", rows, capped };
}

export async function getRecentTransfers(limit = 40): Promise<{ state: DataState; rows: TransferRow[] }> {
  const client = db();
  if (!client) return { state: "UNAVAILABLE", rows: [] };
  const { data, error } = await client
    .from("transfers")
    .select("tx_hash, log_index, block_number, asset_id, from_address, to_address, amount, timestamp")
    .order("block_number", { ascending: false })
    .limit(limit);
  if (error) return { state: "UNAVAILABLE", rows: [] };
  const rows = (data ?? []) as TransferRow[];
  return { state: rows.length ? "OK" : "INDEXING", rows };
}

/* ----------------------------------------------------------- aggregates */

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
};

export async function getWindowActivity(window: FlowWindow, now: number): Promise<WindowActivity> {
  const { state, rows, capped } = await getTransfersSince(since(window, now));
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
    state,
    window,
    transfers: rows.length,
    activeAddresses: addresses.size,
    activeAssets: assets.size,
    uniquePairs: pairs.size,
    capped,
    buckets,
    bucketMinutes: Math.round(span / BUCKETS / 60000),
    rows,
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

export type AddressActivity = {
  address: string;
  inbound: number;
  outbound: number;
  transfers: number;
  counterparties: number;
};

export function foldByAddress(rows: TransferRow[], assets: AssetRow[], limit = 12): AddressActivity[] {
  const decimals = new Map(assets.map((a) => [a.id, a.decimals]));
  const map = new Map<string, AddressActivity>();
  const cp = new Map<string, Set<string>>();
  const touch = (addr: string) => {
    let e = map.get(addr);
    if (!e) {
      e = { address: addr, inbound: 0, outbound: 0, transfers: 0, counterparties: 0 };
      map.set(addr, e);
      cp.set(addr, new Set<string>());
    }
    return e;
  };
  for (const r of rows) {
    const amt = fromBaseUnits(r.amount, decimals.get(r.asset_id ?? "") ?? 18);
    const f = touch(r.from_address);
    const t = touch(r.to_address);
    f.outbound += amt;
    f.transfers += 1;
    cp.get(r.from_address)!.add(r.to_address);
    t.inbound += amt;
    t.transfers += 1;
    cp.get(r.to_address)!.add(r.from_address);
  }
  for (const [addr, e] of map) e.counterparties = cp.get(addr)?.size ?? 0;
  return [...map.values()].sort((a, b) => b.inbound + b.outbound - (a.inbound + a.outbound)).slice(0, limit);
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

/** Exact row count, so a page never reports "10 assets" because it capped at 10. */
export async function countRows(table: "assets" | "transfers" | "wallets"): Promise<Measured<number>> {
  const client = db();
  if (!client) return unavailable<number>(DB, "Supabase is not configured");
  const { count, error } = await client.from(table).select("id", { count: "exact", head: true });
  if (error) {
    // `wallets` is keyed by address and has no id column
    const retry = await client.from(table).select("*", { count: "exact", head: true });
    if (retry.error) return unavailable<number>(DB, "Count query failed");
    return measured(retry.count ?? 0, DB, { observedAt: new Date().toISOString() });
  }
  return measured(count ?? 0, DB, { observedAt: new Date().toISOString() });
}

/* --------------------------------------------------------------- wallets */

export async function getObservedWallets(
  limit = 24,
): Promise<{ state: DataState; rows: { address: string; last_seen: string | null }[] }> {
  const client = db();
  if (!client) return { state: "UNAVAILABLE", rows: [] };
  const { data, error } = await client
    .from("wallets")
    .select("address, last_seen")
    .order("last_seen", { ascending: false })
    .limit(limit);
  if (error) return { state: "UNAVAILABLE", rows: [] };
  const rows = (data ?? []) as { address: string; last_seen: string | null }[];
  return { state: rows.length ? "OK" : "INDEXING", rows };
}

/* ------------------------------------------------------------- protocols */

export type ProtocolRow = { id: string; name: string; category: string; verified: boolean; website: string | null };

export async function getProtocols(): Promise<{ state: DataState; rows: ProtocolRow[] }> {
  const client = db();
  if (!client) return { state: "UNAVAILABLE", rows: [] };
  const { data, error } = await client
    .from("protocols")
    .select("id, name, category, verified, website")
    .order("name");
  if (error) return { state: "UNAVAILABLE", rows: [] };
  const rows = (data ?? []) as ProtocolRow[];
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
  const { data, error } = await client
    .from("contracts")
    .select("address, protocol_id, contract_type, verified");
  if (error) return { state: "UNAVAILABLE", rows: [] };
  const rows = (data ?? []) as ContractRow[];
  return { state: rows.length ? "OK" : "INDEXING", rows };
}

/* ---------------------------------------------------------------- prices */

export type PriceObservation = { price: number; source: string; observedAt: string };

export async function getLatestPrices(assetIds: string[]): Promise<Map<string, PriceObservation>> {
  const out = new Map<string, PriceObservation>();
  const client = db();
  if (!client || !assetIds.length) return out;
  const { data, error } = await client
    .from("prices")
    .select("asset_id, price, source, observed_at")
    .in("asset_id", assetIds)
    .order("observed_at", { ascending: false })
    .limit(500);
  if (error || !data) return out;
  for (const row of data as { asset_id: string; price: number; source: string; observed_at: string }[]) {
    if (!out.has(row.asset_id)) {
      out.set(row.asset_id, { price: Number(row.price), source: row.source, observedAt: row.observed_at });
    }
  }
  return out;
}

/* ----------------------------------------------------------------- flows */

export type FlowWindowRow = {
  entity_type: string;
  entity_id: string;
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
  const { data, error } = await client
    .from("flow_windows")
    .select("entity_type, entity_id, window, inflow, outflow, net_flow, transaction_count, unique_counterparties, calculated_at")
    .eq("window", window)
    .order("net_flow", { ascending: false })
    .limit(50);
  if (error) return { state: "UNAVAILABLE", rows: [] };
  const rows = (data ?? []) as FlowWindowRow[];
  return { state: rows.length ? "OK" : "INDEXING", rows };
}
