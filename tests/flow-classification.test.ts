import { describe, it, expect } from "vitest";
import {
  classifyEdge,
  buildContractIndex,
  filterByFlowClass,
  countByFlowClass,
  parseFlowClass,
  parseCategory,
  categoryOf,
  FLOW_CLASSES,
  PROTOCOL_CATEGORIES,
  type ContractIndex,
} from "@/lib/flow-classification";

/**
 * Flow classification.
 *
 * A transfer log says an amount moved between two addresses. Everything beyond
 * that — buy, sell, deposit, bridge crossing — is a claim about the
 * counterparty, and may only come from the contracts registry.
 *
 * These tests hold two lines. The first is that direction decides meaning: the
 * same pool and the same wallet are a buy or a sell depending only on which way
 * value went, and getting it backwards would invert every trade on the page.
 * The second is that an unknown counterparty stays UNCLASSIFIED — the registry
 * is the only thing allowed to promote a flow out of it.
 */

const POOL = "0xpool00000000000000000000000000000000aaaa";
const LEND = "0xlend00000000000000000000000000000000bbbb";
const BRIDGE = "0xbrdg00000000000000000000000000000000cccc";
const WALLET_A = "0xwala00000000000000000000000000000000dddd";
const WALLET_B = "0xwalb00000000000000000000000000000000eeee";

const registry: ContractIndex = buildContractIndex([
  { address: POOL, contract_type: "dex_pool" },
  { address: LEND, contract_type: "lending_market" },
  { address: BRIDGE, contract_type: "bridge" },
]);

/** An empty registry — the live state on a chain nobody has classified yet. */
const empty: ContractIndex = buildContractIndex([]);

describe("direction decides what a flow was", () => {
  it("calls value leaving a pool for a wallet a DEX_BUY", () => {
    expect(classifyEdge({ from: POOL, to: WALLET_A }, registry)).toBe("DEX_BUY");
  });

  it("calls value entering a pool from a wallet a DEX_SELL", () => {
    // Same two addresses, opposite direction, opposite meaning.
    expect(classifyEdge({ from: WALLET_A, to: POOL }, registry)).toBe("DEX_SELL");
  });

  it("distinguishes borrowing from repaying by direction", () => {
    expect(classifyEdge({ from: LEND, to: WALLET_A }, registry)).toBe("BORROW");
    expect(classifyEdge({ from: WALLET_A, to: LEND }, registry)).toBe("REPAY");
  });

  it("distinguishes a bridge crossing by direction", () => {
    expect(classifyEdge({ from: WALLET_A, to: BRIDGE }, registry)).toBe("BRIDGE_OUT");
    expect(classifyEdge({ from: BRIDGE, to: WALLET_A }, registry)).toBe("BRIDGE_IN");
  });

  it("matches an address whatever case it arrives in", () => {
    expect(classifyEdge({ from: POOL.toUpperCase(), to: WALLET_A }, registry)).toBe("DEX_BUY");
  });
});

describe("an unknown counterparty stays UNCLASSIFIED", () => {
  it("returns UNCLASSIFIED when the registry is empty, even between two plain addresses", () => {
    // The crucial case, and the live one. An empty registry means "we have not
    // looked", which is not the same as "both of these are ordinary wallets".
    // Claiming WALLET_TRANSFER here would assert something never checked.
    expect(classifyEdge({ from: WALLET_A, to: WALLET_B }, empty)).toBe("UNCLASSIFIED");
  });

  it("claims WALLET_TRANSFER only once the registry has answered", () => {
    expect(classifyEdge({ from: WALLET_A, to: WALLET_B }, registry)).toBe("WALLET_TRANSFER");
  });

  it("is not swayed by a contract type it does not recognise", () => {
    const odd = buildContractIndex([{ address: POOL, contract_type: "something_invented" }]);
    expect(odd.size).toBe(0);
    expect(classifyEdge({ from: POOL, to: WALLET_A }, odd)).toBe("UNCLASSIFIED");
  });

  it("ignores a registry row with no contract type at all", () => {
    expect(buildContractIndex([{ address: POOL, contract_type: null }]).size).toBe(0);
  });
});

describe("filtering uses the classification, not a label", () => {
  const edges = [
    { from: POOL, to: WALLET_A },      // DEX_BUY
    { from: WALLET_A, to: POOL },      // DEX_SELL
    { from: BRIDGE, to: WALLET_B },    // BRIDGE_IN
    { from: WALLET_A, to: WALLET_B },  // WALLET_TRANSFER
  ];

  it("keeps only the selected class", () => {
    const buys = filterByFlowClass(edges, registry, "DEX_BUY");
    expect(buys).toHaveLength(1);
    expect(buys[0].from).toBe(POOL);
  });

  it("excludes the opposite direction of the same venue", () => {
    // The regression that matters: DEX_BUY must not quietly include DEX_SELL.
    const buys = filterByFlowClass(edges, registry, "DEX_BUY");
    expect(buys.some((e) => e.to === POOL)).toBe(false);
  });

  it("returns everything when no filter is active", () => {
    expect(filterByFlowClass(edges, registry, null)).toHaveLength(4);
  });

  it("returns nothing rather than something adjacent when a class has no rows", () => {
    // An empty result is the honest answer. Falling back to unfiltered rows
    // would show a reader flows they did not ask for under a label saying they
    // did.
    expect(filterByFlowClass(edges, registry, "LP_DEPOSIT")).toHaveLength(0);
  });

  it("selects only genuinely unclassified rows for UNCLASSIFIED", () => {
    const unknown = filterByFlowClass(edges, empty, "UNCLASSIFIED");
    expect(unknown).toHaveLength(4); // with no registry, all four are unknown
    expect(filterByFlowClass(edges, registry, "UNCLASSIFIED")).toHaveLength(0);
  });

  it("counts every class, including the ones with nothing in them", () => {
    const counts = countByFlowClass(edges, registry);
    expect(counts.DEX_BUY).toBe(1);
    expect(counts.DEX_SELL).toBe(1);
    expect(counts.BRIDGE_IN).toBe(1);
    expect(counts.WALLET_TRANSFER).toBe(1);
    expect(counts.LP_DEPOSIT).toBe(0);
    // Every class is present as a key, so a chip can show a zero rather than
    // vanish when its class is empty.
    for (const c of FLOW_CLASSES) expect(counts[c]).toBeGreaterThanOrEqual(0);
  });
});

describe("a query string cannot produce a false empty page", () => {
  it("accepts a known class in any case", () => {
    expect(parseFlowClass("dex_buy")).toBe("DEX_BUY");
    expect(parseFlowClass("  BRIDGE_IN ")).toBe("BRIDGE_IN");
  });

  it("falls back to no filter for anything unrecognised", () => {
    // A stale or hand-typed value must read as ALL. Treating it as a real
    // filter would render an empty page that looks like a measurement.
    for (const bad of ["", "nonsense", "DEX BUY", "'; drop table", null, undefined]) {
      expect(parseFlowClass(bad as string | null)).toBeNull();
    }
  });

  it("does the same for categories", () => {
    expect(parseCategory("lending")).toBe("LENDING");
    expect(parseCategory("wat")).toBeNull();
    expect(parseCategory(null)).toBeNull();
  });
});

describe("categories map from the registry, never from a name", () => {
  it("maps each known kind to its category", () => {
    expect(categoryOf("dex_pool")).toBe("DEX");
    expect(categoryOf("lending_market")).toBe("LENDING");
    expect(categoryOf("bridge")).toBe("BRIDGE");
    expect(categoryOf("oracle")).toBe("ORACLE");
    expect(categoryOf("infrastructure")).toBe("INFRASTRUCTURE");
  });

  it("maps an unknown kind to UNCLASSIFIED rather than guessing", () => {
    expect(categoryOf(null)).toBe("UNCLASSIFIED");
  });

  it("exposes UNCLASSIFIED as a real category, not the absence of one", () => {
    expect(PROTOCOL_CATEGORIES).toContain("UNCLASSIFIED");
  });
});
