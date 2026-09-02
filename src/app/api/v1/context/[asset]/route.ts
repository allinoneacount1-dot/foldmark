import { NextResponse } from "next/server";
import { STOCK_TOKENS } from "@/lib/assets";

export async function GET(_: Request, { params }: { params: Promise<{ asset: string }> }) {
  const { asset } = await params;
  const token = STOCK_TOKENS.find((t) => t.symbol.toLowerCase() === asset.toLowerCase() || t.contract.toLowerCase() === asset.toLowerCase());
  if (!token) return NextResponse.json({ error: "ASSET NOT INDEXED", asset }, { status: 404 });
  return NextResponse.json({
    identity: token,
    price: { status: "DATA UNAVAILABLE", source: "Chainlink" },
    activity: { status: "INDEXING" },
    flow: { status: "DATA UNAVAILABLE", window: "24h" },
    liquidity: { status: "DATA UNAVAILABLE" },
    markets: [],
    protocols: [],
    relationships: [],
    data_freshness: new Date().toISOString(),
    sources: ["Robinhood Registry", "Chainlink", "RPC"],
  });
}
