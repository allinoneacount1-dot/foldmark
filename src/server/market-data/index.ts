import { CHAIN } from "@/config/site";
import type { MarketPrice, MarketSnapshot } from "@/server/market-data/types";
import { reconcileAll } from "@/server/market-data/reconcile";
import * as geckoterminal from "@/server/market-data/providers/geckoterminal";
import * as dexscreener from "@/server/market-data/providers/dexscreener";
import { PROVIDERS } from "@/server/market-data/registry";
import { readMarketState } from "@/server/market-data/state";
import { isProviderEnabled } from "@/config/providers";

/**
 * The market data facade.
 *
 * This is the only thing the application talks to. Pages, API routes and the
 * chart depend on MarketSnapshot; none of them has ever seen a provider
 * response, so a provider can be replaced, throttled or removed without
 * touching a single component.
 *
 *   UI / API  ->  this module  ->  cache + budget  ->  provider
 *   ingestion ->  this module  ->  reconcile  ->  persist  ->  Postgres
 *
 * Every call is server-side. A hundred readers produce one outbound request,
 * and none of them writes a row.
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
  // Two gates, not one: the provider must serve this chain (a probed fact) and
  // this deployment must permit calling it (an owner's decision).
  const results = await Promise.allSettled([
    isProviderEnabled("geckoterminal") ? geckoterminal.fetchTokenPrices(unique) : Promise.resolve([]),
    isProviderEnabled("dexscreener") ? dexscreener.fetchTokenPrices(unique) : Promise.resolve([]),
  ]);

  const observations: MarketPrice[] = [];
  for (const r of results) if (r.status === "fulfilled") observations.push(...r.value);
  return observations;
}

/**
 * Current market state for a set of contracts, for reading.
 *
 * Reads stored state. It does not fetch, and that is the point: if rendering a
 * page called a provider, the product's cost would scale with its audience and
 * a free quota would last minutes. One scheduled process fetches; every reader
 * selects what that process wrote.
 *
 * It also does not persist. A reader that writes is how duplicate history gets
 * manufactured — the write path belongs to the ingestion pass, where a fetch
 * genuinely happened and one process owns the decision.
 *
 * An asset with no stored row is absent from the map, and the interface renders
 * a state for it. Nothing is invented to fill the gap.
 */
export async function getMarketSnapshots(addresses: string[]): Promise<Map<string, MarketSnapshot>> {
  return readMarketState(addresses);
}

/**
 * Fetch, reconcile, and return current state — the ingestion path only.
 *
 * Named so that calling it from a page reads as obviously wrong. Every call
 * here spends provider quota.
 */
export async function fetchAndReconcile(addresses: string[], now = Date.now()): Promise<Map<string, MarketSnapshot>> {
  const observations = await collectObservations(addresses);
  return reconcileAll(observations, now);
}

export async function getMarketSnapshot(address: string): Promise<MarketSnapshot | null> {
  const snapshots = await getMarketSnapshots([address]);
  return snapshots.get(address.toLowerCase()) ?? null;
}

/* ------------------------------------------------------------- attribution */

/** Attribution required by the providers actually in use. */
export function requiredAttribution(): string[] {
  // Only providers actually called incur an attribution obligation.
  return Object.values(PROVIDERS)
    .filter((p) => isProviderEnabled(p.id) && p.attribution)
    .map((p) => p.attribution!);
}

export { persistObservations } from "@/server/market-data/persist";

export { readMarketState, writeMarketState } from "@/server/market-data/state";
export const CHAIN_ID = CHAIN.id;
