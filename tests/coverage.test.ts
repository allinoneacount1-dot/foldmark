import { describe, it, expect } from "vitest";
import { clampToServableRange, FREE_TIER_LOG_WINDOW_BLOCKS } from "@/server/market-data/providers/rpc";
import { coverageState, coverageNote, coverageBlock, type IndexCoverage } from "@/lib/queries";
import { aggregateCandles, supportedIntervals, defaultInterval } from "@/lib/ohlc";
import { WINDOW_MS } from "@/config/site";

/**
 * Coverage and completeness.
 *
 * Two related honesties are tested here.
 *
 * The first is about range: the free RPC tier only serves logs from a recent
 * window, so a request for older blocks cannot be satisfied. Pretending
 * otherwise — advancing a cursor past blocks that were never read — produces a
 * dataset with holes that nothing downstream can detect.
 *
 * The second is about claims: a panel labelled 7D built from forty minutes of
 * index is asserting something false. The window has to know how far the index
 * actually reaches so it can report PARTIAL instead of a confident number over
 * a fraction of the period.
 */

describe("clampToServableRange — never claim to have read what was refused", () => {
  const head = 1_000_000;

  it("passes a range through untouched when it sits inside the servable window", () => {
    const from = head - 10;
    const result = clampToServableRange(from, head, head);
    expect(result).toEqual({ from, to: head, skipped: 0 });
  });

  it("takes the servable tail and reports the rest as skipped when a range straddles the edge", () => {
    const oldest = head - FREE_TIER_LOG_WINDOW_BLOCKS;
    const from = oldest - 100;
    const result = clampToServableRange(from, head, head);

    expect(result.from).toBe(oldest);
    expect(result.to).toBe(head);
    expect(result.skipped).toBe(100);
  });

  it("jumps to the live window and reports a non-zero gap when the whole range is behind it", () => {
    const oldest = head - FREE_TIER_LOG_WINDOW_BLOCKS;
    const from = 1;
    const to = oldest - 5_000;
    const result = clampToServableRange(from, to, head);

    // The critical part is skipped > 0. Reporting skipped: 0 here would say the
    // range was fully processed when not one block of it was readable — the
    // index would carry a silent hole with nothing recording that it exists.
    expect(result.skipped).toBe(oldest - from);
    expect(result.skipped).toBeGreaterThan(0);
    expect(result.from).toBe(oldest);
    expect(result.to).toBe(head);
  });

  it("never returns a range starting before what the node will serve", () => {
    const oldest = head - FREE_TIER_LOG_WINDOW_BLOCKS;
    for (const from of [0, 1, oldest - 1, oldest, oldest + 1]) {
      const result = clampToServableRange(from, head, head);
      expect(result.from).toBeGreaterThanOrEqual(oldest);
    }
  });
});

describe("coverageState — zero rows over partial coverage is not EMPTY", () => {
  const now = Date.parse("2026-09-04T12:00:00.000Z");
  const coverage = (
    continuousMs: number | null,
    gapBlocks = 0,
    lastGapAt: string | null = null,
    state: IndexCoverage["state"] = continuousMs === null ? "INDEXING" : "OK",
  ): IndexCoverage => ({
    state,
    earliestBlock: 1,
    earliestAt: null,
    continuousSince: continuousMs === null ? null : new Date(now - continuousMs).toISOString(),
    continuousMs,
    gapBlocks,
    lastGapAt,
  });

  /**
   * The rule under test: NO DATA is not NO ACTIVITY.
   *
   * Zero rows is only "nothing happened" when the index is known to have
   * covered the whole period being asked about. Any other zero is "we did not
   * look at all of it", and saying EMPTY there is a false statement about the
   * chain rather than about the index.
   */
  it("reports PARTIAL, not EMPTY, for zero rows when the index covers only 20m of a 24H window", () => {
    expect(coverageState("24H", coverage(20 * 60_000), "EMPTY", now)).toBe("PARTIAL");
  });

  it("reports EMPTY for zero rows only when the full window is known covered", () => {
    expect(coverageState("24H", coverage(WINDOW_MS["24H"] + 60_000), "EMPTY", now)).toBe("EMPTY");
  });

  it("reports PARTIAL for zero rows when a gap falls inside the requested window", () => {
    const gapInside = coverage(WINDOW_MS["7D"], 4_200, new Date(now - 60 * 60_000).toISOString());
    expect(coverageState("24H", gapInside, "EMPTY", now)).toBe("PARTIAL");
  });

  it("ignores a gap that predates the requested window", () => {
    // A hole three days ago says nothing about the last hour.
    const oldGap = coverage(WINDOW_MS["30D"], 4_200, new Date(now - 3 * 86_400_000).toISOString());
    expect(coverageState("1H", oldGap, "EMPTY", now)).toBe("EMPTY");
  });

  it("treats a gap of unknown time as possibly inside the window", () => {
    // An unplaceable hole could be anywhere, including here. Assuming it is
    // elsewhere would be the product guessing in its own favour.
    const unplaceable = coverage(WINDOW_MS["30D"], 900, null);
    expect(coverageState("1H", unplaceable, "EMPTY", now)).toBe("PARTIAL");
  });

  it("downgrades OK to PARTIAL when the index reaches back less far than the window", () => {
    expect(coverageState("7D", coverage(40 * 60_000), "OK", now)).toBe("PARTIAL");
  });

  it("leaves OK alone when the index covers the whole window with no gap", () => {
    expect(coverageState("24H", coverage(WINDOW_MS["24H"] + 60_000), "OK", now)).toBe("OK");
  });

  it("reports UNAVAILABLE when storage is unreachable, whatever coverage says", () => {
    expect(coverageState("24H", coverage(WINDOW_MS["7D"]), "UNAVAILABLE", now)).toBe("UNAVAILABLE");
    expect(coverageState("24H", coverage(null, 0, null, "UNAVAILABLE"), "EMPTY", now)).toBe("UNAVAILABLE");
  });

  it("reports INDEXING for zero rows when coverage has not been recorded", () => {
    // Unrecorded coverage plus zero rows is unreadable — it could be no
    // activity or no indexing. INDEXING says which of those we know: neither.
    expect(coverageState("24H", coverage(null), "EMPTY", now)).toBe("INDEXING");
  });

  it("reports PARTIAL for rows that exist while coverage is unrecorded", () => {
    // The rows are real, but the window still cannot prove it spans its period.
    expect(coverageState("7D", coverage(null), "OK", now)).toBe("PARTIAL");
  });

  it("writes a note that states the actual reach, not just that something is wrong", () => {
    const note = coverageNote("7D", coverage(90 * 60_000), now)!;
    expect(note).toContain("1.5h");
    expect(note).toContain("lower bound");
  });

  it("says a zero here is not a zero on chain when coverage is unrecorded", () => {
    const note = coverageNote("24H", coverage(null), now)!;
    expect(note).toContain("not that nothing happened");
  });

  it("stays silent when coverage is complete and there is nothing to disclose", () => {
    expect(coverageNote("24H", coverage(WINDOW_MS["7D"]), now)).toBeNull();
  });

  it("discloses a gap that falls inside an otherwise covered window", () => {
    const gapInside = coverage(WINDOW_MS["7D"], 4_200, new Date(now - 60 * 60_000).toISOString());
    const note = coverageNote("24H", gapInside, now)!;
    expect(note).toContain("4200");
    expect(note).toContain("lower bound");
  });

  it("does not call a window covered when a gap sits inside it", () => {
    const gapInside = coverage(WINDOW_MS["7D"], 4_200, new Date(now - 60 * 60_000).toISOString());
    const block = coverageBlock("24H", gapInside, now);
    expect(block.covers_window).toBe(false);
    expect(block.gap_inside_window).toBe(true);
  });
});

describe("aggregateCandles — buckets without an observation produce no candle", () => {
  const price = (iso: string, p: number) => ({ price: p, observedAt: iso });

  it("derives open, high, low and close from real observations only", () => {
    const candles = aggregateCandles(
      [
        price("2026-09-04T12:00:10.000Z", 100),
        price("2026-09-04T12:00:20.000Z", 120),
        price("2026-09-04T12:00:30.000Z", 90),
        price("2026-09-04T12:00:40.000Z", 110),
      ],
      "1H",
    );

    expect(candles).toHaveLength(1);
    expect(candles[0].open).toBe(100);
    expect(candles[0].high).toBe(120);
    expect(candles[0].low).toBe(90);
    expect(candles[0].close).toBe(110);
  });

  it("emits nothing for an empty bucket instead of carrying the last close forward", () => {
    const candles = aggregateCandles(
      [price("2026-09-04T09:00:00.000Z", 100), price("2026-09-04T12:00:00.000Z", 105)],
      "1H",
    );
    // Three hours apart, so a flat-forward fill would invent two candles that
    // no market printed. Two real buckets is the honest answer.
    expect(candles).toHaveLength(2);
  });

  it("produces no candles at all from no observations", () => {
    expect(aggregateCandles([], "1H")).toHaveLength(0);
  });

  it("returns nothing for an interval it cannot bucket, rather than one NaN candle", () => {
    // Regression. An unrecognised interval made the bucket size undefined,
    // every timestamp divided to NaN, and the whole dataset collapsed into a
    // single candle stamped NaN whose high and low spanned everything. It
    // looked like a real candle to every consumer and described no period.
    const candles = aggregateCandles(
      [
        { price: 100, observedAt: "2026-09-04T09:00:00.000Z" },
        { price: 105, observedAt: "2026-09-04T12:00:00.000Z" },
      ],
      "1h" as unknown as Parameters<typeof aggregateCandles>[1],
    );
    expect(candles).toHaveLength(0);
  });

  it("never emits a candle with a non-finite timestamp", () => {
    const candles = aggregateCandles(
      [
        { price: 100, observedAt: "2026-09-04T09:00:00.000Z" },
        { price: 105, observedAt: "not-a-date" },
        { price: 110, observedAt: "2026-09-04T12:00:00.000Z" },
      ],
      "1H",
    );
    expect(candles.every((c) => Number.isFinite(c.time))).toBe(true);
    // The unparseable observation is dropped, not bucketed at epoch zero.
    expect(candles).toHaveLength(2);
  });
});

describe("supportedIntervals — an interval is offered only if the data can fill it", () => {
  it("offers nothing when there are no observations", () => {
    expect(supportedIntervals([])).toHaveLength(0);
    expect(defaultInterval([])).toBeNull();
  });

  it("does not offer a daily interval for a few minutes of data", () => {
    const stamps = Array.from({ length: 5 }, (_, i) =>
      new Date(Date.parse("2026-09-04T12:00:00.000Z") + i * 60_000).toISOString(),
    );
    expect(supportedIntervals(stamps)).not.toContain("1D");
  });
});
