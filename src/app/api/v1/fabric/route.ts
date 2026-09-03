import { NextResponse } from "next/server";
import { getAssets, getWindowActivity, coverageBlock } from "@/lib/queries";
import { buildMarketGraph } from "@/lib/graph";
import { WINDOWS, ASSET_TYPES, CHAIN, type AssetType, type FlowWindow } from "@/config/site";

export const dynamic = "force-dynamic";

/** The market topology as data: the same graph the canvas draws. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const requestedWindow = searchParams.get("window") as FlowWindow | null;
  const window: FlowWindow = requestedWindow && WINDOWS.includes(requestedWindow) ? requestedWindow : "24H";
  const requestedType = searchParams.get("type") as AssetType | null;
  const type = requestedType && ASSET_TYPES.includes(requestedType) ? requestedType : null;
  const limit = Math.min(40, Math.max(3, Number(searchParams.get("limit") ?? 12) || 12));

  const now = Date.now();
  const [assetsResult, activity] = await Promise.all([getAssets(), getWindowActivity(window, now)]);

  const assets = type ? assetsResult.rows.filter((a) => a.asset_type === type) : assetsResult.rows;
  const allowed = new Set(assets.map((a) => a.id));
  const rows = type ? activity.rows.filter((r) => r.asset_id && allowed.has(r.asset_id)) : activity.rows;

  const graph = buildMarketGraph(rows, assets, { limitAddresses: limit, limitAssets: limit });

  return NextResponse.json({
    window,
    type,
    state: activity.state,
    index_coverage: coverageBlock(window, activity.coverage, now),
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      kind: n.kind,
      label: n.label,
      role: n.role,
      value_observed: Number(n.weight.toFixed(6)),
      transfers: n.transfers,
      degree: n.degree,
      position: { x: n.x, y: n.y },
      scale: Number(n.scale.toFixed(4)),
      contract: n.contract ?? null,
      fresh: n.fresh,
    })),
    edges: graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      value_moved: Number(e.weight.toFixed(6)),
      transfers: e.transfers,
      asset: e.assetSymbol,
      intensity: Number(e.intensity.toFixed(4)),
      fresh: e.fresh,
    })),
    totals: graph.totals,
    shown: graph.shown,
    truncated: graph.truncated,
    chain_id: CHAIN.id,
    updated_at: new Date().toISOString(),
    methodology:
      "Nodes and edges are folded from indexed Transfer logs in the window. Position encodes role — net senders at x=0.08, assets at x=0.5, net receivers at x=0.92 — and is deterministic, never randomised. Node scale is the square root of observed value moved; edge intensity is the square root of value relative to the heaviest edge. Nodes with no drawn edge are omitted.",
  });
}
