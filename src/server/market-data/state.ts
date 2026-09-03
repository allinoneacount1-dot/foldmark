import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { METHODOLOGY_VERSION } from "@/server/market-data/persist";
import { scoreConfidence } from "@/server/market-data/reconcile";
import { freshnessFor } from "@/server/market-data/types";
import type { MarketPrice, MarketSnapshot, PriceType, LiquidityBasis } from "@/server/market-data/types";
import type { ProviderId } from "@/server/market-data/registry";
import { CHAIN } from "@/config/site";

/**
 * The read/write split.
 *
 * A page render must never be a provider call. If it is, the product's cost
 * scales with its audience: ten readers on one asset is ten outbound requests,
 * a free quota lasts minutes, and popularity becomes an outage. That is the
 * failure mode this module exists to make impossible.
 *
 *   writeMarketState()  called only by the scheduler, after a real fetch
 *   readMarketState()   called by every page and API route, touches no network
 *
 * There is deliberately no function here that can fetch. A reader cannot spend
 * quota because a reader has nothing to spend it with.
 *
 * A stale row is still returned. A real quote from four minutes ago, labelled
 * as four minutes old, is worth more to someone than an empty panel — and the
 * freshness field means they can tell the difference.
 */

type MarketStateRow = {
  asset_id: string;
  chain_id: number;
  contract_address: string;
  price: number;
  currency: string;
  price_type: string;
  source: string;
  dex_id: string | null;
  pair_address: string | null;
  liquidity_usd: number | null;
  liquidity_basis: string | null;
  observed_at: string;
  fetched_at: string;
  persisted_at: string;
  divergence_pct: number | null;
  observation_quality: number | null;
  methodology_version: string;
};

/**
 * Persist the current market state for each asset.
 *
 * Called from the ingestion pass, where a fetch actually happened. One row per
 * asset, replaced in place: this is state, not history — history lives in
 * price_observations and canonical_prices and is never overwritten.
 */
export async function writeMarketState(
  snapshots: Map<string, MarketSnapshot>,
  idByAddress: Map<string, string>,
): Promise<number> {
  if (!isSupabaseConfigured() || !supabase || !snapshots.size) return 0;
  const sb = supabase;

  const rows = [...snapshots.values()]
    .map((snapshot) => {
      const c = snapshot.canonical;
      if (!c) return null;
      const assetId = idByAddress.get(snapshot.contractAddress);
      if (!assetId) return null;

      return {
        asset_id: assetId,
        chain_id: snapshot.chainId,
        contract_address: snapshot.contractAddress,
        price: c.price,
        currency: c.currency,
        price_type: c.priceType,
        source: c.source,
        dex_id: c.dexId,
        pair_address: c.pairAddress,
        liquidity_usd: c.liquidityUsd,
        liquidity_basis: c.liquidityBasis,
        observed_at: c.observedAt,
        fetched_at: c.fetchedAt,
        persisted_at: new Date().toISOString(),
        divergence_pct: snapshot.divergence?.spreadPct ?? null,
        observation_quality: c.confidence,
        methodology_version: METHODOLOGY_VERSION,
        updated_at: new Date().toISOString(),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (!rows.length) return 0;

  const { error, count } = await sb
    .from("market_state")
    .upsert(rows, { onConflict: "asset_id", count: "exact" });

  return error ? 0 : (count ?? rows.length);
}

/**
 * Read the stored market state for a set of contracts.
 *
 * Touches only the database. Freshness is recomputed against `now` rather than
 * stored, because how old a row is depends on when you ask.
 */
export async function readMarketState(
  addresses: string[],
  now = Date.now(),
): Promise<Map<string, MarketSnapshot>> {
  const out = new Map<string, MarketSnapshot>();
  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))].filter(Boolean);
  if (!isSupabaseConfigured() || !supabase || !unique.length) return out;

  const { data, error } = await supabase
    .from("market_state")
    .select(
      "asset_id, chain_id, contract_address, price, currency, price_type, source, dex_id, pair_address, liquidity_usd, liquidity_basis, observed_at, fetched_at, persisted_at, divergence_pct, observation_quality, methodology_version",
    )
    .in("contract_address", unique);

  if (error || !data) return out;

  for (const row of data as MarketStateRow[]) {
    const contractAddress = String(row.contract_address).toLowerCase();

    const priceType = row.price_type as PriceType;
    const price: MarketPrice = {
      assetId: row.asset_id,
      contractAddress,
      chainId: Number(row.chain_id) || CHAIN.id,
      price: Number(row.price),
      currency: row.currency,
      priceType,
      source: row.source as ProviderId,
      observedAt: row.observed_at,
      fetchedAt: row.fetched_at,
      providerTimestamp: null,
      // A row read back is not a fetch. Nothing downstream may record it as an
      // observation, and this field is what stops that happening.
      cacheState: "FRESH",
      blockNumber: null,
      pairAddress: row.pair_address,
      dexId: row.dex_id,
      liquidityUsd: row.liquidity_usd === null ? null : Number(row.liquidity_usd),
      liquidityBasis: (row.liquidity_basis as LiquidityBasis | null) ?? null,
      // Stored at write time, so the row keeps the quality it was judged to
      // have. Freshness is the exception: how old a row is depends on when the
      // question is asked, so it is recomputed against the caller's clock.
      confidence: row.observation_quality === null ? 0 : Number(row.observation_quality),
      freshness: freshnessFor(priceType, Date.parse(row.observed_at), now),
    };

    if (row.observation_quality === null) price.confidence = scoreConfidence(price, now);

    out.set(contractAddress, {
      contractAddress,
      chainId: price.chainId,
      canonical: price,
      // The stored state is one value. The observations behind it are history,
      // and asking for them is a different question with a different endpoint.
      observations: [price],
      divergence: null,
      methodology: `Stored market state, written by the ingestion pass under methodology ${row.methodology_version}. Selected from that sweep's observations by the stated rule; served from storage, so reading this page made no provider call. Persisted ${row.persisted_at}.`,
    });
  }

  return out;
}
