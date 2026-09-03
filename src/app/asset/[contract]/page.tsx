import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { isVerifiedStockToken } from "@/lib/assets";

export default async function AssetPage({ params }: { params: Promise<{ contract: string }> }) {
  const { contract } = await params;
  const verified = isVerifiedStockToken(contract);

  let token: any = null;
  let holders: number | null = null;
  let activity24h: number | null = null;
  let netFlow: string | null = null;

  if (isSupabaseConfigured() && supabase) {
    const { data: asset } = await supabase.from("assets").select("symbol, name, asset_type, verified, contract_address").eq("contract_address", contract.toLowerCase()).single();
    if (asset) token = { symbol: asset.symbol, name: asset.name, type: asset.asset_type, verified: asset.verified, contract: asset.contract_address };
    else {
      // fallback to hardcoded check for legacy
      const { STOCK_TOKENS } = await import("@/lib/assets");
      const t = STOCK_TOKENS.find((x) => x.contract.toLowerCase() === contract.toLowerCase());
      if (t) token = { symbol: t.symbol, name: t.name, type: t.type, verified: t.verified, contract: t.contract };
    }

    if (token || verified) {
      // find asset_id for transfers
      const addr = (token?.contract || contract).toLowerCase();
      const { data: a } = await supabase.from("assets").select("id").eq("contract_address", addr).single();
      const assetId = (a as any)?.id;
      if (assetId) {
        const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
        const { data: transfers } = await supabase.from("transfers").select("from_address, to_address, amount").eq("asset_id", assetId).gte("timestamp", since).limit(1000);
        if (transfers) {
          activity24h = transfers.length;
          const holdersSet = new Set<string>();
          transfers.forEach((t: any) => { holdersSet.add(t.from_address); holdersSet.add(t.to_address); });
          holders = holdersSet.size;
        }
        const { data: flow } = await supabase.from("flow_windows").select("net_flow").eq("entity_id", addr).eq("window", "24H").single();
        if (flow) netFlow = Number((flow as any).net_flow).toFixed(2);
      }
    }
  } else {
    const { STOCK_TOKENS } = await import("@/lib/assets");
    const t = STOCK_TOKENS.find((x) => x.contract.toLowerCase() === contract.toLowerCase());
    if (t) token = { symbol: t.symbol, name: t.name, type: t.type, verified: t.verified, contract: t.contract };
  }

  const displaySymbol = token ? token.symbol : contract.slice(0, 10) + "…";
  const displayType = token?.type === "stock_token" ? "STOCK TOKEN" : token?.type?.toUpperCase() || "UNKNOWN";

  return (
    <main className="mx-auto max-w-[1600px] px-4 md:px-6 py-8">
      <div className="font-mono text-[10px] tracking-[0.16em] text-white/40">ASSET PASSPORT — /asset/[contract] · {holders !== null ? `${holders} holders · ${activity24h} tx 24H` : "INDEXING"}</div>
      <div className="mt-3 flex flex-wrap items-baseline gap-3">
        <h1 className="font-serif text-[32px] tracking-[-0.03em]">{displaySymbol}</h1>
        <span className={`font-mono text-[11px] tracking-[0.14em] px-2 py-1 border ${verified ? "border-[#C7FF4A] text-[#C7FF4A] bg-[#C7FF4A]/10" : "border-white/15 text-white/40"}`}>{verified ? "VERIFIED CONTRACT ✓" : "UNVERIFIED"}</span>
        <span className="font-mono text-[11px] tracking-[0.12em] text-white/30">{displayType}</span>
      </div>
      <div className="mt-6 grid lg:grid-cols-[1.1fr_0.9fr] gap-6">
        <div className="border border-white/[0.07] bg-[#10130F] p-5 space-y-4">
          {[
            ["PRICE", "—", "Chainlink / Robinhood API"],
            ["24H ACTIVITY", activity24h !== null ? `${activity24h} transfers` : "INDEXING", "RPC logs · transfers"],
            ["OBSERVED HOLDERS", holders !== null ? `${holders} addresses` : "INDEXING", "distinct from/to 24H"],
            ["LIQUIDITY", "—", "DEX pools — coming"],
            ["NET FLOW / 24H", netFlow !== null ? `${Number(netFlow) >= 0 ? "+" : ""}${netFlow}` : "INDEXING", "flow_windows 24H"],
          ].map(([k, v, src]) => (
            <div key={k} className="flex justify-between border-b border-white/10 py-3 font-mono text-[11px]">
              <span className="tracking-[0.14em] text-white/40">{k}</span>
              <span className="text-right"><span className={`tabular-nums ${v === "INDEXING" || v === "—" ? "text-white/30" : "text-white"}`}>{v}</span><span className="block text-[10px] text-white/30">{src}</span></span>
            </div>
          ))}
        </div>
        <div className="space-y-4">
          <div className="border border-white/10 bg-[#080A08] p-4">
            <div className="font-mono text-[11px] tracking-[0.16em]">CONTRACT</div>
            <div className="mt-2 font-mono text-[12px] break-all text-white/70">{contract}</div>
            <a href={`https://robinhoodchain.blockscout.com/address/${contract}`} target="_blank" className="mt-2 inline-block font-mono text-[11px] tracking-[0.12em] text-[#C7FF4A] hover:underline">VIEW ON BLOCKSCOUT ↗</a>
            {token && <div className="mt-2 font-mono text-[10px] text-white/30">{token.name} · {token.symbol} · {token.verified ? "verified" : "unverified"}</div>}
          </div>
          <div className="border border-white/10 bg-white/[0.02] p-4 font-mono text-[10px] leading-relaxed text-white/50">
            DATA SOURCES — Price: Chainlink · Metadata: on-chain name “• Robinhood Token” · Transfers: RPC eth_getLogs · Explorer: Blockscout (robinhoodchain.blockscout.com)
          </div>
          {verified && token?.type === "stock_token" && (
            <div className="border border-[#C7FF4A]/20 bg-[#C7FF4A]/10 p-4 font-mono text-[11px] leading-relaxed text-white/80">
              Stock Token: Underlying {token.name} · Symbol {token.symbol} · Source on-chain auto-discovered · {holders !== null ? `${holders} holders observed` : "indexing holders"}.
            </div>
          )}
          {!verified && <div className="border border-[#E85D4E]/20 bg-[#E85D4E]/10 p-4 font-mono text-[11px] text-[#E85D4E]">Unverified contract — not a canonical Stock Token. Verification requires on-chain name match, not symbol.</div>}
        </div>
      </div>
    </main>
  );
}
