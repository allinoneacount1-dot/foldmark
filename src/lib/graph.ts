/**
 * FOLDMARK market topology model.
 *
 * The graph is built only from observed transfers. Every node exists because
 * the indexer saw it, and every edge exists because value actually moved along
 * it. There is no synthetic hub, no decorative node and no random placement.
 *
 * Composition is semantic rather than physical: capital reads left to right as
 *
 *     SOURCE (net sender)  →  ASSET  →  DESTINATION (net receiver)
 *
 * so position itself carries meaning. Layout is a pure function of the ranked
 * data, which makes it deterministic across server and client renders.
 */

import type { AssetRow, TransferRow } from "@/lib/queries";
import { fromBaseUnits } from "@/lib/format";
import type { AssetType } from "@/config/site";

export type NodeKind = "asset" | "source" | "destination" | "counterparty";

export type GraphNode = {
  id: string;
  kind: NodeKind;
  /** Symbol for assets, address for addresses. */
  label: string;
  /** Sub-label: asset type, or the role the address plays. */
  role: string;
  /** Observed value moved through this node, in token units. */
  weight: number;
  transfers: number;
  degree: number;
  /** 0..1 layout coordinates; the view maps them to pixels. */
  x: number;
  y: number;
  /** Radius rank 0..1, from observed activity. */
  scale: number;
  assetType?: AssetType;
  contract?: string;
  /** True when this node moved value in the most recent block of the window. */
  fresh: boolean;
  href: string;
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  /** Value moved along this edge, in units of the asset it belongs to. */
  weight: number;
  transfers: number;
  assetId: string | null;
  assetSymbol: string | null;
  /** 0..1, relative to the heaviest edge — drives stroke weight and opacity. */
  intensity: number;
  fresh: boolean;
};

export type MarketGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Everything the indexer holds for the window, before the display cap. */
  totals: { addresses: number; assets: number; transfers: number; edges: number };
  /** How much of the above is actually drawn. */
  shown: { nodes: number; edges: number };
  truncated: boolean;
};

const MAX_ADDRESSES_PER_SIDE = 9;
const MAX_ASSETS = 9;
const MAX_EDGES = 60;

type AddressAcc = { inflow: number; outflow: number; transfers: number; assets: Set<string>; lastBlock: number };

/**
 * @param limitAddresses per-side cap; raised by the UI when the user expands.
 */
export function buildMarketGraph(
  transfers: TransferRow[],
  assets: AssetRow[],
  opts: { limitAddresses?: number; limitAssets?: number; assetFilter?: string | null } = {},
): MarketGraph {
  const perSide = opts.limitAddresses ?? MAX_ADDRESSES_PER_SIDE;
  const assetCap = opts.limitAssets ?? MAX_ASSETS;

  const assetById = new Map(assets.map((a) => [a.id, a]));
  const rows = opts.assetFilter ? transfers.filter((t) => t.asset_id === opts.assetFilter) : transfers;

  const headBlock = rows.reduce((m, r) => (r.block_number > m ? r.block_number : m), 0);

  // ---- fold addresses and assets -----------------------------------------
  const addresses = new Map<string, AddressAcc>();
  const assetAcc = new Map<string, { volume: number; transfers: number; peers: Set<string>; lastBlock: number }>();

  const touchAddress = (addr: string): AddressAcc => {
    let e = addresses.get(addr);
    if (!e) {
      e = { inflow: 0, outflow: 0, transfers: 0, assets: new Set(), lastBlock: 0 };
      addresses.set(addr, e);
    }
    return e;
  };

  for (const t of rows) {
    const decimals = assetById.get(t.asset_id ?? "")?.decimals ?? 18;
    const amount = fromBaseUnits(t.amount, decimals);

    const from = touchAddress(t.from_address);
    const to = touchAddress(t.to_address);
    from.outflow += amount;
    from.transfers += 1;
    from.lastBlock = Math.max(from.lastBlock, t.block_number);
    to.inflow += amount;
    to.transfers += 1;
    to.lastBlock = Math.max(to.lastBlock, t.block_number);
    if (t.asset_id) {
      from.assets.add(t.asset_id);
      to.assets.add(t.asset_id);
      let a = assetAcc.get(t.asset_id);
      if (!a) {
        a = { volume: 0, transfers: 0, peers: new Set(), lastBlock: 0 };
        assetAcc.set(t.asset_id, a);
      }
      a.volume += amount;
      a.transfers += 1;
      a.peers.add(t.from_address);
      a.peers.add(t.to_address);
      a.lastBlock = Math.max(a.lastBlock, t.block_number);
    }
  }

  // ---- rank -------------------------------------------------------------
  const rankedAssets = [...assetAcc.entries()]
    .filter(([id]) => assetById.has(id))
    .sort((a, b) => b[1].transfers - a[1].transfers || b[1].volume - a[1].volume)
    .slice(0, assetCap);

  const senders = [...addresses.entries()]
    .filter(([, e]) => e.outflow > e.inflow)
    .sort((a, b) => b[1].outflow - a[1].outflow)
    .slice(0, perSide);

  const receivers = [...addresses.entries()]
    .filter(([, e]) => e.inflow >= e.outflow)
    .sort((a, b) => b[1].inflow - a[1].inflow)
    .slice(0, perSide);

  const shownAssets = new Set(rankedAssets.map(([id]) => id));
  const shownAddresses = new Map<string, NodeKind>();
  for (const [addr] of senders) shownAddresses.set(addr, "source");
  for (const [addr] of receivers) if (!shownAddresses.has(addr)) shownAddresses.set(addr, "destination");

  // ---- layout ------------------------------------------------------------
  const nodes: GraphNode[] = [];
  const maxAssetVolume = Math.max(...rankedAssets.map(([, a]) => a.volume), 1);
  const maxAddressValue = Math.max(...[...senders, ...receivers].map(([, e]) => e.inflow + e.outflow), 1);

  const spread = (index: number, count: number) => (count <= 1 ? 0.5 : 0.08 + (index / (count - 1)) * 0.84);

  rankedAssets.forEach(([id, acc], i) => {
    const asset = assetById.get(id)!;
    nodes.push({
      id,
      kind: "asset",
      label: asset.symbol,
      role: asset.asset_type,
      weight: acc.volume,
      transfers: acc.transfers,
      degree: acc.peers.size,
      x: 0.5,
      y: spread(i, rankedAssets.length),
      scale: clamp(Math.sqrt(acc.volume / maxAssetVolume)),
      assetType: asset.asset_type,
      contract: asset.contract_address,
      fresh: headBlock > 0 && acc.lastBlock === headBlock,
      href: `/assets/${asset.contract_address}`,
    });
  });

  senders.forEach(([addr, acc], i) => {
    nodes.push(addressNode(addr, acc, "source", 0.08, spread(i, senders.length), maxAddressValue, headBlock));
  });
  receivers.forEach(([addr, acc], i) => {
    nodes.push(addressNode(addr, acc, "destination", 0.92, spread(i, receivers.length), maxAddressValue, headBlock));
  });

  // ---- edges: address -> asset, weighted by value moved -------------------
  const edgeAcc = new Map<string, { weight: number; transfers: number; assetId: string; lastBlock: number }>();
  for (const t of rows) {
    if (!t.asset_id || !shownAssets.has(t.asset_id)) continue;
    const decimals = assetById.get(t.asset_id)?.decimals ?? 18;
    const amount = fromBaseUnits(t.amount, decimals);

    for (const [addr, direction] of [
      [t.from_address, "out"],
      [t.to_address, "in"],
    ] as const) {
      const kind = shownAddresses.get(addr);
      if (!kind) continue;
      // a source connects into the asset, a destination out of it
      const key = direction === "out" ? `${addr}->${t.asset_id}` : `${t.asset_id}->${addr}`;
      const prev = edgeAcc.get(key);
      if (prev) {
        prev.weight += amount;
        prev.transfers += 1;
        prev.lastBlock = Math.max(prev.lastBlock, t.block_number);
      } else {
        edgeAcc.set(key, { weight: amount, transfers: 1, assetId: t.asset_id, lastBlock: t.block_number });
      }
    }
  }

  const rankedEdges = [...edgeAcc.entries()].sort((a, b) => b[1].weight - a[1].weight).slice(0, MAX_EDGES);
  const maxEdge = Math.max(...rankedEdges.map(([, e]) => e.weight), 1);

  const edges: GraphEdge[] = rankedEdges.map(([key, e]) => {
    const [source, target] = key.split("->");
    return {
      id: key,
      source,
      target,
      weight: e.weight,
      transfers: e.transfers,
      assetId: e.assetId,
      assetSymbol: assetById.get(e.assetId)?.symbol ?? null,
      intensity: clamp(Math.sqrt(e.weight / maxEdge)),
      fresh: headBlock > 0 && e.lastBlock === headBlock,
    };
  });

  // drop nodes that ended up with no drawn edge — an isolated dot says nothing
  const connected = new Set(edges.flatMap((e) => [e.source, e.target]));
  const drawn = nodes.filter((n) => connected.has(n.id));

  return {
    nodes: drawn,
    edges,
    totals: {
      addresses: addresses.size,
      assets: assetAcc.size,
      transfers: rows.length,
      edges: edgeAcc.size,
    },
    shown: { nodes: drawn.length, edges: edges.length },
    truncated: addresses.size > drawn.filter((n) => n.kind !== "asset").length || edgeAcc.size > edges.length,
  };
}

function addressNode(
  address: string,
  acc: AddressAcc,
  kind: NodeKind,
  x: number,
  y: number,
  maxValue: number,
  headBlock: number,
): GraphNode {
  const value = acc.inflow + acc.outflow;
  return {
    id: address,
    kind,
    label: address,
    role: kind === "source" ? "NET SENDER" : "NET RECEIVER",
    weight: value,
    transfers: acc.transfers,
    degree: acc.assets.size,
    x,
    y,
    scale: clamp(Math.sqrt(value / maxValue)),
    fresh: headBlock > 0 && acc.lastBlock === headBlock,
    href: `/wallet/${address}`,
  };
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * The single-asset view used on an asset passport: the asset at the centre with
 * its real counterparties around it.
 */
export function buildAssetGraph(
  transfers: TransferRow[],
  asset: AssetRow,
  opts: { limit?: number } = {},
): MarketGraph {
  return buildMarketGraph(transfers, [asset], {
    assetFilter: asset.id,
    limitAssets: 1,
    limitAddresses: opts.limit ?? 7,
  });
}
