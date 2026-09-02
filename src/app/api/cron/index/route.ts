import { NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { robinhoodChain } from "@/lib/wagmi";
import { isSupabaseConfigured } from "@/lib/supabase";
import { runIndexer, getCursor } from "@/lib/indexer";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "SUPABASE_NOT_CONFIGURED", hint: "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel env, then run supabase.sql" }, { status: 503 });
  }

  try {
    const client = createPublicClient({ chain: robinhoodChain, transport: http(process.env.NEXT_PUBLIC_ROBINHOOD_RPC || "https://rpc.mainnet.chain.robinhood.com") });
    const latest = await client.getBlockNumber();
    const cursor = await getCursor();
    const from = BigInt((cursor as any).last_processed_block || 0);
    const twenty = BigInt(20);
    const one = BigInt(1);
    const nineteen = BigInt(19);
    const zero = BigInt(0);
    const start = from === zero ? (latest > twenty ? latest - twenty : zero) : from + one;
    const end = latest > start + nineteen ? start + nineteen : latest;
    if (start > end) return NextResponse.json({ status: "UP_TO_DATE", latest: Number(latest), cursor });

    const result = await runIndexer({ fromBlock: start, toBlock: end });
    return NextResponse.json({ status: "INDEXED", ...result, latest: Number(latest) });
  } catch (e: any) {
    return NextResponse.json({ error: "INDEXER_FAILED", detail: e.message?.slice(0, 200) }, { status: 500 });
  }
}
