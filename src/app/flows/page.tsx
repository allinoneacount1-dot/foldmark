import Link from "next/link";

export default function FlowsPage() {
  return (
    <main className="mx-auto max-w-[1600px] px-4 md:px-6 py-8">
      <div className="font-mono text-[10px] tracking-[0.2em] text-white/40">CAPITAL FLOW OBSERVATORY</div>
      <h1 className="mt-2 font-serif text-[28px] md:text-[36px] tracking-[-0.03em]">WHERE CAPITAL MOVES</h1>
      <div className="mt-4 flex flex-wrap gap-2 font-mono text-[11px] tracking-[0.12em]">
        {["1H","6H","24H","7D","30D"].map((w) => (
          <span key={w} className={`border px-3 py-1.5 ${w==="24H" ? "bg-white text-[#080A08] border-white" : "border-white/10 text-white/50"}`}>{w}</span>
        ))}
      </div>
      <div className="mt-6 grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="border border-white/[0.07] bg-[#10130F] p-6">
          <div className="font-mono text-[11px] tracking-[0.16em]">CAPITAL MOVEMENT / 24H — INDEXING</div>
          <div className="mt-6 space-y-4">
            {[
              ["STOCK TOKENS", "DATA UNAVAILABLE"],
              ["STABLECOINS", "DATA UNAVAILABLE"],
              ["CRYPTO ASSETS", "INDEXING"],
              ["LENDING", "DATA UNAVAILABLE"],
              ["BRIDGES", "DATA UNAVAILABLE"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center gap-4">
                <span className="w-[160px] font-mono text-[11px] tracking-[0.12em] text-white/60">{k}</span>
                <div className="flex-1 h-2 bg-white/[0.06] border border-white/10" />
                <span className="w-[160px] text-right font-mono text-[11px] text-white/30">{v}</span>
              </div>
            ))}
          </div>
          <div className="mt-6 border border-white/10 bg-[#080A08] px-4 py-3 font-mono text-[11px] leading-relaxed text-white/50">
            Selecting Stock Tokens opens: NVDA +$2.18M, AAPL +$1.74M, TSLA +$1.41M, AMZN +$890K, MSFT +$712K — only after flow classification. Transfers ≠ inflow until context verified.
          </div>
          <Link href="/assets" className="mt-4 inline-block font-mono text-[11px] tracking-[0.14em] text-[#C7FF4A] hover:underline">EXPLORE STOCK TOKEN FLOWS →</Link>
        </div>
        <div className="border border-white/[0.07] bg-[#080A08] p-5">
          <div className="font-mono text-[11px] tracking-[0.16em]">METHODOLOGY</div>
          <p className="mt-3 font-mono text-[11px] leading-relaxed text-white/60">
            Net flow = inbound minus outbound for classified interactions only. Windows trailing. Unclassified transfers remain visible but excluded from derived metrics. Sources: RPC logs + Robinhood Stock Token API + Chainlink. Updated 5s.
          </p>
          <div className="mt-4 font-mono text-[10px] tracking-[0.12em] text-white/30">LAST UPDATED — WAITING FOR INDEXER</div>
        </div>
      </div>
    </main>
  );
}
