import { NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { robinhoodChain } from "@/lib/wagmi";
import { isSupabaseConfigured } from "@/lib/supabase";
import { runIndexer, getCursor } from "@/lib/indexer";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Advance the indexer by one batch.
 *
 * This is the only entry point to ingestion — the scheduled invocation and the
 * local driver both call it, so there is exactly one implementation.
 *
 * The batch is deliberately small: each block may carry many logs, and each
 * distinct block costs a header lookup to resolve its timestamp. Overrun the
 * execution budget and the run commits nothing, so a modest batch that always
 * finishes beats a large one that sometimes does not.
 */
const DEFAULT_BATCH = 2n;
const MAX_BATCH = 25n;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      {
        error: "SUPABASE_NOT_CONFIGURED",
        hint: "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, then apply supabase.sql.",
      },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(req.url);
  const requested = BigInt(Math.max(1, Math.min(Number(searchParams.get("blocks") ?? 0) || 0, Number(MAX_BATCH))));
  const batch = requested > 0n ? requested : DEFAULT_BATCH;

  try {
    const client = createPublicClient({
      chain: robinhoodChain,
      transport: http(process.env.NEXT_PUBLIC_ROBINHOOD_RPC || "https://rpc.mainnet.chain.robinhood.com"),
    });

    const latest = await client.getBlockNumber();
    const cursor = await getCursor();
    const last = BigInt(cursor.last_processed_block || 0);

    // A cold cursor starts just behind the head rather than at genesis.
    const start = last === 0n ? (latest > batch ? latest - batch : 0n) : last + 1n;
    const end = latest < start + batch - 1n ? latest : start + batch - 1n;

    if (start > end) {
      return NextResponse.json({
        status: "UP_TO_DATE",
        latest: Number(latest),
        last_processed_block: Number(last),
      });
    }

    const result = await runIndexer({ fromBlock: start, toBlock: end });
    return NextResponse.json({ status: "INDEXED", ...result, latest: Number(latest) });
  } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 200) : "unknown error";
    return NextResponse.json({ error: "INDEXER_FAILED", detail }, { status: 500 });
  }
}
