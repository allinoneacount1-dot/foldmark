import Link from "next/link";
import { Split, Band, RailColumn } from "@/components/layout/Frame";
import { Tape, TapeCell, TapeStatic } from "@/components/ui/Tape";
import { Figure } from "@/components/ui/Figure";
import { Display, Lede, Panel, PanelHeader, EmptyState, Methodology } from "@/components/ui/primitives";
import { ActionLink } from "@/components/ui/controls";
import { Ledger, LedgerRow, LedgerCell, LedgerEmpty, type LedgerColumn } from "@/components/ui/Ledger";
import { Sparkline, MagnitudeRow } from "@/components/charts";
import { TopologyView } from "@/components/graph/TopologyView";
import { CapitalFlowModule, NetworkActivityModule, TopFlowsModule } from "@/components/intelligence/rail";
import {
  getAssets,
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
import { measured, indexing, withFreshness } from "@/lib/data-state";
import { blockLabel, compact, integer, relativeTime, shortAddress } from "@/lib/format";
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

export default async function Home() {
  const now = await requestNow();
  const [indexer, assetsResult, activity, assetCount, transferCount] = await Promise.all([
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

  return (
    <>
      {/* 00 — MASTHEAD ---------------------------------------------------- */}
      <Band rhythm="quiet" reveal={false}>
        <Split
          ratio="8:4"
          left={
            <div>
              <p className="label-s">
                {SITE.positioning.toUpperCase()} · CHAIN {CHAIN.id}
              </p>
              <h1 className="mt-7 max-w-[16em] font-display text-[2.75rem] leading-[0.94] tracking-[-0.03em] text-ink sm:text-[3.75rem] lg:text-display-xl">
                Markets have structure.
                <span className="block text-ink-dim">FOLDMARK makes it visible.</span>
              </h1>
              <Lede className="mt-8">
                A market intelligence layer for Robinhood Chain. Raw chain activity becomes readable financial structure
                — the assets that move, the addresses moving them, and the relationships between them. Every figure here
                is measured, or it says what it is missing.
              </Lede>
              <div className="mt-9 flex flex-wrap gap-3">
                <ActionLink href="/fabric" tone="primary">
                  OPEN TOPOLOGY
                </ActionLink>
                <ActionLink href="/dashboard">DASHBOARD</ActionLink>
              </div>
            </div>
          }
          right={<span aria-hidden />}
        />
      </Band>

      {/* THE TAPE ---------------------------------------------------------- */}
      <Tape label="Live index status">
        <TapeCell
          label="INDEXED TO"
          measurement={withFreshness(indexer.lastProcessedBlock, now)}
          format={(v) => blockLabel(Number(v))}
        />
        <TapeCell label="CHAIN HEAD" measurement={indexer.chainHead} format={(v) => blockLabel(Number(v))} />
        <TapeCell label="LAG" measurement={indexer.lagBlocks} format={(v) => integer(Number(v))} unit="BLOCKS" />
        <TapeCell label="ASSETS" measurement={assetCount} format={(v) => integer(Number(v))} />
        <TapeCell label="TRANSFERS INDEXED" measurement={transferCount} format={(v) => integer(Number(v))} />
        <TapeCell
          label="ACTIVE ADDRESSES 24H"
          measurement={
            activity.activeAddresses
              ? measured(activity.activeAddresses, { source: "FOLDMARK indexer" }, { observedAt: indexer.updatedAt })
              : indexing<number>({ source: "FOLDMARK indexer" })
          }
          format={(v) => integer(Number(v))}
        />
        <TapeStatic label="UPDATED" value={relativeTime(indexer.updatedAt, now)} />
        <TapeStatic label="CHAIN" value={`${CHAIN.id} · ${CHAIN.name.toUpperCase()}`} />
      </Tape>

      {/* 01 — MARKET LEDGER ------------------------------------------------ */}
      <Band rhythm="dense" marker={{ index: "01", title: "MARKET LEDGER · 24H" }}>
        <div data-reveal-item>
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
                      <Cell value={price ? `$${compact(price.price, 4)}` : null} absent="NO FEED" />
                    </LedgerCell>
                    <LedgerCell column={COLUMNS[3]}>
                      <div className="flex items-center justify-end gap-3">
                        {act && act.transfers > 0 ? (
                          <span className="hidden w-24 sm:block">
                            <Sparkline series={act.buckets} tone="muted" label={`${a.symbol} transfer rate`} />
                          </span>
                        ) : null}
                        <Cell value={act ? integer(act.transfers) : null} absent="NONE" />
                      </div>
                    </LedgerCell>
                    <LedgerCell column={COLUMNS[4]}>
                      <Cell value={act ? compact(act.volume) : null} absent="NONE" />
                    </LedgerCell>
                    <LedgerCell column={COLUMNS[5]}>
                      <Cell value={act ? integer(act.counterparties) : null} absent="NONE" />
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
              <LedgerEmpty
                state={assetsResult.state}
                title="The registry is still filling"
                detail="An asset is added when the indexer observes an ERC-20 Transfer for its contract. Nothing is seeded."
              />
            )}
          </Ledger>
        </div>
        <div className="mt-4 flex justify-end" data-reveal-item>
          <Link href="/assets" className="label text-ink-muted transition-colors duration-[180ms] hover:text-ink">
            FULL REGISTRY →
          </Link>
        </div>
      </Band>

      {/* 02 — TOPOLOGY ----------------------------------------------------- */}
      <Band rhythm="signature" marker={{ index: "02", title: "MARKET TOPOLOGY" }}>
        <div className="mb-8 max-w-[34rem]" data-reveal-item>
          <Display size="l">An asset is more than a price.</Display>
          <Lede className="mt-4">
            It has counterparties, venues, and a position in a network of capital movement. FOLDMARK draws that network
            from what actually happened on chain.
          </Lede>
        </div>

        <div data-reveal-item>
          <Split
            ratio="rail"
            gap="gap-6"
            align="stretch"
            left={
              <Figure
                index="01"
                caption={
                  <>
                    Market topology over 24H — {integer(graph.shown.nodes)} nodes and {integer(graph.shown.edges)}{" "}
                    relationships from {integer(graph.totals.transfers)} observed transfers.
                  </>
                }
                provenance="ROBINHOOD CHAIN RPC · ERC-20 TRANSFER LOGS INDEXED BY FOLDMARK"
                aside={
                  <Link href="/fabric" className="label text-ink-muted transition-colors duration-[180ms] hover:text-ink">
                    OPEN FULL MAP →
                  </Link>
                }
              >
                <div className="flex h-[30rem] min-h-0">
                  <TopologyView graph={graph} />
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
            <div data-reveal-item>
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
                  <PanelHeader title="CAPITAL LEDGER" state={activity.state} />
                  <EmptyState
                    state={activity.state}
                    title="No value moved in the last 24 hours"
                    detail="This is what the index actually holds. FOLDMARK does not fill the gap with a sample."
                  />
                </Panel>
              )}
            </div>
          }
          right={
            <div data-reveal-item className="max-w-[30rem]">
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
            <div data-reveal-item className="max-w-[27rem]">
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
            <div data-reveal-item className="min-w-0 border border-rule">
              <div className="flex items-center justify-between border-b border-rule px-4 py-2.5">
                <span className="label text-ink">
                  GET /api/v1/context/{lead?.symbol ?? "{symbol}"}
                </span>
                <span className="label-s text-ink-faint">LIVE RESPONSE</span>
              </div>
              <pre className="max-h-[26rem] overflow-auto px-4 py-3 font-mono text-data-s leading-relaxed text-ink-muted">
                {context
                  ? JSON.stringify(context, null, 2)
                  : `{\n  "error": "ASSET_NOT_INDEXED",\n  "reason": "No asset has been observed on chain ${CHAIN.id} yet"\n}`}
              </pre>
              <p className="label-s border-t border-rule px-4 py-2 text-ink-faint">
                RENDERED FROM THE SAME BUILDER THE ROUTE USES — NOT A SAMPLE
              </p>
            </div>
          }
        />
      </Band>
    </>
  );
}

function Cell({ value, absent }: { value: string | null; absent: string }) {
  return (
    <span
      className={`tabular font-mono text-data-s ${value ? "text-ink" : "uppercase tracking-[0.12em] text-ink-faint"}`}
    >
      {value ?? absent}
    </span>
  );
}
