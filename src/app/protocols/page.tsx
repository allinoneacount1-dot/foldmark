export default function ProtocolsPage() {
  return (
    <main className="mx-auto max-w-[1600px] px-4 md:px-6 py-8">
      <div className="font-mono text-[10px] tracking-[0.2em] text-white/40">PROTOCOL GRAPH — VERIFIED INFRASTRUCTURE</div>
      <h1 className="mt-2 font-serif text-[28px] md:text-[36px] tracking-[-0.03em]">PROTOCOLS</h1>
      <p className="mt-2 text-[13px] text-white/55 max-w-[560px]">Only verified contracts shown. Each protocol includes category, contracts, observed assets, activity, dependencies, and relationship graph.</p>
      <div className="mt-6 grid md:grid-cols-3 gap-4">
        {[
          ["Uniswap", "DEX", "TRADE"],
          ["Morpho", "LENDING", "LEND"],
          ["Chainlink", "ORACLE", "PRICE FEED"],
          ["Bridge", "BRIDGE", "BRIDGE"],
          ["Wallet Infra", "WALLET", "CUSTODY"],
          ["Perp Venue", "PERP", "PERPETUAL"],
        ].map(([name, cat, cap]) => (
          <div key={name} className="border border-white/[0.07] bg-[#10130F] p-5 hover:bg-[#181C17] transition">
            <div className="font-mono text-[10px] tracking-[0.16em] text-white/40">{cat}</div>
            <div className="mt-1 font-mono text-[14px] tracking-[0.02em]">{name}</div>
            <div className="mt-2 font-mono text-[11px] text-white/30">Capability: {cap}</div>
            <div className="mt-4 border-t border-white/10 pt-3 font-mono text-[11px] text-white/30">DATA UNAVAILABLE — awaiting indexer</div>
            <div className="mt-2 font-mono text-[10px] tracking-[0.12em] text-[#C7FF4A]">VIEW GRAPH →</div>
          </div>
        ))}
      </div>
      <div className="mt-6 border border-white/[0.07] bg-[#080A08] p-6">
        <div className="font-mono text-[11px] tracking-[0.16em]">PROTOCOL GRAPH EXAMPLE</div>
        <div className="mt-4 font-mono text-[11px] leading-relaxed text-white/60">
          CHAINLINK (price) → UNISWAP ← STOCK TOKEN → MARKET → LENDING. Each edge is a verified relationship, not a decorative line.
        </div>
      </div>
    </main>
  );
}
