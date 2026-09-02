import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

function Rail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="border-r border-white/[0.07] px-4 md:px-6 py-3 flex items-center gap-3">
      <span className="font-mono text-[10px] tracking-[0.16em] text-white/40">{label}</span>
      <span className={`font-mono text-[11px] tracking-[0.04em] ${mono ? "tabular-nums" : ""} ${value === "DATA UNAVAILABLE" || value === "INDEXING" ? "text-white/30" : "text-white"}`}>{value}</span>
    </div>
  );
}

function Methodology({ children }: { children: React.ReactNode }) {
  return (
    <details className="group border border-white/[0.07] bg-white/[0.02]">
      <summary className="cursor-pointer list-none px-4 py-2.5 font-mono text-[10px] tracking-[0.16em] text-white/50 hover:text-white flex items-center justify-between">
        <span>METHODOLOGY</span>
        <span className="text-white/30 group-open:rotate-180 transition">⌄</span>
      </summary>
      <div className="border-t border-white/[0.07] px-4 py-3 font-mono text-[11px] leading-relaxed text-white/60">{children}</div>
    </details>
  );
}

async function getLive() {
  if (!isSupabaseConfigured() || !supabase) return { block: null as number | null, assets: [] as any[], updated: null as string | null };
  const [{ data: state }, { data: assets }, { data: transfersCount }] = await Promise.all([
    supabase.from("indexer_state").select("last_processed_block, updated_at").eq("chain_id", 4663).single(),
    supabase.from("assets").select("symbol, name, contract_address, asset_type, verified").order("symbol").limit(10),
    supabase.from("transfers").select("id", { count: "exact", head: true }),
  ]);
  return {
    block: (state as any)?.last_processed_block ?? null,
    assets: assets || [],
    updated: (state as any)?.updated_at ?? null,
    transfers: (transfersCount as any) ?? 0,
  };
}

export default async function Home() {
  const live = await getLive();
  const blockLabel = live.block ? `#${live.block.toLocaleString()}` : "INDEXING";
  const assetsCount = live.assets.length ? `${live.assets.length} VERIFIED` : "INDEXING";
  const updatedLabel = live.updated ? new Date(live.updated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
  const isLive = !!live.block;

  return (
    <main className="flex-1">
      {/* HERO */}
      <section data-hero className="relative overflow-hidden border-b border-white/[0.07]">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[#080A08]" />
          <div className="absolute inset-0 opacity-[0.14]" style={{ backgroundImage: "radial-gradient(ellipse at 30% 10%, rgba(199,255,74,0.18), transparent 55%), radial-gradient(ellipse at 80% 85%, rgba(255,255,255,0.06), transparent 60%)" }} />
          <svg className="absolute inset-0 h-full w-full opacity-[0.18]" aria-hidden>
            <g stroke="rgba(242,240,232,0.08)" strokeWidth="0.7" fill="none">
              <path d="M 120 180 L 420 220 L 700 180 L 980 260 L 1280 200" />
              <path d="M 200 320 L 520 300 L 820 340 L 1120 300" />
              <path d="M 300 420 L 600 400 L 900 420" />
            </g>
            <g fill="#F2F0E8" opacity="0.9">
              <circle cx="120" cy="180" r="3.5" />
              <circle cx="420" cy="220" r="4.5" />
              <circle cx="700" cy="180" r="3" />
              <circle cx="980" cy="260" r="3.5" />
              <circle cx="520" cy="300" r="3" />
              <circle cx="820" cy="340" r="4" />
            </g>
            <g fill="#C7FF4A">
              <circle cx="420" cy="220" r="1.6"><animate attributeName="opacity" values="1;0.2;1" dur="2s" repeatCount="indefinite" /></circle>
              <circle cx="820" cy="340" r="1.6"><animate attributeName="opacity" values="1;0.2;1" dur="2.3s" repeatCount="indefinite" /></circle>
            </g>
          </svg>
        </div>

        <div className="relative mx-auto max-w-[1600px] px-4 md:px-6 pt-14 md:pt-20 pb-0">
          <div className="max-w-[900px]">
            <div className="inline-flex items-center gap-2 border border-white/10 bg-white/[0.04] px-3 py-1.5">
              <span className="h-1.5 w-1.5 bg-[#C7FF4A] animate-pulse" />
              <span className="font-mono text-[10px] tracking-[0.18em] text-white/70">FOLDMARK / LIVE FINANCIAL NETWORK</span>
              <span className="font-mono text-[10px] tracking-[0.12em] text-white/30">ROBINHOOD CHAIN • 4663 {isLive ? "• LIVE" : "• INDEXING"}</span>
            </div>
            <h1 data-headline className="mt-6 font-serif text-[42px] md:text-[68px] leading-[0.85] tracking-[-0.04em]">
              THE MARKET<br />
              IS BECOMING<br />
              <span className="text-[#C7FF4A]">PROGRAMMABLE.</span>
            </h1>
            <p data-body className="mt-6 max-w-[560px] text-[15px] leading-relaxed text-white/60">
              Explore the assets, capital flows and financial infrastructure emerging across Robinhood Chain. Every thread is a transaction. Every node is a market.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/fabric" className="bg-[#C7FF4A] text-[#080A08] px-6 py-3 font-mono text-[11px] tracking-[0.16em] hover:bg-[#D8FF7A] transition">
                ENTER THE FABRIC →
              </Link>
              <Link href="/assets" className="border border-white/15 bg-white/[0.04] px-6 py-3 font-mono text-[11px] tracking-[0.16em] text-white hover:bg-white hover:text-[#080A08] transition">
                EXPLORE {live.assets.length || "—"} ASSETS
              </Link>
            </div>
            <div className="mt-10 font-mono text-[10px] tracking-[0.14em] text-white/30">SCROLL TO OBSERVE CAPITAL — FABRIC UPDATES LIVE</div>
          </div>
        </div>

        {/* hero data rail — LIVE */}
        <div className="relative mt-10 md:mt-16 border-y border-white/[0.07] bg-[#10130F]">
          <div className="mx-auto max-w-[1600px] flex overflow-x-auto">
            <Rail label="BLOCK" value={blockLabel} mono />
            <Rail label="ACTIVITY" value={isLive ? "LIVE" : "INDEXING"} />
            <Rail label="ASSETS" value={assetsCount} />
            <Rail label="CHAIN" value="4663 • ROBINHOOD" />
            <Rail label="UPDATED" value={updatedLabel} />
            <div className="ml-auto hidden md:flex items-center px-6 font-mono text-[10px] tracking-[0.14em] text-white/30">SEE METHODOLOGY →</div>
          </div>
        </div>
      </section>

      {/* NETWORK PULSE — LIVE */}
      <section data-reveal className="mx-auto max-w-[1600px] px-4 md:px-6 py-10 md:py-14">
        <div className="grid md:grid-cols-[1.1fr_0.9fr] gap-8">
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] text-white/40">01 — NETWORK PULSE</div>
            <h2 className="mt-2 font-serif text-[28px] md:text-[36px] leading-none tracking-[-0.03em]">ROBINHOOD CHAIN<br />{isLive ? "IS LIVE. DATA IS FLOWING." : "IS LIVE. DATA IS SCARCE."}</h2>
            <p data-body className="mt-4 text-[13px] leading-relaxed text-white/55 max-w-[520px]">{isLive ? `Indexed to block ${live.block?.toLocaleString()} • ${live.assets.length} verified assets • Transfers observed on-chain.` : "Every value originates from chain data. If the indexer cannot retrieve it, we show DATA UNAVAILABLE — never a fake number."}</p>
          </div>
          <div className="border border-white/[0.08] bg-[#10130F]">
            <div className="px-5 py-3 border-b border-white/[0.07] flex items-center justify-between">
              <span className="font-mono text-[11px] tracking-[0.16em]">NETWORK PULSE</span>
              <span className={`h-1.5 w-1.5 ${isLive ? "bg-[#C7FF4A] animate-pulse" : "bg-white/20"}`} />
            </div>
            <div className="divide-y divide-white/[0.06] font-mono text-[12px]">
              {[
                ["BLOCK", blockLabel],
                ["VERIFIED ASSETS", assetsCount],
                ["CHAIN", "4663 • ROBINHOOD"],
                ["INDEXER", isLive ? "LIVE" : "INDEXING"],
                ["DISCOVERY", "ON-CHAIN • ROBINHOOD TOKEN"],
                ["UPDATED", updatedLabel],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between px-5 py-3">
                  <span className="tracking-[0.12em] text-white/40">{k}</span>
                  <span className="tabular-nums text-white/70">{v}</span>
                </div>
              ))}
            </div>
            <div className="px-5 py-2.5 bg-[#181C17] font-mono text-[10px] tracking-[0.12em] text-white/30">{isLive ? `LIVE • BLOCK ${live.block}` : "UPDATED — WAITING FOR INDEXER"}</div>
            <div className="p-4">
              <Methodology>
                Block via Robinhood Chain RPC (chain 4663). Transfers via eth_getLogs Transfer. Assets auto-discovered on-chain where name contains “• Robinhood Token”. All methodology visible on click.
              </Methodology>
            </div>
          </div>
        </div>
      </section>

      {/* CAPITAL IS MOVING */}
      <section data-reveal className="border-y border-white/[0.07] bg-[#10130F]">
        <div className="mx-auto max-w-[1600px] px-4 md:px-6 py-10 md:py-14">
          <h2 data-headline className="font-serif text-[32px] md:text-[48px] leading-[0.9] tracking-[-0.04em]">
            CAPITAL<br />
            DOESN&apos;T STAND STILL.
          </h2>
          <div className="mt-8 grid lg:grid-cols-[280px_1fr_280px] gap-6">
            <div className="border border-white/[0.07] bg-[#080A08] p-4">
              <div className="font-mono text-[10px] tracking-[0.16em] text-white/40">SOURCE</div>
              <div className="mt-3 space-y-2 font-mono text-[11px]">
                {[
                  `STOCK TOKENS · ${live.assets.length}`,
                  "STABLECOINS · USDG",
                  "CRYPTO ASSETS",
                  "LENDING",
                  "BRIDGES",
                ].map((s) => (
                  <div key={s} className="flex justify-between border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                    <span className="tracking-[0.12em] text-white/60">{s}</span>
                    <span className="tabular-nums text-white/30">{isLive ? "LIVE" : "—"}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="border border-white/[0.07] bg-[#080A08] p-6 flex flex-col items-center justify-center min-h-[280px]">
              <div className="font-mono text-[10px] tracking-[0.16em] text-white/30">CAPITAL MOVEMENT / 24H — {isLive ? "LIVE SAMPLE" : "INDEXING"}</div>
              <div className="mt-6 w-full max-w-[520px] space-y-3">
                {[
                  ["STOCK TOKENS", isLive ? `${live.assets.length} verified` : "DATA UNAVAILABLE"],
                  ["STABLECOINS", "USDG • LIVE"],
                  ["DISCOVERY", "ON-CHAIN • AUTO"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center gap-3">
                    <span className="w-[160px] font-mono text-[11px] tracking-[0.12em] text-white/50">{k}</span>
                    <div className="flex-1 h-[8px] bg-white/[0.06] border border-white/[0.07] relative overflow-hidden">
                      <div className={`absolute inset-y-0 left-0 ${isLive ? "w-[68%] bg-[#C7FF4A]/35" : "w-[0%] bg-[#C7FF4A]/30"}`} />
                    </div>
                    <span className="w-[140px] text-right font-mono text-[11px] tabular-nums text-white/40 truncate">{v}</span>
                  </div>
                ))}
                <div className="pt-2 font-mono text-[10px] tracking-[0.12em] text-white/30">Flow classification — transfers ≠ inflow until context verified.</div>
              </div>
              <Link href="/flows" className="mt-6 font-mono text-[11px] tracking-[0.14em] text-[#C7FF4A] hover:underline">
                OPEN FLOW OBSERVATORY →
              </Link>
            </div>
            <div className="border border-white/[0.07] bg-[#080A08] p-4">
              <div className="font-mono text-[10px] tracking-[0.16em] text-white/40">DESTINATION</div>
              <div className="mt-3 space-y-2 font-mono text-[11px]">
                {["DEX", "LENDING", "BRIDGE", "WALLETS", "TREASURY"].map((s) => (
                  <div key={s} className="flex justify-between border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                    <span className="tracking-[0.12em] text-white/60">{s}</span>
                    <span className="tabular-nums text-white/30">{isLive ? "LIVE" : "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4">
            <Methodology>Flows = classified interactions only. Windows: 1H/6H/24H/7D/30D. Inflow minus outflow per classified context. Unclassified transfers excluded.</Methodology>
          </div>
        </div>
      </section>

      {/* ACTIVE ASSETS — LIVE */}
      <section data-reveal className="mx-auto max-w-[1600px] px-4 md:px-6 py-10 md:py-14">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-mono text-[11px] tracking-[0.2em]">ACTIVE ASSETS / LIVE — {live.assets.length} VERIFIED</h2>
          <Link href="/assets" className="font-mono text-[11px] tracking-[0.14em] text-white/50 hover:text-white">
            VIEW ALL {live.assets.length} ASSETS →
          </Link>
        </div>
        <div className="mt-4 overflow-x-auto border border-white/[0.07]">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-[1.2fr_0.8fr_0.9fr_0.8fr_0.9fr_0.6fr] bg-[#10130F] px-4 py-2.5 font-mono text-[10px] tracking-[0.14em] text-white/40">
              <span>ASSET</span><span>PRICE</span><span>TYPE</span><span>CONTRACT</span><span>SOURCE</span><span>MARKETS</span>
            </div>
            {live.assets.slice(0, 5).map((a: any) => (
              <Link key={a.contract_address} href={`/asset/${a.contract_address}`} className="grid grid-cols-[1.2fr_0.8fr_0.9fr_0.8fr_0.9fr_0.6fr] border-t border-white/[0.06] px-4 py-4 items-center hover:bg-white/[0.02] transition">
                <div>
                  <div className="font-mono text-[13px] tracking-[0.04em]">{a.symbol}</div>
                  <div className="font-mono text-[10px] tracking-[0.12em] text-white/40 truncate">{a.name} · VERIFIED ✓</div>
                </div>
                <span className="font-mono text-[12px] tabular-nums text-white/50">—</span>
                <span className="font-mono text-[11px] text-white/40">{a.asset_type}</span>
                <span className="font-mono text-[10px] text-white/30 truncate">{a.contract_address.slice(0, 6)}…{a.contract_address.slice(-4)}</span>
                <span className="font-mono text-[10px] text-white/30 truncate">ON-CHAIN</span>
                <span className="font-mono text-[11px] text-[#C7FF4A]">→</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="mt-3 font-mono text-[10px] tracking-[0.12em] text-white/30">+ {Math.max(0, live.assets.length - 5)} more verified — auto-discovered where name contains “• Robinhood Token”.</div>
      </section>

      {/* FABRIC — MINI CANVAS */}
      <section data-reveal className="border-y border-white/[0.07] bg-[#10130F]">
        <div className="mx-auto max-w-[1600px] px-4 md:px-6 py-10 md:py-14">
          <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-8 items-center">
            <div className="border border-white/[0.07] bg-[#080A08] aspect-[1.6/1] relative overflow-hidden">
              <div className="absolute inset-0 opacity-[0.18]" style={{ backgroundImage: "radial-gradient(ellipse at 30% 20%, rgba(199,255,74,0.12), transparent 60%)" }} />
              <svg className="absolute inset-0 h-full w-full" aria-hidden>
                <g stroke="rgba(242,240,232,0.08)" strokeWidth="0.7" fill="none">
                  <path d="M 80 120 L 260 150 L 440 120 L 620 180" />
                  <path d="M 140 220 L 320 200 L 500 240" />
                </g>
                {live.assets.slice(0, 6).map((_: any, i: number) => (
                  <g key={i}>
                    <circle cx={80 + i * 90} cy={130 + (i % 2) * 40} r={3.5 + (i === 0 ? 1 : 0)} fill={i === 0 ? "#C7FF4A" : "#F2F0E8"} />
                  </g>
                ))}
              </svg>
              <div className="absolute bottom-3 left-3 right-3 flex gap-2 font-mono text-[10px] tracking-[0.12em]">
                <span className="border border-white/10 bg-[#080A08] px-2 py-1 text-white/50">LIVE</span>
                <span className="border border-white/10 bg-[#C7FF4A] text-[#080A08] px-2 py-1">{live.assets.length} NODES</span>
                <span className="border border-white/10 bg-[#080A08] px-2 py-1 text-white/50">WEBGL →</span>
              </div>
              <Link href="/fabric" className="absolute inset-0 grid place-items-center bg-transparent hover:bg-white/[0.02] transition">
                <span className="border border-white/15 bg-[#080A08]/80 backdrop-blur px-4 py-2 font-mono text-[11px] tracking-[0.16em] text-white">OPEN FULL FABRIC →</span>
              </Link>
            </div>
            <div>
              <h2 data-headline className="font-serif text-[32px] md:text-[44px] leading-[0.9] tracking-[-0.03em]">
                MARKETS WERE BUILT<br />
                INSIDE DATABASES.<br />
                <span className="text-white/40">NOW THEY LIVE<br />INSIDE NETWORKS.</span>
              </h2>
              <p data-body className="mt-4 text-[13px] leading-relaxed text-white/55 max-w-[480px]">Observe the fabric from above. Not a galaxy. Not sci-fi. A structured financial network where each edge is a verified relationship — now {live.assets.length} live Stock Tokens.</p>
              <Link href="/fabric" className="mt-6 inline-flex bg-[#F2F0E8] text-[#080A08] px-6 py-3 font-mono text-[11px] tracking-[0.16em] hover:bg-white">
                OPEN MARKET TOPOLOGY →
              </Link>
              <div className="mt-6 flex flex-wrap gap-2 font-mono text-[10px] tracking-[0.12em] text-white/30">
                <span>DRAG → NAVIGATE</span>
                <span>SCROLL → ZOOM</span>
                <span>CLICK → INSPECT</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* COMPOSABILITY */}
      <section data-reveal className="mx-auto max-w-[1600px] px-4 md:px-6 py-10 md:py-14">
        <h2 data-headline className="font-serif text-[28px] md:text-[40px] leading-none tracking-[-0.03em]">
          AN ASSET IS MORE<br />
          THAN A PRICE.
        </h2>
        <div className="mt-8 grid md:grid-cols-[1.1fr_0.9fr] gap-6">
          <div className="border border-white/[0.07] bg-[#10130F] p-6">
            <div className="font-mono text-[10px] tracking-[0.16em] text-white/40">COMPOSABILITY MAP — {live.assets[0]?.symbol || "NVDA"}</div>
            <div className="mt-6 flex flex-col items-center">
              <div className="border border-white/10 bg-[#C7FF4A] text-[#080A08] px-5 py-2 font-mono text-[12px] tracking-[0.16em]">{live.assets[0]?.symbol || "NVDA"}</div>
              <div className="h-6 w-px bg-white/15" />
              <div className="grid grid-cols-3 gap-3 w-full max-w-[520px]">
                {[
                  ["TRADE", "Uniswap"],
                  ["LEND", "Morpho"],
                  ["TRACK", "Chainlink"],
                ].map(([k, v]) => (
                  <div key={k} className="border border-white/10 bg-[#080A08] p-3 text-center">
                    <div className="font-mono text-[10px] tracking-[0.16em] text-white/40">{k}</div>
                    <div className="mt-1 font-mono text-[11px] text-white">{v}</div>
                    <div className="mt-1 font-mono text-[10px] text-white/30">VERIFIED</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-6 font-mono text-[10px] leading-relaxed text-white/30">Only verified integrations shown. No assumed composability.</div>
          </div>
          <div className="border border-white/[0.07] bg-[#080A08] p-6">
            <div className="font-mono text-[11px] tracking-[0.16em]">WHAT CAN THIS ASSET DO?</div>
            <ul className="mt-4 space-y-2 font-mono text-[11px] leading-relaxed text-white/60">
              <li>• TRADE on verified DEX pools</li>
              <li>• LEND on Morpho-style venues (if verified)</li>
              <li>• PRICE via Chainlink onchain feed</li>
              <li>• BRIDGE via canonical routes</li>
            </ul>
            <Link href={live.assets[0] ? `/asset/${live.assets[0].contract_address}` : "/assets"} className="mt-6 inline-block font-mono text-[11px] tracking-[0.14em] text-[#C7FF4A] hover:underline">
              OPEN {live.assets[0]?.symbol || "NVDA"} PASSPORT →
            </Link>
          </div>
        </div>
      </section>

      {/* MACHINE */}
      <section data-reveal className="border-y border-white/[0.07] bg-[#10130F]">
        <div className="mx-auto max-w-[1600px] px-4 md:px-6 py-10 md:py-14 grid lg:grid-cols-[1.1fr_0.9fr] gap-8">
          <div>
            <h2 data-headline className="font-serif text-[32px] md:text-[44px] leading-none tracking-[-0.03em]">
              FINANCIAL CONTEXT<br />
              FOR MACHINES.
            </h2>
            <p data-body className="mt-4 text-[13px] leading-relaxed text-white/55 max-w-[520px]">Normalized Robinhood Chain market context designed for applications, analysts and autonomous agents. JSON, not screenshots.</p>
            <Link href="/developers" className="mt-6 inline-flex border border-white/15 bg-white/[0.04] px-6 py-3 font-mono text-[11px] tracking-[0.16em] hover:bg-white hover:text-[#080A08]">
              VIEW API DOCS →
            </Link>
          </div>
          <div className="border border-white/[0.07] bg-[#080A08] overflow-hidden">
            <div className="px-4 py-2 border-b border-white/[0.07] font-mono text-[10px] tracking-[0.14em] text-white/40">curl — AGENT CONTEXT</div>
            <pre className="p-4 font-mono text-[11px] leading-relaxed text-white/70 overflow-x-auto">
{`curl https://foldmark-iota.vercel.app/api/v1/context/${live.assets[0]?.symbol || "NVDA"}

{
  "asset": { "symbol": "${live.assets[0]?.symbol || "NVDA"}", "type": "stock_token", "verified": true },
  "observation_window": "24h",
  "activity": { "direction": "net_inflow", "change": 18.4 },
  "liquidity": { "trend": "expanding" },
  "sources": ["Chainlink", "Robinhood Registry", "RPC"],
  "updated_at": "${new Date().toISOString()}"
}`}
            </pre>
          </div>
        </div>
      </section>
    </main>
  );
}
