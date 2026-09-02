export default function DevelopersPage() {
  return (
    <main className="mx-auto max-w-[1600px] px-4 md:px-6 py-8">
      <div className="font-mono text-[10px] tracking-[0.2em] text-white/40">MACHINE / AGENT LAYER — /developers</div>
      <h1 className="mt-2 font-serif text-[28px] md:text-[36px] tracking-[-0.03em]">FINANCIAL CONTEXT FOR MACHINES.</h1>
      <p className="mt-3 max-w-[560px] text-[13px] leading-relaxed text-white/55">Normalized Robinhood Chain market context for apps, analysts and autonomous agents. JSON, not screenshots. Every response includes timestamp, window, sources, and completeness.</p>
      <div className="mt-6 grid lg:grid-cols-[1.1fr_0.9fr] gap-6">
        <div className="space-y-4 font-mono text-[11px]">
          {[
            ["GET /api/v1/network", "Network pulse"],
            ["GET /api/v1/assets", "Verified asset registry"],
            ["GET /api/v1/assets/:contract", "Asset passport"],
            ["GET /api/v1/assets/:contract/flows", "Flows per window"],
            ["GET /api/v1/wallets/:address", "Wallet context"],
            ["GET /api/v1/fabric", "Topology graph"],
            ["GET /api/v1/context/:asset", "Agent unified context"],
          ].map(([ep, desc]) => (
            <div key={ep} className="flex justify-between border border-white/10 bg-white/[0.02] px-4 py-3">
              <span className="text-[#C7FF4A]">{ep}</span>
              <span className="text-white/50">{desc}</span>
            </div>
          ))}
        </div>
        <div className="border border-white/[0.07] bg-[#10130F] overflow-hidden">
          <div className="px-4 py-2 border-b border-white/10 font-mono text-[10px] tracking-[0.14em] text-white/40">EXAMPLE — /api/v1/context/NVDA</div>
          <pre className="p-4 font-mono text-[11px] leading-relaxed text-white/70 overflow-x-auto">
{`{
  "asset": { "symbol": "NVDA", "type": "stock_token", "verified": true },
  "observation_window": "24h",
  "activity": { "direction": "net_inflow", "change": 18.4 },
  "liquidity": { "trend": "expanding" },
  "sources": ["Chainlink","Robinhood Registry","RPC"],
  "updated_at": "2026-09-02T10:00:00Z"
}`}
          </pre>
          <div className="px-4 pb-4 flex gap-2">
            <a href="/api/v1/network" className="border border-white/15 px-3 py-1.5 font-mono text-[11px] hover:bg-white hover:text-[#080A08]">TRY LIVE</a>
            <span className="font-mono text-[10px] tracking-[0.12em] text-white/30 self-center">Returns DATA UNAVAILABLE until indexer live — never fake.</span>
          </div>
        </div>
      </div>
    </main>
  );
}
