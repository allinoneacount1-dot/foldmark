import { Panel, PanelHeader, EmptyState, Methodology } from "@/components/ui/primitives";
import { IconSource } from "@/components/icons";
import { compact, relativeTime } from "@/lib/format";
import type { MarketSnapshot } from "@/server/market-data/types";
import type { Freshness } from "@/server/market-data/types";
import type { DataState } from "@/lib/data-state";
import { CHAIN } from "@/config/site";

/**
 * The data-source inspector.
 *
 * A price on its own is a rumour. This shows the number, which source produced
 * it, how old it is, how deep the venue behind it was, and every other quote
 * that was considered — including the ones that disagreed.
 */

const FRESHNESS_STATE: Record<Freshness, DataState> = {
  LIVE: "OK",
  NEAR_REALTIME: "OK",
  CACHED: "PARTIAL",
  STALE: "STALE",
  UNAVAILABLE: "UNAVAILABLE",
};

const PRICE_TYPE_LABEL: Record<string, string> = {
  REFERENCE: "ISSUER REFERENCE",
  ORACLE: "ON-CHAIN ORACLE",
  DEX_SPOT: "DEX SPOT",
  AGGREGATED: "AGGREGATE",
};

export function MarketPanel({
  snapshot,
  symbol,
  now,
}: {
  snapshot: MarketSnapshot | null;
  symbol: string;
  now: number;
}) {
  if (!snapshot?.canonical) {
    return (
      <Panel>
        <PanelHeader title="MARKET PRICE" meta={symbol} state="UNAVAILABLE" />
        <EmptyState
          state="UNAVAILABLE"
          title="No source quoted this asset"
          detail={`No market source returned a usable price for this contract on chain ${CHAIN.id}. Nothing is estimated in its place.`}
        />
      </Panel>
    );
  }

  const c = snapshot.canonical;
  const others = snapshot.observations.filter((o) => o.source !== c.source || o.priceType !== c.priceType);

  return (
    <Panel>
      <PanelHeader title="MARKET PRICE" meta={symbol} state={FRESHNESS_STATE[c.freshness]} />

      <div className="border-b border-rule px-4 py-4">
        <p className="tabular font-mono text-[1.75rem] leading-none text-ink">${compact(c.price, 4)}</p>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="label-s">{PRICE_TYPE_LABEL[c.priceType] ?? c.priceType}</span>
          <span className="label-s flex items-center gap-1.5 text-ink-muted">
            <IconSource size={10} />
            {c.source.toUpperCase()}
          </span>
          <span className="label-s text-ink-faint">OBSERVED {relativeTime(c.observedAt, now)}</span>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-px bg-rule">
        <div className="bg-surface px-4 py-3">
          <dt className="label-s">POOL RESERVE</dt>
          <dd className="tabular mt-1 font-mono text-data text-ink">
            {c.liquidityUsd ? `$${compact(c.liquidityUsd)}` : "—"}
          </dd>
        </div>
        <div className="bg-surface px-4 py-3">
          <dt className="label-s">CONFIDENCE</dt>
          <dd className="tabular mt-1 font-mono text-data text-ink">{c.confidence.toFixed(2)}</dd>
        </div>
      </dl>

      {others.length ? (
        <div className="border-t border-rule">
          <p className="label-s px-4 pt-3">OTHER SOURCES</p>
          <ul className="px-4 pb-3">
            {others.map((o) => (
              <li
                key={`${o.source}-${o.priceType}`}
                className="flex items-baseline justify-between gap-3 border-b border-rule-faint py-2 last:border-b-0"
              >
                <span className="label-s text-ink-muted">{o.source.toUpperCase()}</span>
                <span className="tabular font-mono text-data-s text-ink">${compact(o.price, 4)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {snapshot.divergence ? (
        <div className="border-t border-rule px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="label-s text-ink">SOURCE DIVERGENCE</span>
            <span className="tabular font-mono text-data text-negative">
              {snapshot.divergence.spreadPct.toFixed(2)}%
            </span>
          </div>
          <p className="mt-1.5 text-body-s text-ink-muted">
            {snapshot.divergence.lowest.source.toUpperCase()} quotes ${compact(snapshot.divergence.lowest.price, 4)} while{" "}
            {snapshot.divergence.highest.source.toUpperCase()} quotes ${compact(snapshot.divergence.highest.price, 4)}.
            That is an observation about venues, not an arbitrage claim — execution and depth at size are not modelled.
          </p>
        </div>
      ) : null}

      <Methodology label="HOW THIS PRICE WAS CHOSEN">{snapshot.methodology}</Methodology>
    </Panel>
  );
}

/** A compact price with its source, for a tape or a header row. */
export function PriceWithSource({ snapshot, now }: { snapshot: MarketSnapshot | null; now: number }) {
  if (!snapshot?.canonical) {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="label-s">PRICE</span>
        <span className="font-mono text-data uppercase tracking-[0.14em] text-ink-faint">DATA UNAVAILABLE</span>
      </div>
    );
  }
  const c = snapshot.canonical;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="label-s">PRICE</span>
      <span className="tabular font-mono text-data text-ink">${compact(c.price, 4)}</span>
      <span className="label-s text-ink-faint">
        {c.source.toUpperCase()} · {relativeTime(c.observedAt, now)}
      </span>
    </div>
  );
}
