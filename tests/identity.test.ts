import { describe, it, expect } from "vitest";
import { observationKey, observationIds } from "@/server/market-data/persist";
import { describeFlowRow, type FlowWindowRow } from "@/lib/queries";
import { observation } from "./fixtures";

/**
 * Identity and unit.
 *
 * Two rules that fail quietly, which is why they are tested rather than
 * trusted:
 *
 *   NULL must not disable deduplication. Postgres treats two NULLs as distinct
 *   values, so a nullable column in a unique constraint enforces nothing for
 *   the rows that leave it empty — and the pairless observations from
 *   GeckoTerminal's multi-token endpoint are exactly those rows.
 *
 *   A token amount without its asset has no meaning. -420 is not a fact;
 *   -420 USDG is.
 */

describe("observationKey — a null pair cannot manufacture a second identity", () => {
  it("gives a pairless observation the same identity as an empty-string pair", () => {
    // This equality IS the fix. If these differed, two writes of the same
    // pairless observation would be two rows, and the price history would gain
    // density that never happened.
    const nullPair = observation({ pairAddress: null });
    const emptyPair = observation({ pairAddress: "" });
    expect(observationKey(nullPair, "asset-nvda")).toBe(observationKey(emptyPair, "asset-nvda"));
  });

  it("collapses two identical pairless observations to one identity", () => {
    const a = observation({ pairAddress: null, source: "geckoterminal" });
    const b = observation({ pairAddress: null, source: "geckoterminal" });
    expect(observationKey(a, "asset-nvda")).toBe(observationKey(b, "asset-nvda"));
  });

  it("still separates a pairless observation from one with a real pair", () => {
    const pairless = observation({ pairAddress: null });
    const paired = observation({ pairAddress: "0xpair0000000000000000000000000000000000aa" });
    expect(observationKey(pairless, "asset-nvda")).not.toBe(observationKey(paired, "asset-nvda"));
  });

  it("never emits an identity containing the literal string null or undefined", () => {
    // A key built by naive interpolation would read "...|null" and collide with
    // a genuine pair address of "null".
    const key = observationKey(observation({ pairAddress: null }), "asset-nvda");
    expect(key).not.toContain("null");
    expect(key).not.toContain("undefined");
  });
});

describe("observationIds — the canonical row can find the raw row it chose", () => {
  const stored = [
    {
      id: "row-1",
      asset_id: "asset-nvda",
      source: "geckoterminal",
      price_type: "DEX_SPOT",
      fetched_at: "2026-09-04T12:00:00.000Z",
      pair_key: "",
    },
  ];

  it("keys a stored row exactly as observationKey keys the observation", () => {
    // The link is null whenever these two disagree, so agreement is the test.
    // A mismatch here would leave every source_observation_id null while the
    // documentation claims the selection is auditable.
    const ids = observationIds(stored);
    const canonical = observation({
      pairAddress: null,
      source: "geckoterminal",
      priceType: "DEX_SPOT",
      fetchedAt: "2026-09-04T12:00:00.000Z",
    });
    expect(ids.get(observationKey(canonical, "asset-nvda"))).toBe("row-1");
  });

  it("resolves a legacy row that came back with pair_address instead of pair_key", () => {
    const legacy = [{ ...stored[0], pair_key: undefined, pair_address: null }];
    const ids = observationIds(legacy as never);
    const canonical = observation({ pairAddress: null, fetchedAt: "2026-09-04T12:00:00.000Z" });
    expect(ids.get(observationKey(canonical, "asset-nvda"))).toBe("row-1");
  });

  it("returns no id for an observation that was not part of this write", () => {
    // The canonical row is still written; only the link is unknown. A missing
    // pointer is a smaller loss than a missing price.
    const ids = observationIds(stored);
    const other = observation({ fetchedAt: "2026-09-04T13:00:00.000Z", pairAddress: null });
    expect(ids.get(observationKey(other, "asset-nvda"))).toBeUndefined();
  });

  it("handles an empty insert result without throwing", () => {
    expect(observationIds(null).size).toBe(0);
    expect(observationIds([]).size).toBe(0);
  });
});

describe("describeFlowRow — an amount is never published without its asset", () => {
  const row = (over: Partial<FlowWindowRow> = {}): FlowWindowRow => ({
    entity_type: "address_asset",
    entity_id: "0xabc0000000000000000000000000000000000001:asset-usdg",
    address: "0xabc0000000000000000000000000000000000001",
    asset_id: "asset-usdg",
    window: "24H",
    inflow: 1200,
    outflow: 1620,
    net_flow: -420,
    transaction_count: 9,
    unique_counterparties: 4,
    calculated_at: "2026-09-04T12:00:00.000Z",
    ...over,
  });

  it("returns the address alone, never the composite storage key", () => {
    const out = describeFlowRow(row(), new Map([["asset-usdg", "USDG"]]));
    expect(out.address).toBe("0xabc0000000000000000000000000000000000001");
    // The composite is an implementation detail and is not a resolvable
    // address — returning it in a field called "address" hands a consumer a
    // string that looks like one and is not.
    expect(out.address).not.toContain(":");
  });

  it("names the asset and the unit beside the amounts", () => {
    const out = describeFlowRow(row(), new Map([["asset-usdg", "USDG"]]));
    expect(out.asset).toEqual({ id: "asset-usdg", symbol: "USDG" });
    expect(out.unit).toBe("USDG");
    expect(out.net_flow).toBe(-420);
  });

  it("reports a null unit rather than a wrong one when the symbol is unknown", () => {
    // Silence is correct here. Guessing a symbol would attach a real number to
    // the wrong asset, which is worse than saying the asset is unidentified.
    const out = describeFlowRow(row(), new Map());
    expect(out.unit).toBeNull();
    expect(out.asset).toEqual({ id: "asset-usdg", symbol: null });
  });

  it("carries no asset at all when the row has none", () => {
    const out = describeFlowRow(row({ asset_id: null }), new Map());
    expect(out.asset).toBeNull();
    expect(out.unit).toBeNull();
  });

  it("always exposes a unit field alongside every amount field", () => {
    // Structural: whatever else changes, an amount must never ship alone.
    const out = describeFlowRow(row(), new Map([["asset-usdg", "USDG"]]));
    for (const amountField of ["inflow", "outflow", "net_flow"] as const) {
      expect(out).toHaveProperty(amountField);
    }
    expect(out).toHaveProperty("unit");
    expect(out).toHaveProperty("asset");
  });
});
