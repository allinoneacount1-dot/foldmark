import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { collectObservations, persistObservations, TIER_INTERVAL_MS, type Tier } from "@/server/market-data";
import { reconcileAll } from "@/server/market-data/reconcile";
import { CHAIN } from "@/config/site";

/**
 * Price ingestion.
 *
 * The refresh set is chosen by attention, not by fairness: an asset someone is
 * looking at is worth spending a call on, the long tail is worth one now and
 * then. That is the whole mechanism keeping a free quota alive.
 *
 * Runs server-side only, on the same schedule as the indexer. A browser never
 * reaches a provider, so a hundred readers still cost one request.
 */

/** Last refresh per contract, so a tier's interval is actually respected. */
const lastRefresh = new Map<string, number>();

/** Contracts recently requested by a reader. Decays into the colder tiers. */
const recentlyViewed = new Map<string, number>();

const VIEW_TTL_MS = 5 * 60_000;

/** Called when a reader opens an asset, so the next sweep prioritises it. */
export function markViewed(contractAddress: string, now = Date.now()): void {
  recentlyViewed.set(contractAddress.toLowerCase(), now);
}

function tierFor(contract: string, index: number, now: number): Tier {
  const viewed = recentlyViewed.get(contract);
  if (viewed && now - viewed < VIEW_TTL_MS) return "ACTIVE";
  if (index < 10) return "HOT";
  return "INDEXED";
}

function isDue(contract: string, tier: Tier, now: number): boolean {
  const interval = TIER_INTERVAL_MS[tier];
  if (!Number.isFinite(interval)) return false;
  const last = lastRefresh.get(contract) ?? 0;
  return now - last >= interval;
}

export type IngestionResult = {
  considered: number;
  refreshed: number;
  observations: number;
  written: number;
  skipped: number;
  byTier: Record<Tier, number>;
  divergences: { contract: string; spreadPct: number }[];
  durationMs: number;
};

/**
 * One ingestion sweep.
 *
 * Assets are ranked by observed activity so the busiest contracts sit in the
 * hot tier. Everything that is due is fetched in one batched round, reconciled,
 * and written to the price history.
 */
export async function ingestPrices(limit = 40): Promise<IngestionResult> {
  const started = Date.now();
  const empty: IngestionResult = {
    considered: 0,
    refreshed: 0,
    observations: 0,
    written: 0,
    skipped: 0,
    byTier: { ACTIVE: 0, HOT: 0, INDEXED: 0, DORMANT: 0 },
    divergences: [],
    durationMs: 0,
  };

  if (!isSupabaseConfigured() || !supabase) return { ...empty, durationMs: Date.now() - started };
  const sb = supabase;

  const { data: assets, error } = await sb
    .from("assets")
    .select("id, contract_address")
    .eq("chain_id", CHAIN.id)
    .limit(limit);

  if (error || !assets?.length) return { ...empty, durationMs: Date.now() - started };

  const now = Date.now();
  const byTier: Record<Tier, number> = { ACTIVE: 0, HOT: 0, INDEXED: 0, DORMANT: 0 };
  const due: string[] = [];

  assets.forEach((a, index) => {
    const contract = String(a.contract_address).toLowerCase();
    const tier = tierFor(contract, index, now);
    byTier[tier] += 1;
    if (isDue(contract, tier, now)) due.push(contract);
  });

  if (!due.length) {
    return { ...empty, considered: assets.length, byTier, durationMs: Date.now() - started };
  }

  const observations = await collectObservations(due);
  for (const contract of due) lastRefresh.set(contract, now);

  const snapshots = reconcileAll(observations, now);
  const divergences = [...snapshots.values()]
    .filter((s) => s.divergence)
    .map((s) => ({ contract: s.contractAddress, spreadPct: s.divergence!.spreadPct }));

  const { written, skipped } = await persistObservations(observations);

  return {
    considered: assets.length,
    refreshed: due.length,
    observations: observations.length,
    written,
    skipped,
    byTier,
    divergences,
    durationMs: Date.now() - started,
  };
}
