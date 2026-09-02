import { NextResponse } from "next/server";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { STOCK_TOKENS } from "@/lib/assets";

export async function GET() {
  // try DB first (auto-discovered), fallback to hardcoded
  if (isSupabaseConfigured() && supabase) {
    const { data } = await supabase.from("assets").select("symbol, name, contract_address, asset_type, verified, source").order("symbol");
    if (data && data.length) {
      return NextResponse.json({
        assets: data.map((t: any) => ({
          symbol: t.symbol,
          name: t.name,
          contract: t.contract_address,
          type: t.asset_type,
          verified: t.verified,
          source: t.source || (t.verified ? "Robinhood Chain — auto-discovered on-chain" : "—"),
        })),
        count: data.length,
        updated_at: new Date().toISOString(),
        methodology: "Verified via on-chain name (• Robinhood Token) + canonical registry. Auto-discovered via eth_call.",
      });
    }
  }
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
