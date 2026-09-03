"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAccount, useConnect, useDisconnect, useSwitchChain, useEnsName } from "wagmi";
import { robinhoodChain } from "@/lib/wagmi";
import { shortAddress } from "@/lib/format";
import { IconClose, IconWallet } from "@/components/icons";

/**
 * Wallet connection. The wagmi wiring is unchanged from the working
 * implementation — this is presentation plus dialog semantics.
 */
export function ConnectButton() {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { data: ensName } = useEnsName({ address, chainId: 1 });
  const [showModal, setShowModal] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!showModal) return;
    restoreTo.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowModal(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      restoreTo.current?.focus?.();
    };
  }, [showModal]);

  const isWrongChain = isConnected && chain?.id !== robinhoodChain.id;

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-1.5">
        <Link
          href={`/wallet/${address}`}
          className="flex h-8 items-center gap-2 border border-rule px-2.5 font-mono text-label-s uppercase tracking-[0.14em] text-ink m-fast hover:border-rule-strong"
        >
          <IconWallet size={13} className="text-signal" />
          <span className="tabular">{ensName || shortAddress(address)}</span>
        </Link>

        {isWrongChain ? (
          <button
            type="button"
            onClick={() => switchChain({ chainId: robinhoodChain.id })}
            disabled={isSwitching}
            className="on-signal h-8 border border-signal bg-signal px-2.5 font-mono text-label-s uppercase tracking-[0.14em] text-void m-fast hover:bg-ink hover:border-ink disabled:opacity-50"
          >
            {isSwitching ? "SWITCHING…" : `SWITCH TO ${robinhoodChain.id}`}
          </button>
        ) : (
          <span className="hidden h-8 items-center gap-1.5 border border-rule px-2.5 font-mono text-label-s uppercase tracking-[0.14em] text-ink-dim md:flex">
            <span aria-hidden className="h-1 w-1 bg-signal" />
            {chain?.name ?? "UNKNOWN"}
          </span>
        )}

        <button
          type="button"
          onClick={() => disconnect()}
          aria-label="Disconnect wallet"
          className="hidden h-8 items-center border border-rule px-2.5 font-mono text-label-s uppercase tracking-[0.14em] text-ink-dim m-fast hover:border-rule-strong hover:text-ink sm:flex"
        >
          DISCONNECT
        </button>
      </div>
    );
  }

  const injected = connectors.find((c) => c.id === "injected") ?? connectors[0];

  return (
    <>
      <button
        type="button"
        onClick={() => (injected ? connect({ connector: injected }) : setShowModal(true))}
        disabled={isPending}
        className="h-8 border border-rule-strong px-3 font-mono text-label-s uppercase tracking-[0.16em] text-ink m-fast hover:bg-ink hover:text-void disabled:opacity-40"
      >
        {isPending ? "CONNECTING…" : "CONNECT"}
      </button>

      {showModal ? (
        <div
          className="fixed inset-0 z-[70] grid place-items-center bg-void/80 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowModal(false);
          }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="connect-title" className="w-full max-w-[420px] border border-rule-strong bg-surface">
            <div className="flex items-center justify-between border-b border-rule px-4 py-3">
              <h2 id="connect-title" className="label text-ink">
                CONNECT WALLET
              </h2>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setShowModal(false)}
                aria-label="Close"
                className="p-1 text-ink-faint m-fast hover:text-ink"
              >
                <IconClose size={14} />
              </button>
            </div>
            <div className="flex flex-col">
              {connectors.map((c) => (
                <button
                  key={c.uid}
                  type="button"
                  onClick={() => {
                    connect({ connector: c });
                    setShowModal(false);
                  }}
                  className="flex items-center justify-between border-b border-rule-faint px-4 py-3.5 text-left font-mono text-data text-ink m-fast hover:bg-raised"
                >
                  <span>{c.name}</span>
                  <span className="font-mono text-label-s uppercase tracking-[0.14em] text-ink-faint">{c.id}</span>
                </button>
              ))}
            </div>
            <p className="px-4 py-3 text-body-s text-ink-muted">
              EVM wallets and Robinhood Wallet via the injected provider. FOLDMARK never requests a seed phrase and is
              read-only until you sign.
            </p>
            {error ? (
              <p className="border-t border-negative/30 bg-negative/10 px-4 py-2.5 font-mono text-data-s text-negative">
                {error.message.slice(0, 160)}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
