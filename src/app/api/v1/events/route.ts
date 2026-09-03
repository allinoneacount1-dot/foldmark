import { NextResponse } from "next/server";
import { getRecentTransfers, getAssets } from "@/lib/queries";
import { fromBaseUnits } from "@/lib/format";
import { CHAIN } from "@/config/site";

export const dynamic = "force-dynamic";

/** The event ledger: most recent observed transfers, newest block first. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") ?? 50) || 50));

  const [recent, assets] = await Promise.all([getRecentTransfers(limit), getAssets()]);
  const byId = new Map(assets.rows.map((a) => [a.id, a]));

  return NextResponse.json({
    events: recent.rows.map((r) => {
      const asset = byId.get(r.asset_id ?? "");
      return {
        type: "TRANSFER",
        tx_hash: r.tx_hash,
        log_index: r.log_index,
        block_number: r.block_number,
        timestamp: r.timestamp,
        from: r.from_address,
        to: r.to_address,
        asset: asset ? { symbol: asset.symbol, contract: asset.contract_address, decimals: asset.decimals } : null,
        amount_raw: r.amount,
        amount: asset ? Number(fromBaseUnits(r.amount, asset.decimals).toFixed(6)) : null,
      };
    }),
    count: recent.rows.length,
    state: recent.state,
    chain_id: CHAIN.id,
    updated_at: new Date().toISOString(),
    methodology:
      "ERC-20 Transfer logs as indexed, ordered by block number descending. Timestamps are block header times. Only TRANSFER is emitted today; richer event types require contract classification.",
  });
}
