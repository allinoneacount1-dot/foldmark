import { describe, it, expect } from "vitest";
import { foldByAddress, flowForAsset, dominantFlow, foldEdges } from "@/lib/queries";
import {
  toNotional,
  notionalNote,
  prepareSeries,
  alignPrice,
  DEFAULT_ALIGNMENT,
  MAX_ALIGNMENT_DELTA_MS,
} from "@/lib/notional";
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

describe("toNotional — a current price is not a historical price", () => {
  const T = (iso: string) => Date.parse(iso);
  const pt = (iso: string, price: number) => ({ price, observedAt: iso, source: "geckoterminal" });

  /**
   * The rule under test: every transfer is valued at the price that held when
   * it happened.
   *
   * Multiplying a whole window of transfers by the newest quote produces a
   * number that looks measured and is not. Nothing here interpolates, carries a
   * price forward past its tolerance, or lets a later observation reach back to
   * value an earlier transfer.
   */

  it("REGRESSION: a 24H-old transfer is NOT valued at a quote observed 23 hours later", () => {
    // The exact scenario from the directive: the quote is only 2 minutes old
    // relative to "now", and 23 hours away from the transfer it would price.
    const movements = [{ assetId: "asset-nvda", amount: 10, at: "2026-09-03T04:00:00.000Z" }];
    const series = prepareSeries(new Map([["asset-nvda", [pt("2026-09-04T03:00:00.000Z", 500)]]]));

    const result = toNotional(movements, series);

    expect(result.usd).toBeNull();
    expect(result.state).toBe("UNAVAILABLE");
    expect(result.transfersPriced).toBe(0);
    // The only observation lies AFTER the transfer, so under no-look-ahead
    // there is nothing that could have priced it at the time.
    expect(result.excludedByReason.NO_PRIOR_OBSERVATION).toBe(1);
  });

  it("selects the nearest observation at or before the transfer", () => {
    const movements = [{ assetId: "asset-nvda", amount: 2, at: "2026-09-03T12:00:00.000Z" }];
    const series = prepareSeries(
      new Map([
        [
          "asset-nvda",
          [
            pt("2026-09-03T11:00:00.000Z", 100), // too old
            pt("2026-09-03T11:55:00.000Z", 200), // the one that held
            pt("2026-09-03T12:30:00.000Z", 900), // look-ahead, must not be used
          ],
        ],
      ]),
    );

    const result = toNotional(movements, series);

    expect(result.state).toBe("OK");
    expect(result.usd).toBeCloseTo(400, 6); // 2 x 200, not 2 x 900 and not 2 x 100
    expect(result.oldestAlignmentDeltaMs).toBe(5 * 60_000);
  });

  it("prices two transfers in the same window at their two different prices", () => {
    // The whole point: one window, one asset, two moments, two valuations.
    const movements = [
      { assetId: "asset-nvda", amount: 1, at: "2026-09-03T06:00:00.000Z" },
      { assetId: "asset-nvda", amount: 1, at: "2026-09-03T18:00:00.000Z" },
    ];
    const series = prepareSeries(
      new Map([["asset-nvda", [pt("2026-09-03T06:00:00.000Z", 100), pt("2026-09-03T18:00:00.000Z", 300)]]]),
    );

    const result = toNotional(movements, series);

    expect(result.transfersPriced).toBe(2);
    // 100 + 300. Valuing both at the latest quote would give 600.
    expect(result.usd).toBeCloseTo(400, 6);
  });

  it("excludes a historical movement with no aligned price and counts it", () => {
    const movements = [
      { assetId: "asset-nvda", amount: 1, at: "2026-09-03T06:00:00.000Z" }, // priced
      { assetId: "asset-aapl", amount: 5, at: "2026-09-03T06:00:00.000Z" }, // no series
    ];
    const series = prepareSeries(new Map([["asset-nvda", [pt("2026-09-03T05:58:00.000Z", 100)]]]));

    const result = toNotional(movements, series);

    expect(result.state).toBe("PARTIAL");
    expect(result.usd).toBeCloseTo(100, 6); // AAPL contributed nothing
    expect(result.transfersTotal).toBe(2);
    expect(result.transfersPriced).toBe(1);
    expect(result.transfersExcluded).toBe(1);
    expect(result.coverage).toBeCloseTo(0.5, 6);
    expect(result.excludedByReason.NO_SERIES).toBe(1);
    expect(result.excludedAssets).toContainEqual({ assetId: "asset-aapl", reason: "NO_SERIES", movements: 1 });
  });

  it("refuses an observation older than the alignment tolerance rather than carrying it forward", () => {
    const movements = [{ assetId: "asset-nvda", amount: 10, at: "2026-09-03T12:00:00.000Z" }];
    const tooOld = new Date(T("2026-09-03T12:00:00.000Z") - MAX_ALIGNMENT_DELTA_MS - 1000).toISOString();
    const series = prepareSeries(new Map([["asset-nvda", [pt(tooOld, 100)]]]));

    const result = toNotional(movements, series);

    expect(result.usd).toBeNull();
    expect(result.excludedByReason.DELTA_EXCEEDED).toBe(1);
  });

  it("accepts an observation exactly at the tolerance boundary", () => {
    const at = "2026-09-03T12:00:00.000Z";
    const exact = new Date(T(at) - MAX_ALIGNMENT_DELTA_MS).toISOString();
    const result = toNotional(
      [{ assetId: "asset-nvda", amount: 1, at }],
      prepareSeries(new Map([["asset-nvda", [pt(exact, 42)]]])),
    );
    expect(result.usd).toBeCloseTo(42, 6);
    expect(result.oldestAlignmentDeltaMs).toBe(MAX_ALIGNMENT_DELTA_MS);
  });

  it("prices a transfer by an observation at the very same instant", () => {
    const at = "2026-09-03T12:00:00.000Z";
    const result = toNotional(
      [{ assetId: "asset-nvda", amount: 3, at }],
      prepareSeries(new Map([["asset-nvda", [pt(at, 10)]]])),
    );
    expect(result.usd).toBeCloseTo(30, 6);
    expect(result.oldestAlignmentDeltaMs).toBe(0);
  });

  it("reports the widest gap actually used, not the tolerance", () => {
    const series = prepareSeries(
      new Map([["asset-nvda", [pt("2026-09-03T11:50:00.000Z", 1), pt("2026-09-03T12:59:00.000Z", 1)]]]),
    );
    const result = toNotional(
      [
        { assetId: "asset-nvda", amount: 1, at: "2026-09-03T11:52:00.000Z" }, // 2m
        { assetId: "asset-nvda", amount: 1, at: "2026-09-03T13:00:00.000Z" }, // 1m
      ],
      series,
    );
    expect(result.oldestAlignmentDeltaMs).toBe(2 * 60_000);
    expect(result.maxAlignmentDeltaMs).toBe(MAX_ALIGNMENT_DELTA_MS);
  });

  it("excludes a movement whose own timestamp cannot be read", () => {
    const result = toNotional(
      [{ assetId: "asset-nvda", amount: 1, at: "not-a-date" }],
      prepareSeries(new Map([["asset-nvda", [pt("2026-09-03T12:00:00.000Z", 100)]]])),
    );
    expect(result.usd).toBeNull();
    expect(result.excludedByReason.UNDATED_MOVEMENT).toBe(1);
  });

  it("drops an unusable price point instead of pricing anything with it", () => {
    // A zero price and an unparseable observation time are both discarded when
    // the series is built, leaving nothing to align to.
    const series = prepareSeries(
      new Map([
        [
          "asset-nvda",
          [pt("2026-09-03T11:59:00.000Z", 0), { price: 5, observedAt: "nonsense", source: "x" }],
        ],
      ]),
    );
    expect(series.has("asset-nvda")).toBe(false);
    const result = toNotional([{ assetId: "asset-nvda", amount: 1, at: "2026-09-03T12:00:00.000Z" }], series);
    expect(result.excludedByReason.NO_SERIES).toBe(1);
  });

  it("states the alignment policy it used, so the number can be checked", () => {
    const result = toNotional(
      [{ assetId: "asset-nvda", amount: 1, at: "2026-09-03T12:00:00.000Z" }],
      prepareSeries(new Map([["asset-nvda", [pt("2026-09-03T11:59:00.000Z", 1)]]])),
    );
    expect(result.noLookAhead).toBe(true);
    expect(notionalNote(result)).toContain("never at the current price");
  });

  it("says how many movements it covered when the total is partial", () => {
    const result = toNotional(
      [
        { assetId: "asset-nvda", amount: 1, at: "2026-09-03T12:00:00.000Z" },
        { assetId: "asset-usdg", amount: 1, at: "2026-09-03T12:00:00.000Z" },
      ],
      prepareSeries(new Map([["asset-nvda", [pt("2026-09-03T11:59:00.000Z", 1)]]])),
    );
    expect(notionalNote(result)).toContain("50%");
    expect(notionalNote(result)).toContain("not estimated");
  });

  it("returns nothing to value for an empty window rather than a zero total", () => {
    const result = toNotional([], prepareSeries(new Map()));
    expect(result.usd).toBeNull();
    expect(result.state).toBe("UNAVAILABLE");
    expect(notionalNote(result)).toContain("nothing to value");
  });
});

describe("alignPrice — the lookup itself", () => {
  const series = prepareSeries(
    new Map([
      [
        "a",
        Array.from({ length: 500 }, (_, i) => ({
          price: i + 1,
          observedAt: new Date(Date.parse("2026-09-03T00:00:00.000Z") + i * 60_000).toISOString(),
          source: "s",
        })),
      ],
    ]),
  ).get("a")!;

  it("binary searches a long series to the correct neighbour", () => {
    const at = Date.parse("2026-09-03T00:00:00.000Z") + 250 * 60_000 + 30_000;
    const r = alignPrice(series, at, DEFAULT_ALIGNMENT);
    expect("point" in r && r.point.price).toBe(251); // the 250th point, 0-indexed
    expect("deltaMs" in r && r.deltaMs).toBe(30_000);
  });

  it("returns NO_SERIES for an asset with no observations", () => {
    const r = alignPrice(undefined, Date.now(), DEFAULT_ALIGNMENT);
    expect("failure" in r && r.failure).toBe("NO_SERIES");
  });

  it("returns NO_PRIOR_OBSERVATION before the series begins", () => {
    const r = alignPrice(series, Date.parse("2026-09-02T00:00:00.000Z"), DEFAULT_ALIGNMENT);
    expect("failure" in r && r.failure).toBe("NO_PRIOR_OBSERVATION");
  });
});
