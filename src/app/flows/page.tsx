import type { Metadata } from "next";
import { Shell, Split, PageHead } from "@/components/layout/Frame";
import { Panel, PanelHeader, EmptyState, Methodology, StateTag } from "@/components/ui/primitives";
import { ChipLink, ChipGroup } from "@/components/ui/controls";
import { Ledger, LedgerRow, LedgerCell, LedgerEmpty, type LedgerColumn } from "@/components/ui/Ledger";
import { Histogram, MagnitudeRow, FlowBar } from "@/components/charts";
import { Figure } from "@/components/ui/Figure";
import { getAssets, getWindowActivity, getFlowWindows, foldEdges, foldByAddress, requestNow,
} from "@/lib/queries";
import { compact, integer, shortAddress, signed } from "@/lib/format";
import { WINDOWS, CHAIN, type FlowWindow } from "@/config/site";

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
  { key: "value", label: "VALUE MOVED", width: "minmax(110px, 0.9fr)", align: "right" },
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

  const receivers = [...addresses].sort((a, b) => b.inbound - a.inbound).slice(0, 8);
  const senders = [...addresses].sort((a, b) => b.outbound - a.outbound).slice(0, 8);
  const totalMoved = edges.reduce((s, e) => s + e.amount, 0);

  // per-asset share of the value that moved in this window
  const byAsset = new Map<string, number>();
  for (const e of edges) {
    if (!e.assetId) continue;
    byAsset.set(e.assetId, (byAsset.get(e.assetId) ?? 0) + e.amount);
  }
  const assetShare = [...byAsset.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

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

        <div className="mt-6 grid gap-px bg-rule sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["VALUE MOVED", edges.length ? compact(totalMoved) : null, "TOKEN UNITS"],
            ["TRANSFERS", activity.transfers ? integer(activity.transfers) : null, window],
            ["DIRECTED EDGES", activity.uniquePairs ? integer(activity.uniquePairs) : null, "ADDRESS PAIRS"],
            ["ACTIVE ADDRESSES", activity.activeAddresses ? integer(activity.activeAddresses) : null, window],
          ].map(([label, value, unit]) => (
            <div key={label as string} className="bg-void p-4">
              <p className="label-s">{label}</p>
              <p
                className={`tabular mt-1.5 font-mono text-data-l ${
                  value ? "text-ink" : "uppercase tracking-[0.14em] text-ink-faint"
                }`}
              >
                {value ?? "INDEXING"}
              </p>
              <p className="label-s mt-1 text-ink-faint">{unit}</p>
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
                title="No flow observed in this window"
                detail="Widen the window, or wait for the indexer to reach blocks containing transfers."
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
                  <PanelHeader title="TOP DESTINATIONS" meta={window} state={receivers.length ? activity.state : "INDEXING"} />
                  {receivers.length ? (
                    <div className="px-4 py-2">
                      {receivers.map((a) => (
                        <MagnitudeRow
                          key={a.address}
                          label={shortAddress(a.address, 8, 6)}
                          value={compact(a.inbound)}
                          fraction={a.inbound / (receivers[0]?.inbound || 1)}
                          tone="signal"
                          meta={`${integer(a.transfers)} TX · ${integer(a.counterparties)} PEERS`}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyState state={activity.state} title="No inbound value observed" />
                  )}
                </Panel>

                <Panel>
                  <PanelHeader title="TOP SOURCES" meta={window} state={senders.length ? activity.state : "INDEXING"} />
                  {senders.length ? (
                    <div className="px-4 py-2">
                      {senders.map((a) => (
                        <MagnitudeRow
                          key={a.address}
                          label={shortAddress(a.address, 8, 6)}
                          value={compact(a.outbound)}
                          fraction={a.outbound / (senders[0]?.outbound || 1)}
                          meta={`${integer(a.transfers)} TX · ${integer(a.counterparties)} PEERS`}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyState state={activity.state} title="No outbound value observed" />
                  )}
                </Panel>

                <Panel className="sm:col-span-2">
                  <PanelHeader title="TOP ASSETS BY VALUE MOVED" meta={window} state={assetShare.length ? activity.state : "INDEXING"} />
                  {assetShare.length ? (
                    <div className="px-4 py-2">
                      {assetShare.map(([id, amount]) => (
                        <MagnitudeRow
                          key={id}
                          label={symbols.get(id) ?? shortAddress(id, 6, 4)}
                          value={compact(amount)}
                          fraction={amount / (assetShare[0]?.[1] || 1)}
                          tone="signal"
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyState state={activity.state} title="No asset moved value in this window" />
                  )}
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
                  />
                  {flowRows.rows.length ? (
                    <div className="flex flex-col">
                      {flowRows.rows.slice(0, 8).map((r) => {
                        const scale = Math.max(Math.abs(r.inflow), Math.abs(r.outflow), 1);
                        return (
                          <div key={r.entity_id} className="border-b border-rule-faint px-4 py-3 last:border-b-0">
                            <div className="flex items-baseline justify-between gap-3">
                              <a href={`/wallet/${r.entity_id}`} className="tabular truncate font-mono text-data-s text-ink hover:underline">
                                {shortAddress(r.entity_id, 8, 6)}
                              </a>
                              <span
                                className={`tabular shrink-0 font-mono text-data-s ${
                                  r.net_flow >= 0 ? "text-signal" : "text-negative"
                                }`}
                              >
                                {signed(r.net_flow)}
                              </span>
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
                      title="Net flow not yet computed"
                      detail="Directional flow is precomputed per address by the indexer after each run that commits new transfers."
                    />
                  )}
                  <p className="label-s border-t border-rule px-4 py-2 normal-case tracking-[0.02em] text-ink-faint">
                    Net flow is defined per address — received minus sent, in token units. It is not defined per token
                    contract, where a transfer moves balance without changing supply.
                  </p>
                </Panel>

                <Panel>
                  <PanelHeader title="CLASSIFICATION" state="INDEXING" />
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
                    <StateTag state={activity.state} />
                  </div>
                  <Methodology>
                    Every figure on this page is folded at request time from the transfers table over the trailing{" "}
                    {window} window. VALUE MOVED sums transfer amounts in token units and does not convert to a
                    currency, because no price oracle is wired to chain {CHAIN.id}. When a window reaches the row cap the
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
