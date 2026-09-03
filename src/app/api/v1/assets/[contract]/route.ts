import { NextResponse } from "next/server";
import {
  getAssetByAddress,
  getTransfersSince,
  getLatestPrices,
  foldByAsset,
  foldByAddress,
  flowForAsset,
  since,
} from "@/lib/queries";
import { WINDOWS, CHAIN, type FlowWindow } from "@/config/site";

export const dynamic = "force-dynamic";

/** Asset passport as data. */
export async function GET(req: Request, { params }: { params: Promise<{ contract: string }> }) {
  const { contract } = await params;
  const { searchParams } = new URL(req.url);
  const requested = searchParams.get("window") as FlowWindow | null;
  const window: FlowWindow = requested && WINDOWS.includes(requested) ? requested : "24H";

  const asset = await getAssetByAddress(contract);
  if (!asset) {
    return NextResponse.json(
      {
        error: "ASSET_NOT_INDEXED",
        contract,
        chain_id: CHAIN.id,
        methodology: "A contract appears once the indexer observes an ERC-20 Transfer it emitted.",
      },
      { status: 404 },
    );
  }

  const now = Date.now();
  const transfers = await getTransfersSince(since(window, now), { assetId: asset.id, limit: 2000 });
  const folded = foldByAsset(transfers.rows, [asset], window, now).get(asset.id);
  const prices = await getLatestPrices([asset.id]);
  const price = prices.get(asset.id);
  const peers = foldByAddress(transfers.rows, [asset], 10);

  return NextResponse.json({
    asset: {
      symbol: asset.symbol,
      name: asset.name,
      contract: asset.contract_address,
      type: asset.asset_type,
      decimals: asset.decimals,
      verified: asset.verified,
      source: asset.source,
      chain_id: CHAIN.id,
      explorer: `${CHAIN.explorer}/address/${asset.contract_address}`,
    },
    observation_window: window,
    state: transfers.state,
    partial: transfers.capped,
    activity: folded
      ? {
          transfers: folded.transfers,
          gross_volume: Number(folded.volume.toFixed(6)),
          counterparties: folded.counterparties,
          last_block: folded.lastBlock,
          last_seen: folded.lastSeen,
          buckets: folded.buckets,
        }
      : { transfers: 0, state: "NO ACTIVITY" },
    price: price
      ? { value: price.price, source: price.source, observed_at: price.observedAt }
      : { state: "DATA UNAVAILABLE", reason: `No price oracle is wired to chain ${CHAIN.id}` },
    liquidity: { state: "DATA UNAVAILABLE", reason: "No DEX pool identified on this chain" },
    holders: { state: "DATA UNAVAILABLE", reason: "Holder counts require balance reconstruction over the full history" },
    // Amounts are in this asset's units, which is the only scope where a token
    // amount means anything.
    top_counterparties: peers.map((p) => {
      const flow = flowForAsset(p, asset.id);
      return {
        address: p.address,
        received: flow ? Number(flow.inbound.toFixed(6)) : 0,
        sent: flow ? Number(flow.outbound.toFixed(6)) : 0,
        unit: asset.symbol,
        transfers: p.transfers,
      };
    }),
    updated_at: new Date().toISOString(),
    methodology:
      "Gross volume sums transfer amounts in token units inside the window. Counterparties counts distinct addresses appearing as sender or recipient; it is not a holder count. No asset-level net flow is published: a transfer moves balance between holders without changing supply.",
  });
}
