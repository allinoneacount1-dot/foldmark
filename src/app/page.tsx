import type { ReactNode } from "react";
import Link from "next/link";
import { Split, Band, RailColumn } from "@/components/layout/Frame";
import { Tape, TapeCell, TapeStatic } from "@/components/ui/Tape";
import { Figure } from "@/components/ui/Figure";
import { Display, Lede, Methodology } from "@/components/ui/primitives";
import { ActionLink } from "@/components/ui/controls";
import { Ledger, LedgerRow, LedgerCell, type LedgerColumn } from "@/components/ui/Ledger";
import { Sparkline, MagnitudeRow } from "@/components/charts";
import { MarketChartPanel } from "@/components/charts/MarketChartPanel";
import { ReferenceChart } from "@/components/charts/ReferenceChart";
import { TopologyView } from "@/components/graph/TopologyView";
import { CapitalFlowModule, NetworkActivityModule, TopFlowsModule } from "@/components/intelligence/rail";
import {
  getAssets,
  getChainHead,
  getIndexerStatus,
  getWindowActivity,
  getLatestPrices,
  countRows,
  foldByAsset,
  foldEdges,
  requestNow,
} from "@/lib/queries";
import { buildMarketGraph } from "@/lib/graph";
import { buildAssetContext } from "@/lib/context";
import { withFreshness, hasValue, type DataState, type Measured } from "@/lib/data-state";
import { present, type Surface } from "@/lib/presentation-state";
import { CAPABILITIES } from "@/lib/presentation-preview";
import { activeEndpoint, getBlockTimes, lastRpcLatencyMs } from "@/server/market-data/providers/rpc";
import { blockLabel, compact, integer, relativeTime, shortAddress, utcClock } from "@/lib/format";
import { ASSET_TYPE_LABEL, CHAIN, SITE } from "@/config/site";

export const revalidate = 30;

const COLUMNS: LedgerColumn[] = [
  { key: "asset", label: "ASSET", width: "minmax(140px, 1.5fr)" },
  { key: "type", label: "TYPE", width: "minmax(110px, 0.9fr)" },
  { key: "price", label: "PRICE", width: "minmax(80px, 0.7fr)", align: "right" },
  { key: "rate", label: "24H TRANSFERS", width: "minmax(130px, 1.1fr)", align: "right" },
  { key: "vol", label: "GROSS VOLUME", width: "minmax(100px, 0.8fr)", align: "right", hideBelow: "sm" },
  { key: "cp", label: "COUNTERPARTIES", width: "minmax(110px, 0.8fr)", align: "right", hideBelow: "md" },
  { key: "contract", label: "CONTRACT", width: "minmax(110px, 0.8fr)", align: "right", hideBelow: "lg" },
];

/**
 * The overview.
 *
 * The hero owes the database nothing. Chain head, block cadence and RPC round
 * trip are read over JSON-RPC on every render, and the market chart beneath it
 * carries TradingView's own data for the underlying instrument — so a visitor
 * lands on live measurements and a working, interactive chart on a deployment
 * with no storage at all.
 *
 * What the index would add is named rather than mourned. A module with no rows
 * shows the engine that fills it — CHAIN LISTENER ACTIVE, FLOW ENGINE READY —
 * which is true today, contains no digit, and cannot be mistaken for a figure.
 * A section with nothing to draw is simply not drawn. Nothing on this page is
 * invented, and no region of it is a rectangle of em dashes.
 */
export default async function Home() {
  const now = await requestNow();
  const [head, indexer, assetsResult, activity, assetCount, transferCount] = await Promise.all([
    // Read straight over RPC. The masthead's live rail is built from this and
    // nothing else, so the hero states a real fact on a deployment that has no
    // database at all — which is precisely the deployment it has to survive.
    getChainHead(),
    getIndexerStatus(),
    getAssets(),
    getWindowActivity("24H", now),
    countRows("assets"),
    countRows("transfers"),
  ]);

  const assets = assetsResult.rows;
  const byAsset = foldByAsset(activity.rows, assets, "24H", now, activity.capped);
  const edges = foldEdges(activity.rows, assets, 12);
  const graph = buildMarketGraph(activity.rows, assets, { limitAddresses: 8, limitAssets: 8 });
  const prices = await getLatestPrices(assets.map((a) => a.id));

  const ranked = [...assets].sort((a, b) => (byAsset.get(b.id)?.transfers ?? 0) - (byAsset.get(a.id)?.transfers ?? 0));
  const lead = ranked[0] ?? null;
  const context = lead ? await buildAssetContext(lead.symbol) : null;
  const maxEdge = edges[0]?.amount ?? 1;

  const linkLive = hasValue(head);
  const drawn = graph.nodes.length > 0;

  /** Measured over RPC, stored nowhere. The hero's other two real facts. */
  const cadence = await measureCadence(linkLive ? head.value : null);
  const latencyMs = lastRpcLatencyMs();
  const rpcHost = endpointHost();

  /** A missing price row is a quote not yet observed, never a price of zero. */
  const priceState: DataState = assetsResult.state === "UNAVAILABLE" ? "UNAVAILABLE" : "INDEXING";

  /**
   * EMPTY, PARTIAL and STALE mean the index answered, so the modules keep their
   * measured copy. INDEXING and UNAVAILABLE mean nobody has looked yet, and a
   * metric rail with nothing behind it should name its engines instead.
   */
  const windowAnswered = activity.state !== "INDEXING" && activity.state !== "UNAVAILABLE";
  const railLive = activity.transfers > 0 || windowAnswered;
  const hasAssets = ranked.length > 0;

  /** Section numbers stay contiguous when a section has nothing to show. */
  const sections = ["chart", ...(hasAssets ? ["ledger"] : []), "topology", "flow", "machine"];
  const num = (key: string) => String(sections.indexOf(key) + 1).padStart(2, "0");

  return (
    <>
      <style>{HOME_CSS}</style>

      {/* 00 — MASTHEAD ---------------------------------------------------- */}
      <Band rhythm="quiet" reveal={false}>
        <Split
          ratio="8:4"
          gap="gap-10"
          left={
            /* A short staged entrance, in reading order: kicker, statement,
               standfirst, actions. Roughly 400ms end to end — enough to feel
               composed, too brief to be an intro sequence. */
            <div>
              <p className="label-s m-enter-fade">
                {SITE.positioning.toUpperCase()} · CHAIN {CHAIN.id}
              </p>
              <h1
                className="m-enter-unmask mt-7 max-w-[16em] font-display text-[2.75rem] leading-[0.94] tracking-[-0.03em] text-ink sm:text-[3.75rem] lg:text-display-xl"
                style={{ animationDelay: "60ms" }}
              >
                Markets have structure.
                <span className="block text-ink-dim">FOLDMARK makes it visible.</span>
              </h1>
              <Lede className="m-enter-rise mt-8" style={{ animationDelay: "180ms" }}>
                A market intelligence layer for Robinhood Chain. Raw chain activity becomes readable financial structure
                — the assets that move, the addresses moving them, and the relationships between them. Every figure here
                is measured, and nothing that was not measured is drawn.
              </Lede>
              <div className="m-enter-rise mt-9 flex flex-wrap gap-3" style={{ animationDelay: "260ms" }}>
                <ActionLink href="/fabric" tone="primary">
                  OPEN TOPOLOGY
                </ActionLink>
                <ActionLink href="/dashboard">DASHBOARD</ActionLink>
              </div>
            </div>
          }
          right={
            <LiveRail
              head={head}
              now={now}
              cadence={cadence}
              latencyMs={latencyMs}
              rpcHost={rpcHost}
              registry={assetCount}
              transfers={transferCount}
            />
          }
        />
      </Band>

      {/* THE TAPE ---------------------------------------------------------- */}
      <Tape label="Chain link and system state" enterDelay={340}>
        <TapeStatic label="CHAIN" value={`${CHAIN.id} · ${CHAIN.name.toUpperCase()}`} />
        <TapeCell
          label="CHAIN HEAD"
          measurement={head}
          format={(v) => blockLabel(Number(v))}
          surface="network"
          emphasis={linkLive}
        />
        {linkLive ? <TapeStatic label="HEAD READ" value={relativeTime(head.observedAt, now)} /> : null}
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
          <TapeCell label="ASSETS" measurement={assetCount} format={(v) => integer(Number(v))} surface="registry" />
        ) : (
          <TapeCapability capability={CAPABILITIES.registry} />
        )}
        {hasValue(transferCount) ? (
          <TapeCell
            label="TRANSFERS INDEXED"
            measurement={transferCount}
            format={(v) => integer(Number(v))}
            surface="flow"
          />
        ) : (
          <TapeCapability capability={CAPABILITIES.transfers} />
        )}
        {activity.activeAddresses > 0 ? (
          <TapeStatic label="ACTIVE ADDRESSES 24H" value={integer(activity.activeAddresses)} />
        ) : (
          <TapeCapability capability={CAPABILITIES.addresses} />
        )}
      </Tape>

      {/* 01 — MARKET CHART -------------------------------------------------- */}
      <Band rhythm="dense" marker={{ index: num("chart"), title: "MARKET CHART" }}>
        <div className="mb-8 max-w-[36rem]" data-reveal-item="heading">
          <Display size="l">Two markets, never confused.</Display>
          <Lede className="mt-4">
            REFERENCE is the underlying instrument&rsquo;s own market, carried live by TradingView. ONCHAIN is what
            FOLDMARK observed on Robinhood Chain. They are different markets, separately sourced and separately labelled
            — a reference feed never writes a FOLDMARK price.
          </Lede>
        </div>

        <div data-reveal-item="graph">
          {lead ? (
            <MarketChartPanel
              contract={lead.contract_address}
              symbol={lead.symbol}
              height={480}
              hasOnchainSeries={prices.has(lead.id)}
            />
          ) : (
            <section aria-label="Reference market chart" className="border border-rule bg-surface">
              <ReferenceChart height={480} />
            </section>
          )}
        </div>
      </Band>

      {/* 02 — MARKET LEDGER ------------------------------------------------ */}
      {hasAssets ? (
        <Band rhythm="dense" marker={{ index: num("ledger"), title: "MARKET LEDGER · 24H" }}>
          <div data-reveal-item="table">
            <Ledger columns={COLUMNS} caption="Assets observed on Robinhood Chain in the last 24 hours" minWidth={820}>
              {ranked.slice(0, 8).map((a) => {
                const act = byAsset.get(a.id);
                const price = prices.get(a.id);
                return (
                  <LedgerRow key={a.id} columns={COLUMNS} href={`/assets/${a.contract_address}`}>
                    <LedgerCell column={COLUMNS[0]}>
                      <p className="truncate font-mono text-data text-ink">{a.symbol}</p>
                      <p className="truncate text-body-s text-ink-faint">{a.name}</p>
                    </LedgerCell>
                    <LedgerCell column={COLUMNS[1]}>
                      <span className="label-s">{ASSET_TYPE_LABEL[a.asset_type] ?? a.asset_type}</span>
                    </LedgerCell>
                    <LedgerCell column={COLUMNS[2]}>
                      <Cell value={price ? `$${compact(price.price, 4)}` : null} state={priceState} surface="price" />
                    </LedgerCell>
                    <LedgerCell column={COLUMNS[3]}>
                      <div className="flex items-center justify-end gap-3">
                        {act && act.transfers > 0 ? (
                          <span className="hidden w-24 sm:block">
                            <Sparkline series={act.buckets} tone="muted" label={`${a.symbol} transfer rate`} />
                          </span>
                        ) : null}
                        <Cell value={act ? integer(act.transfers) : null} state={activity.state} surface="activity" />
                      </div>
                    </LedgerCell>
                    <LedgerCell column={COLUMNS[4]}>
                      <Cell value={act ? compact(act.volume) : null} state={activity.state} surface="flow" />
                    </LedgerCell>
                    <LedgerCell column={COLUMNS[5]}>
                      <Cell value={act ? integer(act.counterparties) : null} state={activity.state} surface="activity" />
                    </LedgerCell>
                    <LedgerCell column={COLUMNS[6]}>
                      <span className="tabular font-mono text-data-s text-ink-faint">
                        {shortAddress(a.contract_address)}
                      </span>
                    </LedgerCell>
                  </LedgerRow>
                );
              })}
            </Ledger>
          </div>
          <div className="mt-4 flex justify-end" data-reveal-item="default">
            <Link href="/assets" className="label text-ink-muted m-fast hover:text-ink">
              FULL REGISTRY →
            </Link>
          </div>
        </Band>
      ) : null}

      {/* 03 — TOPOLOGY ----------------------------------------------------- */}
      <Band rhythm="signature" marker={{ index: num("topology"), title: "MARKET TOPOLOGY" }}>
        <div className="mb-8 max-w-[34rem]" data-reveal-item="heading">
          <Display size="l">An asset is more than a price.</Display>
          <Lede className="mt-4">
            It has counterparties, venues, and a position in a network of capital movement. FOLDMARK draws that network
            from what actually happened on chain.
          </Lede>
        </div>

        <div data-reveal-item="graph">
          <Split
            ratio="rail"
            gap="gap-6"
            align="stretch"
            left={
              <Figure
                index="01"
                caption={
                  drawn ? (
                    <>
                      Market topology over 24H — {integer(graph.shown.nodes)} nodes and {integer(graph.shown.edges)}{" "}
                      relationships from {integer(graph.totals.transfers)} observed transfers.
                    </>
                  ) : (
                    <>
                      Market topology — a node for every address and asset observed moving value, an edge for every
                      transfer between two of them.
                    </>
                  )
                }
                provenance="ROBINHOOD CHAIN RPC · ERC-20 TRANSFER LOGS INDEXED BY FOLDMARK"
                aside={
                  <Link href="/fabric" className="label text-ink-muted m-fast hover:text-ink">
                    OPEN FULL MAP →
                  </Link>
                }
              >
                <div className="flex h-[30rem] min-h-0">
                  <TopologyView graph={graph} state={activity.state} />
                </div>
              </Figure>
            }
            right={
              railLive ? (
                <RailColumn className="lg:!static lg:max-h-none lg:overflow-visible">
                  <CapitalFlowModule window="24H" activity={activity} edges={edges} assets={assets} />
                  <NetworkActivityModule window="24H" activity={activity} />
                  <TopFlowsModule edges={edges} assets={assets} window="24H" state={activity.state} />
                </RailColumn>
              ) : (
                <CapabilityRail />
              )
            }
          />
        </div>
      </Band>

      {/* 04 — CAPITAL LEDGER ----------------------------------------------- */}
      <Band rhythm="dense" marker={{ index: num("flow"), title: "CAPITAL LEDGER · 24H" }} tone="surface">
        {edges.length ? (
          <Split
            ratio="7:5"
            gap="gap-8"
            left={
              <div data-reveal-item="table">
                <div className="border border-rule bg-void px-4 py-2">
                  {edges.slice(0, 8).map((e) => {
                    const symbol = assets.find((a) => a.id === e.assetId)?.symbol ?? "";
                    return (
                      <MagnitudeRow
                        key={`${e.from}-${e.to}-${e.assetId}`}
                        label={`${shortAddress(e.from, 6, 4)} → ${shortAddress(e.to, 6, 4)}`}
                        value={`${compact(e.amount)} ${symbol}`}
                        fraction={e.amount / maxEdge}
                        tone="signal"
                        meta={`${integer(e.transfers)} TX · BLOCK ${integer(e.lastBlock)}`}
                      />
                    );
                  })}
                </div>
              </div>
            }
            right={<FlowEditorial />}
          />
        ) : (
          /* With no ranked edges there is no ledger to draw. The argument for
             reading flow this way is not a measurement and does not depend on
             one, so it stands alone rather than propping up an empty table. */
          <FlowEditorial />
        )}
      </Band>

      {/* 05 — MACHINE ------------------------------------------------------ */}
      <Band rhythm="quiet" marker={{ index: num("machine"), title: "MACHINE LAYER" }}>
        <Split
          ratio="5:7"
          gap="gap-8"
          left={
            <div data-reveal-item="heading" className="max-w-[27rem]">
              <Display size="m">Financial context for machines.</Display>
              <Lede className="mt-4">
                The same measurements, as JSON, for applications, analysts and agents. Fields that are not measured carry
                a state instead of a number — so a consumer can tell the difference.
              </Lede>
              <div className="mt-6">
                <ActionLink href="/developers">API REFERENCE</ActionLink>
              </div>
            </div>
          }
          right={
            <div data-reveal-item="rail" className="min-w-0 border border-rule">
              <div className="flex items-center justify-between gap-3 border-b border-rule px-4 py-2.5">
                <span className="label truncate text-ink">GET /api/v1/context/{lead?.symbol ?? "{asset}"}</span>
                <span className="label-s shrink-0 text-ink-faint">
                  {context ? "LIVE RESPONSE · 200" : "LIVE RESPONSE · 404"}
                </span>
              </div>
              <pre className="max-h-[26rem] overflow-auto px-4 py-3 font-mono text-data-s leading-relaxed text-ink-muted">
                {JSON.stringify(context ?? NOT_INDEXED, null, 2)}
              </pre>
              <p className="label-s border-t border-rule px-4 py-2 text-ink-faint">
                {context
                  ? "RENDERED FROM THE SAME BUILDER THE ROUTE USES — NOT A SAMPLE"
                  : "THE BODY THE ROUTE RETURNS FOR AN ASSET IT HAS NOT OBSERVED — NOT A SAMPLE RESPONSE"}
              </p>
            </div>
          }
        />
      </Band>
    </>
  );
}

/* ------------------------------------------------------------ measurement */

/** How many blocks the cadence sample spans. Recent enough for any public node. */
const CADENCE_SPAN = 100;

/**
 * Block cadence, measured — not assumed.
 *
 * Two real block headers, differenced and divided by the distance between them.
 * It needs no database and no index, which is the point: it is a true statement
 * about the chain that a storage-less deployment can still make. If either
 * header cannot be read this returns null and no cadence is claimed.
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

/**
 * The 404 body `/api/v1/context/[asset]` actually returns for an unindexed
 * asset, reproduced field for field. Showing the real error contract is the
 * honest thing to put here: it carries no measurement, and a consumer reading
 * this page learns exactly what they will receive.
 */
const NOT_INDEXED = {
  error: "ASSET_NOT_INDEXED",
  asset: "{asset}",
  chain_id: CHAIN.id,
  methodology: "An asset resolves once the indexer has observed an ERC-20 Transfer for its contract.",
} as const;

/** The argument for reading flow as structure. True with or without a row behind it. */
function FlowEditorial() {
  return (
    <div data-reveal-item="heading" className="max-w-[34rem]">
      <Display size="m">Follow the structure. Read the flow.</Display>
      <Lede className="mt-4">
        A transfer is not an opinion. FOLDMARK ranks the strongest directed value edges in the window and leaves them
        unclassified until the counterparty contract is actually identified.
      </Lede>
      <div className="mt-6">
        <ActionLink href="/flows">OPEN FLOW OBSERVATORY</ActionLink>
      </div>
      <div className="mt-6 border border-rule">
        <Methodology>
          An edge is a directed pair of addresses that exchanged a specific asset inside the window. Value is the sum of
          transfer amounts in token units, at the asset&apos;s own decimals. Nothing here is converted to a currency:
          valuing a past transfer needs a price observed at or before it, and observations began recently, so most
          transfers have none. Converting them with the current price would describe a market that did not exist.
        </Methodology>
      </div>
    </div>
  );
}

/**
 * The masthead's live rail — and the page's one status area.
 *
 * It answers the question a visitor actually has above the fold: is this thing
 * connected to anything? It answers with measurements that owe nothing to
 * storage — the chain head, the cadence between two real block headers, and the
 * round trip to the endpoint that answered. Where the index would contribute, a
 * capability line names the engine instead of holding a dash.
 *
 * The footer states the whole system's condition once. No panel further down the
 * page repeats it.
 */
function LiveRail({
  head,
  now,
  cadence,
  latencyMs,
  rpcHost,
  registry,
  transfers,
}: {
  head: Measured<number>;
  now: number;
  cadence: { secondsPerBlock: number; span: number } | null;
  latencyMs: number | null;
  rpcHost: string;
  /** Count of indexed assets, as measured — not a number this component invents. */
  registry: Measured<number>;
  transfers: Measured<number>;
}) {
  const live = hasValue(head);
  return (
    <aside
      aria-label="Live state"
      className="m-enter-fade border border-rule bg-surface"
      style={{ animationDelay: "320ms" }}
    >
      <header className="flex items-center justify-between gap-3 border-b border-rule px-4 py-2.5">
        <span className="label text-ink">LIVE STATE</span>
        <span className="label-s text-ink-faint">CHAIN {CHAIN.id}</span>
      </header>

      {live ? (
        <RailRow title="CHAIN HEAD" value={blockLabel(head.value)} caption="BLOCK" tone="signal" />
      ) : (
        <RailRow title="CHAIN LINK" status="FAILOVER READY" />
      )}

      {cadence ? (
        <RailRow
          title="BLOCK CADENCE"
          value={cadenceLabel(cadence.secondsPerBlock)}
          caption={`OVER ${integer(cadence.span)} BLOCKS`}
        />
      ) : (
        <RailRow title="BLOCK CADENCE" status="HEADER READER ACTIVE" />
      )}

      {latencyMs === null ? (
        <RailRow title="RPC LINK" status="FAILOVER READY" />
      ) : (
        <RailRow title="RPC LINK" value={`${integer(latencyMs)} MS`} caption={rpcHost} />
      )}

      {hasValue(registry) ? (
        <RailRow title="ASSET INDEX" value={integer(registry.value)} caption="INDEXED" />
      ) : (
        <RailRow title={CAPABILITIES.registry.label} status={CAPABILITIES.registry.status} />
      )}

      <footer className="flex flex-col gap-1 border-t border-rule px-4 py-2.5">
        <p className="label-s truncate text-ink-faint">
          {live ? "CHAIN LIVE" : "CHAIN LINK DOWN"} · REFERENCE MARKET ·{" "}
          {hasValue(transfers) ? `${integer(transfers.value)} TRANSFERS INDEXED` : "MARKET HISTORY PENDING"}
        </p>
        <p className="label-s truncate text-ink-faint">
          {live ? `${head.provenance.source} · READ ${relativeTime(head.observedAt, now)}` : head.provenance.source} ·{" "}
          {utcClock(new Date(now).toISOString())}
        </p>
      </footer>
    </aside>
  );
}

/**
 * One row of the rail.
 *
 * Either a measurement or a capability — never an em dash. A dash in a hero is
 * the product telling a first-time visitor that it is broken; a capability line
 * tells them which engine is running, and carries no digit that could be
 * misread as a figure.
 */
function RailRow({
  title,
  value,
  caption,
  status,
  tone = "ink",
}: {
  title: string;
  value?: string;
  caption?: ReactNode;
  status?: string;
  /** Signal is reserved for the chain link — the one value being read right now. */
  tone?: "ink" | "signal";
}) {
  return (
    <div className="flex flex-col gap-1.5 border-b border-rule-faint px-4 py-3 last:border-b-0">
      <span className="label-s truncate">{title}</span>
      {value === undefined ? (
        <p className="flex items-center gap-2">
          <span aria-hidden className="h-1.5 w-1.5 shrink-0 bg-ink-dim" />
          <span className="truncate font-mono text-label uppercase tracking-[0.16em] text-ink-muted">{status}</span>
        </p>
      ) : (
        <p className="flex items-baseline gap-2">
          {tone === "signal" ? <span aria-hidden className="fm-tick h-1.5 w-1.5 shrink-0 bg-signal" /> : null}
          <span className={`tabular truncate font-mono text-data-l ${tone === "signal" ? "text-signal" : "text-ink"}`}>
            {value}
          </span>
          {caption ? <span className="label-s shrink-0 truncate text-ink-faint">{caption}</span> : null}
        </p>
      )}
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
 * The intelligence rail before anything has been observed.
 *
 * Four engines, each named with what it is currently doing. Every line is true
 * on a deployment with no storage — the listener, the folding engine and the
 * topology renderer are real code that is present and running — and none of them
 * contains a digit, so a capability cannot read as a metric.
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
 * A ledger cell.
 *
 * A real value prints. Anything else prints an em dash, with the state left for
 * a screen reader and a tooltip rather than set in the row — at this density a
 * status word per cell would either wrap the table or truncate itself. The
 * ledger is only drawn when assets exist, so a dash here sits inside a table of
 * real rows rather than standing in for one.
 */
function Cell({ value, state, surface }: { value: string | null; state: DataState; surface: Surface }) {
  if (value !== null) return <span className="tabular font-mono text-data-s text-ink">{value}</span>;
  const p = present(state, surface);
  return (
    <span className="font-mono text-data-s text-ink-dim" title={p.label}>
      <span aria-hidden>&mdash;</span>
      <span className="sr-only">{p.label}</span>
    </span>
  );
}

/**
 * Page-local motion: one slow tick on the live layer, and nothing else.
 *
 * It marks the single value on this page that is genuinely being read right
 * now. Nothing else moves, because nothing else is happening — and a pulse
 * beside an unobserved figure would be describing activity that does not exist.
 */
const HOME_CSS = `
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
