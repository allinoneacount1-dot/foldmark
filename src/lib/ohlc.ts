/**
 * Deterministic OHLC aggregation.
 *
 * A candle is produced only from real observations inside its own bucket:
 * open = first, high = max, low = min, close = last, volume = summed observed
 * volume. Buckets with no observation produce no candle — gaps are shown as
 * gaps rather than carried forward, because a flat synthetic candle is a
 * fabricated price.
 */

export const INTERVALS = ["1m", "5m", "15m", "30m", "1H", "4H", "1D"] as const;
export type Interval = (typeof INTERVALS)[number];

export const INTERVAL_MS: Record<Interval, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1H": 3_600_000,
  "4H": 14_400_000,
  "1D": 86_400_000,
};

export type Candle = {
  /** Unix seconds at the bucket open — the format lightweight-charts expects. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type VolumeBar = { time: number; value: number; transfers: number };

export type PriceObservationInput = { price: number; observedAt: string };
export type VolumeInput = { amount: number; at: string };

function bucketStart(ms: number, interval: Interval): number {
  const size = INTERVAL_MS[interval];
  return Math.floor(ms / size) * size;
}

/**
 * Whether an interval is one we can actually bucket by.
 *
 * Without this check an unrecognised interval makes `INTERVAL_MS[interval]`
 * undefined, every timestamp divides to NaN, and every observation lands in the
 * same NaN bucket — producing exactly one candle, timestamped NaN, whose high
 * and low span the entire dataset. That candle looks like a real one to
 * everything downstream while describing no period at all. An interval we
 * cannot bucket must yield no candles rather than one fabricated one.
 */
function isInterval(interval: string): interval is Interval {
  return Object.prototype.hasOwnProperty.call(INTERVAL_MS, interval);
}

export function aggregateCandles(observations: PriceObservationInput[], interval: Interval): Candle[] {
  if (!observations.length || !isInterval(interval)) return [];

  // ascending by observation time, so "first" and "last" are unambiguous
  const sorted = [...observations].sort((a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime());

  const byBucket = new Map<number, Candle>();
  for (const o of sorted) {
    const t = new Date(o.observedAt).getTime();
    if (!Number.isFinite(t) || !Number.isFinite(o.price)) continue;
    const key = bucketStart(t, interval);
    const existing = byBucket.get(key);
    if (!existing) {
      byBucket.set(key, { time: key / 1000, open: o.price, high: o.price, low: o.price, close: o.price });
    } else {
      existing.high = Math.max(existing.high, o.price);
      existing.low = Math.min(existing.low, o.price);
      existing.close = o.price;
    }
  }

  return [...byBucket.values()].sort((a, b) => a.time - b.time);
}

export function aggregateVolume(inputs: VolumeInput[], interval: Interval): VolumeBar[] {
  if (!inputs.length || !isInterval(interval)) return [];
  const byBucket = new Map<number, VolumeBar>();
  for (const v of inputs) {
    const t = new Date(v.at).getTime();
    if (!Number.isFinite(t)) continue;
    const key = bucketStart(t, interval);
    const existing = byBucket.get(key);
    if (existing) {
      existing.value += v.amount;
      existing.transfers += 1;
    } else {
      byBucket.set(key, { time: key / 1000, value: v.amount, transfers: 1 });
    }
  }
  return [...byBucket.values()].sort((a, b) => a.time - b.time);
}

/**
 * Which intervals the available data can actually support.
 *
 * An interval is offered only when the observed span covers at least four of
 * its buckets and at least four buckets are non-empty. Anything else would be
 * a chart of one or two points dressed up as a time series.
 */
export function supportedIntervals(times: string[]): Interval[] {
  if (times.length < 2) return [];
  const stamps = times.map((t) => new Date(t).getTime()).filter(Number.isFinite);
  if (stamps.length < 2) return [];
  const span = Math.max(...stamps) - Math.min(...stamps);

  return INTERVALS.filter((i) => {
    const size = INTERVAL_MS[i];
    if (span < size * 4) return false;
    const buckets = new Set(stamps.map((t) => Math.floor(t / size)));
    return buckets.size >= 4;
  });
}

/** The most useful interval for a given span — the coarsest that still shows detail. */
export function defaultInterval(available: Interval[]): Interval | null {
  if (!available.length) return null;
  for (const preferred of ["1H", "15m", "1D", "5m", "4H", "30m", "1m"] as Interval[]) {
    if (available.includes(preferred)) return preferred;
  }
  return available[available.length - 1];
}
