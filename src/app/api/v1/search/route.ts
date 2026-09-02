import { NextResponse } from "next/server";
import { STOCK_TOKENS } from "@/lib/assets";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").toLowerCase().trim();
  if (!q) return NextResponse.json({ query: q, results: { assets: [], wallets: [], protocols: [], contracts: [] } });
  const assets = STOCK_TOKENS.filter((t) => t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || t.contract.toLowerCase().includes(q)).slice(0, 5);
  return NextResponse.json({
    query: q,
    results: {
      assets: assets.map((a) => ({ symbol: a.symbol, contract: a.contract, verified: a.verified })),
      wallets: [],
      protocols: [],
      contracts: [],
    },
    updated_at: new Date().toISOString(),
  });
}
