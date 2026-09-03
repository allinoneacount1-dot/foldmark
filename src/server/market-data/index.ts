import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { CHAIN } from "@/config/site";
import type { MarketPrice, MarketSnapshot } from "@/server/market-data/types";
import { reconcileAll } from "@/server/market-data/reconcile";
import * as geckoterminal from "@/server/market-data/providers/geckoterminal";
import * as dexscreener from "@/server/market-data/providers/dexscreener";
import { PROVIDERS } from "@/server/market-data/registry";

/**
 * The market data facade.
 *
 * This is the only thing the application talks to. Pages, API routes and the
 * chart depend on MarketSnapshot; none of them has ever seen a provider
 * response, so a provider can be replaced, throttled or removed without
 * touching a single component.
 *
 *   UI / API  ->  this module  ->  cache + budget  ->  provider  ->  Postgres
 *
 * Every call is server-side. A hundred readers produce one outbound request.
 */

/**
 * Refresh priority.
 *
 * A free quota is finite, so it is spent where someone is looking. This is the
 * scheduler's whole job: the asset on screen is worth a call, the long tail is
 * worth one occasionally.
 */
export type Tier = "ACTIVE" | "HOT" | "INDEXED" | "DORMANT";

export const TIER_INTERVAL_MS: Record<Tier, number> = {
  ACTIVE: 20_000, // the asset being viewed
  HOT: 60_000, // what the dashboard is showing
  INDEXED: 300_000, // everything else the index knows
  DORMANT: Infinity, // only when asked for
};

/** Fetch fresh observations for a set of contracts from every usable provider. */
export async function collectObservations(addresses: string[]): Promise<MarketPrice[]> {
  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))].filter(Boolean);
  if (!unique.length) return [];

  // Providers run concurrently and independently: one being rate limited or
  // down must never stop the others from answering.
  const results = await Promise.allSettled([
    PROVIDERS.geckoterminal.chainSupport === "SUPPORTED" ? geckoterminal.fetchTokenPrices(unique) : Promise.resolve([]),
    PROVIDERS.dexscreener.chainSupport === "SUPPORTED" ? dexscreener.fetchTokenPrices(unique) : Promise.resolve([]),
  ]);

  const observations: MarketPrice[] = [];
  for (const r of results) if (r.status === "fulfilled") observations.push(...r.value);
  return observations;
}

/**
 * Current market state for a set of contracts.
 *
 * Live observations are reconciled against each other and then persisted, so
 * today's quote becomes tomorrow's history. That accumulation is the point:
 * FOLDMARK should end up owning a dataset no provider can revoke.
 */
export async function getMarketSnapshots(addresses: string[]): Promise<Map<string, MarketSnapshot>> {
  const observations = await collectObservations(addresses);
  const snapshots = reconcileAll(observations);

  if (observations.length) {
    // fire and forget: a storage problem must not fail a read
    void persistObservations(observations).catch(() => {});
  }

  return snapshots;
}

export async function getMarketSnapshot(address: string): Promise<MarketSnapshot | null> {
  const snapshots = await getMarketSnapshots([address]);
  return snapshots.get(address.toLowerCase()) ?? null;
}

/* ------------------------------------------------------------ persistence */

/**
 * Write observations to the price history.
 *
 * Resolves contract addresses to asset ids first: the `prices` table is keyed
 * by asset, and an observation for a contract the index has never seen is
 * dropped rather than orphaned.
 */
export async function persistObservations(observations: MarketPrice[]): Promise<{ written: number; skipped: number }> {
  if (!isSupabaseConfigured() || !supabase || !observations.length) {
    return { written: 0, skipped: observations.length };
  }
  const sb = supabase;

  const addresses = [...new Set(observations.map((o) => o.contractAddress))];
  const { data: assets, error } = await sb
    .from("assets")
    .select("id, contract_address")
    .in("contract_address", addresses);

  if (error || !assets?.length) return { written: 0, skipped: observations.length };

  const idByAddress = new Map(assets.map((a) => [String(a.contract_address).toLowerCase(), a.id as string]));

  const rows = observations
    .map((o) => {
      const assetId = idByAddress.get(o.contractAddress);
      if (!assetId) return null;
      return {
        asset_id: assetId,
        price: o.price,
        currency: o.currency,
        source: `${o.source}:${o.priceType.toLowerCase()}`,
        block_number: o.blockNumber,
        observed_at: o.observedAt,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (!rows.length) return { written: 0, skipped: observations.length };

  const { error: insertError } = await sb.from("prices").insert(rows);
  if (insertError) return { written: 0, skipped: observations.length };

  return { written: rows.length, skipped: observations.length - rows.length };
}

/* ------------------------------------------------------------- attribution */

/** Attribution required by the providers actually in use. */
export function requiredAttribution(): string[] {
  return Object.values(PROVIDERS)
    .filter((p) => p.chainSupport === "SUPPORTED" && p.attribution)
    .map((p) => p.attribution!);
}

export const CHAIN_ID = CHAIN.id;
