import type { Metadata } from "next";
import Link from "next/link";
import { Shell, Split, RailColumn, PageHead } from "@/components/layout/Frame";
import { Tape, TapeCell, TapeStatic } from "@/components/ui/Tape";
import { Figure } from "@/components/ui/Figure";
import { Panel, PanelHeader, EmptyState, Methodology, StateTag, CoverageNote } from "@/components/ui/primitives";
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
import { measured, indexing, withFreshness } from "@/lib/data-state";
import { blockLabel, compact, integer, relativeTime } from "@/lib/format";
import { WINDOWS, ASSET_TYPE_LABEL, type FlowWindow, CHAIN } from "@/config/site";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Live market intelligence for Robinhood Chain: price, capital flow, network activity and market structure read together.",
};

export const revalidate = 30;

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

  const qs = (next: Partial<{ w: string; asset: string }>) => {
    const sp = new URLSearchParams();
    sp.set("w", next.w ?? window);
    const asset = next.asset ?? selected?.contract_address;
    if (asset) sp.set("asset", asset);
    return `/dashboard?${sp.toString()}`;
  };

  return (
    <>
      <Shell>
        <div className="band-dense">
          <PageHead
            kicker={`MARKET INTELLIGENCE · CHAIN ${CHAIN.id}`}
            title="Dashboard"
            lede="Price, capital flow, network activity and market structure for Robinhood Chain, read in one place. Every figure below is computed from indexed chain data or shows its state."
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

      <Tape label="Indexer and chain status">
        <TapeCell label="INDEXED TO" measurement={withFreshness(indexer.lastProcessedBlock, now)} format={(v) => blockLabel(Number(v))} />
        <TapeCell label="CHAIN HEAD" measurement={indexer.chainHead} format={(v) => blockLabel(Number(v))} />
        <TapeCell label="LAG" measurement={indexer.lagBlocks} format={(v) => integer(Number(v))} unit="BLOCKS" />
        <TapeCell label="ASSETS OBSERVED" measurement={assetCount} format={(v) => integer(Number(v))} />
        <TapeCell
          label={`TRANSFERS ${window}`}
          measurement={
            activity.transfers > 0
              ? measured(activity.transfers, { source: "FOLDMARK indexer" }, { observedAt: indexer.updatedAt })
              : indexing<number>({ source: "FOLDMARK indexer" })
          }
          format={(v) => integer(Number(v))}
        />
        <TapeCell
          label="ACTIVE ADDRESSES"
          measurement={
            activity.activeAddresses > 0
              ? measured(activity.activeAddresses, { source: "FOLDMARK indexer" }, { observedAt: indexer.updatedAt })
              : indexing<number>({ source: "FOLDMARK indexer" })
          }
          format={(v) => integer(Number(v))}
        />
        <TapeStatic label="UPDATED" value={relativeTime(indexer.updatedAt, now)} />
        <TapeStatic label="CHAIN" value={`${CHAIN.id} · ${CHAIN.name.toUpperCase()}`} />
      </Tape>

      {/* ---- workspace: chart + intelligence rail --------------------------- */}
      <Shell>
        <div className="band-dense">
          {selected ? (
            <>
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
                  <Stat label="PRICE" value={selectedPrice ? `${compact(selectedPrice.price, 4)}` : null} absent="NO FEED" />
                  <Stat label={`${window} TRANSFERS`} value={selectedActivity ? integer(selectedActivity.transfers) : null} />
                  <Stat label={`${window} GROSS VOLUME`} value={selectedActivity ? compact(selectedActivity.volume) : null} />
                  <Stat label="COUNTERPARTIES" value={selectedActivity ? integer(selectedActivity.counterparties) : null} />
                </dl>
              </div>

              {ranked.length > 1 ? (
                <div className="mb-4">
                  <ChipGroup label="Asset">
                    {ranked.slice(0, 12).map((a) => (
                      <ChipLink
                        key={a.contract_address}
                        href={qs({ asset: a.contract_address })}
                        active={a.id === selected.id}
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
                left={<MarketChart contract={selected.contract_address} symbol={selected.symbol} height={420} />}
                right={
                  <RailColumn revision={`${window}:${selected.contract_address}`}>
                    <CapitalFlowModule window={window} activity={activity} edges={edges} assets={assets} />
                    <NetworkActivityModule window={window} activity={activity} />
                    <TopFlowsModule edges={edges} assets={assets} window={window} state={activity.state} />
                    <StructureChangeModule change={structure} window={window} />
                  </RailColumn>
                }
              />
            </>
          ) : (
            <Panel>
              <PanelHeader title="MARKET WORKSPACE" state={assetsResult.state} />
              <EmptyState
                state={assetsResult.state}
                title="No asset indexed yet"
                detail={
                  <>
                    The chart, the flow rail and the topology all read from the same indexed transfers. They populate as
                    soon as the indexer observes its first ERC-20 Transfer on chain {CHAIN.id}.
                  </>
                }
              />
            </Panel>
          )}
        </div>
      </Shell>

      {/* ---- topology ------------------------------------------------------ */}
      <Shell>
        <div className="band-signature">
          <Figure
            index="01"
            caption={
              <>
                Market topology over {window} — {integer(graph.shown.nodes)} nodes and {integer(graph.shown.edges)}{" "}
                relationships drawn from {integer(graph.totals.transfers)} observed transfers.
              </>
            }
            provenance="ROBINHOOD CHAIN RPC · ERC-20 TRANSFER LOGS INDEXED BY FOLDMARK"
            aside={
              <Link href="/fabric" className="label text-ink-muted m-fast hover:text-ink">
                FULL TOPOLOGY →
              </Link>
            }
          >
            <div className="flex h-[26rem] min-h-0">
              <TopologyView graph={graph} />
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
                <PanelHeader title="ACTIVE ASSETS" meta={window} state={assetsResult.state} />
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
                  <EmptyState state={assetsResult.state} title="No assets observed" />
                )}
              </Panel>
            }
          />
        </div>
      </Shell>
    </>
  );
}

function Stat({ label, value, absent = "INDEXING" }: { label: string; value: string | null; absent?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="label-s">{label}</dt>
      <dd className={`tabular font-mono text-data ${value ? "text-ink" : "uppercase tracking-[0.14em] text-ink-faint"}`}>
        {value ?? absent}
      </dd>
    </div>
  );
}
