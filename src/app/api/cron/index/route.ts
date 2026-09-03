import { NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { robinhoodChain } from "@/lib/wagmi";
import { isSupabaseConfigured } from "@/lib/supabase";
import { activeEndpoint as activeRpcEndpoint } from "@/server/market-data/providers/rpc";
import { runIndexer, getCursor } from "@/lib/indexer";
import { ingestPrices } from "@/server/market-data/scheduler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * One ingestion pass: advance the chain index, and refresh market prices.
 *
 * The two halves are deliberately independent. Chain indexing depends on log
 * queries a public node may refuse for a given range; price ingestion depends
 * on entirely different providers. Letting one failure abort the other would
 * mean a single bad log query silently stops the price history from ever being
 * written — which is precisely how the prices table stayed empty.
 *
 * This is the only entry point to ingestion. The scheduled invocation and the
 * local driver both call it, so there is one implementation, not two.
 *
 * The block batch is small on purpose: every distinct block costs a header
 * lookup to resolve its timestamp, and a run that overruns its budget commits
 * nothing at all.
 */
const DEFAULT_BATCH = 2n;
const MAX_BATCH = 25n;

type Outcome<T> = { ok: true; value: T } | { ok: false; error: string };

async function attempt<T>(label: string, fn: () => Promise<T>): Promise<Outcome<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // viem stacks a lot of context; the first line names the actual failure
    return { ok: false, error: `${label}: ${message.split("\n")[0].slice(0, 180)}` };
  }
}

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
  const endpoint = activeRpcEndpoint();

  const chain = await attempt("chain", async () => {
    const client = createPublicClient({ chain: robinhoodChain, transport: http(endpoint) });
    const latest = await client.getBlockNumber();
    const cursor = await getCursor();
    const last = BigInt(cursor.last_processed_block || 0);

    // A cold cursor starts just behind the head rather than at genesis.
    const start = last === 0n ? (latest > batch ? latest - batch : 0n) : last + 1n;
    const end = latest < start + batch - 1n ? latest : start + batch - 1n;

    if (start > end) {
      return { status: "UP_TO_DATE" as const, latest: Number(latest), last_processed_block: Number(last) };
    }
    const result = await runIndexer({ fromBlock: start, toBlock: end });
    return { status: "INDEXED" as const, latest: Number(latest), ...result };
  });

  // Always runs, whatever the chain half did.
  const prices = await attempt("prices", () => ingestPrices());

  return NextResponse.json(
    {
      rpc_endpoint: new URL(endpoint).host,
      chain: chain.ok ? chain.value : { status: "FAILED", error: chain.error },
      prices: prices.ok ? prices.value : { status: "FAILED", error: prices.error },
      completed_at: new Date().toISOString(),
    },
    { status: chain.ok || prices.ok ? 200 : 500 },
  );
}
