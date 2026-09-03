import type { ReactNode } from "react";
import Link from "next/link";
import { Split, Band, RailColumn } from "@/components/layout/Frame";
import { Tape, TapeCell, TapeStatic } from "@/components/ui/Tape";
import { Figure } from "@/components/ui/Figure";
import { Display, Lede, Panel, PanelHeader, EmptyState, Methodology, StateTag } from "@/components/ui/primitives";
import { ActionLink } from "@/components/ui/controls";
import { Ledger, LedgerRow, LedgerCell, LedgerEmpty, type LedgerColumn } from "@/components/ui/Ledger";
import { Sparkline, MagnitudeRow } from "@/components/charts";
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
import { measured, indexing, withFreshness, hasValue, type DataState, type Measured } from "@/lib/data-state";
import { present, type Surface } from "@/lib/presentation-state";
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

/** The fields a capital-ledger row carries. Named beside an empty ledger, never filled. */
const EDGE_FIELDS = ["FROM", "TO", "ASSET", "VALUE", "TRANSFERS"] as const;

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
  const byAsset = foldByAsset(activity.rows, assets, "24H", now);
  const edges = foldEdges(activity.rows, assets, 12);
  const graph = buildMarketGraph(activity.rows, assets, { limitAddresses: 8, limitAssets: 8 });
  const prices = await getLatestPrices(assets.map((a) => a.id));

  const ranked = [...assets].sort((a, b) => (byAsset.get(b.id)?.transfers ?? 0) - (byAsset.get(a.id)?.transfers ?? 0));
  const lead = ranked[0] ?? null;
  const context = lead ? await buildAssetContext(lead.symbol) : null;
  const maxEdge = edges[0]?.amount ?? 1;

  const linkLive = hasValue(head);
  const drawn = graph.nodes.length > 0;

  /** A missing price row is a quote not yet observed, never a price of zero. */
  const priceState: DataState = assetsResult.state === "UNAVAILABLE" ? "UNAVAILABLE" : "INDEXING";
  /** How many of the indexed assets actually carry an observed quote. */
  const quoted = prices.size;
  const marketState: DataState = quoted > 0 ? "OK" : priceState;

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
                is measured, or it says what it is missing.
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
              registry={assetCount}
              marketState={marketState}
              quoted={quoted}
            />
          }
        />
      </Band>

      {/* THE TAPE ---------------------------------------------------------- */}
      <Tape label="Chain link and index state" enterDelay={340}>
        <TapeStatic label="CHAIN" value={`${CHAIN.id} · ${CHAIN.name.toUpperCase()}`} />
        <TapeCell
          label="CHAIN HEAD"
          measurement={head}
          format={(v) => blockLabel(Number(v))}
          surface="network"
          emphasis={linkLive}
        />
        {linkLive ? <TapeStatic label="HEAD READ" value={relativeTime(head.observedAt, now)} /> : null}
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
        <TapeCell label="ASSETS" measurement={assetCount} format={(v) => integer(Number(v))} surface="registry" />
        <TapeCell
          label="TRANSFERS INDEXED"
          measurement={transferCount}
          format={(v) => integer(Number(v))}
          surface="flow"
        />
        <TapeCell
          label="ACTIVE ADDRESSES 24H"
          measurement={
            activity.activeAddresses
              ? measured(activity.activeAddresses, { source: "FOLDMARK indexer" }, { observedAt: indexer.updatedAt })
              : indexing<number>({ source: "FOLDMARK indexer" })
          }
          format={(v) => integer(Number(v))}
          surface="activity"
        />
      </Tape>

      {/* 01 — MARKET LEDGER ------------------------------------------------ */}
      <Band rhythm="dense" marker={{ index: "01", title: "MARKET LEDGER · 24H" }}>
        <div data-reveal-item="table">
          <Ledger columns={COLUMNS} caption="Assets observed on Robinhood Chain in the last 24 hours" minWidth={820}>
            {ranked.length ? (
              ranked.slice(0, 8).map((a) => {
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
                        <Cell
                          value={act ? integer(act.transfers) : null}
                          state={activity.state}
                          surface="activity"
                        />
                      </div>
                    </LedgerCell>
                    <LedgerCell column={COLUMNS[4]}>
                      <Cell value={act ? compact(act.volume) : null} state={activity.state} surface="flow" />
                    </LedgerCell>
                    <LedgerCell column={COLUMNS[5]}>
                      <Cell
                        value={act ? integer(act.counterparties) : null}
                        state={activity.state}
                        surface="activity"
                      />
                    </LedgerCell>
                    <LedgerCell column={COLUMNS[6]}>
                      <span className="tabular font-mono text-data-s text-ink-faint">
                        {shortAddress(a.contract_address)}
                      </span>
                    </LedgerCell>
                  </LedgerRow>
                );
              })
            ) : (
              /* The table keeps its headers, so the reader can see the shape of
                 what is coming. The copy is the registry surface's own — this
                 page does not write a second version of it. */
              <LedgerEmpty state={assetsResult.state} surface="registry" />
            )}
          </Ledger>
        </div>
        <div className="mt-4 flex justify-end" data-reveal-item="default">
          <Link href="/assets" className="label text-ink-muted m-fast hover:text-ink">
            FULL REGISTRY →
          </Link>
        </div>
      </Band>

      {/* 02 — TOPOLOGY ----------------------------------------------------- */}
      <Band rhythm="signature" marker={{ index: "02", title: "MARKET TOPOLOGY" }}>
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
                      Market topology over 24H — a node for every address and asset observed moving value, an edge for
                      every transfer between two of them.
                    </>
                  )
                }
                provenance="ROBINHOOD CHAIN RPC · ERC-20 TRANSFER LOGS INDEXED BY FOLDMARK"
                aside={
                  <span className="flex items-center gap-3">
                    {drawn ? null : <StateTag state={activity.state} surface="topology" />}
                    <Link href="/fabric" className="label text-ink-muted m-fast hover:text-ink">
                      OPEN FULL MAP →
                    </Link>
                  </span>
                }
              >
                <div className="flex h-[30rem] min-h-0">
                  <TopologyView graph={graph} state={activity.state} />
                </div>
              </Figure>
            }
            right={
              <RailColumn className="lg:!static lg:max-h-none lg:overflow-visible">
                <CapitalFlowModule window="24H" activity={activity} edges={edges} assets={assets} />
                <NetworkActivityModule window="24H" activity={activity} />
                <TopFlowsModule edges={edges} assets={assets} window="24H" state={activity.state} />
              </RailColumn>
            }
          />
        </div>
      </Band>

      {/* 03 — CAPITAL LEDGER ----------------------------------------------- */}
      <Band rhythm="dense" marker={{ index: "03", title: "CAPITAL LEDGER · 24H" }} tone="surface">
        <Split
          ratio="7:5"
          gap="gap-8"
          left={
            <div data-reveal-item="table">
              {edges.length ? (
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
              ) : (
                <Panel tone="void">
                  <PanelHeader title="CAPITAL LEDGER" meta="24H" state={activity.state} surface="flow" />
                  <EmptyState state={activity.state} surface="flow" />
                  {/* The columns an edge row will carry, named. Nothing is put
                      in them, and nothing is ranked, because nothing moved. */}
                  <div className="grid grid-cols-2 gap-px border-t border-rule bg-rule sm:grid-cols-5">
                    {EDGE_FIELDS.map((field) => (
                      <div key={field} className="flex items-baseline justify-between gap-2 bg-void px-4 py-2.5">
                        <span className="label-s truncate">{field}</span>
                        <span aria-hidden className="shrink-0 font-mono text-data-s text-ink-dim">
                          &mdash;
                        </span>
                      </div>
                    ))}
                  </div>
                </Panel>
              )}
            </div>
          }
          right={
            <div data-reveal-item="heading" className="max-w-[30rem]">
              <Display size="m">Follow the structure. Read the flow.</Display>
              <Lede className="mt-4">
                A transfer is not an opinion. FOLDMARK ranks the strongest directed value edges in the window and leaves
                them unclassified until the counterparty contract is actually identified.
              </Lede>
              <div className="mt-6">
                <ActionLink href="/flows">OPEN FLOW OBSERVATORY</ActionLink>
              </div>
              <div className="mt-6 border border-rule">
                <Methodology>
                  An edge is a directed pair of addresses that exchanged a specific asset inside the window. Value is the
                  sum of transfer amounts in token units, at the asset&apos;s own decimals. Nothing is converted to a
                  currency, because no price oracle is wired to chain {CHAIN.id}.
                </Methodology>
              </div>
            </div>
          }
        />
      </Band>

      {/* 04 — MACHINE ------------------------------------------------------ */}
      <Band rhythm="quiet" marker={{ index: "04", title: "MACHINE LAYER" }}>
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
                <span className="label truncate text-ink">
                  GET /api/v1/context/{lead?.symbol ?? "{asset}"}
                </span>
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
                  : "THE BODY THE ROUTE RETURNS WHILE NO ASSET IS INDEXED — NOT A SAMPLE RESPONSE"}
              </p>
            </div>
          }
        />
      </Band>
    </>
  );
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

/**
 * The masthead's live rail.
 *
 * It answers one question above the fold — is this thing connected to anything?
 * — and it answers it with the only fact that is true on a deployment with no
 * storage: the chain head, read over RPC. The layers beneath it say what they
 * are waiting for in their own terms and hold an em dash where their figure
 * will go. Nothing here is derived from the database, so the hero cannot go
 * blank when the database is not there.
 */
function LiveRail({
  head,
  now,
  registry,
  marketState,
  quoted,
}: {
  head: Measured<number>;
  now: number;
  /** Count of indexed assets, as measured — not a number this component invents. */
  registry: Measured<number>;
  marketState: DataState;
  quoted: number;
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

      <RailRow
        title="CHAIN LINK"
        state={head.state}
        surface="network"
        tone="signal"
        value={live ? blockLabel(head.value) : null}
        caption={live ? "CHAIN HEAD" : undefined}
      />
      <RailRow
        title="MARKET DATA"
        state={marketState}
        surface="market"
        value={quoted > 0 ? integer(quoted) : null}
        caption={quoted > 0 ? "ASSETS QUOTED" : undefined}
      />
      <RailRow
        title="ASSET INDEX"
        state={registry.state}
        surface="registry"
        value={hasValue(registry) ? integer(registry.value) : null}
        caption={hasValue(registry) ? "INDEXED" : undefined}
      />

      <footer className="flex flex-col gap-1 border-t border-rule px-4 py-2.5">
        <p className="label-s truncate text-ink-faint">{head.provenance.source}</p>
        <p className="label-s text-ink-faint">
          {live ? `READ ${relativeTime(head.observedAt, now)}` : "NO ENDPOINT ANSWERED"} ·{" "}
          {utcClock(new Date(now).toISOString())}
        </p>
      </footer>
    </aside>
  );
}

/** One layer of the rail: what it is, its condition, and its value or its dash. */
function RailRow({
  title,
  state,
  surface,
  value = null,
  caption,
  tone = "ink",
}: {
  title: string;
  state: DataState;
  surface: Surface;
  value?: string | null;
  caption?: ReactNode;
  /** Signal is reserved for the chain link — the one value being read right now. */
  tone?: "ink" | "signal";
}) {
  const p = present(state, surface);
  const live = value !== null;
  return (
    <div className="flex flex-col gap-1.5 border-b border-rule-faint px-4 py-3 last:border-b-0">
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
          {caption ? <span className="label-s shrink-0 text-ink-faint">{caption}</span> : null}
        </p>
      ) : (
        <p className="flex items-baseline gap-2">
          <span aria-hidden className="font-mono text-data-l leading-none text-ink-dim">
            &mdash;
          </span>
          <span className="sr-only">{p.detail}</span>
        </p>
      )}
    </div>
  );
}

/**
 * A ledger cell.
 *
 * A real value prints. Anything else prints an em dash, with the state left for
 * a screen reader and a tooltip rather than set in the row — at this density a
 * status word per cell would either wrap the table or truncate itself.
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
