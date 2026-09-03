import type { Metadata } from "next";
import { Shell, Split, PageHead } from "@/components/layout/Frame";
import {
  Panel,
  PanelHeader,
  EmptyState,
  Methodology,
  StateTag,
  CoverageNote,
  AbsentValue,
} from "@/components/ui/primitives";
import type { DataState } from "@/lib/data-state";
import type { Surface } from "@/lib/presentation-state";
import { ChipLink, ChipGroup } from "@/components/ui/controls";
import { Ledger, LedgerRow, LedgerCell, LedgerEmpty, type LedgerColumn } from "@/components/ui/Ledger";
import { Histogram, MagnitudeRow, FlowBar } from "@/components/charts";
import { Figure } from "@/components/ui/Figure";
import {
  getAssets,
  getWindowActivity,
  getFlowWindows,
  foldEdges,
  foldByAddress,
  dominantFlow,
  getPriceSeries,
  movementsFrom,
  since,
  requestNow,
} from "@/lib/queries";
import { compact, integer, shortAddress, signed } from "@/lib/format";
import { WINDOWS, CHAIN, type FlowWindow } from "@/config/site";
import { toNotional, notionalNote, prepareSeries, DEFAULT_ALIGNMENT } from "@/lib/notional";

export const metadata: Metadata = {
  title: "Capital flow",
  description: "Where value moves on Robinhood Chain: directed flows between addresses, ranked by observed magnitude.",
};

export const revalidate = 30;

const CLASSES = [
  "DEX_BUY",
  "DEX_SELL",
  "LP_DEPOSIT",
  "LP_WITHDRAW",
  "LEND",
  "BORROW",
  "REPAY",
  "BRIDGE_IN",
  "BRIDGE_OUT",
  "WALLET_TRANSFER",
] as const;

const FLOW_COLUMNS: LedgerColumn[] = [
  { key: "from", label: "SOURCE", width: "minmax(140px, 1.2fr)" },
  { key: "to", label: "DESTINATION", width: "minmax(140px, 1.2fr)" },
  { key: "asset", label: "ASSET", width: "minmax(90px, 0.7fr)" },
  { key: "value", label: "AMOUNT", width: "minmax(110px, 0.9fr)", align: "right" },
  { key: "tx", label: "TRANSFERS", width: "minmax(90px, 0.7fr)", align: "right", hideBelow: "sm" },
  { key: "class", label: "CLASSIFICATION", width: "minmax(130px, 1fr)", align: "right", hideBelow: "md" },
];

export default async function FlowsPage({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const params = await searchParams;
  const window: FlowWindow = (WINDOWS as readonly string[]).includes(params.w ?? "") ? (params.w as FlowWindow) : "24H";
  const now = await requestNow();

  const [assetsResult, activity, flowRows] = await Promise.all([
    getAssets(),
    getWindowActivity(window, now),
    getFlowWindows(window),
  ]);

  const assets = assetsResult.rows;
  const symbols = new Map(assets.map((a) => [a.id, a.symbol]));
  const edges = foldEdges(activity.rows, assets, 20);
  const addresses = foldByAddress(activity.rows, assets, 40);

  /**
   * This page looks across every asset at once, so nothing here may be ranked
   * by token amount.
   *
   * One NVDA, one AAPL and one USDG are three different things; adding them
   * produces a number with no unit, and sorting by it would order addresses by
   * whichever asset happens to have the smallest denomination. Counts — how
   * many transfers, how many counterparties, how many assets — are the only
   * quantities that survive a comparison across assets, so counts are what rank
   * a cross-asset view. Amounts appear only next to their own symbol.
   */
  const receivers = [...addresses]
    .map((a) => ({ activity: a, dominant: dominantFlow(a, "inbound") }))
    .filter((r) => r.dominant !== null)
    .sort((a, b) => b.activity.transfers - a.activity.transfers)
    .slice(0, 8);

  const senders = [...addresses]
    .map((a) => ({ activity: a, dominant: dominantFlow(a, "outbound") }))
    .filter((r) => r.dominant !== null)
    .sort((a, b) => b.activity.transfers - a.activity.transfers)
    .slice(0, 8);

  const totalTransfers = edges.reduce((s, e) => s + e.transfers, 0);

  /**
   * The one figure that legitimately spans assets.
   *
   * Notional value is comparable because it has a unit — USD. But a total is
   * only honest if each transfer was valued at the price that held when it
   * happened, so every transfer is aligned to an observation at or before its
   * own timestamp. Transfers with no such observation are excluded and counted;
   * none of them is priced at today's quote.
   */
  const priceRows = await getPriceSeries(
    assets.map((a) => a.id),
    since(window, now),
    DEFAULT_ALIGNMENT.maxAlignmentDeltaMs,
  );
  const notional = toNotional(movementsFrom(activity.rows, assets), prepareSeries(priceRows));

  // Assets ranked by transfers observed — a count, so the comparison holds.
  // Each asset's own moved amount is carried alongside, in its own units.
  const byAsset = new Map<string, { transfers: number; amount: number }>();
  for (const e of edges) {
    if (!e.assetId) continue;
    const acc = byAsset.get(e.assetId) ?? { transfers: 0, amount: 0 };
    acc.transfers += e.transfers;
    acc.amount += e.amount;
    byAsset.set(e.assetId, acc);
  }
  const assetShare = [...byAsset.entries()].sort((a, b) => b[1].transfers - a[1].transfers).slice(0, 8);

  /**
   * The headline row.
   *
   * A tile prints a figure only when the window was actually queried — a zero
   * from a successful query is a measurement and is shown as one. Until the
   * index reaches the window there is no measurement, so the tile prints a dash
   * and names what it is waiting for, in the terms of the thing that is absent:
   * an edge is flow, an address is a wallet, a notional is market data.
   */
  const observed = activity.state !== "INDEXING" && activity.state !== "UNAVAILABLE";
  const tiles: { label: string; value: string | null; unit: string; state: DataState; surface: Surface }[] = [
    {
      label: "TRANSFERS ON EDGES",
      value: observed ? integer(totalTransfers) : null,
      unit: "OBSERVED",
      state: activity.state,
      surface: "flow",
    },
    {
      label: "NOTIONAL MOVED",
      value: notional.usd !== null ? compact(notional.usd) : null,
      unit:
        notional.state === "PARTIAL"
          ? `USD · ${Math.round(notional.coverage * 100)}% OF TRANSFERS PRICED`
          : notional.state === "OK"
            ? "USD · EVERY TRANSFER PRICED"
            : "NO ALIGNED PRICE",
      state: notional.state,
      surface: "market",
    },
    {
      label: "TRANSFERS",
      value: observed ? integer(activity.transfers) : null,
      unit: window,
      state: activity.state,
      surface: "activity",
    },
    {
      label: "DIRECTED EDGES",
      value: observed ? integer(activity.uniquePairs) : null,
      unit: "ADDRESS PAIRS",
      state: activity.state,
      surface: "flow",
    },
    {
      label: "ACTIVE ADDRESSES",
      value: observed ? integer(activity.activeAddresses) : null,
      unit: window,
      state: activity.state,
      surface: "wallet",
    },
  ];

  return (
    <Shell>
      <div className="band-dense">
        <PageHead
          kicker={`CAPITAL FLOW OBSERVATORY · CHAIN ${CHAIN.id}`}
          title="Where capital moves"
          lede="Directed value edges between addresses, folded from indexed transfers. A flow is a real observation: an address sent a quantity of a token to another address inside the window."
          aside={
            <ChipGroup label="Window">
              {WINDOWS.map((w) => (
                <ChipLink key={w} href={`/flows?w=${w}`} active={w === window}>
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

        <div className="mt-6 grid gap-px bg-rule sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="bg-void p-4">
              <p className="label-s">{t.label}</p>
              {t.value !== null ? (
                <p className="tabular mt-1.5 font-mono text-data-l text-ink">{t.value}</p>
              ) : (
                <div className="mt-1.5">
                  <AbsentValue state={t.state} surface={t.surface} />
                </div>
              )}
              <p className="label-s mt-1 text-ink-faint">{t.unit}</p>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <Figure
            index="01"
            caption={`Transfer rate across the ${window} window, in ${activity.bucketMinutes}-minute intervals.`}
            provenance="ROBINHOOD CHAIN RPC · ERC-20 TRANSFER LOGS"
          >
            <div className="px-4 py-5">
              <Histogram
                buckets={activity.buckets}
                height={72}
                label={`Transfers per interval across ${window}`}
                bucketMinutes={activity.bucketMinutes}
              />
            </div>
          </Figure>
        </div>

        <div className="mt-8">
          <h2 className="label mb-4 border-b border-rule pb-2.5 text-ink-muted">TOP RELATIONSHIPS · {window}</h2>
          <Ledger columns={FLOW_COLUMNS} caption={`Strongest directed value edges observed in the ${window} window`} minWidth={760}>
            {edges.length ? (
              edges.slice(0, 12).map((e) => (
                <LedgerRow key={`${e.from}-${e.to}-${e.assetId}`} columns={FLOW_COLUMNS}>
                  <LedgerCell column={FLOW_COLUMNS[0]}>
                    <a href={`/wallet/${e.from}`} className="tabular font-mono text-data text-ink hover:underline">
                      {shortAddress(e.from, 8, 6)}
                    </a>
                  </LedgerCell>
                  <LedgerCell column={FLOW_COLUMNS[1]}>
                    <a href={`/wallet/${e.to}`} className="tabular font-mono text-data text-ink hover:underline">
                      {shortAddress(e.to, 8, 6)}
                    </a>
                  </LedgerCell>
                  <LedgerCell column={FLOW_COLUMNS[2]}>
                    <span className="font-mono text-data-s text-ink-muted">{symbols.get(e.assetId ?? "") ?? "—"}</span>
                  </LedgerCell>
                  <LedgerCell column={FLOW_COLUMNS[3]}>
                    <span className="tabular font-mono text-data text-ink">{compact(e.amount)}</span>
                  </LedgerCell>
                  <LedgerCell column={FLOW_COLUMNS[4]}>
                    <span className="tabular font-mono text-data-s text-ink-muted">{integer(e.transfers)}</span>
                  </LedgerCell>
                  <LedgerCell column={FLOW_COLUMNS[5]}>
                    <span className="label-s text-ink-faint">UNCLASSIFIED</span>
                  </LedgerCell>
                </LedgerRow>
              ))
            ) : (
              <LedgerEmpty
                state={activity.state}
                surface="flow"
                /* An observed-and-empty window earns the instruction to widen it.
                   A window the index has not reached is still arriving, and the
                   flow surface says that instead. */
                detail={
                  activity.state === "EMPTY"
                    ? "Widen the window, or wait for the indexer to reach blocks containing transfers."
                    : undefined
                }
              />
            )}
          </Ledger>
        </div>

        <div className="mt-8">
          <Split
            ratio="7:5"
            gap="gap-6"
            left={
              <div className="grid gap-6 sm:grid-cols-2">
                <Panel>
                  <PanelHeader
                    title="MOST ACTIVE DESTINATIONS"
                    meta={window}
                    state={receivers.length ? activity.state : "INDEXING"}
                    surface="flow"
                  />
                  {receivers.length ? (
                    <div className="px-4 py-2">
                      {receivers.map(({ activity: a, dominant }) => (
                        <MagnitudeRow
                          key={a.address}
                          label={shortAddress(a.address, 8, 6)}
                          value={integer(a.transfers)}
                          fraction={a.transfers / (receivers[0]?.activity.transfers || 1)}
                          tone="signal"
                          meta={`${compact(dominant!.inbound)} ${symbols.get(dominant!.assetId) ?? "UNKNOWN"} IN · ${integer(a.assets)} ASSET${a.assets === 1 ? "" : "S"}`}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyState state={activity.state} surface="flow" />
                  )}
                </Panel>

                <Panel>
                  <PanelHeader
                    title="MOST ACTIVE SOURCES"
                    meta={window}
                    state={senders.length ? activity.state : "INDEXING"}
                    surface="flow"
                  />
                  {senders.length ? (
                    <div className="px-4 py-2">
                      {senders.map(({ activity: a, dominant }) => (
                        <MagnitudeRow
                          key={a.address}
                          label={shortAddress(a.address, 8, 6)}
                          value={integer(a.transfers)}
                          fraction={a.transfers / (senders[0]?.activity.transfers || 1)}
                          meta={`${compact(dominant!.outbound)} ${symbols.get(dominant!.assetId) ?? "UNKNOWN"} OUT · ${integer(a.assets)} ASSET${a.assets === 1 ? "" : "S"}`}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyState state={activity.state} surface="flow" />
                  )}
                </Panel>

                <Panel className="sm:col-span-2">
                  <PanelHeader
                    title="MOST TRANSFERRED ASSETS"
                    meta={window}
                    state={assetShare.length ? activity.state : "INDEXING"}
                    surface="flow"
                  />
                  {assetShare.length ? (
                    <div className="px-4 py-2">
                      {assetShare.map(([id, agg]) => (
                        <MagnitudeRow
                          key={id}
                          label={symbols.get(id) ?? shortAddress(id, 6, 4)}
                          value={integer(agg.transfers)}
                          fraction={agg.transfers / (assetShare[0]?.[1].transfers || 1)}
                          tone="signal"
                          meta={`${compact(agg.amount)} ${symbols.get(id) ?? "UNITS"} MOVED`}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyState state={activity.state} surface="flow" />
                  )}
                  <p className="label-s border-t border-rule px-4 py-2 normal-case tracking-[0.02em] text-ink-faint">
                    {notionalNote(notional)}
                    {notional.oldestAlignmentDeltaMs !== null
                      ? ` Widest gap between a transfer and the price used for it: ${Math.round(notional.oldestAlignmentDeltaMs / 60_000)}m.`
                      : ""}
                  </p>
                </Panel>
              </div>
            }
            right={
              <div className="flex flex-col gap-6">
                <Panel>
                  <PanelHeader
                    title="NET FLOW BY ADDRESS"
                    meta={window}
                    state={flowRows.rows.length ? flowRows.state : "INDEXING"}
                    surface="flow"
                  />
                  {flowRows.rows.length ? (
                    <div className="flex flex-col">
                      {flowRows.rows.slice(0, 8).map((r) => {
                        const scale = Math.max(Math.abs(r.inflow), Math.abs(r.outflow), 1);
                        const symbol = r.asset_id ? symbols.get(r.asset_id) : null;
                        return (
                          <div key={r.entity_id} className="border-b border-rule-faint px-4 py-3 last:border-b-0">
                            <div className="flex items-baseline justify-between gap-3">
                              <a href={`/wallet/${r.address}`} className="tabular truncate font-mono text-data-s text-ink hover:underline">
                                {shortAddress(r.address, 8, 6)}
                              </a>
                              <span
                                className={`tabular shrink-0 font-mono text-data-s ${
                                  r.net_flow >= 0 ? "text-signal" : "text-negative"
                                }`}
                              >
                                {signed(r.net_flow)}
                              </span>
                            </div>
                            {/* The unit is part of the number. Without it, this row is not a fact. */}
                            <div className="mt-1 flex items-baseline justify-between gap-3">
                              <span className="label-s text-ink-faint">
                                {symbol ?? "UNKNOWN ASSET"} · {integer(r.transaction_count)} TX
                              </span>
                              <span className="label-s text-ink-faint">{symbol ?? "UNITS"}</span>
                            </div>
                            <div className="mt-2">
                              <FlowBar inflow={r.inflow} outflow={r.outflow} scale={scale} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <EmptyState
                      state={flowRows.state}
                      surface="flow"
                      title="Net flow not yet computed"
                      detail="Directional flow is precomputed per address by the indexer after each run that commits new transfers."
                    />
                  )}
                  <p className="label-s border-t border-rule px-4 py-2 normal-case tracking-[0.02em] text-ink-faint">
                    Net flow is defined per address <em className="not-italic text-ink-muted">and per asset</em> —
                    received minus sent, in that asset&rsquo;s own units. It is never summed across assets, because a
                    token unit only means something next to its own symbol. It is also not defined per token contract,
                    where a transfer moves balance without changing supply.
                  </p>
                </Panel>

                <Panel>
                  <PanelHeader title="CLASSIFICATION" state="INDEXING" surface="protocol" />
                  <div className="px-4 py-3">
                    <p className="text-body-s text-ink-muted">
                      FOLDMARK does not guess what a transfer meant. A flow is labelled only when the counterparty
                      contract is identified. Until a venue registry exists for chain {CHAIN.id}, every flow reads
                      UNCLASSIFIED.
                    </p>
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {CLASSES.map((c) => (
                        <li key={c} className="border border-rule px-2 py-1 font-mono text-label-s uppercase tracking-[0.14em] text-ink-faint">
                          {c}
                        </li>
                      ))}
                      <li className="border border-rule-strong px-2 py-1 font-mono text-label-s uppercase tracking-[0.14em] text-ink">
                        UNCLASSIFIED
                      </li>
                    </ul>
                    <p className="label-s mt-3 normal-case tracking-[0.02em] text-ink-faint">
                      UNKNOWN is preferred to a wrong label.
                    </p>
                  </div>
                </Panel>

                <div className="border border-rule">
                  <div className="flex items-center justify-between border-b border-rule px-4 py-2.5">
                    <span className="label text-ink">DATA CONDITION</span>
                    <StateTag state={activity.state} surface="flow" />
                  </div>
                  <Methodology>
                    Every figure on this page is folded at request time from the transfers table over the trailing{" "}
                    {window} window. Because this view spans every asset, all rankings use counts — transfers,
                    counterparties, assets touched — which are comparable. Token amounts are shown only beside the
                    symbol they belong to and are never added across assets: one NVDA plus one USDG is not two of
                    anything. Amounts are not converted to a currency here. When a window reaches the row cap the
                    result reads PARTIAL and every count is a lower bound.
                  </Methodology>
                </div>
              </div>
            }
          />
        </div>
      </div>
    </Shell>
  );
}
