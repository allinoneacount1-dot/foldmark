import { NextResponse } from "next/server";
import { ROBINHOOD_CHAIN } from "@/lib/chain";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Dependency latency probe.
 *
 * Times each upstream the product depends on, using the configured endpoints —
 * no host or project identifier is hardcoded here. Feeds the status page's
 * narrative and is useful when a surface reports DATA UNAVAILABLE.
 */
type Probe = { ok: boolean; ms: number; detail: string };

export async function GET() {
  const started = Date.now();

  const rpc = await timed(async () => {
    const res = await fetch(ROBINHOOD_CHAIN.rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { result?: string };
    if (!json.result) throw new Error("no result");
    return `block ${parseInt(json.result, 16)}`;
  });

  const storage = await timed(async () => {
    if (!isSupabaseConfigured() || !supabase) throw new Error("not configured");
    const { error, count } = await supabase.from("assets").select("id", { count: "exact", head: true });
    if (error) throw new Error(error.message.slice(0, 120));
    return `${count ?? 0} assets`;
  });

  const healthy = rpc.ok && storage.ok;

  return NextResponse.json(
    {
      probes: { rpc, storage },
      total_ms: Date.now() - started,
      chain_id: ROBINHOOD_CHAIN.id,
      checked_at: new Date().toISOString(),
      methodology: "Each probe is a single live call to the configured endpoint, timed on this request.",
    },
    { status: healthy ? 200 : 503 },
  );
}

async function timed(fn: () => Promise<string>): Promise<Probe> {
  const started = Date.now();
  try {
    const detail = await fn();
    return { ok: true, ms: Date.now() - started, detail };
  } catch (error) {
    return {
      ok: false,
      ms: Date.now() - started,
      detail: error instanceof Error ? error.message.slice(0, 160) : "unknown error",
    };
  }
}
