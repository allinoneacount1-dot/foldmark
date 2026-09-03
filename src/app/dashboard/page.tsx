import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Shell, Split, RailColumn, PageHead } from "@/components/layout/Frame";
import { Tape, TapeCell, TapeStatic } from "@/components/ui/Tape";
import { Figure } from "@/components/ui/Figure";
import {
  Panel,
  PanelHeader,
  EmptyState,
  Methodology,
  StateTag,
  AbsentValue,
  CoverageNote,
} from "@/components/ui/primitives";
import { ChipLink, ChipGroup } from "@/components/ui/controls";
import { MarketChart } from "@/components/charts/MarketChart";
import { TopologyView } from "@/components/graph/TopologyView";
import {
  CapitalFlowModule,
  NetworkActivityModule,
  TopFlowsModule,
  StructureChangeModule,
  EventLedger,
} from "@/components/intelligence/rail";
import {
  getAssets,
  getIndexerStatus,
  getWindowActivity,
  getRecentTransfers,
  getStructureChange,
  getLatestPrices,
  countRows,
  foldByAsset,
  foldEdges,
  requestNow,
} from "@/lib/queries";
import { buildMarketGraph } from "@/lib/graph";
import { measured, indexing, withFreshness, hasValue, type DataState } from "@/lib/data-state";
import { present, isAbsent, type Surface } from "@/lib/presentation-state";
import { blockLabel, compact, integer, relativeTime, utcClock } from "@/lib/format";
import { WINDOWS, ASSET_TYPE_LABEL, type FlowWindow, CHAIN } from "@/config/site";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Live market intelligence for Robinhood Chain: price, capital flow, network activity and market structure read together.",
};

export const revalidate = 30;

/**
 * The dashboard.
 *
 * Two kinds of fact share this page and they must never be confused with each
 * other. The chain link is read over RPC and does not depend on storage, so
 * chain id, chain head and the time that head was read are real on every render
 * and are presented as measured. Everything folded out of indexed transfers —
 * assets, flow, activity, structure — depends on the index, and when the index
 * has not reached it the slot holds an em dash and says, in the reader's terms,
 * what is being waited on.
 *
 * The layout does not collapse when the second kind is missing. A dashboard
 * that drops its chart, its rail and its ledger the moment there is nothing to
 * put in them reads as broken; one that keeps its structure and labels the
 * empty slots reads as an instrument that has not been fed yet. Every pending
 * region here is designed rather than absent, and not one of them contains a
 * figure that was not measured.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string; asset?: string }>;
}) {
  const params = await searchParams;
  const window: FlowWindow = (WINDOWS as readonly string[]).includes(params.w ?? "") ? (params.w as FlowWindow) : "24H";
  const now = await requestNow();

  const [indexer, assetsResult, activity, recent, structure, assetCount] = await Promise.all([
    getIndexerStatus(),
    getAssets(),
    getWindowActivity(window, now),
    getRecentTransfers(24),
    getStructureChange(window, now),
    countRows("assets"),
  ]);

  const assets = assetsResult.rows;
  const activityByAsset = foldByAsset(activity.rows, assets, window, now);
  const edges = foldEdges(activity.rows, assets, 10);
  const graph = buildMarketGraph(activity.rows, assets, { limitAddresses: 7, limitAssets: 7 });
  const prices = await getLatestPrices(assets.map((a) => a.id));

  // the charted asset: an explicit choice, else the most active, else the first indexed
  const ranked = [...assets].sort(
    (a, b) => (activityByAsset.get(b.id)?.transfers ?? 0) - (activityByAsset.get(a.id)?.transfers ?? 0),
  );
  const selected =
    assets.find((a) => a.contract_address.toLowerCase() === (params.asset ?? "").toLowerCase()) ?? ranked[0] ?? null;
  const selectedActivity = selected ? activityByAsset.get(selected.id) : undefined;
  const selectedPrice = selected ? prices.get(selected.id) : undefined;

  /**
   * The chain link. Read over RPC, independent of the database, so it is a real
   * measurement on a deployment that has no storage at all — which is exactly
   * why it is the first thing on the page and the only thing wearing the signal
   * colour. It is the difference between a product that is waiting and one that
   * is broken.
   */
  const link = indexer.chainHead;
  const linkLive = hasValue(link);

  /** No price row for an asset is a price not yet observed, not a price of zero. */
  const priceState: DataState = selectedPrice
    ? "OK"
    : assetsResult.state === "UNAVAILABLE"
      ? "UNAVAILABLE"
      : "INDEXING";

  const registry = present(assetsResult.state, "registry");
  const drawn = graph.nodes.length > 0;

  /**
   * A window whose state is not absent was genuinely covered, so its counts are
   * measurements even when they are zero. When it is absent there is no count
   * to report and the layer holds a dash — never a nought standing in for one.
   */
  const windowMeasured = !isAbsent(activity.state);

  const qs = (next: Partial<{ w: string; asset: string }>) => {
    const sp = new URLSearchParams();
    sp.set("w", next.w ?? window);
    const asset = next.asset ?? selected?.contract_address;
    if (asset) sp.set("asset", asset);
    return `/dashboard?${sp.toString()}`;
  };

  return (
    <>
      <style>{DASHBOARD_CSS}</style>

      <Shell>
        <div className="band-dense">
          <PageHead
            kicker={`MARKET INTELLIGENCE · CHAIN ${CHAIN.id}`}
            title="Dashboard"
            lede="Price, capital flow, network activity and market structure for Robinhood Chain, read in one place. The chain link is measured live over RPC; every other figure is computed from indexed chain data, or says what it is still waiting on."
            aside={
              <ChipGroup label="Window">
                {WINDOWS.map((w) => (
                  <ChipLink key={w} href={qs({ w })} active={w === window}>
                    {w}
                  </ChipLink>
                ))}
              </ChipGroup>
            }
          />

          {activity.coverageNote ? (
            <div className="mt-6 border border-rule">
              <CoverageNote note={activity.coverageNote} />
            </div>
          ) : null}
        </div>
      </Shell>

      {/* ---- the tape: chain facts first, index facts after ----------------- */}
      <Tape label="Chain link and index state">
        <TapeStatic label="CHAIN" value={`${CHAIN.id} · ${CHAIN.name.toUpperCase()}`} />
        <TapeCell
          label="CHAIN HEAD"
          measurement={link}
          format={(v) => blockLabel(Number(v))}
          surface="network"
          emphasis={linkLive}
        />
        {linkLive ? <TapeStatic label="HEAD READ" value={relativeTime(link.observedAt, now)} /> : null}
        <TapeStatic label="SESSION" value={utcClock(new Date(now).toISOString())} />
        <TapeCell
          label="INDEXED TO"
          measurement={withFreshness(indexer.lastProcessedBlock, now)}
          format={(v) => blockLabel(Number(v))}
          surface="activity"
        />
        <TapeCell
          label="LAG"
          measurement={indexer.lagBlocks}
          format={(v) => integer(Number(v))}
          unit="BLOCKS"
          surface="activity"
        />
        <TapeCell
          label="ASSETS OBSERVED"
          measurement={assetCount}
          format={(v) => integer(Number(v))}
          surface="registry"
        />
        <TapeCell
          label={`TRANSFERS ${window}`}
          measurement={
            activity.transfers > 0
              ? measured(activity.transfers, { source: "FOLDMARK indexer" }, { observedAt: indexer.updatedAt })
              : indexing<number>({ source: "FOLDMARK indexer" })
          }
          format={(v) => integer(Number(v))}
          surface="flow"
        />
        <TapeCell
          label="ACTIVE ADDRESSES"
          measurement={
            activity.activeAddresses > 0
              ? measured(activity.activeAddresses, { source: "FOLDMARK indexer" }, { observedAt: indexer.updatedAt })
              : indexing<number>({ source: "FOLDMARK indexer" })
          }
          format={(v) => integer(Number(v))}
          surface="activity"
        />
      </Tape>

      {/* ---- workspace: layers, chart + intelligence rail -------------------- */}
      <Shell>
        <div className="band-dense">
          {/* What is being observed, layer by layer. The one live layer carries
              a real block number; the rest carry a dash and their own sentence,
              so the reader learns the shape of the product from its empty state
              rather than reading a column of the same word. */}
          <section aria-label="Observation layers" className="mb-8 border border-rule">
            <header className="flex items-center justify-between gap-3 border-b border-rule px-4 py-2.5">
              <h2 className="label text-ink">OBSERVATION LAYERS</h2>
              <Link href="/docs/status" className="label-s text-ink-faint m-fast hover:text-ink">
                PIPELINE STATUS →
              </Link>
            </header>
            <div className="grid grid-cols-1 gap-px bg-rule sm:grid-cols-2 xl:grid-cols-4">
              <Layer
                title="CHAIN LINK"
                state={link.state}
                surface="network"
                tone="signal"
                value={linkLive ? blockLabel(link.value) : null}
                foot={
                  linkLive
                    ? `${link.provenance.source} · READ ${relativeTime(link.observedAt, now)}`
                    : undefined
                }
              />
              <Layer
                title="ASSET REGISTRY"
                state={assetCount.state}
                surface="registry"
                value={hasValue(assetCount) ? `${integer(assetCount.value)} INDEXED` : null}
              />
              <Layer
                title="CAPITAL FLOW"
                state={activity.state}
                surface="flow"
                value={windowMeasured ? `${integer(activity.transfers)} TRANSFERS` : null}
              />
              <Layer
                title="MARKET STRUCTURE"
                state={activity.state}
                surface="topology"
                value={windowMeasured ? `${integer(graph.shown.nodes)} NODES` : null}
              />
            </div>
          </section>

          {/* The identity row keeps its shape whether or not an asset resolved:
              same grid, same four measurements, dashes where the observations
              are not there yet. */}
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-4">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
              {selected ? (
                <>
                  <h2 className="font-display text-[1.75rem] leading-none tracking-[-0.02em] text-ink">
                    {selected.symbol}
                  </h2>
                  <span className="label-s">{ASSET_TYPE_LABEL[selected.asset_type] ?? selected.asset_type}</span>
                  <span className="truncate text-body-s text-ink-muted">{selected.name}</span>
                  {selected.verified ? <StateTag state="OK" label="VERIFIED CONTRACT" /> : null}
                </>
              ) : (
                <>
                  <h2 className="font-display text-[1.75rem] leading-none tracking-[-0.02em] text-ink">
                    {registry.headline}
                  </h2>
                  <StateTag state={assetsResult.state} surface="registry" />
                  <span className="max-w-[46ch] text-body-s text-ink-muted">{registry.detail}</span>
                </>
              )}
            </div>
            <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
              <Stat
                label="PRICE"
                value={selectedPrice ? compact(selectedPrice.price, 4) : null}
                state={priceState}
                surface="price"
              />
              <Stat
                label={`${window} TRANSFERS`}
                value={selectedActivity ? integer(selectedActivity.transfers) : null}
                state={activity.state}
                surface="activity"
              />
              <Stat
                label={`${window} GROSS VOLUME`}
                value={selectedActivity ? compact(selectedActivity.volume) : null}
                state={activity.state}
                surface="flow"
              />
              <Stat
                label="COUNTERPARTIES"
                value={selectedActivity ? integer(selectedActivity.counterparties) : null}
                state={activity.state}
                surface="activity"
              />
            </dl>
          </div>

          {ranked.length > 1 ? (
            <div className="mb-4">
              <ChipGroup label="Asset">
                {ranked.slice(0, 12).map((a) => (
                  <ChipLink
                    key={a.contract_address}
                    href={qs({ asset: a.contract_address })}
                    active={a.id === selected?.id}
                    count={activityByAsset.get(a.id)?.transfers}
                  >
                    {a.symbol}
                  </ChipLink>
                ))}
              </ChipGroup>
            </div>
          ) : null}

          <Split
            ratio="rail"
            gap="gap-6"
            align="stretch"
            left={
              selected ? (
                <MarketChart contract={selected.contract_address} symbol={selected.symbol} height={420} />
              ) : (
                <PendingPlane state={priceState} minHeight={420} />
              )
            }
            right={
              <RailColumn revision={`${window}:${selected?.contract_address ?? "none"}`}>
                <CapitalFlowModule window={window} activity={activity} edges={edges} assets={assets} />
                <NetworkActivityModule window={window} activity={activity} />
                <TopFlowsModule edges={edges} assets={assets} window={window} state={activity.state} />
                <StructureChangeModule change={structure} window={window} />
              </RailColumn>
            }
          />
        </div>
      </Shell>

      {/* ---- topology ------------------------------------------------------ */}
      <Shell>
        <div className="band-signature">
          <Figure
            index="01"
            caption={
              drawn ? (
                <>
                  Market topology over {window} — {integer(graph.shown.nodes)} nodes and {integer(graph.shown.edges)}{" "}
                  relationships drawn from {integer(graph.totals.transfers)} observed transfers.
                </>
              ) : (
                <>
                  Market topology over {window} — a node for every address and asset observed moving value, an edge for
                  every transfer between two of them.
                </>
              )
            }
            provenance="ROBINHOOD CHAIN RPC · ERC-20 TRANSFER LOGS INDEXED BY FOLDMARK"
            aside={
              <span className="flex items-center gap-3">
                {drawn ? null : <StateTag state={activity.state} surface="topology" />}
                <Link href="/fabric" className="label text-ink-muted m-fast hover:text-ink">
                  FULL TOPOLOGY →
                </Link>
              </span>
            }
          >
            <div className="flex h-[26rem] min-h-0">
              <TopologyView graph={graph} state={activity.state} />
            </div>
          </Figure>
          <Methodology>
            Position encodes role: net senders on the left, assets on the centre line, net receivers on the right. Node
            radius is the square root of observed value moved, edge weight is value transferred along that edge. A ring
            marks a node that moved value in the most recent indexed block. Nothing is placed randomly and no node exists
            without an observed transfer behind it.
          </Methodology>
        </div>
      </Shell>

      {/* ---- events -------------------------------------------------------- */}
      <Shell>
        <div className="band-dense">
          <Split
            ratio="7:5"
            gap="gap-6"
            left={<EventLedger rows={recent.rows} assets={assets} state={recent.state} now={now} />}
            right={
              <Panel>
                <PanelHeader title="ACTIVE ASSETS" meta={window} state={assetsResult.state} surface="registry" />
                {ranked.length ? (
                  <ol>
                    {ranked.slice(0, 8).map((a) => {
                      const act = activityByAsset.get(a.id);
                      return (
                        <li key={a.id}>
                          <Link
                            href={`/assets/${a.contract_address}`}
                            className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-4 border-b border-rule-faint px-4 py-3 m-fast last:border-b-0 hover:bg-raised"
                          >
                            <span className="truncate font-mono text-data text-ink">
                              {a.symbol}
                              <span className="ml-2 text-ink-faint">{ASSET_TYPE_LABEL[a.asset_type] ?? a.asset_type}</span>
                            </span>
                            <span className="tabular font-mono text-data-s text-ink-muted">
                              {act ? `${integer(act.transfers)} TX` : "—"}
                            </span>
                            <span className="tabular font-mono text-data-s text-ink-muted">
                              {act ? compact(act.volume) : "—"}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <EmptyState state={assetsResult.state} surface="registry" />
                )}
              </Panel>
            }
          />
        </div>
      </Shell>
    </>
  );
}

/* ------------------------------------------------------------------ parts */

/**
 * One measurement in the identity row.
 *
 * A real value prints; anything else prints the em dash and its own sentence
 * through AbsentValue. There is deliberately no third branch: nothing here can
 * put a figure in the slot that did not come from a measurement.
 */
function Stat({
  label,
  value,
  state,
  surface,
}: {
  label: string;
  value: string | null;
  state: DataState;
  surface: Surface;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="label-s">{label}</dt>
      <dd>
        {value === null ? (
          <AbsentValue state={state} surface={surface} />
        ) : (
          <span className="tabular font-mono text-data text-ink">{value}</span>
        )}
      </dd>
    </div>
  );
}

/**
 * One layer of the product and its condition.
 *
 * `value` is passed only where something was genuinely measured — in practice
 * the chain head, which is read over RPC and owes nothing to storage. Every
 * other layer resolves to a dash and the sentence its surface writes.
 */
function Layer({
  title,
  state,
  surface,
  value = null,
  tone = "ink",
  foot,
}: {
  title: string;
  state: DataState;
  surface: Surface;
  value?: string | null;
  /** Signal is reserved for the chain link — the one thing being read right now. */
  tone?: "ink" | "signal";
  foot?: ReactNode;
}) {
  const p = present(state, surface);
  const live = value !== null;
  return (
    <div className="flex min-w-0 flex-col gap-2.5 bg-void px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <span className="label-s truncate">{title}</span>
        <StateTag state={state} surface={surface} />
      </div>

      {live ? (
        <p className="flex items-baseline gap-2">
          {tone === "signal" ? <span aria-hidden className="fm-tick h-1.5 w-1.5 shrink-0 bg-signal" /> : null}
          <span
            className={`tabular truncate font-mono text-data-l ${tone === "signal" ? "text-signal" : "text-ink"}`}
          >
            {value}
          </span>
        </p>
      ) : (
        <AbsentValue state={state} surface={surface} />
      )}

      {/* A live layer says where the value came from; a pending one says what it
          is waiting on. Neither sentence is written here — both come from the
          presentation layer or from real provenance. */}
      {live ? null : <p className="text-body-s text-ink-muted">{p.detail}</p>}
      {foot ? <p className="label-s truncate text-ink-faint">{foot}</p> : null}
    </div>
  );
}

/**
 * The chart before there is a series to draw.
 *
 * It draws no axis, no gridline, no candle and no number. What it does keep is
 * the instrument's furniture — the range control, the OHLC readout, the source
 * line — with a dash in every slot, so the region reads as a chart that has not
 * received an observation rather than a rectangle where a chart failed.
 *
 * The only motion is a single scan across the plane. It runs once and stops:
 * a loop beside a market surface would be animating an absence, and continuous
 * horizontal movement is the thing most easily mistaken for a live series.
 */
function PendingPlane({ state, minHeight = 420 }: { state: DataState; minHeight?: number }) {
  const p = present(state, "chart");
  return (
    <section aria-label="Market chart" className="flex flex-col border border-rule bg-void">
      <header className="flex items-center justify-between gap-3 border-b border-rule px-4 py-2.5">
        <span className="label text-ink">MARKET CHART</span>
        <StateTag state={state} surface="chart" />
      </header>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-rule-faint px-4 py-2">
        <span className="label-s text-ink-dim">RANGE</span>
        {WINDOWS.map((w) => (
          <span key={w} className="label-s text-ink-faint">
            {w}
          </span>
        ))}
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-6 py-12"
        style={{ minHeight }}
      >
        <div aria-hidden className="fm-plane-scan absolute inset-0" />
        <CornerMarks />
        <div className="relative flex max-w-[46ch] flex-col items-center gap-3 text-center">
          <p className="m-enter-unmask font-display text-[1.375rem] leading-tight tracking-[-0.02em] text-ink sm:text-[1.625rem]">
            {p.headline}
          </p>
          <p className="m-enter-fade text-body-s text-ink-muted">{p.detail}</p>
        </div>
      </div>

      {/* The readout the chart will carry, with nothing asserted in it. */}
      <div className="grid grid-cols-2 gap-px border-t border-rule bg-rule sm:grid-cols-5">
        {OHLCV.map((field) => (
          <div key={field} className="flex items-baseline justify-between gap-2 bg-void px-4 py-2.5">
            <span className="label-s truncate">{field}</span>
            <span aria-hidden className="shrink-0 font-mono text-data-s text-ink-dim">
              &mdash;
            </span>
          </div>
        ))}
      </div>

      <p className="label-s border-t border-rule px-4 py-2 text-ink-faint">
        SOURCE ROBINHOOD CHAIN RPC · NO SERIES IS DRAWN UNTIL AN OBSERVATION EXISTS
      </p>
    </section>
  );
}

/** The fields a candle carries, named — never filled. */
const OHLCV = ["OPEN", "HIGH", "LOW", "CLOSE", "VOLUME"] as const;

/** Registration marks. A drafting frame, not a card border. */
function CornerMarks() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <span className="absolute left-3 top-3 h-3 w-3 border-l border-t border-rule-strong" />
      <span className="absolute right-3 top-3 h-3 w-3 border-r border-t border-rule-strong" />
      <span className="absolute bottom-3 left-3 h-3 w-3 border-b border-l border-rule-strong" />
      <span className="absolute bottom-3 right-3 h-3 w-3 border-b border-r border-rule-strong" />
    </div>
  );
}

/**
 * Page-local motion.
 *
 * Two gestures only: one bounded scan across an empty plane, and a slow tick on
 * the live layer. Neither encodes a quantity, and the global reduced-motion
 * reset already collapses both to a still frame — restated here so the scan is
 * removed outright rather than flashed.
 */
const DASHBOARD_CSS = `
.fm-plane-scan {
  background-image: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--color-signal) 10%, transparent),
    transparent
  );
  background-size: 160px 100%;
  background-repeat: no-repeat;
  background-position: -200px 0;
  animation: fm-plane-sweep 1800ms var(--ease-inout) 260ms both;
}

.fm-tick {
  animation: fm-tick-blink 2600ms steps(1, end) infinite;
}

@keyframes fm-plane-sweep {
  from { background-position: -200px 0; }
  to { background-position: calc(100% + 200px) 0; }
}

@keyframes fm-tick-blink {
  0%, 62% { opacity: 1; }
  63%, 100% { opacity: 0.25; }
}

@media (prefers-reduced-motion: reduce) {
  .fm-plane-scan { background-image: none; animation: none; }
  .fm-tick { animation: none; opacity: 1; }
}
`;
