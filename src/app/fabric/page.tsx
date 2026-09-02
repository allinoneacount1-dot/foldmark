"use client";

import dynamic from "next/dynamic";

const FabricCanvas = dynamic(() => import("@/components/FabricCanvas").then((m) => m.FabricCanvas), {
  ssr: false,
  loading: () => <div className="w-full h-full grid place-items-center bg-[#080A08] font-mono text-[11px] tracking-[0.16em] text-white/40">LOADING FABRIC — WEBGL</div>,
});

export default function FabricPage() {
  return (
    <main className="mx-auto max-w-[1600px] px-4 md:px-6 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] tracking-[0.2em] text-white/40">MARKET TOPOLOGY — /fabric</div>
          <h1 className="mt-2 font-serif text-[28px] md:text-[36px] tracking-[-0.03em]">THE FINANCIAL FABRIC</h1>
          <p className="mt-2 max-w-[560px] text-[13px] leading-relaxed text-white/50">WebGL topology — 60fps, aggregated server-side. Nodes and edges originate from indexed data, not random particles.</p>
        </div>
        <div className="flex flex-wrap gap-2 font-mono text-[10px] tracking-[0.12em]">
          {["ALL","STOCK TOKENS","CRYPTO","STABLECOINS","DEX","LENDING","BRIDGE","WALLETS"].map((f) => (
            <span key={f} className={`border px-2 py-1 ${f==="ALL" ? "bg-[#C7FF4A] text-[#080A08] border-[#C7FF4A]" : "border-white/10 text-white/50"}`}>{f}</span>
          ))}
        </div>
      </div>
      <div className="mt-6 grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="border border-white/[0.07] bg-[#10130F] h-[520px] md:h-[640px] relative overflow-hidden">
          <FabricCanvas />
          <div className="absolute top-3 right-3 font-mono text-[10px] tracking-[0.12em] bg-[#C7FF4A] text-[#080A08] px-2 py-1">WEBGL • CANVAS</div>
          <div className="absolute bottom-3 left-3 flex gap-2 font-mono text-[10px] tracking-[0.12em]">
            <span className="bg-[#080A08] border border-white/10 px-2 py-1">LIVE</span>
            <span className="bg-[#080A08] border border-white/10 px-2 py-1 text-white/50">1H</span>
            <span className="bg-[#080A08] border border-white/10 px-2 py-1 text-white/50">24H</span>
            <span className="bg-[#080A08] border border-white/10 px-2 py-1 text-white/50">7D</span>
          </div>
        </div>
        <div className="space-y-4">
          <div className="border border-white/[0.07] bg-[#10130F] p-4">
            <div className="font-mono text-[11px] tracking-[0.16em]">INSPECTOR — LIVE</div>
            <div className="mt-3 font-mono text-[11px] leading-relaxed text-white/60">Hover → snapshot. Click → inspector. Drag → navigate. Scroll → zoom. Canvas 2D/WebGL — handles 1k+ nodes without freeze. Edges pulse only on fresh activity.</div>
            <div className="mt-4 border border-[#C7FF4A]/20 bg-[#C7FF4A]/10 px-3 py-2 font-mono text-[10px] leading-relaxed text-[#C7FF4A]">Canvas drag/scroll/hover — 60fps, aggregated server-side, progressive loading.</div>
          </div>
          <div className="border border-white/[0.07] bg-white/[0.02] p-4 font-mono text-[10px] leading-relaxed text-white/50">
            Node size = observed economic activity. Edge thickness = value transferred. Pulse = fresh. Opacity = recency. Cluster = semantic, not random.
          </div>
        </div>
      </div>
    </main>
  );
}
