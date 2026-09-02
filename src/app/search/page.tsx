export default function SearchPage() {
  return (
    <main className="mx-auto max-w-[1600px] px-4 md:px-6 py-8">
      <div className="font-mono text-[10px] tracking-[0.2em] text-white/40">SEARCH — ⌘ K</div>
      <h1 className="mt-2 font-serif text-[28px] tracking-[-0.03em]">SEARCH</h1>
      <div className="mt-6 max-w-[640px] border border-white/15 bg-white/[0.04] flex items-center px-4 py-3">
        <span className="font-mono text-[11px] tracking-[0.12em] text-white/30">⌘ K</span>
        <input autoFocus placeholder="Search assets, wallets, protocols, contracts…" className="ml-3 flex-1 bg-transparent font-mono text-[13px] placeholder:text-white/30 focus:outline-none" />
      </div>
      <div className="mt-6 border border-white/[0.07] bg-[#10130F] p-8 grid place-items-center">
        <div className="font-mono text-[11px] tracking-[0.14em] text-white/30">NO MATCHING ASSET, WALLET OR PROTOCOL — try NVDA, 0x..., Uniswap</div>
      </div>
      <div className="mt-4 font-mono text-[10px] tracking-[0.12em] text-white/30">Keyboard-first. Fast. Institutional. Results categorized: ASSETS / WALLETS / PROTOCOLS / CONTRACTS</div>
    </main>
  );
}
