import { NextResponse } from "next/server";
import { STOCK_TOKENS, isVerifiedStockToken } from "@/lib/assets";

export async function GET(_: Request, { params }: { params: Promise<{ contract: string }> }) {
  const { contract } = await params;
  const token = STOCK_TOKENS.find((t) => t.contract.toLowerCase() === contract.toLowerCase());
  if (!token) {
    return NextResponse.json({ error: "ASSET NOT INDEXED", contract, verified: isVerifiedStockToken(contract), updated_at: new Date().toISOString() }, { status: 404 });
  }
  return NextResponse.json({
    asset: token,
    verified: token.verified,
    observation_window: "24h",
    activity: { status: "INDEXING", note: "DATA UNAVAILABLE until indexer processes logs" },
    sources: ["Robinhood Registry", "Chainlink", "RPC"],
    updated_at: new Date().toISOString(),
  });
}
