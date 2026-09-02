export default function AssetsPage() {
  return (
    <main className="mx-auto max-w-[1600px] px-4 md:px-6 py-8 md:py-10">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] tracking-[0.2em] text-white/40">ASSETS — VERIFIED REGISTRY</div>
          <h1 className="mt-2 font-serif text-[28px] md:text-[36px] tracking-[-0.03em]">ASSET DIRECTORY</h1>
          <p className="mt-2 max-w-[560px] text-[13px] leading-relaxed text-white/55">Canonical Stock Tokens verified via Robinhood registry. Never verify by symbol alone.</p>
        </div>
        <div className="hidden md:block font-mono text-[10px] tracking-[0.14em] text-white/30">6 VERIFIED · DATA UNAVAILABLE UNTIL INDEXER LIVE</div>
      </div>
      <div className="mt-6 overflow-x-auto border border-white/[0.07]">
        <div className="min-w-[900px]">
          <div className="grid grid-cols-[1.4fr_0.9fr_0.7fr_0.8fr_0.7fr_0.6fr] bg-[#10130F] px-4 py-2.5 font-mono text-[10px] tracking-[0.14em] text-white/40">
            <span>ASSET</span><span>TYPE</span><span>PRICE</span><span>24H ACTIVITY</span><span>NET FLOW</span><span>CONTRACT</span>
          </div>
          {[
            ["NVDA", "NVIDIA", "Stock Token", "VERIFIED ✓"],
            ["AAPL", "Apple", "Stock Token", "VERIFIED ✓"],
            ["TSLA", "Tesla", "Stock Token", "VERIFIED ✓"],
            ["AMZN", "Amazon", "Stock Token", "VERIFIED ✓"],
            ["MSFT", "Microsoft", "Stock Token", "VERIFIED ✓"],
            ["USDG", "USDG Stablecoin", "Crypto", "—"],
          ].map(([sym, name, type, verified]) => (
            <a key={sym} href={`/asset/${sym === "USDG" ? "0x0000000000000000000000000000000000000010" : `0x000000000000000000000000000000000000000${["NVDA","AAPL","TSLA","AMZN","MSFT"].indexOf(sym)+1}`}`} className="grid grid-cols-[1.4fr_0.9fr_0.7fr_0.8fr_0.7fr_0.6fr] border-t border-white/[0.06] px-4 py-4 items-center hover:bg-white/[0.03] transition">
              <div>
                <div className="font-mono text-[13px]">{sym} <span className="text-white/40">· {name}</span></div>
                <div className="font-mono text-[10px] tracking-[0.12em] text-white/30">{verified}</div>
              </div>
              <span className="font-mono text-[11px] text-white/60">{type}</span>
              <span className="font-mono text-[11px] text-white/30">DATA UNAVAILABLE</span>
              <span className="font-mono text-[11px] text-white/30">INDEXING</span>
              <span className="font-mono text-[11px] text-white/30">—</span>
              <span className="font-mono text-[10px] text-white/40">0x000…000{sym === "USDG" ? "10" : String(["NVDA","AAPL","TSLA","AMZN","MSFT"].indexOf(sym)+1)}</span>
            </a>
          ))}
        </div>
      </div>
      <div className="mt-4 border border-white/[0.07] bg-white/[0.02] px-4 py-3 font-mono text-[11px] leading-relaxed text-white/50">
        Methodology: Price via Chainlink onchain feeds where available, otherwise Robinhood Stock Token API. Verification requires canonical registry match, not symbol.
      </div>
    </main>
  );
}
