"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain, useEnsName } from "wagmi";
import { robinhoodChain } from "@/lib/wagmi";
import { useState } from "react";

function short(addr: string) {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

export function ConnectButton() {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { data: ensName } = useEnsName({ address, chainId: 1 });
  const [showModal, setShowModal] = useState(false);

  const isWrongChain = isConnected && chain?.id !== robinhoodChain.id;

  if (isConnected && address) {
    return (
      <>
        <div className="flex items-center gap-2">
          <a href={`/wallet/${address}`} className="hidden md:inline border border-[#C7FF4A] bg-[#C7FF4A]/10 text-[#C7FF4A] px-3 py-1.5 font-mono text-[11px] tracking-[0.12em] hover:bg-[#C7FF4A] hover:text-[#080A08] transition">
            {ensName || short(address)}
          </a>
          <span className={`hidden md:inline-flex items-center gap-1.5 border px-2 py-1 font-mono text-[10px] tracking-[0.12em] ${isWrongChain ? "border-[#E85D4E] text-[#E85D4E] bg-[#E85D4E]/10" : "border-white/10 text-white/40 bg-white/[0.04]"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${isWrongChain ? "bg-[#E85D4E] animate-pulse" : "bg-[#C7FF4A]"}`} />
            {chain?.name || "UNKNOWN"}
          </span>
          {isWrongChain && (
            <button onClick={() => switchChain({ chainId: robinhoodChain.id })} disabled={isSwitching} className="bg-[#C7FF4A] text-[#080A08] px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] hover:bg-[#D8FF7A] disabled:opacity-50">
              {isSwitching ? "SWITCHING…" : "SWITCH TO 4663"}
            </button>
          )}
          <button onClick={() => disconnect()} className="border border-white/15 bg-white/[0.04] px-3 py-1.5 font-mono text-[11px] tracking-[0.12em] text-white/60 hover:text-white hover:bg-white/10">
            DISCONNECT
          </button>
        </div>
        {/* mobile short */}
        <div className="md:hidden font-mono text-[11px] tracking-[0.12em] text-[#C7FF4A]">{short(address)}</div>
      </>
    );
  }

  const injected = connectors.find((c) => c.id === "injected") || connectors[0];

  return (
    <>
      <button
        onClick={() => (injected ? connect({ connector: injected }) : setShowModal(true))}
        disabled={isPending}
        className="bg-[#F2F0E8] text-[#080A08] px-3.5 py-1.5 font-mono text-[11px] tracking-[0.14em] hover:bg-white transition disabled:opacity-50"
      >
        {isPending ? "CONNECTING…" : "CONNECT"}
      </button>
      {showModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowModal(false)}>
          <div className="w-full max-w-[420px] border border-white/10 bg-[#10130F] p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] tracking-[0.16em]">CONNECT WALLET</span>
              <button onClick={() => setShowModal(false)} className="font-mono text-[11px] text-white/40 hover:text-white">✕</button>
            </div>
            <div className="mt-4 space-y-2">
              {connectors.map((c) => (
                <button key={c.id} onClick={() => { connect({ connector: c }); setShowModal(false); }} className="w-full flex justify-between border border-white/10 bg-[#080A08] px-4 py-3 font-mono text-[11px] tracking-[0.12em] hover:bg-white hover:text-[#080A08] text-left">
                  <span>{c.name}</span>
                  <span className="text-white/30">{c.id}</span>
                </button>
              ))}
            </div>
            <div className="mt-4 font-mono text-[10px] leading-relaxed text-white/30">Supports EVM wallets + Robinhood Wallet (injected). No seed ever requested. Read-only until you sign.</div>
            {error && <div className="mt-3 border border-[#E85D4E]/20 bg-[#E85D4E]/10 px-3 py-2 font-mono text-[10px] text-[#E85D4E]">{error.message.slice(0, 120)}</div>}
          </div>
        </div>
      )}
      {error && !showModal && <span className="hidden lg:inline font-mono text-[10px] text-[#E85D4E]">{error.message.slice(0, 32)}</span>}
    </>
  );
}
