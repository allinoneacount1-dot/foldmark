"use client";

import { useState } from "react";
import { ReferenceChart } from "@/components/charts/ReferenceChart";
import { MarketChart } from "@/components/charts/MarketChart";
import { referenceMarketFor } from "@/config/reference-markets";
import { CHAIN } from "@/config/site";

/**
 * The chart panel: two markets, never confused for one another.
 *
 *   REFERENCE   the underlying instrument, from TradingView. Works with no
 *               database, no indexer and no price history of our own.
 *   ONCHAIN     what FOLDMARK itself observed on Robinhood Chain — canonical
 *               prices built from venue quotes it fetched and reconciled.
 *
 * These are different markets. A token on a DEX and its underlying on an
 * exchange can diverge for entirely real reasons, and a product that blurred
 * them would be making the most consequential mistake available to it. So they
 * are separate tabs, separately sourced and separately labelled, and the
 * reference feed never writes to FOLDMARK's own price tables.
 *
 * REFERENCE is the default while no onchain series exists — a visitor should
 * always land on a working chart rather than an explanation of why there is
 * not one. Once canonical prices exist, ONCHAIN is what the product is for and
 * becomes the default.
 */

type Tab = "REFERENCE" | "ONCHAIN";

export function MarketChartPanel({
  contract,
  symbol,
  height = 420,
  className = "",
  hasOnchainSeries = false,
}: {
  contract: string;
  symbol: string;
  height?: number;
  className?: string;
  /**
   * Whether FOLDMARK has canonical prices for this asset. When it does, the
   * onchain market is the one worth opening on.
   */
  hasOnchainSeries?: boolean;
}) {
  const initial: Tab = hasOnchainSeries ? "ONCHAIN" : "REFERENCE";
  const [tab, setTab] = useState<Tab>(initial);

  /**
   * Which tabs have ever been opened.
   *
   * A chart is mounted only once its tab has been shown, and then stays
   * mounted. Mounting while hidden is the trap: `hidden` is display:none, an
   * autosizing widget measures its container at mount, and a container with no
   * layout box gives it zero height — the chart then renders as an empty strip
   * even after the tab is opened. Mounting on first view avoids that, and never
   * unmounting avoids the flash of re-creating an expensive widget, which on a
   * price surface would read as data changing.
   */
  const [seen, setSeen] = useState<Set<Tab>>(() => new Set<Tab>([initial]));

  const open = (next: Tab) => {
    setTab(next);
    setSeen((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
  };

  const mapped = referenceMarketFor(CHAIN.id, contract);

  const tabs: { id: Tab; label: string; meta: string }[] = [
    { id: "REFERENCE", label: "REFERENCE", meta: mapped ? mapped.market : "BENCHMARK" },
    { id: "ONCHAIN", label: "ONCHAIN", meta: `CHAIN ${CHAIN.id}` },
  ];

  return (
    <section className={`border border-rule bg-surface ${className}`}>
      <div className="flex items-stretch border-b border-rule">
        {tabs.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => open(t.id)}
              aria-pressed={active}
              className={`flex min-w-0 flex-col gap-0.5 border-r border-rule px-4 py-2.5 text-left m-fast last:border-r-0 ${
                active ? "bg-raised text-ink" : "text-ink-dim hover:text-ink-muted"
              }`}
            >
              <span className="label">{t.label}</span>
              <span className="label-s text-ink-faint">{t.meta}</span>
            </button>
          );
        })}
        <div className="flex flex-1 items-center justify-end px-4">
          <span className="label-s text-ink-faint">
            {tab === "REFERENCE" ? "UNDERLYING INSTRUMENT" : "FOLDMARK OBSERVED"}
          </span>
        </div>
      </div>

      {/*
        Mounted on first view, then kept mounted and merely hidden. Re-creating
        the widget on every tab switch would flash, and a flash on a price
        surface reads as data changing.
      */}
      <div hidden={tab !== "REFERENCE"}>
        {seen.has("REFERENCE") ? <ReferenceChart contractAddress={contract} height={height} /> : null}
      </div>

      <div hidden={tab !== "ONCHAIN"}>
        {seen.has("ONCHAIN") ? <MarketChart contract={contract} symbol={symbol} height={height} /> : null}
      </div>
    </section>
  );
}
