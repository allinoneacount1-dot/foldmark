import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export default async function FlowsPage() {
  let flows: any[] = [];
  let updated: string | null = null;
  if (isSupabaseConfigured() && supabase) {
    const { data } = await supabase.from("flow_windows").select("entity_id, window, inflow, outflow, net_flow, transaction_count, calculated_at").eq("window", "24H").order("net_flow", { ascending: false }).limit(10);
    if (data) flows = data;
    if (flows[0]) updated = flows[0].calculated_at;
  }

  const hasFlows = flows.length > 0;
  const maxFlow = hasFlows ? Math.max(...flows.map((f: any) => Math.abs(f.net_flow) || 1)) : 1;

  return (
    <main className="mx-auto max-w-[1600px] px-4 md:px-6 py-8">
      <div className="font-mono text-[10px] tracking-[0.2em] text-white/40">CAPITAL FLOW OBSERVATORY — LIVE</div>
      <h1 className="mt-2 font-serif text-[28px] md:text-[36px] tracking-[-0.03em]">WHERE CAPITAL MOVES</h1>
      <div className="mt-1 font-mono text-[11px] text-white/40">{hasFlows ? `${flows.length} assets · 24H window · net flow from classified transfers` : "Indexing — flows appear once transfers classified"}</div>
      <div className="mt-4 flex flex-wrap gap-2 font-mono text-[11px] tracking-[0.12em]">
        {["1H","6H","24H","7D","30D"].map((w) => (
          <span key={w} className={`border px-3 py-1.5 ${w==="24H" ? "bg-white text-[#080A08] border-white" : "border-white/10 text-white/50"}`}>{w}</span>
        ))}
      </div>
      <div className="mt-6 grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="border border-white/[0.07] bg-[#10130F] p-6">
          <div className="font-mono text-[11px] tracking-[0.16em]">CAPITAL MOVEMENT / 24H — {hasFlows ? "LIVE" : "INDEXING"}</div>
          <div className="mt-6 space-y-4">
            {hasFlows ? flows.map((f: any) => {
              const label = f.entity_id.slice(0,6) + "…" + f.entity_id.slice(-4);
              // resolve symbol from entity_id via assets if possible — we do simple display
              const pct = Math.min(100, Math.abs(f.net_flow) / maxFlow * 100);
              const isInflow = f.net_flow >= 0;
              return (
                <div key={f.entity_id} className="flex items-center gap-4">
                  <span className="w-[160px] font-mono text-[11px] tracking-[0.12em] text-white/60 truncate" title={f.entity_id}>{label}</span>
                  <div className="flex-1 h-2 bg-white/[0.06] border border-white/10 relative overflow-hidden">
                    <div className={`absolute inset-y-0 ${isInflow ? "left-0 bg-[#C7FF4A]/35" : "right-0 bg-white/20"}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className={`w-[160px] text-right font-mono text-[11px] tabular-nums ${isInflow ? "text-[#C7FF4A]" : "text-white/50"}`}>{isInflow ? "+" : ""}{f.net_flow.toFixed(2)} · {f.transaction_count} tx</span>
                </div>
              );
            }) : [
              ["STOCK TOKENS", "INDEXING"],
              ["STABLECOINS", "INDEXING"],
              ["CRYPTO ASSETS", "INDEXING"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center gap-4">
                <span className="w-[160px] font-mono text-[11px] tracking-[0.12em] text-white/60">{k}</span>
                <div className="flex-1 h-2 bg-white/[0.06] border border-white/10" />
                <span className="w-[160px] text-right font-mono text-[11px] text-white/30">{v}</span>
              </div>
            ))}
          </div>
          <div className="mt-6 border border-white/10 bg-[#080A08] px-4 py-3 font-mono text-[11px] leading-relaxed text-white/50">
            {hasFlows ? `Live: ${flows.length} assets with 24H flow · Max |net| ${maxFlow.toFixed(2)}` : "Selecting Stock Tokens opens: NVDA, AAPL, TSLA, AMZN, MSFT — only after flow classification. Transfers ≠ inflow until context verified."}
          </div>
          <Link href="/assets" className="mt-4 inline-block font-mono text-[11px] tracking-[0.14em] text-[#C7FF4A] hover:underline">EXPLORE STOCK TOKEN FLOWS →</Link>
        </div>
        <div className="border border-white/[0.07] bg-[#080A08] p-5">
          <div className="font-mono text-[11px] tracking-[0.16em]">METHODOLOGY</div>
          <p className="mt-3 font-mono text-[11px] leading-relaxed text-white/60">
            Net flow = inbound minus outbound for classified interactions only. Window trailing 24H. Unclassified transfers excluded. Source: RPC logs ({flows.length ? flows.length + " assets" : "indexing"}) + Supabase. Discovery on-chain.
          </p>
          <div className="mt-4 font-mono text-[10px] tracking-[0.12em] text-white/30">{updated ? `UPDATED ${new Date(updated).toLocaleTimeString()}` : "LAST UPDATED — WAITING FOR INDEXER"}</div>
        </div>
      </div>
    </main>
  );
}
