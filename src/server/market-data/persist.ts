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
  /**
   * How the row identity was enforced on this write.
   *
   * PAIR_KEY      the null-safe column exists; duplicates are impossible.
   * LEGACY_NULLABLE  the migration has not run here, so the database still
   *                  treats two NULL pair addresses as distinct rows and only
   *                  the in-process guard is stopping duplicates. Reported
   *                  rather than hidden, because it is a real weakening.
   */
  identityMode: "PAIR_KEY" | "LEGACY_NULLABLE";
  /** Canonical rows that could be traced back to their raw observation row. */
  canonicalLinked: number;
};

const EMPTY: PersistResult = {
  eligible: 0,
  fromCache: 0,
  observationsWritten: 0,
  duplicates: 0,
  canonicalWritten: 0,
  unknownAsset: 0,
  identityMode: "PAIR_KEY",
  canonicalLinked: 0,
};

/**
 * The identity a row is deduplicated by.
 *
 * pair_key is pair_address with NULL collapsed to the empty string. The
 * database cannot deduplicate on a nullable column — Postgres treats two NULLs
 * as different values, so every pairless observation would be insertable
 * forever. Collapsing it here is what makes the unique index mean something.
 */
const IDENTITY_WITH_PAIR_KEY = "asset_id,source,price_type,fetched_at,pair_key";
const IDENTITY_LEGACY = "asset_id,source,price_type,fetched_at,pair_address";

/** True when the database has not learned about pair_key yet. */
function missingPairKey(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return text.includes("pair_key") || text.includes("pgrst204") || text.includes("42703");
}

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
      // The same fact with no NULL in it, so the unique index can hold.
      pair_key: o.pairAddress ?? "",
      dex_id: o.dexId,
      liquidity_usd: o.liquidityUsd,
      liquidity_basis: o.liquidityBasis,
    });
  }

  if (!rows.length) {
    return { ...EMPTY, eligible: eligible.length, fromCache: fromCache.length, unknownAsset };
  }

  /**
   * The unique index absorbs anything already recorded, so a retry or an
   * overlapping sweep cannot double-count.
   *
   * `.select()` is what makes the provenance link possible: the rows that come
   * back carry the database ids the canonical series needs to point at.
   */
  let identityMode: PersistResult["identityMode"] = "PAIR_KEY";
  let inserted = await sb
    .from("price_observations")
    .upsert(rows, { onConflict: IDENTITY_WITH_PAIR_KEY, ignoreDuplicates: true, count: "exact" })
    .select("id, asset_id, source, price_type, fetched_at, pair_key");

  if (inserted.error && missingPairKey(inserted.error)) {
    /**
     * The pair_key migration has not run on this deployment.
     *
     * Fall back to the legacy identity so ingestion keeps working, and say so
     * in the result. Under this mode the database will happily store the same
     * pairless observation twice; only the in-process guard above is preventing
     * it, and that guard does not survive a restart or a second instance.
     */
    identityMode = "LEGACY_NULLABLE";
    const legacyRows = rows.map((row) => {
      const legacy = { ...row };
      delete legacy.pair_key;
      return legacy;
    });
    inserted = await sb
      .from("price_observations")
      .upsert(legacyRows, { onConflict: IDENTITY_LEGACY, ignoreDuplicates: true, count: "exact" })
      .select("id, asset_id, source, price_type, fetched_at, pair_address");
  }

  const observationsWritten = inserted.error ? 0 : (inserted.count ?? inserted.data?.length ?? 0);
  const duplicates = rows.length - observationsWritten;

  const canonical = snapshots
    ? await persistCanonical(snapshots, idByAddress, observationIds(inserted.data))
    : { written: 0, linked: 0 };

  return {
    eligible: eligible.length,
    fromCache: fromCache.length,
    observationsWritten,
    duplicates,
    canonicalWritten: canonical.written,
    unknownAsset,
    identityMode,
    canonicalLinked: canonical.linked,
  };
}

/**
 * Database ids for the observations this write actually inserted.
 *
 * Keyed the same way `observationKey` keys them, so a canonical selection can
 * find the exact row it chose. An observation that was already stored — a retry,
 * an overlapping sweep — does not come back from an ignoreDuplicates upsert and
 * so is simply absent; the canonical row is still written, with a null link.
 * A missing link is a smaller loss than a missing price.
 */
export function observationIds(
  data: { id: string; asset_id: string; source: string; price_type: string; fetched_at: string; pair_key?: string; pair_address?: string | null }[] | null,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const row of data ?? []) {
    const pair = row.pair_key ?? row.pair_address ?? "";
    out.set([row.asset_id, row.source, row.price_type, row.fetched_at, pair].join("|"), row.id);
  }
  return out;
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
  observationRowIds: Map<string, string>,
): Promise<{ written: number; linked: number }> {
  if (!isSupabaseConfigured() || !supabase) return { written: 0, linked: 0 };
  const sb = supabase;
  let linked = 0;

  const rows = [...snapshots.values()]
    .map((snapshot) => {
      const c = snapshot.canonical;
      if (!c) return null;
      // never canonicalise something that was not itself a real fetch
      if (!isFreshFetch(c)) return null;
      const assetId = idByAddress.get(snapshot.contractAddress);
      if (!assetId) return null;

      /**
       * The provenance link.
       *
       * Points at the exact raw row this selection chose, so a past canonical
       * decision can be audited against the observation behind it rather than
       * merely described. Null when the raw row was already stored and did not
       * come back from the insert — the price is still written, because the
       * value was measured and only the pointer is unknown.
       */
      const sourceObservationId = observationRowIds.get(observationKey(c, assetId)) ?? null;
      if (sourceObservationId) linked += 1;

      return {
        asset_id: assetId,
        price: c.price,
        currency: c.currency,
        price_type: c.priceType,
        source: c.source,
        source_observation_id: sourceObservationId,
        pair_address: c.pairAddress,
        dex_id: c.dexId,
        liquidity_usd: c.liquidityUsd,
        observed_at: c.observedAt,
        methodology_version: METHODOLOGY_VERSION,
        divergence_pct: snapshot.divergence?.spreadPct ?? null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (!rows.length) return { written: 0, linked: 0 };

  const { error, count } = await sb
    .from("canonical_prices")
    .upsert(rows, { onConflict: "asset_id,observed_at,source", ignoreDuplicates: true, count: "exact" });

  if (error) return { written: 0, linked: 0 };
  return { written: count ?? rows.length, linked };
}
