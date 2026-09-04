/**
 * Architecture preview geometry.
 *
 * The topology canvas illustrates a product STRUCTURE — how wallets, assets,
 * venues and protocols relate — and that structure is real whether or not any
 * particular market has been observed yet. So before a database is connected
 * the canvas draws a generic version of it rather than an empty black
 * rectangle, and says ARCHITECTURE PREVIEW in the corner.
 *
 * There is deliberately NO price data in this file. An earlier draft generated
 * deterministic candles to fill the chart; that was wrong and is gone. A price
 * chart showing invented movement is a claim about a market no matter how it is
 * labelled, so the chart uses REAL reference market data from TradingView
 * instead (see src/config/reference-markets.ts). Illustrating a topology is not
 * the same act as drawing a price.
 *
 * WHAT KEEPS THIS SAFE:
 *
 * 1. Nothing here is denominated. No price, no amount, no percentage, no
 *    volume. Node weight drives a radius; edge intensity drives a stroke.
 * 2. Nothing here names a real thing. Nodes are ASSET A and WALLET CLUSTER,
 *    never a symbol, a contract address or a protocol.
 * 3. Nothing here can reach the machine. A test walks the import graph and
 *    fails if an API route, the database layer, the indexer or the market-data
 *    engine ever imports this module.
 * 4. Nothing here is random. The generator is seeded and pure, so server and
 *    browser agree and nothing shifts on hydration.
 *
 * The moment real structure is observed, the preview is not consulted.
 */

/** The one flag that says a surface is drawing preview geometry. */
export const PREVIEW_MODE = "PREVIEW" as const;

export type PresentationMode = "LIVE" | "REFERENCE" | typeof PREVIEW_MODE;

/**
 * Deterministic generator.
 *
 * mulberry32: small, fast, and — the only property that matters here — a pure
 * function of its seed. The server and the browser produce identical geometry,
 * so nothing shifts on hydration.
 */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable seed from a string, so one asset always previews the same shape. */
function seedFrom(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ----------------------------------------------------------------- topology */

export type PreviewNodeKind = "asset" | "wallet" | "market" | "protocol";

export type PreviewNode = {
  id: string;
  /** A category, never an entity. No symbol, no address, no protocol name. */
  label: string;
  kind: PreviewNodeKind;
  /** Unit-square coordinates; the canvas maps them to its own box. */
  x: number;
  y: number;
  /** 0..1 relative weight, drives radius only. Not a measurement. */
  weight: number;
};

export type PreviewEdge = {
  id: string;
  source: string;
  target: string;
  /** 0..1, drives stroke only. */
  intensity: number;
};

export type PreviewTopology = {
  nodes: PreviewNode[];
  edges: PreviewEdge[];
  mode: typeof PREVIEW_MODE;
};

/**
 * The shape of a market, without claiming a market.
 *
 * Wallets on the left, assets through the middle, venues on the right — the
 * same left-to-right reading the measured graph uses, so the preview teaches
 * the layout a visitor will later read real data in. Labels are categories
 * because a named node would be an assertion about something that exists.
 */
export function previewTopology(key = "foldmark"): PreviewTopology {
  const rand = seeded(seedFrom(key));

  const nodes: PreviewNode[] = [
    { id: "a1", label: "ASSET A", kind: "asset", x: 0.5, y: 0.28, weight: 1 },
    { id: "a2", label: "ASSET B", kind: "asset", x: 0.52, y: 0.56, weight: 0.78 },
    { id: "a3", label: "ASSET C", kind: "asset", x: 0.46, y: 0.82, weight: 0.5 },

    { id: "w1", label: "WALLET CLUSTER", kind: "wallet", x: 0.14, y: 0.2, weight: 0.62 },
    { id: "w2", label: "WALLET CLUSTER", kind: "wallet", x: 0.1, y: 0.46, weight: 0.44 },
    { id: "w3", label: "WALLET CLUSTER", kind: "wallet", x: 0.16, y: 0.72, weight: 0.55 },
    { id: "w4", label: "WALLET CLUSTER", kind: "wallet", x: 0.24, y: 0.9, weight: 0.32 },
    { id: "w5", label: "WALLET CLUSTER", kind: "wallet", x: 0.2, y: 0.05, weight: 0.28 },

    { id: "m1", label: "MARKET", kind: "market", x: 0.86, y: 0.34, weight: 0.8 },
    { id: "m2", label: "LIQUIDITY", kind: "market", x: 0.9, y: 0.66, weight: 0.6 },
    { id: "p1", label: "PROTOCOL", kind: "protocol", x: 0.74, y: 0.12, weight: 0.45 },
    { id: "p2", label: "PROTOCOL", kind: "protocol", x: 0.78, y: 0.9, weight: 0.38 },
  ];

  const pairs: [string, string][] = [
    ["w1", "a1"], ["w2", "a1"], ["w2", "a2"], ["w3", "a2"], ["w3", "a3"],
    ["w4", "a3"], ["w5", "a1"], ["w1", "a2"],
    ["a1", "m1"], ["a2", "m1"], ["a2", "m2"], ["a3", "m2"], ["a1", "m2"],
    ["a1", "p1"], ["a3", "p2"], ["m1", "p1"], ["m2", "p2"],
  ];

  const edges: PreviewEdge[] = pairs.map(([source, target]) => ({
    id: `${source}-${target}`,
    source,
    target,
    intensity: 0.3 + rand() * 0.65,
  }));

  return { nodes, edges, mode: PREVIEW_MODE };
}

/* ------------------------------------------------------------- capabilities */

export type Capability = { label: string; status: string };

/**
 * What a metric rail says when it has no metric.
 *
 * A column of em dashes reads as a broken dashboard. These say what the system
 * can do and what part of it is currently running — every one of which is true
 * without a database, because the chain listener, the folding engine and the
 * topology renderer are all real code that is genuinely present.
 */
export const CAPABILITIES: Record<string, Capability> = {
  transfers: { label: "TRANSFER INDEX", status: "CHAIN LISTENER ACTIVE" },
  flow: { label: "CAPITAL FLOW", status: "FLOW ENGINE READY" },
  topology: { label: "MARKET STRUCTURE", status: "TOPOLOGY ONLINE" },
  addresses: { label: "ADDRESS INDEX", status: "READY" },
  price: { label: "PRICE LAYER", status: "PREVIEW" },
  registry: { label: "ASSET REGISTRY", status: "DISCOVERY READY" },
  protocols: { label: "CLASSIFICATION", status: "RULES LOADED" },
};
