import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { ConnectButton } from "@/components/ConnectButton";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const instrument = Instrument_Serif({ variable: "--font-display", weight: "400", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "FOLDMARK — The Financial Fabric of Robinhood Chain",
  description: "See where capital moves before it becomes obvious. Financial intelligence, asset graph, and capital-flow observatory for Robinhood Chain.",
  metadataBase: new URL("https://foldmark.xyz"),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${instrument.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-[#080A08] text-[#F2F0E8] antialiased">
        <Providers>
          <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#080A08]/80 backdrop-blur-xl">
            <div className="mx-auto max-w-[1600px] flex h-[52px] items-center justify-between px-4 md:px-6">
              <div className="flex items-center gap-8">
                <a href="/" className="flex items-center gap-3">
                  <div className="h-7 w-7 border border-white/10 bg-white/[0.04] grid place-items-center">
                    <span className="h-3 w-3 border border-[#C7FF4A] rotate-45 block" aria-hidden />
                  </div>
                  <span className="font-mono text-[11px] tracking-[0.28em]">FOLDMARK</span>
                  <span className="hidden md:inline font-mono text-[10px] tracking-[0.14em] text-white/40">/ ROBINHOOD CHAIN</span>
                </a>
                <nav className="hidden lg:flex items-center gap-1 text-[11px] tracking-[0.14em] font-mono">
                  {[
                    ["OVERVIEW", "/"],
                    ["FABRIC", "/fabric"],
                    ["FLOWS", "/flows"],
                    ["ASSETS", "/assets"],
                    ["PROTOCOLS", "/protocols"],
                    ["WALLETS", "/wallets"],
                    ["DEVELOPERS", "/developers"],
                  ].map(([label, href]) => (
                    <a key={label} href={href} className="px-2.5 py-1.5 text-white/55 hover:text-white hover:bg-white/[0.06] transition">
                      {label}
                    </a>
                  ))}
                </nav>
              </div>
              <div className="flex items-center gap-2">
                <a href="/search" className="hidden md:inline-flex items-center gap-2 border border-white/10 px-3 py-1.5 font-mono text-[11px] tracking-[0.14em] text-white/60 hover:text-white hover:border-white/15">
                  <span>⌘ K</span>
                  <span className="text-white/30">SEARCH</span>
                </a>
                <ConnectButton />
              </div>
            </div>
          </header>
          <div className="flex-1 flex flex-col">{children}</div>
          <footer className="border-t border-white/[0.07] bg-[#080A08]">
            <div className="mx-auto max-w-[1600px] px-4 md:px-6 py-10">
              <div className="font-serif text-[28px] md:text-[40px] leading-[0.9] tracking-[-0.03em]">
                THE MARKET IS NO LONGER<br />A COLLECTION OF DATABASES.<br />
                <span className="text-white/40">IT IS A NETWORK.</span>
              </div>
              <div className="mt-8 flex flex-wrap gap-6 border-t border-white/[0.07] pt-6 font-mono text-[10px] tracking-[0.14em] text-white/40">
                <span>FOLDMARK / THE FINANCIAL FABRIC OF ROBINHOOD CHAIN</span>
                <span className="ml-auto">NOT AFFILIATED WITH ROBINHOOD MARKETS, INC.</span>
              </div>
              <div className="mt-3 font-mono text-[10px] leading-relaxed text-white/30 max-w-3xl">
                FoldMark is an independent analytics application built on Robinhood Chain and is not affiliated with Robinhood Markets, Inc. Robinhood Chain brand rules respected. Stock Tokens verified via canonical registry only.
              </div>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
