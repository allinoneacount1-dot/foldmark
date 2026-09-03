/**
 * Converting observed flow into a comparable figure.
 *
 * Token units do not add up. One NVDA plus one AAPL plus one USDG is not three
 * of anything, so FOLDMARK reports flow per asset and ranks by counts. That is
 * correct, and it is also less useful than a single number would be — the
 * honest single number is notional value.
 *
 * The trap this module exists to avoid is subtler than refusing to add units.
 * It is pricing the past with the present.
 *
 * A 24H window holds transfers from every hour of that day. Multiplying all of
 * them by the newest quote — however fresh that quote is relative to *now* —
 * values a transfer from 23 hours ago at today's price. The result looks like a
 * measurement, carries a plausible number, and describes nothing that happened.
 * A current price is not a historical price.
 *
 * So each movement is priced at its own moment:
 *
 *   1. Find the observation nearest that movement's timestamp.
 *   2. By default only an observation AT OR BEFORE the movement may price it.
 *      Pricing a transfer with a quote from after it is look-ahead — using
 *      information that did not exist yet, which is how backtests lie.
 *   3. The gap between the two must be within MAX_ALIGNMENT_DELTA_MS.
 *   4. A movement with no aligned price is EXCLUDED and counted. It is never
 *      interpolated, never carried forward, never priced by a neighbour.
 *
 * The result reports how many movements were priced and how many were not, so
 * a partial total can never be mistaken for a complete one.
 */

export type NotionalState = "OK" | "PARTIAL" | "UNAVAILABLE";

/**
 * How far a price observation may sit from the movement it prices.
 *
 * Fifteen minutes: long enough that a quiet asset with sparse quotes can still
 * be valued, short enough that the price and the transfer belong to the same
 * market conditions. Beyond it the number stops being a measurement.
 */
export const MAX_ALIGNMENT_DELTA_MS = 15 * 60_000;

export type AlignmentPolicy = {
  /** Maximum |movement time − price time|. */
  maxAlignmentDeltaMs: number;
  /**
   * When true, only an observation at or before the movement may price it.
   * FOLDMARK does not interpolate, so this stays true: a later quote pricing an
   * earlier transfer is look-ahead, and look-ahead is how a number stops being
   * a record of what was knowable at the time.
   */
  noLookAhead: boolean;
};

export const DEFAULT_ALIGNMENT: AlignmentPolicy = {
  maxAlignmentDeltaMs: MAX_ALIGNMENT_DELTA_MS,
  noLookAhead: true,
};

/**
 * One observed movement at one moment.
 *
 * `assetId` and `amount` are nullable so that a transfer the indexer could not
 * fully identify still ARRIVES here and is counted. Dropping such transfers
 * before the count would shrink the denominator and inflate coverage — the
 * total would silently become "of the transfers we could price, we priced all
 * of them", which is not a measurement of anything.
 */
export type Movement = {
  /** null when the indexer never identified the token contract. */
  assetId: string | null;
  /** In the asset's own units. null when its decimals are unknown, so the scale is unknown. */
  amount: number | null;
  /** ISO timestamp of the transfer itself, not of the window it falls in. */
  at: string;
};

export type PricePoint = {
  price: number;
  /** When the market was observed — not when the row was written. */
  observedAt: string;
  source: string;
};

/** Price points per asset, ascending by observation time. Built by prepareSeries. */
export type PriceSeries = Map<string, InternalPoint[]>;

type InternalPoint = { ms: number; price: number; observedAt: string; source: string };

export type AlignmentFailure =
  /** The transfer's token was never identified, so there is nothing to price. */
  | "NO_ASSET"
  /** The token is known but its decimals are not, so the amount has no scale. */
  | "AMOUNT_UNKNOWN_SCALE"
  /** No price observation exists for this asset at all. */
  | "NO_SERIES"
  /** Observations exist, but none at or before this movement. */
  | "NO_PRIOR_OBSERVATION"
  /** The nearest usable observation is further away than the policy allows. */
  | "DELTA_EXCEEDED"
  /** The movement itself carries no readable timestamp, so it cannot be aligned. */
  | "UNDATED_MOVEMENT"
  /** The movement's amount is not a finite number. */
  | "AMOUNT_NOT_FINITE";

export type Notional = {
  state: NotionalState;
  /** USD notional of the priced movements only, or null when none were priced. */
  usd: number | null;

  /** Every movement considered. */
  transfersTotal: number;
  /** Movements that found an aligned price. */
  transfersPriced: number;
  /** Movements deliberately left out, with the reason counted below. */
  transfersExcluded: number;
  /** transfersPriced / transfersTotal, 0..1. */
  coverage: number;

  excludedByReason: Record<AlignmentFailure, number>;
  /** Which assets could not be priced, and why, for a reader to act on. */
  excludedAssets: { assetId: string; reason: AlignmentFailure; movements: number }[];

  /** The largest gap between a movement and the price used for it. */
  oldestAlignmentDeltaMs: number | null;
  maxAlignmentDeltaMs: number;
  noLookAhead: boolean;

  pricedAssets: string[];
  sources: string[];
};

const NO_FAILURES: Record<AlignmentFailure, number> = {
  NO_ASSET: 0,
  AMOUNT_UNKNOWN_SCALE: 0,
  NO_SERIES: 0,
  NO_PRIOR_OBSERVATION: 0,
  DELTA_EXCEEDED: 0,
  UNDATED_MOVEMENT: 0,
  AMOUNT_NOT_FINITE: 0,
};

function emptyResult(policy: AlignmentPolicy, total = 0): Notional {
  return {
    state: "UNAVAILABLE",
    usd: null,
    transfersTotal: total,
    transfersPriced: 0,
    transfersExcluded: total,
    coverage: 0,
    excludedByReason: { ...NO_FAILURES },
    excludedAssets: [],
    oldestAlignmentDeltaMs: null,
    maxAlignmentDeltaMs: policy.maxAlignmentDeltaMs,
    noLookAhead: policy.noLookAhead,
    pricedAssets: [],
    sources: [],
  };
}

/**
 * Index price points for alignment.
 *
 * Sorted once per asset so the lookup below can binary search. A window can
 * hold thousands of transfers against hundreds of observations per asset, and a
 * linear scan per transfer turns an O(n log m) job into O(n·m).
 */
export function prepareSeries(points: Map<string, PricePoint[]>): PriceSeries {
  const out: PriceSeries = new Map();
  for (const [assetId, list] of points) {
    const usable: InternalPoint[] = [];
    for (const p of list) {
      const ms = Date.parse(p.observedAt);
      // An observation we cannot place in time cannot align to anything.
      if (Number.isNaN(ms)) continue;
      if (!Number.isFinite(p.price) || p.price <= 0) continue;
      usable.push({ ms, price: p.price, observedAt: p.observedAt, source: p.source });
    }
    usable.sort((a, b) => a.ms - b.ms);
    if (usable.length) out.set(assetId, usable);
  }
  return out;
}

export type Alignment = { point: InternalPoint; deltaMs: number } | { failure: AlignmentFailure };

/**
 * The observation that may price a movement at `atMs`, or why none may.
 *
 * Binary search for the last observation at or before the movement. Under
 * no-look-ahead that is the only candidate — the most recent thing that was
 * actually knowable when the transfer happened.
 */
export function alignPrice(series: InternalPoint[] | undefined, atMs: number, policy: AlignmentPolicy): Alignment {
  if (!series || !series.length) return { failure: "NO_SERIES" };
  if (!Number.isFinite(atMs)) return { failure: "UNDATED_MOVEMENT" };

  // last index whose observation time is <= atMs
  let lo = 0;
  let hi = series.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].ms <= atMs) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  const before = idx >= 0 ? series[idx] : null;

  if (policy.noLookAhead) {
    if (!before) return { failure: "NO_PRIOR_OBSERVATION" };
    const deltaMs = atMs - before.ms;
    if (deltaMs > policy.maxAlignmentDeltaMs) return { failure: "DELTA_EXCEEDED" };
    return { point: before, deltaMs };
  }

  // Look-ahead permitted: take whichever neighbour is nearer. FOLDMARK does not
  // use this path today; it exists so the policy is a stated choice rather than
  // an accident of the implementation.
  const after = idx + 1 < series.length ? series[idx + 1] : null;
  const dBefore = before ? atMs - before.ms : Infinity;
  const dAfter = after ? after.ms - atMs : Infinity;
  const best = dBefore <= dAfter ? before : after;
  const deltaMs = Math.min(dBefore, dAfter);
  if (!best || !Number.isFinite(deltaMs)) return { failure: "NO_PRIOR_OBSERVATION" };
  if (deltaMs > policy.maxAlignmentDeltaMs) return { failure: "DELTA_EXCEEDED" };
  return { point: best, deltaMs };
}

/**
 * Sum movements in USD, pricing each at its own moment.
 *
 * Movements that cannot be aligned are excluded and counted. The total is
 * therefore always a total of what was priced, never an estimate of the rest.
 */
export function toNotional(
  movements: Movement[],
  series: PriceSeries,
  policy: AlignmentPolicy = DEFAULT_ALIGNMENT,
): Notional {
  if (!movements.length) return emptyResult(policy, 0);

  let usd = 0;
  let priced = 0;
  let oldestAlignmentDeltaMs: number | null = null;
  const excludedByReason: Record<AlignmentFailure, number> = { ...NO_FAILURES };
  const excludedPerAsset = new Map<string, Map<AlignmentFailure, number>>();
  const pricedAssets = new Set<string>();
  const sources = new Set<string>();

  const note = (assetId: string, reason: AlignmentFailure) => {
    excludedByReason[reason] += 1;
    const byReason = excludedPerAsset.get(assetId) ?? new Map<AlignmentFailure, number>();
    byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
    excludedPerAsset.set(assetId, byReason);
  };

  for (const m of movements) {
    // Counted, not dropped. An unidentified transfer is part of what moved.
    if (m.assetId === null) {
      note("(unidentified)", "NO_ASSET");
      continue;
    }
    if (m.amount === null) {
      note(m.assetId, "AMOUNT_UNKNOWN_SCALE");
      continue;
    }
    if (!Number.isFinite(m.amount)) {
      note(m.assetId, "AMOUNT_NOT_FINITE");
      continue;
    }
    const atMs = Date.parse(m.at);
    if (Number.isNaN(atMs)) {
      note(m.assetId, "UNDATED_MOVEMENT");
      continue;
    }

    const aligned = alignPrice(series.get(m.assetId), atMs, policy);
    if ("failure" in aligned) {
      note(m.assetId, aligned.failure);
      continue;
    }

    usd += m.amount * aligned.point.price;
    priced += 1;
    pricedAssets.add(m.assetId);
    sources.add(aligned.point.source);
    if (oldestAlignmentDeltaMs === null || aligned.deltaMs > oldestAlignmentDeltaMs) {
      oldestAlignmentDeltaMs = aligned.deltaMs;
    }
  }

  const total = movements.length;
  const excluded = total - priced;

  const excludedAssets: Notional["excludedAssets"] = [];
  for (const [assetId, byReason] of excludedPerAsset) {
    for (const [reason, movementCount] of byReason) {
      excludedAssets.push({ assetId, reason, movements: movementCount });
    }
  }
  excludedAssets.sort((a, b) => b.movements - a.movements);

  if (!priced) {
    return {
      ...emptyResult(policy, total),
      excludedByReason,
      excludedAssets,
    };
  }

  return {
    state: excluded > 0 ? "PARTIAL" : "OK",
    usd,
    transfersTotal: total,
    transfersPriced: priced,
    transfersExcluded: excluded,
    coverage: priced / total,
    excludedByReason,
    excludedAssets,
    oldestAlignmentDeltaMs,
    maxAlignmentDeltaMs: policy.maxAlignmentDeltaMs,
    noLookAhead: policy.noLookAhead,
    pricedAssets: [...pricedAssets],
    sources: [...sources].sort(),
  };
}

/** One line a reader can act on, naming the coverage rather than hiding it. */
export function notionalNote(n: Notional): string {
  const minutes = Math.round(n.maxAlignmentDeltaMs / 60_000);

  if (n.state === "UNAVAILABLE") {
    if (n.transfersTotal === 0) return "No movement was observed in this window, so there is nothing to value.";
    if (n.excludedByReason.NO_SERIES === n.transfersTotal) {
      return "No notional total: no asset that moved in this window has an observed price history.";
    }
    return `No notional total: no movement in this window had a price observed within ${minutes} minutes before it.`;
  }

  const pct = Math.round(n.coverage * 100);
  const basis = `Each transfer is valued at a price observed at or before it, within ${minutes} minutes — never at the current price.`;

  if (n.state === "PARTIAL") {
    return `Notional covers ${pct}% of movements (${n.transfersPriced} of ${n.transfersTotal}). ${basis} Movements without such a price are excluded, not estimated.`;
  }
  return `Notional covers every movement observed. ${basis}`;
}
