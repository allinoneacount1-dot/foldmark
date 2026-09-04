/**
 * Per-interval activity, with the intervals nobody looked at left unknown.
 *
 * THE BUG THIS EXISTS TO PREVENT. Every window query is bounded by a row cap
 * and ordered newest first. When a busy asset hits that cap, the rows returned
 * cover only the recent end of the window — and a histogram built by counting
 * them into a zero-filled array reports the older intervals as ZERO ACTIVITY.
 * They are not zero. Nobody looked at them.
 *
 * The asset passport prints, at the top of the page, "a cell holding an em dash
 * was not observed in that window — it is never a zero". The sparkline directly
 * beneath it was drawing twenty hours of flat baseline off the back of a
 * LIMIT clause. A fabricated zero rendered as a chart is the most convincing
 * kind, because a chart looks like a measurement even when it is an artefact of
 * pagination.
 *
 * So: an interval that ends before the oldest row we actually received is
 * `null` — unknown — and a renderer must draw it as absent rather than as flat.
 * An uncapped query has genuinely seen the whole window, and its zeros are real
 * zeros.
 */

/** Intervals per window. Twenty-four reads as hours on a day and stays legible. */
export const BUCKETS = 24;

/** A count, or null where the window was not covered. Never a zero standing in for null. */
export type Bucket = number | null;

/** Which interval a timestamp falls in. Out-of-range values clamp to the ends. */
export function bucketIndex(iso: string, start: number, span: number): number {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  return Math.min(BUCKETS - 1, Math.max(0, Math.floor(((t - start) / span) * BUCKETS)));
}

/**
 * Count rows into intervals, marking the intervals the cap hid.
 *
 * `capped` is the whole point: without it this cannot tell "the query saw the
 * window and found nothing here" from "the query stopped before it got here".
 * Callers must pass the flag their query returned rather than inferring it from
 * the row count, since a window can legitimately hold exactly the cap.
 */
export function bucketise(
  rows: readonly { timestamp: string }[],
  start: number,
  span: number,
  capped: boolean,
): Bucket[] {
  const counts = new Array<number>(BUCKETS).fill(0);
  let oldest = Number.POSITIVE_INFINITY;

  for (const r of rows) {
    const t = Date.parse(r.timestamp);
    if (Number.isFinite(t) && t < oldest) oldest = t;
    counts[bucketIndex(r.timestamp, start, span)] += 1;
  }

  if (!capped) return counts;

  /**
   * The cap truncated the oldest end. Everything strictly before the oldest row
   * we hold is outside what was read, so it is unknown.
   *
   * The interval CONTAINING that row keeps its count: it is a lower bound for
   * that interval, which the surrounding coverage note already says of every
   * figure in a capped window. Intervals wholly before it are null.
   */
  if (!Number.isFinite(oldest)) return counts.map(() => null);
  const boundary = bucketIndex(new Date(oldest).toISOString(), start, span);
  return counts.map((c, i) => (i < boundary ? null : c));
}

/** Total across the intervals that were actually covered. */
export function bucketTotal(buckets: readonly Bucket[]): number {
  return buckets.reduce<number>((sum, b) => sum + (b ?? 0), 0);
}

/** How many intervals were never read. Zero on an uncapped window. */
export function uncoveredIntervals(buckets: readonly Bucket[]): number {
  return buckets.filter((b) => b === null).length;
}
