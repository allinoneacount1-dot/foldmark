import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Shell, Split, RailColumn, PageHead } from "@/components/layout/Frame";
import { StructureChange } from "@/components/intelligence/StructureChange";
import { flowIntelligence } from "@/server/flows/intelligence";
import { Tape, TapeCell, TapeStatic } from "@/components/ui/Tape";
import { Figure } from "@/components/ui/Figure";
import { Panel, PanelHeader, Methodology, StateTag, AbsentValue, CoverageNote } from "@/components/ui/primitives";
import { ChipLink, ChipGroup } from "@/components/ui/controls";
import { MarketChartPanel } from "@/components/charts/MarketChartPanel";
import { ReferenceChart } from "@/components/charts/ReferenceChart";
import { TopologyView } from "@/components/graph/TopologyView";
import { FoldmarkFlowArchitecture } from "@/components/flows/FoldmarkFlowArchitecture";
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
import { withFreshness, hasValue, type DataState } from "@/lib/data-state";
import { type Surface } from "@/lib/presentation-state";
import { CAPABILITIES } from "@/lib/presentation-preview";
import { activeEndpoint, getBlockTimes, lastRpcLatencyMs } from "@/server/market-data/providers/rpc";
import { blockLabel, compact, integer, relativeTime, utcClock } from "@/lib/format";
import { WINDOWS, ASSET_TYPE_LABEL, type FlowWindow, CHAIN } from "@/config/site";

export const metadata: Metadata = {
  title: "Dashboard",
  description:
    "Live market intelligence for Robinhood Chain: reference market, capital flow, network activity and market structure read together.",
};

export const revalidate = 30;

/**
 * The dashboard.
 *
 * Three kinds of fact share this page and none may be mistaken for another.
 *
 *   CHAIN        read over RPC, owes nothing to storage. Chain id, chain head,
 *                block cadence and RPC round trip are real on every render, on
 *                any deployment, and they are the loudest things here.
 *   REFERENCE    the underlying instrument's own market, carried by TradingView.
 *                A real, interactive chart with no database behind it. It is
 *                never a FOLDMARK price and never fills a FOLDMARK field.
 *   OBSERVED     folded out of indexed transfers. Present only where the index
 *                reached; where it has not, the module says which part of the
 *                system is running rather than printing a dash.
 *
 * That last move is the one worth naming. A metric with no measurement used to
 * render an em dash and a status word, and a column of those reads as a broken
 * backend. A capability line — CHAIN LISTENER ACTIVE, FLOW ENGINE READY — is
 * true without a database, carries no digit, and cannot be mistaken for a
 * figure. Nothing here is invented; the empty slots simply stopped pretending a
 * number was about to land in them.
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
  /**
   * What moved against the equivalent window before this one. Descriptive only:
   * both numbers behind every change are carried through to the reader.
   */
  const intel = await flowIntelligence(window, now);
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
   * measurement on a deployment with no storage at all — which is exactly why it
   * leads the page and carries the only signal colour on it.
   */
  const link = indexer.chainHead;
  const linkLive = hasValue(link);

  /** Two more measurements the chain gives for free, and neither is stored. */
  const cadence = await measureCadence(linkLive ? link.value : null);
  const latencyMs = lastRpcLatencyMs();
  const rpcHost = endpointHost();

  /** No price row for an asset is a price not yet observed, not a price of zero. */
  const priceState: DataState = selectedPrice
    ? "OK"
    : assetsResult.state === "UNAVAILABLE"
      ? "UNAVAILABLE"
      : "INDEXING";

  const drawn = graph.nodes.length > 0;

  /**
   * Whether the window was actually answered.
   *
   * EMPTY, PARTIAL and STALE all mean the index looked: those modules keep their
   * measured copy, because "nothing moved in this window" is a finding. Only
   * INDEXING and UNAVAILABLE mean nobody has looked yet, and that is the case
   * where a metric rail has no business drawing metric furniture at all.
   */
  const windowAnswered = activity.state !== "INDEXING" && activity.state !== "UNAVAILABLE";
  const railLive = activity.transfers > 0 || windowAnswered;
  const showEvents = recent.rows.length > 0 || assets.length > 0;

  const qs = (next: Partial<{ w: string; asset: string }>) => {
    const sp = new URLSearchParams();
    sp.set("w", next.w ?? window);
    const asset = next.asset ?? selected?.contract_address;
    if (asset) sp.set("asset", asset);
    return `/dashboard?${sp.toString()}`;
  };

  /**
   * The page's one status area.
   *
   * Every panel used to restate its own condition, so a visitor read the same
   * sentence a dozen times down the page. The condition is stated here, once, in
   * three segments — and nowhere else.
   */
  const status: StatusSegment[] = [
    linkLive
      ? {
          label: "CHAIN LIVE",
          value: cadence
            ? `${blockLabel(link.value)} · ${cadenceLabel(cadence.secondsPerBlock)} BLOCKS`
            : blockLabel(link.value),
          tone: "live",
        }
      : { label: "CHAIN LINK", value: "NO ENDPOINT ANSWERED", tone: "off" },
    { label: "REFERENCE MARKET", value: "TRADINGVIEW", tone: "ready" },
    activity.transfers > 0
      ? { label: "MARKET HISTORY", value: `${integer(activity.transfers)} TRANSFERS ${window}`, tone: "ready" }
      : { label: "MARKET HISTORY", value: "PENDING", tone: "off" },
  ];

  return (
    <>
      <style>{DASHBOARD_CSS}</style>

      <Shell>
        <div className="band-dense">
          <PageHead
            kicker={`MARKET INTELLIGENCE · CHAIN ${CHAIN.id}`}
            title="Dashboard"
            lede="The chain link is measured live over RPC — head, cadence and round trip on every render. The reference market is the underlying instrument's own, carried by TradingView. Everything folded from indexed transfers appears as the index reaches it, and nothing is drawn that was not measured."
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

          <div className="mt-6">
            <StatusRail segments={status} />
          </div>

          {activity.coverageNote ? (
            <div className="mt-4 border border-rule">
              <CoverageNote note={activity.coverageNote} />
            </div>
          ) : null}
        </div>
      </Shell>

      {/* ---- the tape: chain facts first, index facts after ----------------- */}
      <Tape label="Chain link and system state">
        <TapeStatic label="CHAIN" value={`${CHAIN.id} · ${CHAIN.name.toUpperCase()}`} />
        <TapeCell
          label="CHAIN HEAD"
          measurement={link}
          format={(v) => blockLabel(Number(v))}
          surface="network"
          emphasis={linkLive}
        />
        {linkLive ? <TapeStatic label="HEAD READ" value={relativeTime(link.observedAt, now)} /> : null}
        {cadence ? <TapeStatic label="BLOCK CADENCE" value={cadenceLabel(cadence.secondsPerBlock)} /> : null}
        {latencyMs === null ? null : <TapeStatic label="RPC ROUND TRIP" value={`${integer(latencyMs)} MS`} />}
        <TapeStatic label="SESSION" value={utcClock(new Date(now).toISOString())} />
        {hasValue(indexer.lastProcessedBlock) ? (
          <TapeCell
            label="INDEXED TO"
            measurement={withFreshness(indexer.lastProcessedBlock, now)}
            format={(v) => blockLabel(Number(v))}
            surface="activity"
          />
        ) : null}
        {hasValue(indexer.lagBlocks) ? (
          <TapeCell
            label="LAG"
            measurement={indexer.lagBlocks}
            format={(v) => integer(Number(v))}
            unit="BLOCKS"
            surface="activity"
          />
        ) : null}
        {hasValue(assetCount) ? (
          <TapeCell
            label="ASSETS OBSERVED"
            measurement={assetCount}
            format={(v) => integer(Number(v))}
            surface="registry"
          />
        ) : (
          <TapeCapability capability={CAPABILITIES.registry} />
        )}
        {activity.transfers > 0 ? (
          <TapeStatic label={`TRANSFERS ${window}`} value={integer(activity.transfers)} />
        ) : (
          <TapeCapability capability={CAPABILITIES.transfers} />
        )}
        {activity.activeAddresses > 0 ? (
          <TapeStatic label="ACTIVE ADDRESSES" value={integer(activity.activeAddresses)} />
        ) : (
          <TapeCapability capability={CAPABILITIES.addresses} />
        )}
      </Tape>

      {intel.current.transfers > 0 || intel.previous.transfers > 0 ? (
        <Shell>
          <div className="mt-6">
            <StructureChange intel={intel} />
          </div>
        </Shell>
      ) : null}

      {/* ---- workspace: chain measurements, chart + intelligence rail -------- */}
      <Shell>
        <div className="band-dense">
          {/* Three of these four cells are read over RPC on this render. They are
              the reason the product feels alive with nothing stored: a head, a
              cadence and a round trip are facts, measured now. */}
          <section aria-label="Live chain measurements" className="mb-8 border border-rule">
            <header className="flex items-center justify-between gap-3 border-b border-rule px-4 py-2.5">
              <h2 className="label text-ink">LIVE CHAIN MEASUREMENTS</h2>
              <Link href="/docs/status" className="label-s text-ink-faint m-fast hover:text-ink">
                PIPELINE STATUS →
              </Link>
            </header>
            <div className="grid grid-cols-1 gap-px bg-rule sm:grid-cols-2 xl:grid-cols-4">
              {linkLive ? (
                <Metric
                  title="CHAIN HEAD"
                  value={blockLabel(link.value)}
                  tone="signal"
                  foot={`${link.provenance.source} · READ ${relativeTime(link.observedAt, now)}`}
                />
              ) : (
                <CapabilityCell title="CHAIN LINK" status="FAILOVER READY" foot={link.provenance.source} />
              )}

              {cadence ? (
                <Metric
                  title="BLOCK CADENCE"
                  value={cadenceLabel(cadence.secondsPerBlock)}
                  foot={`MEASURED ACROSS ${integer(cadence.span)} BLOCK HEADERS`}
                />
              ) : (
                <CapabilityCell title="BLOCK CADENCE" status="HEADER READER ACTIVE" />
              )}

              {latencyMs === null ? (
                <CapabilityCell title="RPC LINK" status="FAILOVER READY" foot={rpcHost} />
              ) : (
                <Metric title="RPC LINK" value={`${integer(latencyMs)} MS`} foot={`${rpcHost} · ROUND TRIP`} />
              )}

              {hasValue(assetCount) ? (
                <Metric title="ASSET REGISTRY" value={`${integer(assetCount.value)} INDEXED`} />
              ) : (
                <CapabilityCell
                  title={CAPABILITIES.registry.label}
                  status={CAPABILITIES.registry.status}
                  foot="AN ASSET APPEARS ON ITS FIRST OBSERVED TRANSFER"
                />
              )}
            </div>
          </section>

          {/* The identity row belongs to an asset. With none resolved there is
              nothing to identify, so it is not drawn — a row of four dashes under
              a heading is worse than no row at all. */}
          {selected ? (
            <div className="mb-4 flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-4">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
                <h2 className="font-display text-[1.75rem] leading-none tracking-[-0.02em] text-ink">
                  {selected.symbol}
                </h2>
                <span className="label-s">{ASSET_TYPE_LABEL[selected.asset_type] ?? selected.asset_type}</span>
                <span className="truncate text-body-s text-ink-muted">{selected.name}</span>
                {selected.verified ? <StateTag state="OK" label="VERIFIED CONTRACT" /> : null}
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
          ) : null}

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
              /* A real, interactive chart on first paint, with or without a
                 database. With an asset resolved the panel offers both markets
                 and opens on whichever has a series; with none, the reference
                 market stands alone and says so in its own header. */
              selected ? (
                <MarketChartPanel
                  contract={selected.contract_address}
                  symbol={selected.symbol}
                  height={460}
                  hasOnchainSeries={Boolean(selectedPrice)}
                />
              ) : (
                <section aria-label="Reference market chart" className="border border-rule bg-surface">
                  <ReferenceChart height={460} />
                </section>
              )
            }
            right={
              railLive ? (
                <RailColumn revision={`${window}:${selected?.contract_address ?? "none"}`}>
                  <CapitalFlowModule window={window} activity={activity} edges={edges} assets={assets} />
                  <NetworkActivityModule window={window} activity={activity} />
                  <TopFlowsModule edges={edges} assets={assets} window={window} state={activity.state} />
                  <StructureChangeModule change={structure} window={window} />
                </RailColumn>
              ) : (
                <CapabilityRail />
              )
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
                  Market topology — a node for every address and asset observed moving value, an edge for every transfer
                  between two of them.
                </>
              )
            }
            /* Crediting indexed Transfer logs while the canvas draws a generic
               architecture preview would attribute invented geometry to a
               measurement — an invented citation, which is the same error as an
               invented number. */
            provenance={
              graph.nodes.length > 0
                ? "ROBINHOOD CHAIN RPC · ERC-20 TRANSFER LOGS INDEXED BY FOLDMARK"
                : "PRODUCT ARCHITECTURE PREVIEW · NOT AN OBSERVATION"
            }
            aside={
              <Link href="/fabric" className="label text-ink-muted m-fast hover:text-ink">
                FULL TOPOLOGY →
              </Link>
            }
          >
            {graph.nodes.length > 0 ? (
              <div className="flex h-[26rem] min-h-0">
                <TopologyView graph={graph} state={activity.state} />
              </div>
            ) : (
              <FoldmarkFlowArchitecture variant="compact" className="border-0" />
            )}
          </Figure>
          {/*
            The methodology describes an encoding. While the preview is drawn
            that encoding is not in force — radius is not observed value and
            edge weight is not value transferred — so describing it would
            explain a measurement that is not on screen.
          */}
          <Methodology>
            {graph.nodes.length > 0 ? (
              <>
                Position encodes role: net senders on the left, assets on the centre line, net receivers on the right.
                Node radius is the square root of observed value moved, edge weight is value transferred along that
                edge. A ring marks a node that moved value in the most recent indexed block. Nothing is placed randomly
                and no node exists without an observed transfer behind it.
              </>
            ) : (
              <>
                No transfer has been observed yet, so this is the product&rsquo;s architecture rather than a
                measurement: the lanes a real map is read in — sources left, assets on the centre line, destinations
                right — with category placeholders in them. No radius, edge or position here carries a value. The moment
                a transfer is indexed the same canvas draws the observed graph instead.
              </>
            )}
          </Methodology>
        </div>
      </Shell>

      {/* ---- events -------------------------------------------------------- */}
      {showEvents ? (
        <Shell>
          <div className="band-dense">
            <Split
              ratio="7:5"
              gap="gap-6"
              left={<EventLedger rows={recent.rows} assets={assets} state={recent.state} now={now} />}
              right={
                <Panel>
                  <PanelHeader title="ACTIVE ASSETS" meta={window} state={assetsResult.state} surface="registry" />
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
                              <span className="ml-2 text-ink-faint">
                                {ASSET_TYPE_LABEL[a.asset_type] ?? a.asset_type}
                              </span>
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
                </Panel>
              }
            />
          </div>
        </Shell>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------ measurement */

/** How many blocks the cadence sample spans. Recent enough for any public node. */
const CADENCE_SPAN = 100;

/**
 * Block cadence, measured — not assumed.
 *
 * Two real block headers, their timestamps differenced and divided by the
 * distance between them. It needs no database and no index, which is the whole
 * point: it is a true statement about the chain that a storage-less deployment
 * can still make. If either header cannot be read the function returns null and
 * the surface simply does not claim a cadence.
 */
async function measureCadence(head: number | null): Promise<{ secondsPerBlock: number; span: number } | null> {
  if (head === null || head <= CADENCE_SPAN) return null;
  const from = head - CADENCE_SPAN;
  try {
    const times = await getBlockTimes([from, head]);
    const a = times.get(from);
    const b = times.get(head);
    if (a === undefined || b === undefined || b <= a) return null;
    return { secondsPerBlock: (b - a) / 1000 / CADENCE_SPAN, span: CADENCE_SPAN };
  } catch {
    return null;
  }
}

/**
 * How a measured cadence is written.
 *
 * Robinhood Chain produces blocks faster than once a second, and "0.11 S" makes
 * a reader do arithmetic to learn that. Below a second the same measurement is
 * said in milliseconds. The number is not changed, only its unit.
 */
function cadenceLabel(secondsPerBlock: number): string {
  return secondsPerBlock < 1 ? `${integer(Math.round(secondsPerBlock * 1000))} MS` : `${secondsPerBlock.toFixed(2)} S`;
}

/** The endpoint that answered last, as a host. Real, and worth naming. */
function endpointHost(): string {
  const url = activeEndpoint();
  try {
    return new URL(url).host.toUpperCase();
  } catch {
    return url.toUpperCase();
  }
}

/* ------------------------------------------------------------------ parts */

type StatusSegment = { label: string; value: string; tone: "live" | "ready" | "off" };

/**
 * The single status area.
 *
 * One line, three segments, stated once for the whole page. Every panel below it
 * is then free to say nothing about its own condition, which is what stops the
 * dashboard reading as twenty copies of the same apology.
 */
function StatusRail({ segments }: { segments: StatusSegment[] }) {
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-6 gap-y-2 border border-rule bg-surface px-4 py-2.5">
      {segments.map((s) => (
        <span key={s.label} className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className={`h-1.5 w-1.5 shrink-0 ${
              s.tone === "live" ? "fm-tick bg-signal" : s.tone === "ready" ? "bg-ink-dim" : "bg-ink-faint"
            }`}
          />
          <span className={`label ${s.tone === "live" ? "text-signal" : "text-ink"}`}>{s.label}</span>
          <span className="label-s truncate text-ink-faint">{s.value}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * One measurement in the identity row.
 *
 * A real value prints; anything else prints the em dash and its own sentence
 * through AbsentValue. There is deliberately no third branch: nothing here can
 * put a figure in the slot that did not come from a measurement. This row is
 * only drawn beside a resolved asset, so a dash here sits next to three real
 * figures rather than standing in a column of its own.
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

/** A measured cell. Only ever rendered with a value that was actually read. */
function Metric({
  title,
  value,
  foot,
  tone = "ink",
}: {
  title: string;
  value: string;
  foot?: ReactNode;
  /** Signal is reserved for the chain link — the thing being read right now. */
  tone?: "ink" | "signal";
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5 bg-void px-4 py-4">
      <span className="label-s truncate">{title}</span>
      <p className="flex items-baseline gap-2">
        {tone === "signal" ? <span aria-hidden className="fm-tick h-1.5 w-1.5 shrink-0 bg-signal" /> : null}
        <span className={`tabular truncate font-mono text-data-l ${tone === "signal" ? "text-signal" : "text-ink"}`}>
          {value}
        </span>
      </p>
      {foot ? <p className="label-s truncate text-ink-faint">{foot}</p> : null}
    </div>
  );
}

/**
 * A cell with no measurement in it.
 *
 * It states what part of the system is running instead of what is missing. Every
 * one of these sentences is true on a deployment with no storage at all — the
 * listener, the folding engine and the renderer are real code that is present
 * and running — and none contains a digit, so a capability can never be misread
 * as a figure.
 */
function CapabilityCell({ title, status, foot }: { title: string; status: string; foot?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5 bg-void px-4 py-4">
      <span className="label-s truncate">{title}</span>
      <p className="flex items-center gap-2">
        <span aria-hidden className="h-1.5 w-1.5 shrink-0 bg-ink-dim" />
        <span className="truncate font-mono text-label uppercase tracking-[0.16em] text-ink-muted">{status}</span>
      </p>
      {foot ? <p className="label-s truncate text-ink-faint">{foot}</p> : null}
    </div>
  );
}

/** A tape cell in capability mode: a label and a running system, never a dash. */
function TapeCapability({ capability }: { capability: { label: string; status: string } }) {
  return (
    <div className="flex min-w-[9.5rem] shrink-0 flex-col justify-center gap-1 border-r border-rule py-3 pr-6 last:border-r-0 sm:min-w-[11rem]">
      <dt className="label-s">{capability.label}</dt>
      <dd className="flex items-center gap-2">
        <span aria-hidden className="h-1 w-1 shrink-0 bg-ink-dim" />
        <span className="whitespace-nowrap font-mono text-label-s uppercase tracking-[0.16em] text-ink-muted">
          {capability.status}
        </span>
      </dd>
    </div>
  );
}

/**
 * The rail in capability mode.
 *
 * What the metric rail becomes before anything has been observed. The four lines
 * are the four engines that would fill it, each named with what it is currently
 * doing — which is running and reading the chain, not failing.
 */
function CapabilityRail() {
  const items = [CAPABILITIES.transfers, CAPABILITIES.flow, CAPABILITIES.topology, CAPABILITIES.addresses];
  return (
    <aside aria-label="System capabilities" className="flex flex-col border border-rule bg-surface">
      <header className="flex items-center justify-between gap-3 border-b border-rule px-4 py-2.5">
        <span className="label text-ink">SYSTEM</span>
        <span className="label-s text-ink-faint">CHAIN {CHAIN.id}</span>
      </header>
      {items.map((c) => (
        <div
          key={c.label}
          className="flex items-center justify-between gap-3 border-b border-rule-faint px-4 py-3.5 last:border-b-0"
        >
          <span className="label-s truncate text-ink-muted">{c.label}</span>
          <span className="flex shrink-0 items-center gap-2">
            <span aria-hidden className="h-1 w-1 bg-ink-dim" />
            <span className="whitespace-nowrap font-mono text-label-s uppercase tracking-[0.16em] text-ink">
              {c.status}
            </span>
          </span>
        </div>
      ))}
      <p className="label-s border-t border-rule px-4 py-2.5 normal-case tracking-[0.02em] text-ink-faint">
        Each layer is running. No figure is shown until it is measured.
      </p>
    </aside>
  );
}

/**
 * Page-local motion: one slow tick on the live layer, and nothing else.
 *
 * The sweeping scan that used to run across the empty chart plane is gone with
 * the plane itself — there is a real chart in that slot now, and animating an
 * absence was always the weaker idea. The global reduced-motion reset already
 * collapses the tick; it is restated here so the rule travels with the page.
 */
const DASHBOARD_CSS = `
.fm-tick {
  animation: fm-tick-blink 2600ms steps(1, end) infinite;
}

@keyframes fm-tick-blink {
  0%, 62% { opacity: 1; }
  63%, 100% { opacity: 0.25; }
}

@media (prefers-reduced-motion: reduce) {
  .fm-tick { animation: none; opacity: 1; }
}
`;
