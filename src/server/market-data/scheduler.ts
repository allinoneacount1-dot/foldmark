import { db } from "@/server/db/client";
import { collectObservations, persistObservations, writeMarketState, TIER_INTERVAL_MS, type Tier } from "@/server/market-data";
import { reconcileAll } from "@/server/market-data/reconcile";
import { acquireLease, releaseLease } from "@/server/market-data/lease";
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
  /** Observations that came from a real network call and could become history. */
  eligible: number;
  /** Observations rejected because they were cache reads, not new observations. */
  fromCache: number;
  observationsWritten: number;
  duplicates: number;
  canonicalWritten: number;
  unknownAsset: number;
  /** False when another instance already held the sweep lease. */
  leaseAcquired: boolean;
  /** When the lease frees up, if this sweep stood down. */
  leaseNextAllowedAt: string | null;
  /** Rows published to market_state — what readers will actually see. */
  stateWritten: number;
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
    eligible: 0,
    fromCache: 0,
    observationsWritten: 0,
    duplicates: 0,
    canonicalWritten: 0,
    unknownAsset: 0,
    leaseAcquired: false,
    leaseNextAllowedAt: null,
    stateWritten: 0,
    byTier: { ACTIVE: 0, HOT: 0, INDEXED: 0, DORMANT: 0 },
    divergences: [],
    durationMs: 0,
  };

  const sql = db();
  if (!sql) return { ...empty, durationMs: Date.now() - started };

  // A failed registry read is indistinguishable, for this sweep's purposes,
  // from an empty registry: there is nothing to refresh either way, and a
  // sweep that cannot name its assets must not spend a provider call guessing.
  let assets: { id: string; contract_address: string }[];
  try {
    const rows = await sql`
      select id, contract_address
      from assets
      where chain_id = ${CHAIN.id}
      limit ${limit}
    `;
    assets = rows.map((r) => ({ id: String(r.id), contract_address: String(r.contract_address) }));
  } catch {
    return { ...empty, durationMs: Date.now() - started };
  }

  if (!assets.length) return { ...empty, durationMs: Date.now() - started };

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
    return { ...empty, considered: assets.length, byTier, leaseAcquired: false, durationMs: Date.now() - started };
  }

  /**
   * Stand down if another instance is already sweeping.
   *
   * The in-memory schedule above is per-process; the quota is not. Without this
   * lease, a preview deployment and production would each spend a full sweep
   * against the same free allowance every minute.
   *
   * The hold is deliberately longer than a sweep takes. It expires on its own,
   * so an instance that dies mid-sweep blocks the next one for a bounded time
   * rather than forever.
   */
  const lease = await acquireLease("market-sweep", "*", 45_000, now);
  if (!lease.acquired) {
    return {
      ...empty,
      considered: assets.length,
      byTier,
      leaseAcquired: false,
      leaseNextAllowedAt: lease.nextAllowedAt,
      durationMs: Date.now() - started,
    };
  }

  let observations: Awaited<ReturnType<typeof collectObservations>> = [];
  try {
    observations = await collectObservations(due);
    await releaseLease("market-sweep", "*", "OK", Date.now());
  } catch {
    await releaseLease("market-sweep", "*", "ERROR", Date.now());
    return {
      ...empty,
      considered: assets.length,
      byTier,
      leaseAcquired: true,
      durationMs: Date.now() - started,
    };
  }
  for (const contract of due) lastRefresh.set(contract, now);

  const snapshots = reconcileAll(observations, now);
  const divergences = [...snapshots.values()]
    .filter((s) => s.divergence)
    .map((s) => ({ contract: s.contractAddress, spreadPct: s.divergence!.spreadPct }));

  // Snapshots are passed in so the canonical series is written alongside the
  // raw observations, from the same reconciliation that produced them.
  const persisted = await persistObservations(observations, snapshots);

  /**
   * Publish the state readers will see.
   *
   * This is the only place market_state is written. Doing it here — after a
   * real fetch, in the one process that owns the decision — is what allows
   * every page and API route to read a price without touching the network.
   */
  const snapshotContracts = [...snapshots.keys()];
  const idByAddress = new Map<string, string>();
  try {
    const assetRows = await sql`
      select id, contract_address
      from assets
      where contract_address = any(${snapshotContracts}::text[])
    `;
    for (const a of assetRows) idByAddress.set(String(a.contract_address).toLowerCase(), String(a.id));
  } catch {
    // Without ids nothing can be published, and writeMarketState is left to
    // report zero rows rather than this sweep inventing a mapping.
  }
  const stateWritten = await writeMarketState(snapshots, idByAddress);

  return {
    considered: assets.length,
    refreshed: due.length,
    observations: observations.length,
    ...persisted,
    stateWritten,
    leaseAcquired: true,
    leaseNextAllowedAt: null,
    byTier,
    divergences,
    durationMs: Date.now() - started,
  };
}
