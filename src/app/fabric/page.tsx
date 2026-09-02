export default function FabricPage() {
  return (
    <main className="mx-auto max-w-[1600px] px-4 md:px-6 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] tracking-[0.2em] text-white/40">MARKET TOPOLOGY — /fabric</div>
          <h1 className="mt-2 font-serif text-[28px] md:text-[36px] tracking-[-0.03em]">THE FINANCIAL FABRIC</h1>
        </div>
        <div className="flex flex-wrap gap-2 font-mono text-[10px] tracking-[0.12em]">
          {["ALL","STOCK TOKENS","CRYPTO","STABLECOINS","DEX","LENDING","BRIDGE","WALLETS"].map((f) => (
            <span key={f} className={`border px-2 py-1 ${f==="ALL" ? "bg-[#C7FF4A] text-[#080A08] border-[#C7FF4A]" : "border-white/10 text-white/50"}`}>{f}</span>
          ))}
        </div>
      </div>
      <div className="mt-6 grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="border border-white/[0.07] bg-[#10130F] aspect-[1.5/1] md:aspect-[1.8/1] relative overflow-hidden">
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice">
            <g stroke="rgba(242,240,232,0.07)" fill="none" strokeWidth="0.8">
              <path d="M 120 200 L 380 240 L 640 200 L 880 280 L 1060 220" />
              <path d="M 200 380 L 480 360 L 740 400 L 980 360" />
              <path d="M 320 520 L 560 500 L 820 520 L 1020 480" />
              <path d="M 380 240 L 480 360" />
              <path d="M 640 200 L 740 400" />
              <path d="M 880 280 L 980 360" />
            </g>
            <g>
              {[
                [120,200,"NVDA"],["380",240,"AAPL"],["640",200,"TSLA"],["880",280,"UNI"],["1060",220,"USDG"],
                [200,380,"MORPHO"],[480,360,"CHAINLINK"],[740,400,"WALLET"],[980,360,"BRIDGE"],
                [320,520,"AMZN"],[560,500,"MSFT"],[820,520,"LEND"],
              ].map(([x,y,label]) => (
                <g key={`${x}-${y}`}>
                  <circle cx={Number(x)} cy={Number(y)} r="14" fill="#10130F" stroke="rgba(242,240,232,0.14)" />
                  <circle cx={Number(x)} cy={Number(y)} r="3" fill="#F2F0E8" />
                  <text x={Number(x)} y={Number(y)+28} textAnchor="middle" fontFamily="monospace" fontSize="9" fill="rgba(242,240,232,0.6)" letterSpacing="0.08em">{String(label)}</text>
                </g>
              ))}
            </g>
            <g fill="#C7FF4A">
              <circle cx="380" cy="240" r="2"><animate attributeName="opacity" values="1;0.3;1" dur="1.8s" repeatCount="indefinite" /></circle>
              <circle cx="740" cy="400" r="2"><animate attributeName="opacity" values="1;0.3;1" dur="2.1s" repeatCount="indefinite" /></circle>
            </g>
          </svg>
          <div className="absolute bottom-3 left-3 flex gap-2 font-mono text-[10px] tracking-[0.12em]">
            <span className="bg-[#080A08] border border-white/10 px-2 py-1">LIVE</span>
            <span className="bg-[#080A08] border border-white/10 px-2 py-1 text-white/50">1H</span>
            <span className="bg-[#080A08] border border-white/10 px-2 py-1 text-white/50">24H</span>
            <span className="bg-[#080A08] border border-white/10 px-2 py-1 text-white/50">7D</span>
          </div>
          <div className="absolute top-3 right-3 font-mono text-[10px] tracking-[0.12em] bg-[#C7FF4A] text-[#080A08] px-2 py-1">DRAG • SCROLL ZOOM • CLICK INSPECT</div>
        </div>
        <div className="space-y-4">
          <div className="border border-white/[0.07] bg-[#10130F] p-4">
            <div className="font-mono text-[11px] tracking-[0.16em]">INSPECTOR</div>
            <div className="mt-3 font-mono text-[11px] leading-relaxed text-white/60">Hover node → snapshot. Click → inspector. Double-click → isolate network. ESC → global fabric.</div>
            <div className="mt-4 space-y-2 font-mono text-[11px]">
              <div className="flex justify-between border border-white/10 bg-[#080A08] px-3 py-2"><span className="text-white/40">NODE</span><span>— DATA UNAVAILABLE</span></div>
              <div className="flex justify-between border border-white/10 bg-[#080A08] px-3 py-2"><span className="text-white/40">EDGES</span><span className="text-white/30">— INDEXING</span></div>
            </div>
          </div>
          <div className="border border-white/[0.07] bg-white/[0.02] p-4 font-mono text-[10px] leading-relaxed text-white/50">
            Node size = observed economic activity. Edge thickness = value transferred. Pulse = fresh activity. Opacity = recency. Cluster = semantic relationship, not random particles.
          </div>
        </div>
      </div>
    </main>
  );
}
