import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { previewTopology, CAPABILITIES } from "@/lib/presentation-preview";

/**
 * Preview isolation.
 *
 * Preview geometry exists so the interface is not a grid of em dashes before a
 * database is connected. It is safe only while it stays on the far side of one
 * line: it may be drawn, and it may never be recorded, priced, served, or
 * counted.
 *
 * That line cannot be held by intention. Someone reaches for a chart series in
 * a route handler, or a topology in an aggregation, and the product starts
 * publishing invented structure as measurement. So the line is held by a test
 * that walks the actual import graph, and by assertions that the preview
 * carries no denominated value to leak in the first place.
 */

const ROOT = join(process.cwd(), "src");
const PREVIEW_MODULE = "presentation-preview";

/** Every .ts/.tsx file under a directory. */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

function imports(file: string): boolean {
  return readFileSync(file, "utf8").includes(PREVIEW_MODULE);
}

describe("preview geometry cannot reach the machine", () => {
  /**
   * The directories where a number becomes a fact.
   *
   * An API response is a published measurement. The database layer writes
   * history. The indexer decides what was observed. The market-data engine
   * prices things. If preview data enters any of them it stops being a drawing
   * and starts being a claim.
   */
  const FORBIDDEN = [
    { dir: join(ROOT, "app", "api"), why: "an API response is a published measurement" },
    { dir: join(ROOT, "server"), why: "the server layer writes history and prices assets" },
  ];

  for (const { dir, why } of FORBIDDEN) {
    it(`is never imported under ${dir.replace(process.cwd(), "").replace(/\\/g, "/")} — ${why}`, () => {
      const offenders = walk(dir).filter(imports);
      expect(offenders.map((f) => f.replace(process.cwd(), ""))).toEqual([]);
    });
  }

  const FORBIDDEN_FILES = [
    ["src/lib/queries.ts", "the read layer answers with measured rows"],
    ["src/lib/indexer.ts", "the indexer decides what was observed"],
    ["src/lib/notional.ts", "notional multiplies real amounts by real prices"],
    ["src/lib/ohlc.ts", "OHLC aggregates observations into candles"],
    ["src/lib/graph.ts", "the graph folds real transfers into structure"],
  ] as const;

  for (const [file, why] of FORBIDDEN_FILES) {
    it(`is never imported by ${file} — ${why}`, () => {
      expect(imports(join(process.cwd(), file)), `${file} imports preview data`).toBe(false);
    });
  }

  it("is imported by at least one component, or it is dead code", () => {
    // The mirror of the rule above: isolation is only meaningful if the module
    // is actually used somewhere it belongs.
    const used = walk(join(ROOT, "components")).filter(imports);
    expect(used.length).toBeGreaterThan(0);
  });
});

describe("preview data carries nothing that could pass as a measurement", () => {
  it("names no real entity anywhere in the topology", () => {
    const t = previewTopology();
    const text = t.nodes.map((n) => n.label).join(" ");

    // No address, no ticker, no protocol anyone could look up.
    expect(text).not.toMatch(/0x[0-9a-fA-F]{6,}/);
    for (const real of ["NVDA", "AAPL", "USDG", "AMZN", "TSLA", "UNISWAP", "PANCAKE", "ROBINHOOD"]) {
      expect(text.toUpperCase()).not.toContain(real);
    }
    // Every label is a category.
    for (const n of t.nodes) {
      expect(n.label).toMatch(/^(ASSET [A-Z]|WALLET CLUSTER|MARKET|LIQUIDITY|PROTOCOL)$/);
    }
  });

  it("carries no contract address on any node", () => {
    for (const n of previewTopology().nodes) {
      expect(n).not.toHaveProperty("contract");
      expect(n).not.toHaveProperty("address");
      expect(n).not.toHaveProperty("symbol");
    }
  });

  it("carries no amount, price or liquidity on any edge", () => {
    for (const e of previewTopology().edges) {
      expect(e).not.toHaveProperty("amount");
      expect(e).not.toHaveProperty("value");
      expect(e).not.toHaveProperty("usd");
      expect(e).not.toHaveProperty("liquidityUsd");
    }
  });
});

describe("preview data is deterministic", () => {
  it("produces an identical topology across calls", () => {
    expect(previewTopology()).toEqual(previewTopology());
  });

  it("uses no clock, so it cannot drift between render passes", () => {
    // Calls, not mentions — the module's own comments explain why Math.random
    // is excluded, and a substring match would flag that explanation.
    const src = readFileSync(join(ROOT, "lib", "presentation-preview.ts"), "utf8").replace(
      /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
      "",
    );
    expect(src).not.toMatch(/Math\.random\s*\(/);
    expect(src).not.toMatch(/Date\.now\s*\(/);
    expect(src).not.toMatch(/new Date\(\s*\)/);
  });
});

describe("the preview is actually drawable", () => {
  it("returns enough topology to fill a canvas", () => {
    const t = previewTopology();
    expect(t.nodes.length).toBeGreaterThanOrEqual(10);
    expect(t.edges.length).toBeGreaterThanOrEqual(12);
    // Every edge connects nodes that exist, or the canvas draws into nothing.
    const ids = new Set(t.nodes.map((n) => n.id));
    for (const e of t.edges) {
      expect(ids.has(e.source), e.id).toBe(true);
      expect(ids.has(e.target), e.id).toBe(true);
    }
  });

  it("places every node inside the unit square", () => {
    for (const n of previewTopology().nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(1);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeLessThanOrEqual(1);
    }
  });
});

describe("capability copy states what is genuinely running", () => {
  it("carries no digit, so a capability can never read as a metric", () => {
    for (const [key, c] of Object.entries(CAPABILITIES)) {
      expect(`${c.label} ${c.status}`, key).not.toMatch(/\d/);
    }
  });
});
