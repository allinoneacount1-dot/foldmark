import { NextResponse } from "next/server";
import { getPulse } from "@/lib/chain";

export async function GET() {
  const pulse = await getPulse();
  if (pulse.error) {
    return NextResponse.json(
      { error: "DATA UNAVAILABLE", reason: "indexer_unavailable", updated_at: pulse.updatedAt, sources: [pulse.source], methodology: "Block via eth_blockNumber on Robinhood Chain RPC 4663." },
      { status: 503 }
    );
  }
  return NextResponse.json({
    block: pulse.block,
    chain_id: 4663,
    network: "Robinhood Chain",
    updated_at: pulse.updatedAt,
    sources: [pulse.source],
    methodology: "Block via eth_blockNumber on Robinhood Chain RPC 4663.",
  });
}
