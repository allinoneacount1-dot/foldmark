import { NextResponse } from "next/server";
import { getAssets, getWindowActivity, getFlowWindows, foldEdges, foldByAddress } from "@/lib/queries";
import { WINDOWS, CHAIN, type FlowWindow } from "@/config/site";

export const dynamic = "force-dynamic";

/** Directed value edges, plus precomputed per-address net flow. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const requested = searchParams.get("window") as FlowWindow | null;
  const window: FlowWindow = requested && WINDOWS.includes(requested) ? requested : "24H";
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 20) || 20));

  const now = Date.now();
  const [assets, activity, precomputed] = await Promise.all([
    getAssets(),
    getWindowActivity(window, now),
    getFlowWindows(window),
  ]);

  const symbols = new Map(assets.rows.map((a) => [a.id, a.symbol]));
  const edges = foldEdges(activity.rows, assets.rows, limit);
  const addresses = foldByAddress(activity.rows, assets.rows, limit);

  return NextResponse.json({
    window,
    state: activity.state,
    partial: activity.capped,
    edges: edges.map((e) => ({
      from: e.from,
      to: e.to,
      asset: e.assetId ? { id: e.assetId, symbol: symbols.get(e.assetId) ?? null } : null,
      value_moved: Number(e.amount.toFixed(6)),
      transfers: e.transfers,
      last_block: e.lastBlock,
      classification: "UNCLASSIFIED",
    })),
    top_addresses: addresses.map((a) => ({
      address: a.address,
      received: Number(a.inbound.toFixed(6)),
      sent: Number(a.outbound.toFixed(6)),
      net: Number((a.inbound - a.outbound).toFixed(6)),
      transfers: a.transfers,
      counterparties: a.counterparties,
    })),
    precomputed_net_flow: {
      state: precomputed.state,
      rows: precomputed.rows.map((r) => ({
        address: r.entity_id,
        inflow: r.inflow,
        outflow: r.outflow,
        net_flow: r.net_flow,
        transfers: r.transaction_count,
        counterparties: r.unique_counterparties,
        calculated_at: r.calculated_at,
      })),
    },
    chain_id: CHAIN.id,
    updated_at: new Date().toISOString(),
    methodology:
      "An edge is a directed address pair that exchanged one asset inside the window; value is summed in token units at the asset's own decimals. Net flow is defined per address — received minus sent — and is not defined per token contract. Classification stays UNCLASSIFIED until the counterparty contract is identified.",
  });
}
