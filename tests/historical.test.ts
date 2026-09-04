import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { priceHistory, assetNotional } from "@/server/market/historical";
import { MAX_ALIGNMENT_DELTA_MS } from "@/lib/notional";

/**
 * Historical pricing.
 *
 * The failure this suite prevents is valuing the past with the present. A 24H
 * window holds transfers from every hour of that day; multiplying all of them
 * by the newest quote produces a plausible number describing nothing that
 * happened. Worse, it is indistinguishable from a real measurement.
 *
 * So the rules held here are: a price may only value a transfer if it was
 * observed AT OR BEFORE it, within the alignment window; anything else is
 * counted as unpriced and said so; and coverage travels with every total.
 */

const ASSET = "22222222-2222-2222-2222-222222222222";
const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.SUPABASE_URL = "https://test.invalid";
  process.env.SUPABASE_SERVICE_ROLE_JWT = "test-key";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_JWT;
});

/** Routes the two reads the module performs: transfers and prices. */
function mockStore(opts: {
  transfers?: { amount: string; timestamp: string }[];
  prices?: { price: number; observed_at: string; price_type?: string; pair_address?: string }[];
}) {
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    const body = u.includes("/prices")
      ? (opts.prices ?? []).map((p) => ({
          price: p.price,
          observed_at: p.observed_at,
          price_type: p.price_type ?? "DEX_SPOT",
          provider: "GeckoTerminal",
          pair_address: p.pair_address ?? "0xpool",
        }))
      : (opts.transfers ?? []);
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

/** 1e18 base units == 1 display unit at 18 decimals. */
const ONE = "1000000000000000000";

describe("a price may not value a transfer that came before it", () => {
  it("prices a transfer from an observation taken just before it", async () => {
    mockStore({
      transfers: [{ amount: ONE, timestamp: "2026-09-04T05:10:00Z" }],
      prices: [{ price: 100, observed_at: "2026-09-04T05:05:00Z" }],
    });
    const r = await assetNotional(ASSET, 18);
    expect(r.priced).toBe(1);
    expect(r.notional.usd).toBeCloseTo(100, 6);
  });

  it("refuses to price a transfer using a LATER observation", async () => {
    // The observation exists, but only after the transfer. Using it would be
    // look-ahead: information that did not exist when the transfer happened.
    mockStore({
      transfers: [{ amount: ONE, timestamp: "2026-09-04T05:00:00Z" }],
      prices: [{ price: 100, observed_at: "2026-09-04T05:10:00Z" }],
    });
    const r = await assetNotional(ASSET, 18);
    expect(r.priced).toBe(0);
    expect(r.unpriced).toBe(1);
    expect(r.notional.usd).toBeNull();
  });

  it("refuses an observation older than the alignment window", async () => {
    // Sixteen minutes back, window is fifteen. Beyond it the quote and the
    // transfer no longer describe the same market conditions.
    mockStore({
      transfers: [{ amount: ONE, timestamp: "2026-09-04T05:16:00Z" }],
      prices: [{ price: 100, observed_at: "2026-09-04T05:00:00Z" }],
    });
    const r = await assetNotional(ASSET, 18);
    expect(r.priced).toBe(0);
    expect(r.notional.noLookAhead).toBe(true);
    expect(r.alignmentWindowMs).toBe(MAX_ALIGNMENT_DELTA_MS);
  });

  it("never carries the current price backwards over old transfers", async () => {
    // The shape of this deployment: prices start recently, transfers reach back
    // much further. Only the recent transfer may be valued.
    mockStore({
      transfers: [
        { amount: ONE, timestamp: "2026-09-02T16:00:00Z" },
        { amount: ONE, timestamp: "2026-09-03T09:00:00Z" },
        { amount: ONE, timestamp: "2026-09-04T05:10:00Z" },
      ],
      prices: [{ price: 330, observed_at: "2026-09-04T05:05:00Z" }],
    });
    const r = await assetNotional(ASSET, 18);
    expect(r.priced).toBe(1);
    expect(r.unpriced).toBe(2);
    // One transfer at 330, not three.
    expect(r.notional.usd).toBeCloseTo(330, 6);
    expect(r.priceHistoryStartsAfterOldestMovement).toBe(true);
  });

  it("reports coverage as a ratio that matches the counts", async () => {
    mockStore({
      transfers: [
        { amount: ONE, timestamp: "2026-09-04T05:10:00Z" },
        { amount: ONE, timestamp: "2026-09-01T00:00:00Z" },
      ],
      prices: [{ price: 50, observed_at: "2026-09-04T05:05:00Z" }],
    });
    const r = await assetNotional(ASSET, 18);
    expect(r.coverageRatio).toBeCloseTo(0.5, 6);
    expect(r.priced + r.unpriced).toBe(2);
  });

  it("prices nothing at all when there are no observations", async () => {
    mockStore({ transfers: [{ amount: ONE, timestamp: "2026-09-04T05:10:00Z" }], prices: [] });
    const r = await assetNotional(ASSET, 18);
    expect(r.priced).toBe(0);
    expect(r.notional.usd).toBeNull();
    expect(r.coverageRatio).toBe(0);
  });
});

describe("only on-chain observations enter an on-chain series", () => {
  it("requests DEX_SPOT and nothing else", async () => {
    let requested = "";
    globalThis.fetch = (async (url: string) => {
      requested = String(url);
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    await priceHistory(ASSET);
    // The firewall: a REFERENCE quote describes an external instrument and must
    // never appear in an on-chain price series.
    expect(requested).toContain("price_type=eq.DEX_SPOT");
  });

  it("keeps the pool each observation came from", async () => {
    mockStore({
      prices: [
        { price: 1, observed_at: "2026-09-04T05:00:00Z", pair_address: "0xaaa" },
        { price: 2, observed_at: "2026-09-04T05:05:00Z", pair_address: "0xbbb" },
      ],
    });
    const h = await priceHistory(ASSET);
    expect(h.pairs.sort()).toEqual(["0xaaa", "0xbbb"]);
    expect(h.points).toHaveLength(2);
  });

  it("returns observations oldest first with a real span", async () => {
    mockStore({
      prices: [
        { price: 1, observed_at: "2026-09-04T05:00:00Z" },
        { price: 2, observed_at: "2026-09-04T05:30:00Z" },
      ],
    });
    const h = await priceHistory(ASSET);
    expect(h.firstObservedAt).toBe("2026-09-04T05:00:00Z");
    expect(h.lastObservedAt).toBe("2026-09-04T05:30:00Z");
  });

  it("discards an unusable price rather than plotting a zero", async () => {
    mockStore({ prices: [{ price: 0, observed_at: "2026-09-04T05:00:00Z" }] });
    expect((await priceHistory(ASSET)).points).toHaveLength(0);
  });
});

describe("the chart draws observations and nothing between them", () => {
  const panel = readFileSync(
    join(process.cwd(), "src", "components", "market", "PriceHistoryPanel.tsx"),
    "utf8",
  );

  it("plots points against real timestamps rather than even spacing", () => {
    // Evenly spaced points would imply a regular sampling cadence that the
    // provider never provided.
    expect(panel).toContain("Date.parse(p.observedAt)");
    expect(panel).toContain("timeSpan");
  });

  it("renders no candles and no interpolation", () => {
    // The word appears only where the panel denies drawing them, so the check
    // is for the drawing itself: no OHLC bodies, no smoothed path commands.
    expect(panel).not.toMatch(/<rect/);
    expect(panel).not.toMatch(/curveMonotone|d3-shape|bezier|C d/);
    expect(panel).toMatch(/no interpolation/i);
    expect(panel).toMatch(/no candles/i);
  });

  it("shows coverage beside the notional total", () => {
    expect(panel).toContain("OF TRANSFERS PRICED");
    expect(panel).toContain("coverage.methodology");
  });

  it("states that this is not the reference chart", () => {
    expect(panel).toMatch(/separate from any reference chart/i);
  });
});
