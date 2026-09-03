import { describe, it, expect } from "vitest";
import { foldByAddress, flowForAsset, dominantFlow, foldEdges } from "@/lib/queries";
import { toNotional, notionalNote, MAX_ACCEPTABLE_PRICE_AGE_MS } from "@/lib/notional";
import { ASSETS, transfer } from "./fixtures";

/**
 * Unit safety.
 *
 * The rule under test: one NVDA plus one AAPL plus one USDG is not three of
 * anything. Token amounts only mean something beside their own symbol, so any
 * figure that spans assets must be either a count or a currency conversion.
 *
 * This is the failure that looks most like working software. Every number
 * renders, every chart draws, and the ranking is wrong — usually ordering
 * addresses by whichever asset has the smallest denomination. These tests exist
 * because that mistake is invisible without them.
 */

const ALICE = "0xaaa0000000000000000000000000000000000001";
const BOB = "0xbbb0000000000000000000000000000000000002";
const CAROL = "0xccc0000000000000000000000000000000000003";

/**
 * Alice moves a lot of USDG (6 decimals, huge unit counts) in few transfers.
 * Bob moves a little NVDA (18 decimals) across many transfers.
 *
 * Summed naively, Alice dwarfs Bob by a factor of thousands — entirely because
 * of decimals. By any honest measure Bob is the more active address.
 */
const ROWS = [
  transfer({ assetId: "asset-usdg", from: BOB, to: ALICE, amount: "5000000000" }), // 5,000 USDG
  transfer({ assetId: "asset-usdg", from: BOB, to: ALICE, amount: "3000000000" }), // 3,000 USDG
  ...Array.from({ length: 6 }, () =>
    transfer({ assetId: "asset-nvda", from: CAROL, to: BOB, amount: "2000000000000000000" }),
  ), // 6 × 2 NVDA
  transfer({ assetId: "asset-aapl", from: ALICE, to: BOB, amount: "1000000000000000000" }), // 1 AAPL
];

describe("foldByAddress — flow is kept per asset", () => {
  it("never exposes a single inbound or outbound total across assets", () => {
    const [first] = foldByAddress(ROWS, ASSETS, 10);
    // The absence of these fields IS the guarantee: no caller can accidentally
    // sum incomparable units because there is nothing to sum.
    expect(first).not.toHaveProperty("inbound");
    expect(first).not.toHaveProperty("outbound");
    expect(Array.isArray(first.byAsset)).toBe(true);
  });

  it("reports each asset's flow separately with its own asset id", () => {
    const bob = foldByAddress(ROWS, ASSETS, 10).find((a) => a.address === BOB)!;
    const nvda = flowForAsset(bob, "asset-nvda")!;
    const usdg = flowForAsset(bob, "asset-usdg")!;

    expect(nvda.inbound).toBeCloseTo(12, 6); // 6 × 2 NVDA received
    expect(usdg.outbound).toBeCloseTo(8000, 6); // 5,000 + 3,000 USDG sent
    expect(nvda.assetId).toBe("asset-nvda");
    expect(usdg.assetId).toBe("asset-usdg");
  });

  it("ranks by transfer count, not by summed token units", () => {
    const ranked = foldByAddress(ROWS, ASSETS, 10);
    // Bob: 9 transfers (2 USDG out, 6 NVDA in, 1 AAPL in). Alice: 3. Carol: 6.
    // A naive unit sum would put Alice first, because her 8,000 USDG dwarfs
    // everything else purely by having 6 decimals instead of 18.
    expect(ranked[0].address).toBe(BOB);
    expect(ranked[0].transfers).toBe(9);
  });

  it("counts distinct assets touched, which is comparable across addresses", () => {
    const bob = foldByAddress(ROWS, ASSETS, 10).find((a) => a.address === BOB)!;
    expect(bob.assets).toBe(3);
    expect(bob.byAsset).toHaveLength(3);
  });

  it("returns null from flowForAsset for an asset the address never touched", () => {
    const carol = foldByAddress(ROWS, ASSETS, 10).find((a) => a.address === CAROL)!;
    expect(flowForAsset(carol, "asset-usdg")).toBeNull();
  });
});

describe("dominantFlow — one named asset stands in for magnitude", () => {
  it("picks the asset with the most transfers, not the largest number", () => {
    const bob = foldByAddress(ROWS, ASSETS, 10).find((a) => a.address === BOB)!;
    const main = dominantFlow(bob, "inbound")!;
    // NVDA: 6 inbound transfers totalling 12 units.
    // AAPL: 1 inbound transfer totalling 1 unit.
    // USDG amounts are outbound for Bob and must not be considered here.
    expect(main.assetId).toBe("asset-nvda");
  });

  it("returns null when nothing moved in that direction", () => {
    const carol = foldByAddress(ROWS, ASSETS, 10).find((a) => a.address === CAROL)!;
    expect(dominantFlow(carol, "inbound")).toBeNull();
  });
});

describe("foldEdges — an edge belongs to exactly one asset", () => {
  it("never merges two assets into one edge between the same pair", () => {
    const edges = foldEdges(ROWS, ASSETS, 20);
    const bobToAlice = edges.filter((e) => e.from === BOB && e.to === ALICE);
    expect(bobToAlice.every((e) => e.assetId !== null)).toBe(true);
    const assetIds = new Set(bobToAlice.map((e) => e.assetId));
    expect(assetIds.size).toBe(bobToAlice.length);
  });
});

describe("toNotional — the only honest cross-asset total", () => {
  const now = Date.parse("2026-09-04T12:00:00.000Z");
  const fresh = (iso: string) => ({ price: 2, observedAt: iso, source: "geckoterminal" });

  it("converts to USD when every asset has a fresh price", () => {
    const result = toNotional(
      [
        { assetId: "asset-nvda", amount: 10 },
        { assetId: "asset-aapl", amount: 5 },
      ],
      new Map([
        ["asset-nvda", fresh("2026-09-04T11:59:00.000Z")],
        ["asset-aapl", fresh("2026-09-04T11:59:30.000Z")],
      ]),
      now,
    );
    expect(result.state).toBe("OK");
    expect(result.usd).toBeCloseTo(30, 6);
    expect(result.coverage).toBe(1);
  });

  it("excludes an asset with no price and drops to PARTIAL rather than guessing", () => {
    const result = toNotional(
      [
        { assetId: "asset-nvda", amount: 10 },
        { assetId: "asset-aapl", amount: 5 },
      ],
      new Map([["asset-nvda", fresh("2026-09-04T11:59:00.000Z")]]),
      now,
    );
    expect(result.state).toBe("PARTIAL");
    expect(result.usd).toBeCloseTo(20, 6); // AAPL contributed nothing
    expect(result.excluded).toEqual([{ assetId: "asset-aapl", reason: "NO_PRICE", ageMs: null }]);
  });

  it("refuses a price older than the acceptable age instead of carrying it forward", () => {
    const stale = new Date(now - MAX_ACCEPTABLE_PRICE_AGE_MS - 1000).toISOString();
    const result = toNotional(
      [{ assetId: "asset-nvda", amount: 10 }],
      new Map([["asset-nvda", fresh(stale)]]),
      now,
    );
    expect(result.state).toBe("UNAVAILABLE");
    expect(result.usd).toBeNull();
    expect(result.excluded[0].reason).toBe("PRICE_TOO_OLD");
  });

  it("treats an unparseable observation time as an unknown age and excludes it", () => {
    const result = toNotional(
      [{ assetId: "asset-nvda", amount: 10 }],
      new Map([["asset-nvda", { price: 2, observedAt: "not-a-date", source: "x" }]]),
      now,
    );
    expect(result.usd).toBeNull();
    expect(result.excluded[0].reason).toBe("PRICE_TOO_OLD");
  });

  it("excludes a non-positive price rather than multiplying by zero", () => {
    const result = toNotional(
      [{ assetId: "asset-nvda", amount: 10 }],
      new Map([["asset-nvda", { price: 0, observedAt: "2026-09-04T11:59:00.000Z", source: "x" }]]),
      now,
    );
    expect(result.excluded[0].reason).toBe("PRICE_NOT_FINITE");
    expect(result.usd).toBeNull();
  });

  it("states its coverage in words a reader can act on", () => {
    const partial = toNotional(
      [
        { assetId: "asset-nvda", amount: 1 },
        { assetId: "asset-usdg", amount: 1 },
      ],
      new Map([["asset-nvda", fresh("2026-09-04T11:59:00.000Z")]]),
      now,
    );
    expect(notionalNote(partial)).toContain("50%");
    expect(notionalNote(partial)).toContain("not estimated");
  });
});
