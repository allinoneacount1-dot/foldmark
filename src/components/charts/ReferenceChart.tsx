"use client";

import { useEffect, useRef, useState } from "react";
import {
  BENCHMARK_MARKETS,
  DEFAULT_BENCHMARK,
  referenceMarketFor,
  type BenchmarkMarket,
} from "@/config/reference-markets";
import { CHAIN } from "@/config/site";
import { ChartFrame } from "@/components/charts/ChartSurface";

/**
 * The reference market chart.
 *
 * TradingView's Advanced Real-Time Chart, embedded. It carries TradingView's
 * own market data, which means the chart works with no database, no indexer and
 * no price history of our own — a visitor sees a real, interactive instrument
 * from the first page load.
 *
 * WHAT THIS CHART IS, AND IS NOT
 *
 * It is the UNDERLYING instrument's market. A Robinhood Stock Token claims to
 * track something; this shows what that something is doing, sourced and labelled
 * as TradingView's.
 *
 * It is NOT the token's price. A DEX pool on Robinhood Chain and the underlying
 * on NASDAQ are different markets that can and do diverge. So nothing here ever
 * populates DEX SPOT, canonical prices, market state, notional or liquidity —
 * those come only from FOLDMARK's own observation pipeline, and the ONCHAIN tab
 * is where they appear. The separation is the point of having two tabs.
 *
 * The symbol is chosen from an allowlist keyed on contract address
 * (src/config/reference-markets.ts). A token's own name or symbol cannot select
 * an instrument — otherwise anyone could deploy "Apple • Robinhood Token" and
 * borrow Apple's price history for their contract.
 *
 * On latency: TradingView's data status varies by instrument and exchange, and
 * many equity feeds are delayed. The widget renders its own status, and this
 * component does not add a REALTIME claim over the top of it.
 */

type Props = {
  /** Contract address of the asset in view, if any. Selects an allowlisted mapping. */
  contractAddress?: string | null;
  /** Height of the chart body. The widget fills it. */
  height?: number;
  /** Show the benchmark selector when no mapping exists. */
  selectable?: boolean;
  className?: string;
};

const WIDGET_SRC = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";

export function ReferenceChart({ contractAddress, height = 420, selectable = true, className = "" }: Props) {
  const mapped = referenceMarketFor(CHAIN.id, contractAddress ?? null);

  // A mapped asset charts its own underlying and offers no selector — the
  // instrument is not the reader's choice, it is what the mapping says.
  const [benchmark, setBenchmark] = useState<BenchmarkMarket>(DEFAULT_BENCHMARK);
  const active: { symbol: string; displayName: string; market: string } = mapped
    ? { symbol: mapped.tradingViewSymbol, displayName: mapped.displayName, market: mapped.market }
    : { symbol: benchmark.tradingViewSymbol, displayName: benchmark.displayName, market: benchmark.market };

  const hostRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);
  /**
   * Whether the widget has actually put a frame on the page.
   *
   * The script loading is not the same event as the chart appearing, and a
   * blocked embed frequently loads its script and then renders nothing. So the
   * underlay is dismissed by the arrival of the iframe itself, which is the
   * only signal that means a reader is looking at a chart rather than at an
   * empty box.
   */
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // Remount on symbol change: the widget reads its configuration once, from
    // the script tag it was created with.
    host.innerHTML = "";
    setFailed(false);
    setDrawn(false);

    const observer = new MutationObserver(() => {
      if (host.querySelector("iframe")) {
        setDrawn(true);
        observer.disconnect();
      }
    });
    observer.observe(host, { childList: true, subtree: true });

    const container = document.createElement("div");
    container.className = "tradingview-widget-container";
    container.style.height = "100%";
    container.style.width = "100%";

    const target = document.createElement("div");
    target.className = "tradingview-widget-container__widget";
    target.style.height = "100%";
    target.style.width = "100%";
    container.appendChild(target);

    const script = document.createElement("script");
    script.src = WIDGET_SRC;
    script.async = true;
    script.type = "text/javascript";
    script.onerror = () => setFailed(true);
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: active.symbol,
      interval: "60",
      timezone: "Etc/UTC",
      // Matched to FOLDMARK's own surfaces so the widget sits in the page
      // rather than on top of it.
      theme: "dark",
      style: "1", // candles
      locale: "en",
      backgroundColor: "rgba(8, 10, 8, 1)",
      gridColor: "rgba(255, 255, 255, 0.05)",
      hide_top_toolbar: false,
      hide_legend: false,
      allow_symbol_change: false,
      save_image: false,
      calendar: false,
      support_host: "https://www.tradingview.com",
    });

    container.appendChild(script);
    host.appendChild(container);

    return () => {
      observer.disconnect();
      host.innerHTML = "";
    };
  }, [active.symbol]);

  return (
    <div className={`flex flex-col ${className}`}>
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-rule px-4 py-2.5">
        <div className="flex min-w-0 items-baseline gap-3">
          <h3 className="label text-ink">REFERENCE MARKET</h3>
          <span className="label-s truncate text-ink-faint">
            {active.market} · {active.displayName}
          </span>
        </div>
        <span className="label-s shrink-0 text-ink-dim">SOURCE · TRADINGVIEW</span>
      </header>

      {/*
        Only offered when the asset has no mapping of its own. A mapped asset
        charts its underlying and nothing else, so there is nothing to choose.
      */}
      {!mapped && selectable ? (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-rule-faint px-4 py-2">
          {BENCHMARK_MARKETS.map((b) => (
            <button
              key={b.tradingViewSymbol}
              type="button"
              onClick={() => setBenchmark(b)}
              aria-pressed={b.tradingViewSymbol === active.symbol}
              className={`inline-flex h-7 shrink-0 items-center border px-2 font-mono text-label-s uppercase tracking-[0.16em] m-fast ${
                b.tradingViewSymbol === active.symbol
                  ? "border-signal/40 bg-signal/10 text-signal"
                  : "border-rule text-ink-dim hover:border-rule-strong hover:text-ink-muted"
              }`}
            >
              {b.displayName}
            </button>
          ))}
        </div>
      ) : null}

      {/*
        The widget is injected into the host and paints its own opaque
        background over everything beneath it. Until it does — and permanently
        if a network policy or an extension stops it from ever rendering — the
        host is an empty box the height of a chart, sitting on the panel's own
        surface tone: a flat rectangle a reader has no way to interpret. So the
        frame is drawn underneath it and says what it is waiting for. It carries
        no series, no axis figures and no numbers of any kind; it is furniture,
        and the widget covers it the moment it arrives.
      */}
      <div className="relative w-full min-w-0" style={{ height }}>
        {drawn ? null : (
          <>
            <div aria-hidden className="absolute inset-0">
              <ChartFrame />
            </div>
            <div className="pointer-events-none absolute inset-0 flex items-center px-5 sm:px-7" aria-live="polite">
              <div className="flex max-w-[42ch] flex-col items-start gap-2">
                <p className="font-display text-[1.25rem] leading-tight tracking-[-0.02em] text-ink">
                  {active.market} · {active.displayName}
                </p>
                <p className="text-body-s text-ink-muted">
                  {failed
                    ? "The reference chart could not load. It is served by TradingView and may be blocked by a network policy or an extension; FOLDMARK’s own data is unaffected."
                    : "The reference market is served by TradingView and draws itself over this frame."}
                </p>
                <p className="flex items-center gap-2 font-mono text-label-s uppercase tracking-[0.18em] text-ink-dim">
                  <span
                    aria-hidden
                    className={`h-1 w-1 shrink-0 ${failed ? "bg-ink-faint" : "m-receiver bg-signal"}`}
                  />
                  {failed ? "SOURCE — TRADINGVIEW, NO RESPONSE" : "SOURCE — TRADINGVIEW, CONNECTING"}
                </p>
              </div>
            </div>
          </>
        )}
        <div ref={hostRef} className="absolute inset-0 h-full w-full" data-testid="tradingview-host" />
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-rule px-4 py-2">
        <span className="label-s text-ink-faint">
          {mapped ? "MAPPED UNDERLYING" : "BENCHMARK MARKET"} · NOT THE ONCHAIN TOKEN PRICE
        </span>
        <a
          href={`https://www.tradingview.com/symbols/${active.symbol.replace(":", "-")}/`}
          target="_blank"
          rel="noopener noreferrer"
          className="label-s text-ink-dim underline-offset-2 hover:text-ink-muted hover:underline"
        >
          TRADINGVIEW
        </a>
      </footer>

      {/* The failure notice used to live here, under the footer, while the
          chart region above it stayed an empty box. It now reads inside that
          region, where the reader is already looking for the chart. */}
    </div>
  );
}
