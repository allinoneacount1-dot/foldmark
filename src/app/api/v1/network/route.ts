import { NextResponse } from "next/server";
import { getIndexerStatus, getWindowActivity, countRows } from "@/lib/queries";
import { CHAIN } from "@/config/site";

export const dynamic = "force-dynamic";

/** Network pulse: where the chain is, where the index is, and the gap between them. */
export async function GET() {
  const now = Date.now();
  const [indexer, activity, assets, transfers, wallets] = await Promise.all([
    getIndexerStatus(),
    getWindowActivity("24H", now),
    countRows("assets"),
    countRows("transfers"),
    countRows("wallets"),
  ]);

  const degraded = indexer.chainHead.value === null;

  return NextResponse.json(
    {
      chain: { id: CHAIN.id, name: CHAIN.name, explorer: CHAIN.explorer },
      chain_head: indexer.chainHead.value ?? { state: indexer.chainHead.state, reason: indexer.chainHead.note },
      last_processed_block: indexer.lastProcessedBlock.value ?? { state: indexer.lastProcessedBlock.state },
      lag_blocks: indexer.lagBlocks.value ?? { state: indexer.lagBlocks.state },
      indexer_updated_at: indexer.updatedAt,
      totals: {
        assets: assets.value ?? { state: assets.state },
        transfers: transfers.value ?? { state: transfers.state },
        wallets: wallets.value ?? { state: wallets.state },
      },
      window_24h: {
        state: activity.state,
        transfers: activity.transfers,
        active_addresses: activity.activeAddresses,
        active_assets: activity.activeAssets,
        directed_pairs: activity.uniquePairs,
        partial: activity.capped,
      },
      sources: ["Robinhood Chain RPC — eth_blockNumber", "FOLDMARK indexer"],
      updated_at: new Date().toISOString(),
      methodology:
        "Chain head is read live from the RPC. The indexer cursor is the last block committed to storage. Lag is the difference; a large lag means the figures below it describe an older state of the chain.",
    },
    { status: degraded ? 503 : 200 },
  );
}
