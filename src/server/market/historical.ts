/**
 * Historical market intelligence.
 *
 * SERVER ONLY.
 *
 * This module reads persisted observations and feeds them to the canonical
 * alignment in `@/lib/notional`. It adds no pricing rules of its own: the
 * no-look-ahead policy, the fifteen-minute window and the exclusion accounting
 * all live there, and duplicating any of them here would create a second set of
 * semantics that could drift from the first.
 *
 * WHAT THE DATA ACTUALLY SUPPORTS TODAY. Price observations began accumulating
 * when market enrichment was switched on; transfers reach back further. So most
 * transfers have no observation at or before them within the window, and are
 * UNPRICED. That is the correct answer, not a shortfall to paper over — pricing
 * them with the observations that do exist would be look-ahead, which is exactly
 * how a backtest lies. Coverage is reported alongside every total.
 */

import { selectRows } from "@/server/db/supabase";
import {
  prepareSeries,
  toNotional,
  MAX_ALIGNMENT_DELTA_MS,
  DEFAULT_ALIGNMENT,
  type Movement,
  type PricePoint,
  type Notional,
} from "@/lib/notional";
import { fromBaseUnits } from "@/lib/format";

/** One observed price for an asset, with the pool it came from. */
export type HistoricalPricePoint = {
  price: number;
  observedAt: string;
  priceType: string;
  provider: string | null;
  pairAddress: string | null;
};

export type PriceHistory = {
  assetId: string;
  points: HistoricalPricePoint[];
  /** The window the observations actually span. Never the window a chart shows. */
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  /** Distinct pools contributing. Series from different pools are not merged. */
  pairs: string[];
  provider: string | null;
};

/**
 * Real DEX_SPOT observations for one asset, oldest first.
 *
 * Only DEX_SPOT is returned. REFERENCE observations describe an external
 * instrument and must never end up in an on-chain price series; the filter is
 * the firewall.
 */
export async function priceHistory(assetId: string, limit = 500): Promise<PriceHistory> {
  const rows = await selectRows<Record<string, unknown>>(
    "prices",
    `select=price,observed_at,price_type,provider,pair_address&asset_id=eq.${encodeURIComponent(assetId)}&price_type=eq.DEX_SPOT&order=observed_at.asc&limit=${limit}`,
  );

  const points: HistoricalPricePoint[] = [];
  const pairs = new Set<string>();
  let provider: string | null = null;

  for (const r of rows ?? []) {
    const price = Number(r.price);
    const observedAt = String(r.observed_at ?? "");
    if (!Number.isFinite(price) || price <= 0 || !observedAt) continue;
    const pair = (r.pair_address as string | null) ?? null;
    if (pair) pairs.add(pair);
    provider = provider ?? ((r.provider as string | null) ?? null);
    points.push({
      price,
      observedAt,
      priceType: String(r.price_type ?? "DEX_SPOT"),
      provider: (r.provider as string | null) ?? null,
      pairAddress: pair,
    });
  }

  return {
    assetId,
    points,
    firstObservedAt: points[0]?.observedAt ?? null,
    lastObservedAt: points[points.length - 1]?.observedAt ?? null,
    pairs: [...pairs],
    provider,
  };
}

export type NotionalCoverage = {
  notional: Notional;
  /** Movements that could be valued. */
  priced: number;
  /** Movements deliberately left unvalued, with the reason kept. */
  unpriced: number;
  coverageRatio: number;
  alignmentWindowMs: number;
  methodology: string;
  /** True when observations exist but none reach back to the oldest movement. */
  priceHistoryStartsAfterOldestMovement: boolean;
};

const METHODOLOGY =
  "Each transfer is valued at a DEX_SPOT observation taken at or before its block time, within 15 minutes of it. No observation, no value: a transfer is never priced by a later quote, by a neighbour, or by the current price. Totals are reported with the share of transfers actually priced.";

/**
 * USD notional for one asset's observed transfers, with coverage.
 *
 * Amounts are converted from base units using the asset's decimals. Where
 * decimals are unknown the movement carries a null amount and the canonical
 * aligner counts it as unpriced rather than assuming a scale.
 */
export async function assetNotional(
  assetId: string,
  decimals: number,
  opts: { sinceIso?: string; limit?: number } = {},
): Promise<NotionalCoverage> {
  const limit = opts.limit ?? 2000;
  const filters = [
    `select=amount,timestamp`,
    `asset_id=eq.${encodeURIComponent(assetId)}`,
    "order=timestamp.desc",
    `limit=${limit}`,
  ];
  if (opts.sinceIso) filters.push(`timestamp=gte.${encodeURIComponent(opts.sinceIso)}`);

  const [transfers, history] = await Promise.all([
    selectRows<Record<string, unknown>>("transfers", filters.join("&")),
    priceHistory(assetId),
  ]);

  const movements: Movement[] = (transfers ?? []).map((t) => ({
    assetId,
    // Base units to display units. Unknown decimals would make the scale
    // unknown, which the aligner records rather than guesses.
    amount: Number.isFinite(decimals) ? fromBaseUnits(String(t.amount ?? "0"), decimals) : null,
    at: String(t.timestamp ?? ""),
  }));

  const pricePoints = new Map<string, PricePoint[]>([
    [
      assetId,
      history.points.map((p) => ({
        price: p.price,
        observedAt: p.observedAt,
        source: `${p.provider ?? "provider"} · ${p.priceType}${p.pairAddress ? ` · pool ${p.pairAddress}` : ""}`,
      })),
    ],
  ]);

  /**
   * The canonical aligner already counts priced, excluded and coverage. Those
   * numbers are read from it rather than recomputed here: a second tally could
   * drift from the first, and then two parts of the product would disagree
   * about the same transfers.
   */
  const notional = toNotional(movements, prepareSeries(pricePoints), DEFAULT_ALIGNMENT);
  const priced = notional.transfersPriced;
  const unpriced = notional.transfersExcluded;

  /**
   * The dominant reason for low coverage on this deployment, stated as a fact
   * rather than left for a reader to infer from a small percentage.
   */
  const oldestMovement = movements.reduce<string | null>((oldest, m) => {
    if (!m.at) return oldest;
    return !oldest || m.at < oldest ? m.at : oldest;
  }, null);
  const startsAfter =
    Boolean(history.firstObservedAt && oldestMovement && history.firstObservedAt > oldestMovement);

  return {
    notional,
    priced,
    unpriced,
    coverageRatio: notional.coverage,
    alignmentWindowMs: MAX_ALIGNMENT_DELTA_MS,
    methodology: METHODOLOGY,
    priceHistoryStartsAfterOldestMovement: startsAfter,
  };
}
