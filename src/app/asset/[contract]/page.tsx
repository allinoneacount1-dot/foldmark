import { STOCK_TOKENS, isVerifiedStockToken } from "@/lib/assets";

export default async function AssetPage({ params }: { params: Promise<{ contract: string }> }) {
  const { contract } = await params;
  const token = STOCK_TOKENS.find((t) => t.contract.toLowerCase() === contract.toLowerCase());
  const verified = isVerifiedStockToken(contract);
  return (
    <main className="mx-auto max-w-[1600px] px-4 md:px-6 py-8">
      <div className="font-mono text-[10px] tracking-[0.16em] text-white/40">ASSET PASSPORT — /asset/[contract]</div>
      <div className="mt-3 flex flex-wrap items-baseline gap-3">
        <h1 className="font-serif text-[32px] tracking-[-0.03em]">{token ? token.symbol : contract.slice(0, 10) + "…"}</h1>
        <span className={`font-mono text-[11px] tracking-[0.14em] px-2 py-1 border ${verified ? "border-[#C7FF4A] text-[#C7FF4A] bg-[#C7FF4A]/10" : "border-white/15 text-white/40"}`}>{verified ? "VERIFIED CONTRACT ✓" : "UNVERIFIED"}</span>
        <span className="font-mono text-[11px] tracking-[0.12em] text-white/30">{token?.type === "stock_token" ? "STOCK TOKEN" : token?.type || "UNKNOWN"}</span>
      </div>
      <div className="mt-6 grid lg:grid-cols-[1.1fr_0.9fr] gap-6">
        <div className="border border-white/[0.07] bg-[#10130F] p-5 space-y-4">
          {[
            ["PRICE", "DATA UNAVAILABLE", "Chainlink / Robinhood API"],
            ["24H ACTIVITY", "INDEXING", "RPC logs"],
            ["OBSERVED HOLDERS", "DATA UNAVAILABLE", "Indexer"],
            ["LIQUIDITY", "DATA UNAVAILABLE", "DEX pools"],
            ["NET FLOW / 24H", "DATA UNAVAILABLE", "Flow Engine"],
          ].map(([k, v, src]) => (
            <div key={k} className="flex justify-between border-b border-white/10 py-3 font-mono text-[11px]">
              <span className="tracking-[0.14em] text-white/40">{k}</span>
              <span className="text-right"><span className="tabular-nums text-white/60">{v}</span><span className="block text-[10px] text-white/30">{src}</span></span>
            </div>
          ))}
        </div>
        <div className="space-y-4">
          <div className="border border-white/10 bg-[#080A08] p-4">
            <div className="font-mono text-[11px] tracking-[0.16em]">CONTRACT</div>
            <div className="mt-2 font-mono text-[12px] break-all text-white/70">{contract}</div>
            <a href={`https://explorer.robinhoodchain.io/address/${contract}`} target="_blank" className="mt-2 inline-block font-mono text-[11px] tracking-[0.12em] text-[#C7FF4A] hover:underline">VIEW ON BLOCKSCOUT ↗</a>
          </div>
          <div className="border border-white/10 bg-white/[0.02] p-4 font-mono text-[10px] leading-relaxed text-white/50">
            DATA SOURCES — Price: Chainlink · Metadata: Robinhood Registry · Transfers: RPC · Contract: Registry · Explorer: Blockscout
          </div>
          {verified && token?.type === "stock_token" && (
            <div className="border border-[#C7FF4A]/20 bg-[#C7FF4A]/10 p-4 font-mono text-[11px] leading-relaxed text-white/80">
              Stock Token fields: Underlying {token.name} · Symbol {token.symbol} · Source Robinhood Stock Token Registry · Price handled with corporate-action multiplier.
            </div>
          )}
          {!verified && <div className="border border-[#E85D4E]/20 bg-[#E85D4E]/10 p-4 font-mono text-[11px] text-[#E85D4E]">Unverified contract — not a canonical Stock Token. Verification requires registry match, not symbol.</div>}
        </div>
      </div>
    </main>
  );
}
