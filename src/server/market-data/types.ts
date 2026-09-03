import type { ProviderId } from "@/server/market-data/registry";

/**
 * The normalized market model.
 *
 * The interface and the API depend on these shapes, never on a provider's own
 * response. Swapping or losing a provider must be a change inside
 * src/server/market-data and nowhere else.
 */

/**
 * Price types are never collapsed into one another.
 *
 * An illiquid pool legitimately disagrees with a reference quote, and that
 * disagreement is information. Averaging them would destroy it.
 */
export type PriceType =
  /** The underlying instrument's quote, from its issuer. */
  | "REFERENCE"
  /** An on-chain oracle reading, with a round and an update time. */
  | "ORACLE"
  /** What the token actually trades at in a specific pool. */
  | "DEX_SPOT"
  /** A provider's own cross-venue aggregate. */
  | "AGGREGATED";

/**
 * How current a value is, in the terms the source itself can support.
 *
 * A sixty-second cached quote is never labelled LIVE. The word is reserved for
 * data that arrived because the chain pushed it.
 */
export type Freshness =
  /** Event-driven from the chain. */
  | "LIVE"
  /** A recent provider update, seconds old. */
  | "NEAR_REALTIME"
  /** Served from a provider or our own cache, still inside its validity. */
  | "CACHED"
  /** Older than the source's expected update interval. */
  | "STALE"
  /** No trustworthy source answered. */
  | "UNAVAILABLE";

export type MarketPrice = {
  assetId: string | null;
  contractAddress: string;
  chainId: number;
  price: number;
  currency: string;
  priceType: PriceType;
  source: ProviderId;
  /** When FOLDMARK recorded it. */
  observedAt: string;
  /** When the provider says the value was true, if it tells us. */
  providerTimestamp: string | null;
  blockNumber: number | null;
  pairAddress: string | null;
  liquidityUsd: number | null;
  /** 0..1. Depth and recency, not a model output — see reconcile.ts. */
  confidence: number;
  freshness: Freshness;
};

/** Everything known about one asset's price right now, with the disagreements kept. */
export type MarketSnapshot = {
  contractAddress: string;
  chainId: number;
  /** The value the interface should show, chosen by an explicit rule. */
  canonical: MarketPrice | null;
  /** Every observation that informed it, including the ones not chosen. */
  observations: MarketPrice[];
  /** Set when sources disagree by more than the tolerance for their depth. */
  divergence: {
    highest: MarketPrice;
    lowest: MarketPrice;
    spreadPct: number;
  } | null;
  /** Why `canonical` is the one shown. */
  methodology: string;
};

export type ProviderStatus =
  | "UP"
  | "DEGRADED"
  | "RATE_LIMITED"
  | "STALE"
  | "DOWN"
  /** Not wired in this deployment — see registry.ts for why. */
  | "DISABLED";

export type ProviderHealth = {
  id: ProviderId;
  status: ProviderStatus;
  lastSuccess: string | null;
  lastFailure: string | null;
  lastError: string | null;
  /** Round-trip of the most recent successful call. */
  latencyMs: number | null;
  consecutiveErrors: number;
  callsThisMinute: number;
  callsThisMonth: number;
  minuteBudget: number | null;
  monthBudget: number | null;
  /** Requests answered from cache rather than sent, as a share of all asks. */
  cacheHitRate: number | null;
};

/** Freshness budgets per source, in milliseconds. */
export const FRESHNESS_BUDGET_MS: Record<PriceType, number> = {
  REFERENCE: 30_000,
  ORACLE: 120_000,
  DEX_SPOT: 90_000,
  AGGREGATED: 300_000,
};

export function freshnessFor(priceType: PriceType, observedAtMs: number, now: number): Freshness {
  const age = now - observedAtMs;
  if (age < 0) return "NEAR_REALTIME"; // provider clock ahead of ours; not an error
  const budget = FRESHNESS_BUDGET_MS[priceType];
  if (age <= budget * 0.25) return "NEAR_REALTIME";
  if (age <= budget) return "CACHED";
  return "STALE";
}
