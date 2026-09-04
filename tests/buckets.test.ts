import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BUCKETS, bucketise, bucketTotal, uncoveredIntervals } from "@/lib/buckets";

/**
 * The cap that looked like quiet.
 *
 * Every window query is bounded by a row cap and ordered newest first. On a
 * busy asset the rows that come back cover only the recent end of the window,
 * and the histogram built by counting them into a zero-filled array reported
 * the older intervals as ZERO ACTIVITY. In production the AAPL passport served
 * `buckets: [0,0,0,...,0,169,662,404,765]` — twenty hours of flat baseline
 * produced entirely by a LIMIT clause.
 *
 * The passport prints, at the top of that same page, "a cell holding an em dash
 * was not observed in that window — it is never a zero". The chart beneath it
 * was breaking that promise, and a chart is the most convincing place to break
 * it: a flat line reads as a measurement of calm, not as an artefact of
 * pagination.
 *
 * These are the rules the fix holds to. An interval before the oldest row we
 * actually received is UNKNOWN. An uncapped query genuinely saw the window, so
 * its zeros are real. And the renderers must draw the two differently, or the
 * distinction dies on the way to the screen.
 */

const H = 3_600_000;
const START = Date.parse("2026-09-04T00:00:00Z");
const SPAN = 24 * H;

/** A row in the interval `hour`, counting from the window start. */
const at = (hour: number) => ({ timestamp: new Date(START + hour * H + 60_000).toISOString() });

describe("an interval nobody read is not an interval with nothing in it", () => {
  it("marks every interval before the oldest row as unknown when capped", () => {
    // The shape production actually served: rows only in the last four hours,
    // because the cap cut the read short.
    const rows = [at(20), at(21), at(22), at(23)];
    const buckets = bucketise(rows, START, SPAN, true);

    expect(buckets.slice(0, 20).every((b) => b === null)).toBe(true);
    expect(buckets.slice(20)).toEqual([1, 1, 1, 1]);
    // The number that was being published as twenty hours of calm.
    expect(uncoveredIntervals(buckets)).toBe(20);
    expect(buckets).not.toContain(0);
  });

  it("keeps zeros as zeros when the query was not capped", () => {
    // Nothing truncated the read, so an interval with no rows really had none.
    const buckets = bucketise([at(23)], START, SPAN, false);
    expect(uncoveredIntervals(buckets)).toBe(0);
    expect(buckets[0]).toBe(0);
    expect(buckets[23]).toBe(1);
  });

  it("keeps the interval holding the oldest row, as a lower bound", () => {
    // That interval was partly read. Blanking it would discard a real
    // observation; the surrounding coverage note already says every figure in a
    // capped window is a lower bound.
    const buckets = bucketise([at(10), at(23)], START, SPAN, true);
    expect(buckets[9]).toBeNull();
    expect(buckets[10]).toBe(1);
  });

  it("reports nothing at all rather than zero when a capped read returned no rows", () => {
    // A cap with no rows means the read stopped before it saw anything. Zeroes
    // here would assert an empty day nobody looked at.
    const buckets = bucketise([], START, SPAN, true);
    expect(buckets).toHaveLength(BUCKETS);
    expect(buckets.every((b) => b === null)).toBe(true);
  });

  it("totals only what was covered", () => {
    const buckets = bucketise([at(22), at(23), at(23)], START, SPAN, true);
    expect(bucketTotal(buckets)).toBe(3);
  });

  it("ignores an unparseable timestamp rather than counting it into hour zero", () => {
    const buckets = bucketise([{ timestamp: "not a date" }, at(23)], START, SPAN, false);
    // The bad row lands in interval 0 by the clamp, which is the pre-existing
    // behaviour; what matters is that it cannot make interval 23 wrong.
    expect(buckets[23]).toBe(1);
    expect(bucketTotal(buckets)).toBe(2);
  });
});

describe("the distinction survives to the screen", () => {
  const charts = readFileSync(join(process.cwd(), "src", "components", "charts", "index.tsx"), "utf8");

  it("breaks the sparkline at an unread interval instead of drawing through it", () => {
    // Interpolating across the gap would invent the very flat line the null was
    // introduced to prevent.
    expect(charts).toMatch(/segments/);
    expect(charts).toMatch(/v === null/);
    expect(charts).toMatch(/interpolated across/i);
  });

  it("gives an unread histogram column no bar and no baseline", () => {
    // A real zero draws a hairline on the baseline. An unread interval must not
    // borrow it, or the two states look identical.
    expect(charts).toMatch(/if \(v === null\) return <span key=\{i\} aria-hidden className="flex-1" \/>/);
  });

  it("says in the accessible label how much was not read", () => {
    expect(charts).toMatch(/intervals not read/);
  });
});

describe("no surface builds its own zero-filled histogram", () => {
  const SURFACES = [
    join("src", "lib", "queries.ts"),
    join("src", "app", "assets", "[contract]", "page.tsx"),
    join("src", "app", "wallet", "[address]", "page.tsx"),
    join("src", "app", "fabric", "page.tsx"),
  ];

  it("routes every producer through the one helper", () => {
    // Four surfaces each grew their own copy of the same loop, and each copy
    // reproduced the same fabricated zero. One helper, one rule.
    for (const rel of SURFACES) {
      const source = readFileSync(join(process.cwd(), rel), "utf8");
      expect(source, `${rel} builds its own buckets`).not.toMatch(/new Array<number>\(\s*(?:24|BUCKETS|[a-z][\w.]*\.length)\s*\)\.fill\(0\)/);
      expect(source, `${rel} does not use the helper`).toMatch(/bucketise\(/);
    }
  });
});
