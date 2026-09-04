import { CHAIN } from "@/config/site";

/**
 * Why a figure is withheld, said once.
 *
 * These were written inline at each site, and every one of them named the wrong
 * reason. "No price oracle is wired to chain 4663" is true — there is no
 * on-chain oracle — but it was used as the reason a PRICE was missing, and
 * FOLDMARK has held DEX_SPOT prices since market enrichment shipped. A reader
 * given a true sentence as the answer to a different question learns something
 * false: that the product has no prices at all.
 *
 * The rule these hold to: name the reason THIS figure is absent, not a
 * neighbouring fact that happens to be true.
 */

/** No observation for THIS contract. Other contracts may well be priced. */
export const PRICE_ABSENT =
  "No market observation has been recorded for this contract. FOLDMARK prices an asset only from a pool holding that exact contract, so an absent price here is about this address, not about the chain.";

/**
 * Depth exists, but not as one number per asset.
 *
 * Summing pools would claim a tradeable depth that no single market offers,
 * which is the more expensive lie than saying nothing.
 */
export const LIQUIDITY_NOT_PER_ASSET =
  "Liquidity is a property of a pool, not of an asset. Pools holding this contract are reported individually at /api/v1/market/{contract}; they are never summed, because depth in one market does not make another market deep.";

/**
 * Value needs balances, and head-following never saw the opening balance.
 */
export const PORTFOLIO_VALUE_WITHHELD =
  "A portfolio value needs balances, and FOLDMARK does not hold them: the index follows the head of the chain and never observed these addresses' opening positions, so what it sees is net movement over a window. Multiplying a movement by a price would produce a number that looks like a valuation and is not one.";

/** A holder count needs every transfer since the token existed. */
export const HOLDERS_WITHHELD =
  "Holder counts require balance reconstruction over the full history. The index follows the head of the chain and does not reach the first transfer, so any count it produced would be a count of addresses seen recently, not of holders.";

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
