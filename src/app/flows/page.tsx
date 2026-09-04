import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Shell, Split, PageHead } from "@/components/layout/Frame";
import {
  Panel,
  PanelHeader,
  EmptyState,
  Methodology,
  StateTag,
  CoverageNote,
} from "@/components/ui/primitives";
import { ChipLink, ChipGroup } from "@/components/ui/controls";
import { Ledger, LedgerRow, LedgerCell, type LedgerColumn } from "@/components/ui/Ledger";
import { Histogram, MagnitudeRow, FlowBar } from "@/components/charts";
import { Figure } from "@/components/ui/Figure";
import { getPulse, type Pulse } from "@/lib/chain";
import {
  getAssets,
  getWindowActivity,
  getFlowWindows,
  foldEdges,
  getContracts,
  foldByAddress,
  dominantFlow,
  getPriceSeries,
  movementsFrom,
  since,
  requestNow,
} from "@/lib/queries";
import { blockLabel, compact, integer, shortAddress, signed, utcClock } from "@/lib/format";
import { WINDOWS, CHAIN, type FlowWindow } from "@/config/site";
import { FoldmarkFlowArchitecture } from "@/components/flows/FoldmarkFlowArchitecture";
import { ClassificationPipeline } from "@/components/intelligence/ClassificationPipeline";
import {
  FLOW_CLASSES,
  parseFlowClass,
  buildContractIndex,
  filterByFlowClass,
  countByFlowClass,
} from "@/lib/flow-classification";
import { toNotional, notionalNote, prepareSeries, DEFAULT_ALIGNMENT } from "@/lib/notional";

export const metadata: Metadata = {
  title: "Capital flow",
  description: "Where value moves on Robinhood Chain: directed flows between addresses, ranked by observed magnitude.",
};

export const revalidate = 30;

const FLOW_COLUMNS: LedgerColumn[] = [
  { key: "from", label: "SOURCE", width: "minmax(140px, 1.2fr)" },
  { key: "to", label: "DESTINATION", width: "minmax(140px, 1.2fr)" },
  { key: "asset", label: "ASSET", width: "minmax(90px, 0.7fr)" },
  { key: "value", label: "AMOUNT", width: "minmax(110px, 0.9fr)", align: "right" },
  { key: "tx", label: "TRANSFERS", width: "minmax(90px, 0.7fr)", align: "right", hideBelow: "sm" },
  { key: "class", label: "CLASSIFICATION", width: "minmax(130px, 1fr)", align: "right", hideBelow: "md" },
];

export default async function FlowsPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string; flow?: string }>;
}) {
  const params = await searchParams;
  const window: FlowWindow = (WINDOWS as readonly string[]).includes(params.w ?? "") ? (params.w as FlowWindow) : "24H";

  /**
   * Filter state lives in the URL, not in component state.
   *
   * It survives a refresh, it can be sent to someone, back and forward work,
   * and the server renders the same page the link describes. An unrecognised
   * value parses to null and reads as ALL — a stale query string must never
   * produce an empty page that looks like a measurement of nothing.
   */
  const flowFilter = parseFlowClass(params.flow);
  const now = await requestNow();

  const [assetsResult, activity, flowRows, contractsResult, pulse] = await Promise.all([
    getAssets(),
    getWindowActivity(window, now),
    getFlowWindows(window),
    // The registry is what turns a transfer into a named flow. With it empty,
    // every flow is honestly UNCLASSIFIED rather than guessed at.
    getContracts(),
    /**
     * The chain answers with no database attached. Head, endpoint and round
     * trip are real measurements taken on this request, and they are why this
     * page can be honest about having folded nothing yet and still be visibly
     * connected to a live chain.
     */
    getPulse(),
  ]);

  const assets = assetsResult.rows;
  const symbols = new Map(assets.map((a) => [a.id, a.symbol]));

  /**
   * One filtered dataset, read by every surface on the page.
   *
   * The ledger, the counts, the rankings and the empty state all derive from
   * `edges`. A chip that changed the table while the totals stayed global would
   * be worse than a dead chip: it would be a working control telling a lie.
   */
  const contracts = buildContractIndex(contractsResult.rows);
  const allEdges = foldEdges(activity.rows, assets, 20);
  const classCounts = countByFlowClass(allEdges, contracts);
  const edges = filterByFlowClass(allEdges, contracts, flowFilter);
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
   * from a successful query is a measurement and is shown as one. Until then
   * the slot holds a rule and the tile says what will be counted into it.
   *
   * What it must never hold is a number. What it should not hold is the same
   * status word five times over: a reader facing five identical chips learns
   * nothing about the five different quantities underneath them, and the row
   * reads as a dashboard that broke rather than one that has not started. The
   * page states its condition once, in the strip above.
   */
  const observed = activity.state !== "INDEXING" && activity.state !== "UNAVAILABLE";
  const tiles: { label: string; value: string | null; unit: string; defines: string }[] = [
    {
      label: "TRANSFERS ON EDGES",
      value: observed ? integer(totalTransfers) : null,
      unit: "OBSERVED",
      defines: "TRANSFERS CARRIED BY FOLDED EDGES",
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
      defines: "USD, ONLY WHERE EACH TRANSFER IS PRICED",
    },
    {
      label: "TRANSFERS",
      value: observed ? integer(activity.transfers) : null,
      unit: window,
      defines: `ERC-20 TRANSFER LOGS IN ${window}`,
    },
    {
      label: "DIRECTED EDGES",
      value: observed ? integer(activity.uniquePairs) : null,
      unit: "ADDRESS PAIRS",
      defines: "DISTINCT SENDER / RECEIVER PAIRS",
    },
    {
      label: "ACTIVE ADDRESSES",
      value: observed ? integer(activity.activeAddresses) : null,
      unit: window,
      defines: "ADDRESSES PARTY TO A TRANSFER",
    },
  ];

  /**
   * Which composition the page draws.
   *
   * With edges, the measured instrument. Without them, the architecture: the
   * shape of a flow is real whether or not one has been observed, and drawing
   * that shape is not the same act as drawing a market.
   */
  const hasFlow = edges.length > 0;
  const hasActivity = activity.rows.length > 0;

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

        {/* The page's one state chip, set beside the values that are live
            whether or not anything has been indexed. */}
        <div className="mt-6">
          <ChainStrip pulse={pulse}>
            <StateTag state={activity.state} surface="flow" />
          </ChainStrip>
        </div>

        {activity.coverageNote ? (
          <div className="mt-3 border border-rule">
            <CoverageNote note={activity.coverageNote} />
          </div>
        ) : null}

        {/*
          Five tiles never divide evenly into two or four columns, and the grid
          used to draw its hairlines by showing a rule-toned background through
          a one-pixel gap — which meant the cells no tile occupied were painted
          in that tone too: a lighter block, three columns wide, sitting beside
          the last figure with nothing in it. The rules are drawn by the tiles
          themselves now, so the row simply ends where the tiles do.
        */}
        <div className="mt-6 grid border-t border-l border-rule sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="border-b border-r border-rule bg-void p-4">
              <p className="label-s">{t.label}</p>
              {t.value !== null ? (
                <>
                  <p className="tabular mt-1.5 font-mono text-data-l text-ink">{t.value}</p>
                  <p className="label-s mt-1 text-ink-faint">{t.unit}</p>
                </>
              ) : (
                <FigureSlot defines={t.defines} />
              )}
            </div>
          ))}
        </div>

        <div className="mt-6">
          {hasActivity ? (
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
          ) : (
            <Figure
              index="01"
              caption="The shape of a capital flow — source, asset, counterparty — and the fields an edge carries."
              provenance="FOLDMARK FLOW MODEL · STRUCTURE ONLY, NO OBSERVATIONS"
              aside={<span className="label-s border border-rule px-1.5 py-0.5 text-ink-faint">ARCHITECTURE</span>}
            >
              <div className="flex min-h-0 flex-col">
                {/*
                  The signature composition. It carries its own responsive
                  behaviour — a three-column diagram on desktop, a stacked one
                  below sm — so it needs no scroll wrapper and the page never
                  scrolls sideways.
                */}
                <FoldmarkFlowArchitecture variant="full" className="border-0" />

                {/*
                  Directly beneath the architecture, because it is the next
                  question a reader has: the diagram shows where value goes, and
                  this shows how far FOLDMARK can go in saying what that
                  movement was. Model mode — no entity is in view, so no stage
                  is current, and VERIFIED stays dark because nothing on this
                  chain reaches it.
                */}
                <ClassificationPipeline
                  mode="model"
                  className="border-0 border-t border-rule"
                  caption="A flow is named only when the counterparty contract is identified. Until a venue registry exists for this chain, every flow reads UNCLASSIFIED — a real answer about an unknown counterparty, not a placeholder for a better one."
                />
                {/* Six entries divide evenly into one, two and three columns,
                    so the rule-toned gap can never show through a cell no entry
                    occupies. That is the condition for using this technique at
                    all. */}
                <dl className="grid grid-cols-1 gap-px border-t border-rule bg-rule sm:grid-cols-2 lg:grid-cols-3">
                  {EDGE_RECORD.map(([term, definition]) => (
                    <div key={term} className="flex flex-col gap-1 bg-void px-4 py-3">
                      <dt className="label-s text-ink-muted">{term}</dt>
                      <dd className="text-body-s text-ink-faint">{definition}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </Figure>
          )}
        </div>

        <div className="mt-8">
          <h2 className="label mb-4 border-b border-rule pb-2.5 text-ink-muted">TOP RELATIONSHIPS · {window}</h2>
          <Ledger columns={FLOW_COLUMNS} caption={`Strongest directed value edges observed in the ${window} window`} minWidth={760}>
            {hasFlow ? (
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
              /* One designed empty state for the whole ledger, and no status
                 word repeated down a column. An observed-and-empty window earns
                 the instruction to widen it; a window the index has not reached
                 is still arriving, and says that instead. */
              <LedgerVoid
                title={activity.state === "EMPTY" ? "No flow observed in this window" : "Awaiting the first folded edge"}
                detail={
                  activity.state === "EMPTY"
                    ? "Nothing moved between addresses inside the period the index covers. Widen the window, or wait for the indexer to reach blocks containing transfers."
                    : "An edge is written here the moment the indexer folds a transfer between two addresses. The columns above are the fields each one will carry."
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
              hasFlow ? (
                /* items-start: a grid stretches its children by default, and a
                   Panel is a toned surface — so the shorter of two side-by-side
                   panels grew a block of empty surface below its last row to
                   match its neighbour. A panel ends where its content ends. */
                <div className="grid items-start gap-6 sm:grid-cols-2">
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
              ) : (
                /* Those four panels are what the engine produces. Before it has
                   produced any, the page names them and says what each will
                   hold — one composition, rather than four boxes each repeating
                   the same pending sentence. */
                <Panel>
                  <PanelHeader title="WHAT THE FLOW ENGINE COMPUTES" meta="PER WINDOW" />
                  <dl className="flex flex-col">
                    {ENGINE_OUTPUTS.map(([term, definition]) => (
                      <div
                        key={term}
                        className="flex flex-col gap-1 border-b border-rule-faint px-4 py-3 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-5"
                      >
                        <dt className="label-s shrink-0 text-ink-muted sm:w-[13rem]">{term}</dt>
                        <dd className="text-body-s text-ink-faint">{definition}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="label-s border-t border-rule px-4 py-2 normal-case tracking-[0.02em] text-ink-faint">
                    {notionalNote(notional)}
                  </p>
                </Panel>
              )
            }
            right={
              <div className="flex flex-col gap-6">
                {hasFlow ? (
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
                                <a
                                  href={`/wallet/${r.address}`}
                                  className="tabular truncate font-mono text-data-s text-ink hover:underline"
                                >
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
                ) : null}

                <Panel>
                  {/* No state chip: the classification rule below is not a
                      pending message, it is the product's policy, and it is
                      true in every state. */}
                  <PanelHeader title="CLASSIFICATION" meta="COUNTERPARTY DERIVED" />
                  <div className="px-4 py-3">
                    <p className="text-body-s text-ink-muted">
                      FOLDMARK does not guess what a transfer meant. A flow is labelled only when the counterparty
                      contract is identified. Until a venue registry exists for chain {CHAIN.id}, every flow reads
                      UNCLASSIFIED — which is a real classification for a counterparty whose identity is genuinely
                      unknown, not a placeholder for one.
                    </p>
                    {/*
                      These were list items styled like controls, which is the
                      worst of both: they invited a click and did nothing. They
                      are links now, and every surface on the page reads the
                      dataset they select.
                    */}
                    <div className="mt-3">
                      <ChipGroup label="Flow class">
                        <ChipLink href={`/flows?w=${window}`} active={flowFilter === null} count={allEdges.length}>
                          ALL
                        </ChipLink>
                        {FLOW_CLASSES.map((c) => (
                          <ChipLink
                            key={c}
                            // Clicking the active chip again clears it.
                            href={flowFilter === c ? `/flows?w=${window}` : `/flows?w=${window}&flow=${c.toLowerCase()}`}
                            active={flowFilter === c}
                            count={classCounts[c]}
                          >
                            {c}
                          </ChipLink>
                        ))}
                      </ChipGroup>
                    </div>
                    <p className="label-s mt-3 normal-case tracking-[0.02em] text-ink-faint">
                      UNKNOWN is preferred to a wrong label.
                    </p>
                  </div>
                </Panel>

                <div className="border border-rule">
                  <div className="flex items-center justify-between border-b border-rule px-4 py-2.5">
                    <span className="label text-ink">DATA CONDITION</span>
                    {/* Stated once per page. With no flow the strip at the top
                        already carries it, and a second chip here would be the
                        beginning of the column of status words this page was
                        rebuilt to remove. */}
                    {hasFlow ? <StateTag state={activity.state} surface="flow" /> : null}
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

/* ==========================================================================
   Live chain identity
   ========================================================================== */

/**
 * The values that are true with no database attached.
 *
 * Chain id comes from configuration; head, endpoint and round trip are measured
 * on this request. None of it is derived from the index, which is exactly why
 * it belongs at the top of a page whose index may be empty: the product is
 * demonstrably reading a live chain even when it has nothing folded to show.
 */
function ChainStrip({ pulse, children }: { pulse: Pulse; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border border-rule bg-surface px-4 py-2.5">
      <ChainFact label="CHAIN" value={String(CHAIN.id)} />
      <ChainFact label="HEAD" value={blockLabel(pulse.block)} />
      <ChainFact label="RPC" value={pulse.endpoint} tone="muted" />
      {pulse.latencyMs !== null ? (
        <ChainFact label="ROUND TRIP" value={`${integer(pulse.latencyMs)} MS`} tone="muted" />
      ) : null}
      <ChainFact label="READ AT" value={utcClock(pulse.updatedAt)} tone="muted" />
      {children ? <div className="ml-auto shrink-0">{children}</div> : null}
    </div>
  );
}

function ChainFact({ label, value, tone = "ink" }: { label: string; value: string; tone?: "ink" | "muted" }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <span className="label-s shrink-0 text-ink-dim">{label}</span>
      <span className={`tabular truncate font-mono text-data-s ${tone === "muted" ? "text-ink-muted" : "text-ink"}`}>
        {value}
      </span>
    </div>
  );
}

/* ==========================================================================
   Absence, designed
   ========================================================================== */

/**
 * A metric slot with no metric in it.
 *
 * A short rule sits where the numeral would, and the line beneath says what
 * will be counted into the slot rather than repeating the page's state. The
 * rule is presentation: it occupies the slot without asserting a value, and it
 * is the same weight as every other hairline here, so a row of them reads as
 * ruled stationery rather than as a dashboard that failed.
 */
function FigureSlot({ defines }: { defines: string }) {
  return (
    <>
      <span aria-hidden className="mt-1.5 flex h-[1.375rem] items-end">
        <span className="block h-px w-8 bg-rule-strong" />
      </span>
      <p className="label-s mt-1 text-ink-faint">{defines}</p>
    </>
  );
}

/**
 * The one empty state a ledger gets.
 *
 * The headers stay; the body says once what is being waited on, and three ruled
 * lines mark where rows will be drawn. They are evenly spaced and equal in
 * length on purpose — regularity is the tell that this is stationery and not a
 * reading.
 */
function LedgerVoid({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="min-w-0 max-w-[52ch]">
        <p className="font-display text-[1.25rem] leading-tight tracking-[-0.02em] text-ink">{title}</p>
        <p className="mt-2 text-body-s text-ink-muted">{detail}</p>
      </div>
      <div aria-hidden className="flex w-full shrink-0 flex-col gap-3 sm:w-[15rem]">
        <span className="block h-px w-full bg-rule" />
        <span className="block h-px w-full bg-rule" />
        <span className="block h-px w-full bg-rule" />
      </div>
    </div>
  );
}

/* ==========================================================================
   Flow architecture
   ========================================================================== */

/** What a folded edge records — the ledger's columns, defined. */
const EDGE_RECORD: ReadonlyArray<readonly [string, string]> = [
  ["SOURCE", "The address the value left. Always a real address, never a label."],
  ["DESTINATION", "Where it arrived, which may be a wallet, a market or a protocol contract."],
  ["ASSET", "The token contract that moved. One edge carries one asset."],
  ["AMOUNT", "Summed over the window, in that asset's own units at its own decimals."],
  ["TRANSFERS", "How many transfers folded into the edge — the one figure comparable across assets."],
  ["CLASSIFICATION", "Derived from the counterparty contract, or UNCLASSIFIED while its identity is unknown."],
];

/** What the engine derives from those edges, once there are any. */
const ENGINE_OUTPUTS: ReadonlyArray<readonly [string, string]> = [
  ["DIRECTED EDGES", "Sender, receiver and asset folded into one edge per pair, with the amount in that asset's units."],
  ["NET FLOW", "Received minus sent, per address and per asset. Never summed across assets."],
  ["MOST ACTIVE SOURCES", "Addresses ranked by transfers sent inside the window."],
  ["MOST ACTIVE DESTINATIONS", "Addresses ranked by transfers received inside the window."],
  ["MOST TRANSFERRED ASSETS", "Assets ranked by transfers observed, each amount kept beside its own symbol."],
  ["NOTIONAL MOVED", "A USD total, computed only where every transfer aligns to a price observed at or before it."],
];


