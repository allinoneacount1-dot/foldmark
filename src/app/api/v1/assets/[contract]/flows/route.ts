import { NextResponse } from "next/server";
import { getAssetByAddress, getTransfersSince, foldEdges, foldByAddress, since } from "@/lib/queries";
import { WINDOWS, CHAIN, type FlowWindow } from "@/config/site";

export const dynamic = "force-dynamic";

/** Directed value edges touching one asset. */
export async function GET(req: Request, { params }: { params: Promise<{ contract: string }> }) {
  const { contract } = await params;
  const { searchParams } = new URL(req.url);
  const requested = searchParams.get("window") as FlowWindow | null;
  const window: FlowWindow = requested && WINDOWS.includes(requested) ? requested : "24H";
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 20) || 20));

  const asset = await getAssetByAddress(contract);
  if (!asset) {
    return NextResponse.json({ error: "ASSET_NOT_INDEXED", contract, chain_id: CHAIN.id }, { status: 404 });
  }

  const now = Date.now();
  const transfers = await getTransfersSince(since(window, now), { assetId: asset.id, limit: 2000 });
  const edges = foldEdges(transfers.rows, [asset], limit);
  const addresses = foldByAddress(transfers.rows, [asset], limit);

  return NextResponse.json({
    asset: { symbol: asset.symbol, contract: asset.contract_address, decimals: asset.decimals },
    window,
    state: transfers.state,
    partial: transfers.capped,
    edges: edges.map((e) => ({
      from: e.from,
      to: e.to,
      value_moved: Number(e.amount.toFixed(6)),
      transfers: e.transfers,
      last_block: e.lastBlock,
      classification: "UNCLASSIFIED",
    })),
    addresses: addresses.map((a) => ({
      address: a.address,
      received: Number(a.inbound.toFixed(6)),
      sent: Number(a.outbound.toFixed(6)),
      net: Number((a.inbound - a.outbound).toFixed(6)),
      transfers: a.transfers,
      counterparties: a.counterparties,
    })),
    chain_id: CHAIN.id,
    updated_at: new Date().toISOString(),
    methodology:
      "Edges are directed address pairs that exchanged this asset inside the window, summed in token units. No asset-level net flow is published; net is reported per address only.",
  });
}
