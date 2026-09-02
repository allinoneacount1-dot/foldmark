"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";

function short(addr: string) {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">
        <a href={`/wallet/${address}`} className="border border-[#C7FF4A] bg-[#C7FF4A]/10 text-[#C7FF4A] px-3 py-1.5 font-mono text-[11px] tracking-[0.12em] hover:bg-[#C7FF4A] hover:text-[#080A08] transition">
          {short(address)}
        </a>
        <button onClick={() => disconnect()} className="border border-white/15 bg-white/[0.04] px-3 py-1.5 font-mono text-[11px] tracking-[0.12em] text-white/60 hover:text-white hover:bg-white/10">
          DISCONNECT
        </button>
      </div>
    );
  }

  const injected = connectors.find((c) => c.id === "injected") || connectors[0];

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => injected && connect({ connector: injected })}
        disabled={isPending || !injected}
        className="bg-[#F2F0E8] text-[#080A08] px-3.5 py-1.5 font-mono text-[11px] tracking-[0.14em] hover:bg-white transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? "CONNECTING…" : "CONNECT"}
      </button>
      {error && <span className="hidden md:inline font-mono text-[10px] text-[#E85D4E]">{error.message.slice(0, 40)}</span>}
    </div>
  );
}
