import { NextResponse } from "next/server";

export async function GET() {
  const t0 = Date.now();
  const times: any = {};
  try {
    let t = Date.now();
    const r1 = await fetch("https://rpc.mainnet.chain.robinhood.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
    });
    const j1 = await r1.json();
    times.blockNumber = Date.now() - t + "ms " + j1.result?.slice(0,10);

    t = Date.now();
    const r2 = await fetch("https://rhgnvcalkawwfbrhxhxn.supabase.co/rest/v1/assets?select=symbol&limit=1", {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "", Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` },
    });
    times.supabase = Date.now() - t + "ms status " + r2.status;

    times.total = Date.now() - t0 + "ms";
    return NextResponse.json(times);
  } catch (e: any) {
    return NextResponse.json({ error: e.message, times });
  }
}
