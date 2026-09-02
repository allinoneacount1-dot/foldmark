export default function WalletsPage() {
  return (
    <main className="mx-auto max-w-[1600px] px-4 md:px-6 py-8">
      <div className="font-mono text-[10px] tracking-[0.2em] text-white/40">WALLET INTELLIGENCE — PUBLIC ADDRESS ANALYSIS</div>
      <h1 className="mt-2 font-serif text-[28px] md:text-[36px] tracking-[-0.03em]">WALLETS</h1>
      <div className="mt-6 max-w-[640px] flex gap-2">
        <input placeholder="0x… — paste Robinhood Chain address" className="flex-1 border border-white/15 bg-white/[0.04] px-4 py-3 font-mono text-[13px] placeholder:text-white/30 focus:outline-none focus:border-[#C7FF4A]" />
        <button className="bg-[#F2F0E8] text-[#080A08] px-5 font-mono text-[11px] tracking-[0.14em]">INSPECT</button>
      </div>
      <div className="mt-8 border border-white/[0.07] bg-[#10130F] p-6 grid place-items-center py-16">
        <div className="text-center">
          <div className="font-mono text-[11px] tracking-[0.16em] text-white/40">NO WALLET SELECTED</div>
          <div className="mt-2 font-mono text-[13px] text-white/60">Enter an address to see portfolio, exposure, activity, counterparty graph.</div>
          <div className="mt-4 font-mono text-[10px] tracking-[0.12em] text-white/30">Try: 0x48D…C912 (example from spec)</div>
        </div>
      </div>
      <div className="mt-6 grid md:grid-cols-3 gap-4 font-mono text-[11px]">
        <div className="border border-white/10 bg-[#080A08] p-4"><div className="text-white/40">ASSET EXPOSURE</div><div className="mt-2 text-white/30">DATA UNAVAILABLE</div></div>
        <div className="border border-white/10 bg-[#080A08] p-4"><div className="text-white/40">PROTOCOL EXPOSURE</div><div className="mt-2 text-white/30">INDEXING</div></div>
        <div className="border border-white/10 bg-[#080A08] p-4"><div className="text-white/40">CAPITAL MOVEMENT</div><div className="mt-2 text-white/30">DATA UNAVAILABLE</div></div>
      </div>
    </main>
  );
}
