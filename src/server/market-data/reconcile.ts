import { freshnessFor, type MarketPrice, type MarketSnapshot, type PriceType } from "@/server/market-data/types";
import { CHAIN } from "@/config/site";

/**
 * Reconciliation.
 *
 * When several sources quote the same asset they will disagree, and the
 * disagreement is information. This module therefore does two things it is easy
 * to get wrong by doing the obvious thing instead:
 *
 *   it never averages       — an illiquid pool and a deep one are not two
 *                             samples of the same quantity
 *   it never hides a spread — divergence is surfaced, not smoothed away
 *
 * One observation is chosen to display, by a stated rule, and every other
 * observation stays attached to it.
 */

/** Authority by kind of price, highest first. Depth and recency break ties. */
const TYPE_RANK: Record<PriceType, number> = {
  REFERENCE: 4, // the issuer's own quote for the underlying
  ORACLE: 3, // an on-chain feed with a round and an update time
  DEX_SPOT: 2, // what it actually trades at, subject to depth
  AGGREGATED: 1, // a provider's cross-venue blend
};

/**
 * Confidence, from evidence rather than a model.
 *
 * Depth dominates: a quote against $10M of reserve is worth far more than the
 * same quote against $5k. Age is a straight penalty. Nothing here is tuned to
 * make a number look good.
 */
export function scoreConfidence(price: MarketPrice, now: number): number {
  const liquidity = price.liquidityUsd ?? 0;
  // $1k -> ~0.0, $100k -> ~0.5, $10M -> ~1.0
  const depth = liquidity <= 0 ? 0.15 : Math.min(1, Math.log10(liquidity + 1) / 7);

  const ageMs = Math.max(0, now - new Date(price.observedAt).getTime());
  const recency = ageMs <= 30_000 ? 1 : ageMs <= 120_000 ? 0.8 : ageMs <= 600_000 ? 0.5 : 0.2;

  const authority = TYPE_RANK[price.priceType] / 4;

  return Number(Math.min(1, depth * 0.45 + recency * 0.3 + authority * 0.25).toFixed(3));
}

/**
 * How far two quotes may sit apart before it is worth saying so.
 *
 * A thin pool moving 3% from a deep one is ordinary; two deep venues doing the
 * same is not. The tolerance therefore scales with the shallower side.
 */
function divergenceTolerancePct(a: MarketPrice, b: MarketPrice): number {
  const thinner = Math.min(a.liquidityUsd ?? 0, b.liquidityUsd ?? 0);
  if (thinner < 10_000) return 8;
  if (thinner < 100_000) return 4;
  if (thinner < 1_000_000) return 2;
  return 1;
}

export function reconcile(contractAddress: string, observations: MarketPrice[], now = Date.now()): MarketSnapshot {
  const scored = observations
    .filter((o) => Number.isFinite(o.price) && o.price > 0)
    .map((o) => ({
      ...o,
      confidence: scoreConfidence(o, now),
      freshness: freshnessFor(o.priceType, new Date(o.observedAt).getTime(), now),
    }))
    .filter((o) => o.freshness !== "UNAVAILABLE");

  if (!scored.length) {
    return {
      contractAddress: contractAddress.toLowerCase(),
      chainId: CHAIN.id,
      canonical: null,
      observations: [],
      divergence: null,
      methodology:
        "No source returned a usable quote for this contract. Nothing is estimated, carried forward or interpolated in its place.",
    };
  }

  // Rank by authority, then by evidence. Never by whichever number looks nicer.
  const ranked = [...scored].sort((a, b) => {
    const type = TYPE_RANK[b.priceType] - TYPE_RANK[a.priceType];
    if (type !== 0) return type;
    const conf = b.confidence - a.confidence;
    if (Math.abs(conf) > 0.05) return conf;
    return new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime();
  });

  const canonical = ranked[0];

  // Compare only within one price type: a reference quote and a pool price are
  // different quantities, so a gap between them is not a divergence.
  const sameType = scored.filter((o) => o.priceType === canonical.priceType);
  let divergence: MarketSnapshot["divergence"] = null;

  if (sameType.length > 1) {
    const sorted = [...sameType].sort((a, b) => a.price - b.price);
    const lowest = sorted[0];
    const highest = sorted[sorted.length - 1];
    const spreadPct = ((highest.price - lowest.price) / lowest.price) * 100;
    if (spreadPct > divergenceTolerancePct(lowest, highest)) {
      divergence = { highest, lowest, spreadPct: Number(spreadPct.toFixed(3)) };
    }
  }

  return {
    contractAddress: contractAddress.toLowerCase(),
    chainId: CHAIN.id,
    canonical,
    observations: scored,
    divergence,
    methodology:
      "Sources are ranked by price type — issuer reference, then on-chain oracle, then DEX spot, then aggregate — and within a type by confidence, which is derived from pool depth and observation age. The highest ranked observation is displayed; the others are kept beside it. Prices are never averaged across sources or across types, and a spread wider than the tolerance for the shallower venue is reported as a divergence rather than smoothed away.",
  };
}

/** Reconcile many assets at once, keyed by lower-cased contract address. */
export function reconcileAll(observations: MarketPrice[], now = Date.now()): Map<string, MarketSnapshot> {
  const byContract = new Map<string, MarketPrice[]>();
  for (const o of observations) {
    const key = o.contractAddress.toLowerCase();
    const list = byContract.get(key) ?? [];
    list.push(o);
    byContract.set(key, list);
  }

  const out = new Map<string, MarketSnapshot>();
  for (const [address, list] of byContract) out.set(address, reconcile(address, list, now));
  return out;
}
