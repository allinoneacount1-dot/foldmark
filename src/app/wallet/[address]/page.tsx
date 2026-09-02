export default async function WalletDetail({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const isValid = /^0x[a-fA-F0-9]{40}$/.test(address);
  return (
    <main className="mx-auto max-w-[1600px] px-4 md:px-6 py-8">
      <div className="font-mono text-[10px] tracking-[0.16em] text-white/40">WALLET — /wallet/[address]</div>
      <h1 className="mt-2 font-mono text-[18px] tracking-[-0.02em] break-all">{address}</h1>
      {!isValid ? (
        <div className="mt-4 border border-[#E85D4E]/20 bg-[#E85D4E]/10 px-4 py-3 font-mono text-[11px] text-[#E85D4E]">INVALID ADDRESS — must be 0x + 40 hex</div>
      ) : (
        <div className="mt-6 grid md:grid-cols-3 gap-4">
          <div className="border border-white/10 bg-[#10130F] p-4">
            <div className="font-mono text-[11px] tracking-[0.14em]">PORTFOLIO VALUE</div>
            <div className="mt-2 font-mono text-[18px] tabular-nums text-white/30">DATA UNAVAILABLE</div>
            <div className="mt-1 font-mono text-[10px] text-white/30">STOCK TOKENS  — · CRYPTO — · STABLECOINS —</div>
          </div>
          <div className="border border-white/10 bg-[#10130F] p-4">
            <div className="font-mono text-[11px] tracking-[0.14em]">PROTOCOL EXPOSURE</div>
            <div className="mt-2 font-mono text-[11px] text-white/30">INDEXING — waiting for activity classification</div>
          </div>
          <div className="border border-white/10 bg-[#10130F] p-4">
            <div className="font-mono text-[11px] tracking-[0.14em]">CAPITAL MOVEMENT</div>
            <div className="mt-2 font-mono text-[11px] text-white/30">DATA UNAVAILABLE</div>
          </div>
        </div>
      )}
      <div className="mt-6 border border-white/10 bg-white/[0.02] px-4 py-3 font-mono text-[10px] leading-relaxed text-white/40">No login required for public wallet analysis. Portfolio = sum of observed asset exposures. Requires indexer + classified transfers.</div>
    </main>
  );
}
