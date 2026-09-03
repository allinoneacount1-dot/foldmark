import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { isFreshFetch } from "@/server/market-data/cache";
import type { MarketPrice, MarketSnapshot } from "@/server/market-data/types";

/**
 * Price history persistence.
 *
 * Two rules decide whether anything is written, and both exist to stop the
 * product inventing history it never observed.
 *
 * 1. A cache read is not an observation. Only a value that arrived from a
 *    network call this process actually made may become a row. Reading the same
 *    cached quote three times must produce one row, not three.
 *
 * 2. Uniqueness is not the price. Two genuine observations can carry the same
 *    number, and throwing the second away would discard a real data point. What
 *    makes an observation unique is which source produced it, for which asset,
 *    at which venue, from which network fetch.
 *
 * Raw observations and the canonical series are stored separately: the first is
 * what each source said, the second is the one coherent series a chart may read.
 */

/** Bumped when the selection rule changes, so past choices stay auditable. */
export const METHODOLOGY_VERSION = "2026-09-04.rank-by-type-then-depth-and-age";

export type PersistResult = {
  /** Observations that arrived from a real network call. */
  eligible: number;
  /** Rejected because they came from cache — the anti-fabrication guard. */
  fromCache: number;
  /** Rows written to price_observations. */
  observationsWritten: number;
  /** Rows the unique constraint already held. */
  duplicates: number;
  /** Rows written to canonical_prices. */
  canonicalWritten: number;
  /** Observations for a contract the index has never seen. */
  unknownAsset: number;
};

const EMPTY: PersistResult = {
  eligible: 0,
  fromCache: 0,
  observationsWritten: 0,
  duplicates: 0,
  canonicalWritten: 0,
  unknownAsset: 0,
};

/**
 * Which observations may become history.
 *
 * Exported for tests: this predicate is the whole anti-fabrication guarantee,
 * so it is worth being able to assert on directly.
 */
export function persistable(observations: MarketPrice[]): {
  eligible: MarketPrice[];
  fromCache: MarketPrice[];
} {
  const eligible: MarketPrice[] = [];
  const fromCache: MarketPrice[] = [];
  for (const o of observations) {
    if (isFreshFetch(o)) eligible.push(o);
    else fromCache.push(o);
  }
  return { eligible, fromCache };
}

/** The row identity used for deduplication. Never includes the price. */
export function observationKey(o: MarketPrice, assetId: string): string {
  return [assetId, o.source, o.priceType, o.fetchedAt, o.pairAddress ?? ""].join("|");
}

export async function persistObservations(
  observations: MarketPrice[],
  snapshots?: Map<string, MarketSnapshot>,
): Promise<PersistResult> {
  if (!isSupabaseConfigured() || !supabase || !observations.length) {
    return { ...EMPTY, fromCache: observations.length };
  }
  const sb = supabase;

  const { eligible, fromCache } = persistable(observations);
  if (!eligible.length) return { ...EMPTY, fromCache: fromCache.length };

  // Resolve contracts to asset ids. An observation for a contract the index has
  // never seen is dropped rather than orphaned.
  const addresses = [...new Set(eligible.map((o) => o.contractAddress))];
  const { data: assets, error } = await sb
    .from("assets")
    .select("id, contract_address")
    .in("contract_address", addresses);

  if (error || !assets?.length) {
    return { ...EMPTY, eligible: eligible.length, fromCache: fromCache.length, unknownAsset: eligible.length };
  }

  const idByAddress = new Map(assets.map((a) => [String(a.contract_address).toLowerCase(), a.id as string]));

  const seen = new Set<string>();
  let unknownAsset = 0;
  const rows: Record<string, unknown>[] = [];

  for (const o of eligible) {
    const assetId = idByAddress.get(o.contractAddress);
    if (!assetId) {
      unknownAsset += 1;
      continue;
    }
    // de-duplicate within the batch as well as against the table
    const key = observationKey(o, assetId);
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({
      asset_id: assetId,
      chain_id: o.chainId,
      price: o.price,
      currency: o.currency,
      price_type: o.priceType,
      source: o.source,
      provider_timestamp: o.providerTimestamp,
      fetched_at: o.fetchedAt,
      observed_at: o.observedAt,
      block_number: o.blockNumber,
      pair_address: o.pairAddress,
      dex_id: o.dexId,
      liquidity_usd: o.liquidityUsd,
      liquidity_basis: o.liquidityBasis,
    });
  }

  if (!rows.length) {
    return { ...EMPTY, eligible: eligible.length, fromCache: fromCache.length, unknownAsset };
  }

  // The unique constraint absorbs anything already recorded, so a retry or an
  // overlapping sweep cannot double-count.
  const { error: insertError, count } = await sb
    .from("price_observations")
    .upsert(rows, {
      onConflict: "asset_id,source,price_type,fetched_at,pair_address",
      ignoreDuplicates: true,
      count: "exact",
    });

  const observationsWritten = insertError ? 0 : (count ?? rows.length);
  const duplicates = rows.length - observationsWritten;

  const canonicalWritten = snapshots ? await persistCanonical(snapshots, idByAddress) : 0;

  return {
    eligible: eligible.length,
    fromCache: fromCache.length,
    observationsWritten,
    duplicates,
    canonicalWritten,
    unknownAsset,
  };
}

/**
 * The canonical series.
 *
 * One row per asset per moment, naming the observation that was selected and
 * the rule that selected it. This is the only table an OHLC series may read,
 * which is what stops a chart printing a high from one provider and a low from
 * another as though a single venue had traded through both.
 */
async function persistCanonical(
  snapshots: Map<string, MarketSnapshot>,
  idByAddress: Map<string, string>,
): Promise<number> {
  if (!isSupabaseConfigured() || !supabase) return 0;
  const sb = supabase;

  const rows = [...snapshots.values()]
    .map((snapshot) => {
      const c = snapshot.canonical;
      if (!c) return null;
      // never canonicalise something that was not itself a real fetch
      if (!isFreshFetch(c)) return null;
      const assetId = idByAddress.get(snapshot.contractAddress);
      if (!assetId) return null;

      return {
        asset_id: assetId,
        price: c.price,
        currency: c.currency,
        price_type: c.priceType,
        source: c.source,
        pair_address: c.pairAddress,
        dex_id: c.dexId,
        liquidity_usd: c.liquidityUsd,
        observed_at: c.observedAt,
        methodology_version: METHODOLOGY_VERSION,
        divergence_pct: snapshot.divergence?.spreadPct ?? null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (!rows.length) return 0;

  const { error, count } = await sb
    .from("canonical_prices")
    .upsert(rows, { onConflict: "asset_id,observed_at,source", ignoreDuplicates: true, count: "exact" });

  return error ? 0 : (count ?? rows.length);
}
