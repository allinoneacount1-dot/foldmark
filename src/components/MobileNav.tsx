"use client";
import { useState } from "react";

const LINKS: [string, string][] = [
  ["OVERVIEW", "/"],
  ["FABRIC", "/fabric"],
  ["FLOWS", "/flows"],
  ["ASSETS", "/assets"],
  ["PROTOCOLS", "/protocols"],
  ["WALLETS", "/wallets"],
  ["DEVELOPERS", "/developers"],
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden">
      <button
        aria-label="Menu"
        onClick={() => setOpen(!open)}
        className="h-9 w-9 grid place-items-center border border-white/10 text-white/70 hover:text-white hover:border-white/20"
      >
        <span className="font-mono text-[14px]">{open ? "✕" : "≡"}</span>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-[52px] z-50 border-b border-white/[0.07] bg-[#080A08]/95 backdrop-blur-xl">
          <nav className="mx-auto max-w-[1600px] px-4 py-3 flex flex-col gap-1 font-mono text-[11px] tracking-[0.14em]">
            {LINKS.map(([label, href]) => (
              <a key={label} href={href} onClick={() => setOpen(false)} className="px-3 py-2.5 text-white/60 hover:text-white hover:bg-white/[0.06]">
                {label}
              </a>
            ))}
            <a href="/search" className="px-3 py-2.5 text-white/40 border-t border-white/[0.06] mt-1">⌘ K SEARCH</a>
          </nav>
        </div>
      )}
    </div>
  );
}
