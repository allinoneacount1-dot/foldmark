import { NextResponse } from "next/server";
import { getAssets, getIndexerStatus, getTransfersSince, since } from "@/lib/queries";
import { fromBaseUnits, isAddress } from "@/lib/format";
import { WINDOWS, CHAIN, type FlowWindow } from "@/config/site";

export const dynamic = "force-dynamic";

/** Wallet context: exposure, counterparties and directional flow for one address. */
export async function GET(req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address: raw } = await params;
  if (!isAddress(raw)) {
    return NextResponse.json({ error: "INVALID_ADDRESS", address: raw }, { status: 400 });
  }
  const address = raw.toLowerCase();

  const { searchParams } = new URL(req.url);
  const requested = searchParams.get("window") as FlowWindow | null;
  const window: FlowWindow = requested && WINDOWS.includes(requested) ? requested : "7D";

  const now = Date.now();
  const [indexer, assets, transfers] = await Promise.all([
    getIndexerStatus(),
    getAssets(),
    getTransfersSince(since(window, now), { address, limit: 2000 }),
  ]);

  const byId = new Map(assets.rows.map((a) => [a.id, a]));
  let inbound = 0;
  let outbound = 0;
  const exposure = new Map<string, { inbound: number; outbound: number; transfers: number }>();
  const peers = new Map<string, { inbound: number; outbound: number; transfers: number }>();

  for (const r of transfers.rows) {
    const asset = byId.get(r.asset_id ?? "");
    const amount = fromBaseUnits(r.amount, asset?.decimals ?? 18);
    const isIn = r.to_address === address;
    const peer = isIn ? r.from_address : r.to_address;
    if (isIn) inbound += amount;
    else outbound += amount;

    if (r.asset_id) {
      const e = exposure.get(r.asset_id) ?? { inbound: 0, outbound: 0, transfers: 0 };
      if (isIn) e.inbound += amount;
      else e.outbound += amount;
      e.transfers += 1;
      exposure.set(r.asset_id, e);
    }
    const p = peers.get(peer) ?? { inbound: 0, outbound: 0, transfers: 0 };
    if (isIn) p.inbound += amount;
    else p.outbound += amount;
    p.transfers += 1;
    peers.set(peer, p);
  }

  const round = (n: number) => Number(n.toFixed(6));

  return NextResponse.json({
    address,
    chain_id: CHAIN.id,
    observation_window: window,
    state: transfers.state,
    partial: transfers.capped,
    capital_movement: {
      received: round(inbound),
      sent: round(outbound),
      net: round(inbound - outbound),
      transfers: transfers.rows.length,
      unit: "token units, not aggregated across assets",
    },
    portfolio_value: { state: "DATA UNAVAILABLE", reason: `No price oracle is wired to chain ${CHAIN.id}` },
    asset_exposure: [...exposure.entries()]
      .map(([id, e]) => {
        const asset = byId.get(id);
        return {
          symbol: asset?.symbol ?? null,
          contract: asset?.contract_address ?? null,
          type: asset?.asset_type ?? null,
          received: round(e.inbound),
          sent: round(e.outbound),
          net: round(e.inbound - e.outbound),
          transfers: e.transfers,
        };
      })
      .sort((a, b) => b.transfers - a.transfers),
    counterparties: [...peers.entries()]
      .map(([addr, p]) => ({
        address: addr,
        received_from: round(p.inbound),
        sent_to: round(p.outbound),
        transfers: p.transfers,
      }))
      .sort((a, b) => b.transfers - a.transfers)
      .slice(0, 25),
    protocol_exposure: { state: "DATA UNAVAILABLE", reason: "No protocol is verified on this chain yet" },
    indexer: {
      last_processed_block: indexer.lastProcessedBlock.value,
      chain_head: indexer.chainHead.value,
      lag_blocks: indexer.lagBlocks.value,
    },
    sources: ["Robinhood Chain RPC — eth_getLogs, Transfer topic", "FOLDMARK indexer"],
    updated_at: new Date().toISOString(),
    methodology:
      "Folded from transfers where this address is the sender or the recipient inside the window. Amounts stay in each asset's own units and are never summed across assets. Net is movement inside the window, not a balance.",
  });
}
