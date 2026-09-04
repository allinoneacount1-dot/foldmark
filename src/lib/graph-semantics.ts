/**
 * Semantic classes and spatial layout for the market topology map.
 *
 * Two jobs, both pure, both deterministic, and deliberately kept out of the
 * renderer so they can be held by tests.
 *
 * CLASS. What a node *is* — a venue, a lending protocol, an oracle — is a claim
 * about an address, and the only thing entitled to make it is the contracts
 * registry. An address nobody has identified is drawn as an address and called
 * an address. It is never promoted to "wallet", "retail" or any other category
 * on the strength of how it behaved, because the shape a node is drawn in is
 * read as a fact about it.
 *
 * POSITION. Where a node sits encodes role, not importance: assets inner,
 * venues and protocols around them, plain addresses on the perimeter, oracles
 * and infrastructure outside that. Angle comes from what a node is actually
 * connected to, so a node sits near the asset it moved value with and edges run
 * roughly radially instead of across the whole field. Nothing here is random —
 * the same graph lays out identically on the server and the client, and twice
 * in a row.
 */

import type { GraphEdge, GraphNode, MarketGraph } from "@/lib/graph";
import type { ContractIndex } from "@/lib/flow-classification";

/**
 * The visual vocabulary of the map.
 *
 * `address` is the honest default: an address the registry has no entry for.
 * It is not a claim that the address is an ordinary wallet — only that nothing
 * has identified it as anything else.
 */
export const NODE_CLASSES = [
  "asset",
  "venue",
  "protocol",
  "oracle",
  "infrastructure",
  "address",
] as const;

export type NodeClass = (typeof NODE_CLASSES)[number];

/** What each class is called in the legend and the inspector. */
export const NODE_CLASS_LABEL: Record<NodeClass, string> = {
  asset: "ASSET",
  venue: "MARKET VENUE",
  protocol: "PROTOCOL",
  oracle: "ORACLE",
  infrastructure: "INFRASTRUCTURE",
  address: "ADDRESS",
};

/**
 * The shape each class is drawn in. Shape is the primary carrier of class —
 * colour reinforces it but never carries it alone, so the map stays readable
 * to a viewer who cannot separate lime from violet.
 */
export type NodeShape = "hexagon" | "circle" | "square" | "triangle" | "diamond";

export const NODE_CLASS_SHAPE: Record<NodeClass, NodeShape> = {
  asset: "hexagon",
  venue: "circle",
  protocol: "hexagon",
  oracle: "triangle",
  infrastructure: "diamond",
  address: "square",
};

/**
 * Registry kind to visual class.
 *
 * A bridge is drawn as a protocol rather than getting a class of its own: it is
 * a counterparty you send to and receive from, which is what the protocol shape
 * already says. The distinction survives where it matters — in the flow
 * classification, which still separates BRIDGE_IN from BRIDGE_OUT.
 */
export function classifyNode(node: GraphNode, contracts: ContractIndex): NodeClass {
  if (node.kind === "asset") return "asset";
  const kind = contracts.get(node.id.toLowerCase()) ?? null;
  switch (kind) {
    case "dex_pool":
      return "venue";
    case "lending_market":
    case "bridge":
      return "protocol";
    case "oracle":
      return "oracle";
    case "infrastructure":
      return "infrastructure";
    default:
      // Unidentified. Drawn as what it is: an address.
      return "address";
  }
}

/* ========================================================================== */
/*  LAYOUT                                                                    */
/* ========================================================================== */

/**
 * Ring radii in world units. The canvas maps the world box to pixels, so these
 * are ratios rather than sizes: assets inner, counterparties around them,
 * unidentified addresses on the rim, oracles and infrastructure outside it.
 */
const RING: Record<NodeClass, number> = {
  asset: 0.32,
  venue: 0.62,
  protocol: 0.62,
  address: 0.94,
  oracle: 1.1,
  infrastructure: 1.1,
};

/** Rings are laid out from the inside out so an outer node can read inner angles. */
const RING_ORDER: NodeClass[][] = [
  ["asset"],
  ["venue", "protocol"],
  ["address"],
  ["oracle", "infrastructure"],
];

export type PlacedNode = GraphNode & {
  nodeClass: NodeClass;
  /** World coordinates, origin at the centre of the map. */
  wx: number;
  wy: number;
  /** Angle in radians, kept so the renderer can place a label outward. */
  angle: number;
  /** True only for a node with a strictly greater degree than every other asset. */
  central: boolean;
};

export type Layout = {
  nodes: PlacedNode[];
  byId: Map<string, PlacedNode>;
  /** World-space bounding box of everything placed, for fit-to-screen. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};

/**
 * Place every node in the graph.
 *
 * @param graph     the measured graph — nothing is added to it here
 * @param contracts the registry; an empty one means every address stays `address`
 */
export function layoutRadial(graph: MarketGraph, contracts: ContractIndex): Layout {
  const classOf = new Map<string, NodeClass>();
  for (const n of graph.nodes) classOf.set(n.id, classifyNode(n, contracts));

  const assets = graph.nodes.filter((n) => classOf.get(n.id) === "asset");

  /**
   * The centre is a measurement or it is nothing.
   *
   * One asset connected to strictly more counterparties than any other is a
   * fact the graph already holds, and putting it in the middle reports that
   * fact. A tie is not a fact, so on a tie nothing takes the centre and every
   * asset sits on the inner ring — the map declines to nominate a hub the data
   * did not nominate.
   */
  const central = dominantAsset(assets);

  /** Angle of each asset, so outer nodes can aim at the ones they trade with. */
  const angleOf = new Map<string, number>();
  const ringAssets = central ? assets.filter((a) => a.id !== central.id) : assets;
  ringAssets.forEach((a, i) => {
    angleOf.set(a.id, startAngle(i, ringAssets.length));
  });

  const placed: PlacedNode[] = [];
  const place = (n: GraphNode, angle: number, radius: number) => {
    const cls = classOf.get(n.id) ?? "address";
    placed.push({
      ...n,
      nodeClass: cls,
      angle,
      wx: Math.cos(angle) * radius,
      wy: Math.sin(angle) * radius,
      central: central?.id === n.id,
    });
  };

  if (central) place(central, -Math.PI / 2, 0);
  for (const a of ringAssets) place(a, angleOf.get(a.id) ?? 0, RING.asset);

  /**
   * Every outer ring, inside out. A node's preferred angle is the direction of
   * the neighbours already placed, weighted by how much moved along each edge,
   * so a node ends up beside what it actually transacts with.
   */
  for (const classes of RING_ORDER.slice(1)) {
    const members = graph.nodes.filter((n) => classes.includes(classOf.get(n.id) ?? "address"));
    if (!members.length) continue;

    const placedSoFar = new Map(placed.map((p) => [p.id, p]));
    const preferred = members.map((n) => ({
      node: n,
      angle: preferredAngle(n, graph.edges, placedSoFar),
    }));

    /**
     * Sorted by preference, then spread evenly.
     *
     * The sort keeps neighbours near their counterparty; the even spread
     * guarantees nodes never collide however lopsided the graph is. Ties break
     * on id so the result cannot depend on the order rows arrived in.
     */
    preferred.sort((a, b) => a.angle - b.angle || (a.node.id < b.node.id ? -1 : 1));
    const radius = RING[classes[0]];
    const offset = preferred.length ? preferred[0].angle : -Math.PI / 2;
    preferred.forEach((p, i) => {
      place(p.node, offset + (i / preferred.length) * Math.PI * 2, radius);
    });
  }

  return { nodes: placed, byId: new Map(placed.map((p) => [p.id, p])), bounds: boundsOf(placed) };
}

/** The single most connected asset, or null when nothing leads outright. */
function dominantAsset(assets: GraphNode[]): GraphNode | null {
  if (assets.length < 2) return assets[0] ?? null;
  const ranked = [...assets].sort((a, b) => b.degree - a.degree || b.transfers - a.transfers);
  const [first, second] = ranked;
  if (first.degree > second.degree) return first;
  // Degree ties: fall back to observed transfers, still a measurement.
  if (first.degree === second.degree && first.transfers > second.transfers) return first;
  return null;
}

/** Evenly spaced, starting at the top so a single ring reads as a clock face. */
function startAngle(index: number, count: number): number {
  if (count <= 1) return -Math.PI / 2;
  return -Math.PI / 2 + (index / count) * Math.PI * 2;
}

/**
 * Circular mean of the angles of already-placed neighbours, weighted by
 * transfers. Averaging angles arithmetically would send a node between 350° and
 * 10° to 180° — the exact opposite of both — so the mean is taken over unit
 * vectors instead.
 */
function preferredAngle(
  node: GraphNode,
  edges: GraphEdge[],
  placed: Map<string, PlacedNode>,
): number {
  let x = 0;
  let y = 0;
  for (const e of edges) {
    const otherId = e.source === node.id ? e.target : e.target === node.id ? e.source : null;
    if (!otherId) continue;
    const other = placed.get(otherId);
    if (!other) continue;
    // A neighbour at the exact centre points nowhere; it cannot contribute one.
    if (other.wx === 0 && other.wy === 0) continue;
    const w = Math.max(1, e.transfers);
    x += Math.cos(other.angle) * w;
    y += Math.sin(other.angle) * w;
  }
  if (x === 0 && y === 0) return -Math.PI / 2;
  return Math.atan2(y, x);
}

function boundsOf(nodes: PlacedNode[]): Layout["bounds"] {
  if (!nodes.length) return { minX: -1, minY: -1, maxX: 1, maxY: 1 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    if (n.wx < minX) minX = n.wx;
    if (n.wx > maxX) maxX = n.wx;
    if (n.wy < minY) minY = n.wy;
    if (n.wy > maxY) maxY = n.wy;
  }
  return { minX, minY, maxX, maxY };
}
