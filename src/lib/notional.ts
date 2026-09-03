/**
 * Converting observed flow into a comparable figure.
 *
 * Token units do not add up. One NVDA plus one AAPL plus one USDG is not three
 * of anything, so FOLDMARK reports flow per asset and ranks by counts. That is
 * correct, and it is also less useful than a single number would be — the
 * honest single number is notional value, and it exists only when every asset
 * in the sum has a price the product actually observed, recently enough for the
 * multiplication to mean something.
 *
 * This module is that conversion and, more importantly, its refusal. Three
 * rules decide what comes out:
 *
 * 1. An asset with no price is never assigned one. It is excluded and named.
 * 2. A price older than MAX_ACCEPTABLE_PRICE_AGE_MS is treated as no price.
 *    Multiplying today's flow by last week's quote produces a number that looks
 *    like measurement and is not.
 * 3. If anything was excluded, the result is PARTIAL and says what is missing.
 *    A total that silently covers four of nine assets is worse than no total.
 *
 * The output is therefore either a number with its coverage stated, or nothing.
 */

export type NotionalState = "OK" | "PARTIAL" | "UNAVAILABLE";

/** The staleness ceiling. A quote older than this cannot price current flow. */
export const MAX_ACCEPTABLE_PRICE_AGE_MS = 15 * 60_000;

export type NotionalFlow = {
  assetId: string;
  /** Amount in the asset's own units, already scaled out of base units. */
  amount: number;
};

export type NotionalPrice = {
  price: number;
  /** When the market was observed — not when the row was written. */
  observedAt: string;
  source: string;
};

export type NotionalExclusion = {
  assetId: string;
  reason: "NO_PRICE" | "PRICE_TOO_OLD" | "PRICE_NOT_FINITE";
  ageMs: number | null;
};

export type Notional = {
  state: NotionalState;
  /** USD notional, or null when nothing could be converted. */
  usd: number | null;
  /** Assets that carried a usable price. */
  covered: string[];
  /** Assets deliberately left out, each with the reason. */
  excluded: NotionalExclusion[];
  /** Share of assets converted, 0..1. Counting assets, not value — the value is what is being computed. */
  coverage: number;
  /** Age of the oldest price used, so a reader can judge the figure. */
  oldestPriceAgeMs: number | null;
  maxAcceptablePriceAgeMs: number;
  sources: string[];
};

const EMPTY: Notional = {
  state: "UNAVAILABLE",
  usd: null,
  covered: [],
  excluded: [],
  coverage: 0,
  oldestPriceAgeMs: null,
  maxAcceptablePriceAgeMs: MAX_ACCEPTABLE_PRICE_AGE_MS,
  sources: [],
};

/**
 * Sum flow across assets in USD, or explain why that cannot be done.
 *
 * `now` is passed in rather than read, so a page computes every figure against
 * one timestamp and a test can assert on staleness without waiting.
 */
export function toNotional(
  flows: NotionalFlow[],
  prices: Map<string, NotionalPrice>,
  now: number,
  maxAgeMs: number = MAX_ACCEPTABLE_PRICE_AGE_MS,
): Notional {
  if (!flows.length) return { ...EMPTY, maxAcceptablePriceAgeMs: maxAgeMs };

  // Several flows can name the same asset; price each asset once.
  const byAsset = new Map<string, number>();
  for (const f of flows) {
    if (!Number.isFinite(f.amount)) continue;
    byAsset.set(f.assetId, (byAsset.get(f.assetId) ?? 0) + f.amount);
  }
  if (!byAsset.size) return { ...EMPTY, maxAcceptablePriceAgeMs: maxAgeMs };

  let usd = 0;
  const covered: string[] = [];
  const excluded: NotionalExclusion[] = [];
  const sources = new Set<string>();
  let oldestPriceAgeMs: number | null = null;

  for (const [assetId, amount] of byAsset) {
    const price = prices.get(assetId);
    if (!price) {
      excluded.push({ assetId, reason: "NO_PRICE", ageMs: null });
      continue;
    }

    const observed = Date.parse(price.observedAt);
    const ageMs = Number.isNaN(observed) ? null : now - observed;

    if (!Number.isFinite(price.price) || price.price <= 0) {
      excluded.push({ assetId, reason: "PRICE_NOT_FINITE", ageMs });
      continue;
    }
    // An unparseable timestamp is an unknown age, and an unknown age fails the
    // rule the same way a known-old one does.
    if (ageMs === null || ageMs > maxAgeMs) {
      excluded.push({ assetId, reason: "PRICE_TOO_OLD", ageMs });
      continue;
    }

    usd += amount * price.price;
    covered.push(assetId);
    sources.add(price.source);
    if (oldestPriceAgeMs === null || ageMs > oldestPriceAgeMs) oldestPriceAgeMs = ageMs;
  }

  if (!covered.length) {
    return {
      ...EMPTY,
      excluded,
      coverage: 0,
      maxAcceptablePriceAgeMs: maxAgeMs,
    };
  }

  return {
    state: excluded.length ? "PARTIAL" : "OK",
    usd,
    covered,
    excluded,
    coverage: covered.length / byAsset.size,
    oldestPriceAgeMs,
    maxAcceptablePriceAgeMs: maxAgeMs,
    sources: [...sources].sort(),
  };
}

/** One line a reader can act on, naming the coverage rather than hiding it. */
export function notionalNote(n: Notional): string {
  if (n.state === "UNAVAILABLE") {
    const aged = n.excluded.filter((e) => e.reason === "PRICE_TOO_OLD").length;
    return aged
      ? `No notional total: every priced asset's last quote is older than ${Math.round(n.maxAcceptablePriceAgeMs / 60_000)} minutes.`
      : "No notional total: no asset in this window has an observed price.";
  }
  const pct = Math.round(n.coverage * 100);
  if (n.state === "PARTIAL") {
    return `Notional covers ${pct}% of the assets that moved (${n.covered.length} of ${n.covered.length + n.excluded.length}). Assets without a fresh price are excluded, not estimated.`;
  }
  return `Notional covers every asset that moved, each priced within ${Math.round(n.maxAcceptablePriceAgeMs / 60_000)} minutes of this request.`;
}
