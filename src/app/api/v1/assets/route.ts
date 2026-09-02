import { NextResponse } from "next/server";
import { STOCK_TOKENS } from "@/lib/assets";

export async function GET() {
  return NextResponse.json({
    assets: STOCK_TOKENS.map((t) => ({
      symbol: t.symbol,
      name: t.name,
      contract: t.contract,
      type: t.type,
      verified: t.verified,
      source: t.verified ? "Robinhood Stock Token Registry" : "—",
    })),
    count: STOCK_TOKENS.length,
    updated_at: new Date().toISOString(),
    methodology: "Verified via canonical registry, not symbol. Price via Chainlink where available.",
  });
}
