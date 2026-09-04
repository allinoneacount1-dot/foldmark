import { describe, it, expect } from "vitest";
import {
  classifyNode,
  layoutRadial,
  NODE_CLASSES,
  NODE_CLASS_SHAPE,
  type NodeClass,
} from "@/lib/graph-semantics";
import { buildContractIndex, type ContractIndex } from "@/lib/flow-classification";
import type { GraphEdge, GraphNode, MarketGraph } from "@/lib/graph";

/**
 * The topology map's semantics.
 *
 * The map draws claims. A hexagon says "this is an asset", a circle says "this
 * is a trading venue", and a reader takes both at face value. These tests hold
 * the line that only the contracts registry may make such a claim, and that
 * position on the canvas encodes role rather than an importance nobody
 * measured.
 */

const POOL = "0xpool00000000000000000000000000000000aaaa";
const LEND = "0xlend00000000000000000000000000000000bbbb";
const ORACLE = "0xorcl00000000000000000000000000000000cccc";
const PLAIN = "0xplan00000000000000000000000000000000dddd";

const registry: ContractIndex = buildContractIndex([
  { address: POOL, contract_type: "dex_pool" },
  { address: LEND, contract_type: "lending_market" },
  { address: ORACLE, contract_type: "oracle" },
]);

const empty: ContractIndex = buildContractIndex([]);

function node(id: string, over: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    kind: "source",
    label: id,
    role: "NET SENDER",
    weight: 1,
    transfers: 1,
    degree: 1,
    x: 0,
    y: 0,
    scale: 0.5,
    fresh: false,
    href: `/wallet/${id}`,
    ...over,
  };
}

function asset(id: string, over: Partial<GraphNode> = {}): GraphNode {
  return node(id, { kind: "asset", label: id.toUpperCase(), role: "stablecoin", href: `/assets/${id}`, ...over });
}

function edge(source: string, target: string, transfers = 1): GraphEdge {
  return {
    id: `${source}->${target}`,
    source,
    target,
    weight: 1,
    transfers,
    assetId: null,
    assetSymbol: null,
    intensity: 0.5,
    fresh: false,
  };
}

function graphOf(nodes: GraphNode[], edges: GraphEdge[]): MarketGraph {
  return {
    nodes,
    edges,
    totals: { addresses: 0, assets: 0, transfers: 0, edges: edges.length },
    shown: { nodes: nodes.length, edges: edges.length },
    truncated: false,
  };
}

describe("only the registry may say what a node is", () => {
  it("reads each identified kind into its visual class", () => {
    expect(classifyNode(node(POOL), registry)).toBe("venue");
    expect(classifyNode(node(LEND), registry)).toBe("protocol");
    expect(classifyNode(node(ORACLE), registry)).toBe("oracle");
  });

  it("leaves an unidentified address an address", () => {
    // The claim that matters. Drawing this as a wallet would assert it is an
    // externally owned account, which nothing has established.
    expect(classifyNode(node(PLAIN), registry)).toBe("address");
  });

  it("classes every address as an address when the registry is empty", () => {
    // The live state: no registry rows yet. Not one node may be promoted.
    for (const id of [POOL, LEND, ORACLE, PLAIN]) {
      expect(classifyNode(node(id), empty)).toBe("address");
    }
  });

  it("still calls an asset an asset without any registry", () => {
    // An asset is an asset because the indexer resolved a token contract, not
    // because the counterparty registry said so.
    expect(classifyNode(asset("usdc"), empty)).toBe("asset");
  });

  it("matches an address whatever case it arrives in", () => {
    expect(classifyNode(node(POOL.toUpperCase()), registry)).toBe("venue");
  });

  it("gives every class a distinct-enough shape to read without colour", () => {
    // Colour reinforces class; shape carries it. Assets and protocols share the
    // hexagon deliberately — both are counterparties you address directly — and
    // are separated by ring and colour instead.
    const shapes = new Set(NODE_CLASSES.map((c) => NODE_CLASS_SHAPE[c as NodeClass]));
    expect(shapes.size).toBeGreaterThanOrEqual(4);
    expect(NODE_CLASS_SHAPE.address).not.toBe(NODE_CLASS_SHAPE.asset);
    expect(NODE_CLASS_SHAPE.venue).not.toBe(NODE_CLASS_SHAPE.oracle);
  });
});

describe("the centre is a measurement, never a decoration", () => {
  it("puts a strictly best-connected asset at the origin", () => {
    const g = graphOf(
      [asset("a", { degree: 9 }), asset("b", { degree: 2 }), node(PLAIN)],
      [edge(PLAIN, "a")],
    );
    const { byId } = layoutRadial(g, empty);
    expect(byId.get("a")!.central).toBe(true);
    expect(byId.get("a")!.wx).toBeCloseTo(0);
    expect(byId.get("a")!.wy).toBeCloseTo(0);
  });

  it("nominates nobody when two assets tie", () => {
    // A tie is not a finding. Rather than pick one and imply dominance the map
    // does not claim, both sit on the inner ring.
    const g = graphOf(
      [asset("a", { degree: 4, transfers: 7 }), asset("b", { degree: 4, transfers: 7 }), node(PLAIN)],
      [edge(PLAIN, "a")],
    );
    const { nodes } = layoutRadial(g, empty);
    expect(nodes.filter((n) => n.central)).toHaveLength(0);
    for (const a of nodes.filter((n) => n.nodeClass === "asset")) {
      expect(Math.hypot(a.wx, a.wy)).toBeGreaterThan(0);
    }
  });

  it("breaks a degree tie on observed transfers rather than on row order", () => {
    const g = graphOf(
      [asset("a", { degree: 4, transfers: 2 }), asset("b", { degree: 4, transfers: 90 }), node(PLAIN)],
      [edge(PLAIN, "b")],
    );
    expect(layoutRadial(g, empty).byId.get("b")!.central).toBe(true);
  });

  it("centres a lone asset, which claims nothing about rank", () => {
    const g = graphOf([asset("a"), node(PLAIN)], [edge(PLAIN, "a")]);
    expect(layoutRadial(g, empty).byId.get("a")!.central).toBe(true);
  });
});

describe("position encodes role", () => {
  const g = graphOf(
    [asset("a", { degree: 9 }), node(POOL), node(LEND), node(ORACLE), node(PLAIN)],
    [edge(POOL, "a"), edge(LEND, "a"), edge(ORACLE, "a"), edge(PLAIN, "a")],
  );

  it("orders the rings asset, counterparty, address, periphery", () => {
    const { byId } = layoutRadial(g, registry);
    const r = (id: string) => Math.hypot(byId.get(id)!.wx, byId.get(id)!.wy);
    expect(r("a")).toBeLessThan(r(POOL));
    expect(r(POOL)).toBeLessThan(r(PLAIN));
    expect(r(PLAIN)).toBeLessThan(r(ORACLE));
  });

  it("puts a venue and a protocol on the same ring", () => {
    const { byId } = layoutRadial(g, registry);
    expect(Math.hypot(byId.get(POOL)!.wx, byId.get(POOL)!.wy)).toBeCloseTo(
      Math.hypot(byId.get(LEND)!.wx, byId.get(LEND)!.wy),
    );
  });

  it("places every node exactly once", () => {
    const { nodes } = layoutRadial(g, registry);
    expect(nodes).toHaveLength(g.nodes.length);
    expect(new Set(nodes.map((n) => n.id)).size).toBe(g.nodes.length);
  });
});

describe("layout is deterministic and never random", () => {
  const nodes = [asset("a", { degree: 9 }), node(POOL), node(LEND), node(PLAIN)];
  const edges = [edge(POOL, "a", 5), edge(LEND, "a", 2), edge(PLAIN, "a", 1)];

  it("produces identical coordinates twice in a row", () => {
    // The server and the client must draw the same map. Any jitter here is a
    // hydration mismatch waiting to happen.
    const first = layoutRadial(graphOf(nodes, edges), registry);
    const second = layoutRadial(graphOf(nodes, edges), registry);
    for (const n of first.nodes) {
      const m = second.byId.get(n.id)!;
      expect(m.wx).toBe(n.wx);
      expect(m.wy).toBe(n.wy);
    }
  });

  it("does not depend on the order rows arrived in", () => {
    const forward = layoutRadial(graphOf(nodes, edges), registry);
    const reversed = layoutRadial(graphOf([...nodes].reverse(), [...edges].reverse()), registry);
    for (const n of forward.nodes) {
      const m = reversed.byId.get(n.id)!;
      expect(m.wx).toBeCloseTo(n.wx, 10);
      expect(m.wy).toBeCloseTo(n.wy, 10);
    }
  });

  it("separates every node on a ring", () => {
    // Ten addresses around one asset must not stack on one another.
    const many = [asset("a", { degree: 20 }), ...Array.from({ length: 10 }, (_, i) => node(`0xaddr${i}`))];
    const manyEdges = Array.from({ length: 10 }, (_, i) => edge(`0xaddr${i}`, "a"));
    const { nodes: placed } = layoutRadial(graphOf(many, manyEdges), empty);
    const ring = placed.filter((n) => n.nodeClass === "address");
    for (const p of ring) {
      for (const q of ring) {
        if (p.id === q.id) continue;
        expect(Math.hypot(p.wx - q.wx, p.wy - q.wy)).toBeGreaterThan(0.01);
      }
    }
  });

  it("survives a graph with no edges at all", () => {
    const { nodes: placed } = layoutRadial(graphOf([node(PLAIN), node(POOL)], []), registry);
    expect(placed).toHaveLength(2);
    for (const p of placed) {
      expect(Number.isFinite(p.wx)).toBe(true);
      expect(Number.isFinite(p.wy)).toBe(true);
    }
  });

  it("returns a usable box for an empty graph", () => {
    const { bounds, nodes: placed } = layoutRadial(graphOf([], []), empty);
    expect(placed).toHaveLength(0);
    expect(bounds.maxX).toBeGreaterThan(bounds.minX);
    expect(bounds.maxY).toBeGreaterThan(bounds.minY);
  });
});

describe("a node sits near what it transacts with", () => {
  it("aims an address at the asset it actually moved value with", () => {
    // Two assets on opposite sides; an address trading only with the second
    // must not be parked next to the first.
    const g = graphOf(
      [asset("a", { degree: 3 }), asset("b", { degree: 3 }), node(PLAIN), node(POOL)],
      [edge(PLAIN, "b", 40), edge(POOL, "a", 40)],
    );
    const { byId } = layoutRadial(g, empty);
    const b = byId.get("b")!;
    const plain = byId.get(PLAIN)!;
    const a = byId.get("a")!;

    const gap = (p: number, q: number) => Math.abs(Math.atan2(Math.sin(p - q), Math.cos(p - q)));
    expect(gap(plain.angle, b.angle)).toBeLessThan(gap(plain.angle, a.angle));
  });
});
