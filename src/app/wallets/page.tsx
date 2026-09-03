import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export default async function WalletsPage() {
  let wallets: any[] = [];
  if (isSupabaseConfigured() && supabase) {
    const { data } = await supabase.from("wallets").select("address").limit(8);
    if (data) wallets = data;
    // if empty, fallback to distinct from transfers
    if (!wallets.length) {
      const { data: t } = await supabase.from("transfers").select("from_address, to_address").limit(20);
      const set = new Set<string>();
      t?.forEach((r: any) => { set.add(r.from_address); set.add(r.to_address); });
      wallets = [...set].slice(0,8).map(a=>({ address: a }));
    }
  }

  return (
    <main className="mx-auto max-w-[1600px] px-4 md:px-6 py-8">
      <div className="font-mono text-[10px] tracking-[0.2em] text-white/40">WALLET INTELLIGENCE — {wallets.length ? `${wallets.length} OBSERVED` : "INDEXING"}</div>
      <h1 className="mt-2 font-serif text-[28px] md:text-[36px] tracking-[-0.03em]">WALLETS</h1>
      <div className="mt-6 max-w-[640px] flex gap-2">
        <input placeholder="0x… — paste Robinhood Chain address" className="flex-1 border border-white/15 bg-white/[0.04] px-4 py-3 font-mono text-[13px] placeholder:text-white/30 focus:outline-none focus:border-[#C7FF4A]" />
        <button className="bg-[#F2F0E8] text-[#080A08] px-5 font-mono text-[11px] tracking-[0.14em]">INSPECT</button>
      </div>
      {wallets.length ? (
        <div className="mt-6 border border-white/[0.07] bg-[#10130F] p-4">
          <div className="font-mono text-[11px] tracking-[0.16em]">RECENTLY OBSERVED — FROM TRANSFER LOGS</div>
          <div className="mt-3 grid md:grid-cols-2 gap-2 font-mono text-[11px]">
            {wallets.map((w: any) => (
              <a key={w.address} href={`/wallet/${w.address}`} className="border border-white/10 bg-[#080A08] px-3 py-2.5 flex justify-between hover:bg-white/[0.04]">
                <span className="text-white/70 truncate">{w.address.slice(0,6)}…{w.address.slice(-4)}</span>
                <span className="text-[#C7FF4A]">→</span>
              </a>
            ))}
          </div>
          <div className="mt-3 font-mono text-[10px] text-white/30">Click to inspect exposure — portfolio & counterparties from indexed transfers.</div>
        </div>
      ) : (
        <div className="mt-8 border border-white/[0.07] bg-[#10130F] p-6 grid place-items-center py-16">
          <div className="text-center">
            <div className="font-mono text-[11px] tracking-[0.16em] text-white/40">NO WALLET SELECTED</div>
            <div className="mt-2 font-mono text-[13px] text-white/60">Enter an address to see portfolio, exposure, activity, counterparty graph.</div>
          </div>
        </div>
      )}
      <div className="mt-6 grid md:grid-cols-3 gap-4 font-mono text-[11px]">
        <div className="border border-white/10 bg-[#080A08] p-4"><div className="text-white/40">OBSERVED WALLETS</div><div className="mt-2 text-white/60">{wallets.length || "—"}</div></div>
        <div className="border border-white/10 bg-[#080A08] p-4"><div className="text-white/40">INDEXER</div><div className="mt-2 text-[#C7FF4A]">LIVE • LOCAL CRON 2m</div></div>
        <div className="border border-white/10 bg-[#080A08] p-4"><div className="text-white/40">SOURCE</div><div className="mt-2 text-white/30">Transfers → wallets</div></div>
      </div>
    </main>
  );
}
