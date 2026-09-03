import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const query = (q || "").toLowerCase();
  let assets: any[] = [];
  if (isSupabaseConfigured() && supabase) {
    const { data } = await supabase.from("assets").select("symbol, name, contract_address").limit(20);
    if (data) assets = query ? data.filter((a: any) => a.symbol.toLowerCase().includes(query) || a.name.toLowerCase().includes(query) || a.contract_address.toLowerCase().includes(query)) : data.slice(0,8);
  }

  return (
    <main className="mx-auto max-w-[1600px] px-4 md:px-6 py-8">
      <div className="font-mono text-[10px] tracking-[0.2em] text-white/40">SEARCH — ⌘ K · {assets.length} ASSETS INDEXED</div>
      <h1 className="mt-2 font-serif text-[28px] tracking-[-0.03em]">SEARCH</h1>
      <form className="mt-6 max-w-[640px] border border-white/15 bg-white/[0.04] flex items-center px-4 py-3">
        <span className="font-mono text-[11px] tracking-[0.12em] text-white/30">⌘ K</span>
        <input autoFocus name="q" defaultValue={q} placeholder="Search NVDA, AAPL, 0x..., wallet…" className="ml-3 flex-1 bg-transparent font-mono text-[13px] placeholder:text-white/30 focus:outline-none" />
        <button className="ml-3 font-mono text-[11px] tracking-[0.14em] text-[#C7FF4A]">SEARCH</button>
      </form>
      <div className="mt-6 border border-white/[0.07] bg-[#10130F] divide-y divide-white/[0.06]">
        {assets.length ? assets.map((a: any) => (
          <a key={a.contract_address} href={`/asset/${a.contract_address}`} className="flex justify-between px-4 py-3 hover:bg-white/[0.03] font-mono text-[11px]">
            <span><span className="text-white">{a.symbol}</span> <span className="text-white/40">· {a.name}</span></span>
            <span className="text-white/30 truncate ml-4">{a.contract_address.slice(0,8)}…</span>
          </a>
        )) : (
          <div className="p-8 grid place-items-center font-mono text-[11px] tracking-[0.14em] text-white/30">NO MATCHING ASSET — try NVDA, AAPL, TSLA</div>
        )}
      </div>
      <div className="mt-4 font-mono text-[10px] tracking-[0.12em] text-white/30">Results from on-chain discovery — {assets.length} verified. Wallets & protocols next.</div>
    </main>
  );
}
