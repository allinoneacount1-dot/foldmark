import { CHAIN } from "@/config/site";

/**
 * Sentences about what FOLDMARK is not showing, derived from what it holds.
 *
 * These lived as constants on the asset passport, and the constants went stale
 * the day market enrichment started working: the page told a reader that no
 * venue had been observed quoting this contract while listing twenty pools and
 * a price four hundred pixels below it. A page that contradicts itself is worse
 * than a page that says nothing, because a reader cannot tell which half to
 * believe — and the half that was wrong was the half claiming absence, which is
 * the claim this product is least entitled to make carelessly.
 *
 * So the reason a metric is withheld is computed from what is actually held.
 * With no observations the answer is that there are none. With observations the
 * answer is the real one: a per-window series would need a price aligned to
 * each window, and observations that began recently cannot value an older
 * window without look-ahead.
 *
 * They live here rather than in the page so the derivation can be tested
 * directly. A sentence asserting absence deserves a test.
 */
export type WithheldMetric = readonly [metric: string, reason: string];

export function withheldMetrics(observations: number, pools: number): readonly WithheldMetric[] {
  return [
    [
      "PRICE",
      observations > 0
        ? "Prices are observed, not sampled on a schedule, so there is no per-window series to fold. A transfer is valued only by an observation at or before it; older windows have none and are reported unpriced rather than valued with a later quote. The observed series is charted below."
        : `No venue has been observed quoting this contract on chain ${CHAIN.id} yet, so there is no price to fold into a window. Nothing is estimated in its place.`,
    ],
    [
      "LIQUIDITY",
      pools > 0
        ? "Depth is read per pool, as it stands now. It is not folded into a window because a pool's depth today is not its depth during a past window, and carrying it backwards would describe a market that did not exist. The pools are listed with their own figures."
        : "Depth is read from the pool that produced a quote. No DEX pool has been identified for this contract, so there is nothing to read it from.",
    ],
  ];
}
