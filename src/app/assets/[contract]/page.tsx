import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Shell, Split, RailColumn } from "@/components/layout/Frame";
import { Tape, TapeCell, TapeStatic } from "@/components/ui/Tape";
import { Figure } from "@/components/ui/Figure";
import { Matrix, type MatrixRow } from "@/components/ui/Matrix";
import { Ledger, LedgerRow, LedgerCell, LedgerEmpty, type LedgerColumn } from "@/components/ui/Ledger";
import { Panel, PanelHeader, StateTag, Methodology } from "@/components/ui/primitives";
import { ExplorerLink } from "@/components/ui/controls";
import { MarketChartPanel } from "@/components/charts/MarketChartPanel";
import { ReferenceChart } from "@/components/charts/ReferenceChart";
import { TopologyView } from "@/components/graph/TopologyView";
import { CapitalFlowModule, NetworkActivityModule, TopFlowsModule } from "@/components/intelligence/rail";
import {
  getAssetByAddress,
  getIndexerStatus,
  getTransfersSince,
  getWindowActivity,
  getLatestPrices,
  foldByAsset,
  foldByAddress,
  flowForAsset,
  foldEdges,
  since,
  requestNow,
} from "@/lib/queries";
import { buildAssetGraph } from "@/lib/graph";
import {
  measured,
  indexing,
  unavailable,
  withFreshness,
  hasValue,
  type DataState,
  type Measured,
} from "@/lib/data-state";
import { presentMissing, type Surface } from "@/lib/presentation-state";
import { referenceMarketFor } from "@/config/reference-markets";
import { DexMarkets } from "@/components/market/DexMarkets";
import { restAssetMarket } from "@/server/db/rest-queries";
import { ObservedOwnership } from "@/components/market/ObservedOwnership";
import { observedOwnership } from "@/server/ownership/balances";
import { PriceHistoryPanel } from "@/components/market/PriceHistoryPanel";
import { priceHistory, assetNotional } from "@/server/market/historical";
import { blockLabel, compact, integer, isAddress, relativeTime, shortAddress } from "@/lib/format";
import { withheldMetrics } from "@/lib/market-copy";
import { bucketise } from "@/lib/buckets";
import { ASSET_TYPE_LABEL, CHAIN, WINDOWS, type FlowWindow } from "@/config/site";

export const revalidate = 30;

const INDEX = { source: "FOLDMARK indexer", method: "ERC-20 Transfer logs from Robinhood Chain RPC" };
const ORACLE = { source: "Price oracle", method: "Latest stored price observation for this asset" };

export async function generateMetadata({ params }: { params: Promise<{ contract: string }> }): Promise<Metadata> {
  const { contract } = await params;
  /**
   * A malformed address is a 404, and it is decided here so the status ships
   * with the response rather than after the body has already committed a 200.
   *
   * A well-formed contract that is simply not indexed is NOT a 404. That page
   * is a real answer — the contract may exist on chain and FOLDMARK has not
   * reached it — and it says exactly that.
   */
  if (!isAddress(contract)) notFound();
  const asset = await getAssetByAddress(contract);
  if (!asset) return { title: "Asset not indexed" };
  return {
    title: `${asset.symbol} — asset passport`,
    description: `${asset.name} on ${CHAIN.name}: observed activity, counterparties, capital flow and asset graph.`,
  };
}

export default async function AssetPassport({ params }: { params: Promise<{ contract: string }> }) {
  const { contract } = await params;
  if (!isAddress(contract)) notFound();

  const asset = await getAssetByAddress(contract);
  /**
   * Market observations, read from what enrichment persisted.
   *
   * Never a provider call from a page render: readers share one observation
   * rather than each producing a request, and everyone sees the same timestamp.
   */
  const dexMarket = asset ? await restAssetMarket(asset.id) : null;
  /**
   * Net observed movement per address. Not balances: the index follows the head
   * and does not reach this asset's first transfer, so the panel says so.
   */
  const ownership = asset ? await observedOwnership(asset.id) : null;
  /**
   * Real observed prices, and what share of transfers they can actually value.
   * Alignment is the canonical no-look-ahead rule; coverage travels with the
   * total so a partial figure is never read as a complete one.
   */
  const [history, notionalCoverage] = asset
    ? await Promise.all([priceHistory(asset.id), assetNotional(asset.id, asset.decimals)])
    : [null, null];
  const now = await requestNow();

  const [indexer, activity24h] = await Promise.all([getIndexerStatus(), getWindowActivity("24H", now)]);

  // The chain head is read over RPC and needs no database. It is the figure on
  // this page that is real before anything is indexed, so it is shown as a real
  // figure rather than folded into the same waiting state as the rest.
  const chainHead = withFreshness(indexer.chainHead, now);

  if (!asset) {
    // A contract with a confirmed underlying still has a real market to show,
    // even when nothing about it has been indexed. Unmapped addresses get no
    // chart: an arbitrary benchmark beside an unknown contract would invite
    // exactly the association the mapping allowlist exists to prevent.
    const mapped = referenceMarketFor(CHAIN.id, contract);

    return (
      <Shell>
        <div className="band-dense">
          <p className="label-s">ASSET PASSPORT · CHAIN {CHAIN.id}</p>
          <h1 className="mt-3 font-mono text-[1.25rem] break-all text-ink">{contract}</h1>
          <Panel className="mt-6">
            <PanelHeader title="NOT IN THE INDEX" state="INDEXING" surface="registry" />
            <div className="flex flex-col items-start gap-3 px-4 py-8">
              <StateTag state="INDEXING" surface="registry" />
              <p className="font-display text-[1.5rem] text-ink">This contract has not been observed</p>
              <p className="measure text-body-s text-ink-muted">
                FOLDMARK indexes a contract once it emits an ERC-20 Transfer that the indexer reaches. That this address
                is absent is a statement about the index, not about the contract.
              </p>
              <ExplorerLink address={contract} explorer={CHAIN.explorer}>
                Inspect on Blockscout
              </ExplorerLink>
            </div>
            <ChainFacts head={chainHead} now={now} />
          </Panel>

          {mapped ? (
            <div className="mt-6 border border-rule bg-surface">
              <ReferenceChart contractAddress={contract} height={340} selectable={false} />
            </div>
          ) : null}
        </div>
      </Shell>
    );
  }

  // one query per window, folded into the matrix
  const windowRows = await Promise.all(
    WINDOWS.map(async (w) => {
      const res = await getTransfersSince(since(w, now), { assetId: asset.id, limit: 2000 });
      const folded = foldByAsset(res.rows, [asset], w, now, res.capped).get(asset.id);
      return { window: w, state: res.state, capped: res.capped, folded, rows: res.rows };
    }),
  );

  const window7d = windowRows.find((r) => r.window === "7D")!;
  const graph = buildAssetGraph(window7d.rows, asset, { limit: 7 });
  const counterparties = foldByAddress(window7d.rows, [asset], 12);
  const edges = foldEdges(window7d.rows, [asset], 8);
  // The latest persisted observation. Reading a page never calls a provider, so
  // a hundred readers cost nothing and all of them see the same timestamp.
  const prices = await getLatestPrices([asset.id]);
  const price = prices.get(asset.id);

  /**
   * Whether FOLDMARK holds an onchain price of its own for this asset.
   *
   * It decides which chart tab opens. With a price of our own the onchain
   * market is what the product is for; without one the visitor lands on the
   * reference market — a real instrument, sourced and labelled as TradingView
   * data — rather than on an explanation of why there is no chart. The
   * reference feed is the underlying instrument and never fills DEX SPOT,
   * canonical price, market state, notional or liquidity.
   */
  const hasOnchainSeries = Boolean(price) || dexMarket?.status === "MATCHED";

  const cell = (value: number | null | undefined, state: (typeof windowRows)[number]): Measured<number | string> =>
    value === null || value === undefined
      ? state.state === "UNAVAILABLE"
        ? unavailable(INDEX)
        : indexing(INDEX)
      : measured(value, INDEX, { observedAt: indexer.updatedAt, state: state.capped ? "PARTIAL" : "OK" });

  /**
   * The passport's one mode indicator.
   *
   * Every cell on this page used to carry its own AWAITING / SYNCING /
   * INDEXING caption, so a page with nothing indexed read as forty separate
   * warnings about one fact. The fact is stated once, here, and the cells below
   * simply hold an em dash — which is what a dash has always meant in this
   * product: a slot with no measurement in it, never a zero.
   */
  const observed = windowRows.some((r) => r.rows.length > 0);
  const answered = windowRows.every((r) => r.state !== "UNAVAILABLE");
  const modeState: DataState = observed ? "OK" : answered ? "EMPTY" : "INDEXING";
  const modeDetail = observed
    ? "Every figure below is folded from indexed Transfer logs at request time. A cell holding an em dash was not observed in that window — it is never a zero."
    : answered
      ? `The index answered for each window and recorded no transfer of ${asset.symbol} in them. Cells hold an em dash where nothing was measured.`
      : "Nothing has been observed for this contract yet. Cells hold an em dash until a value is measured, and nothing on this page is estimated in the meantime.";

  const indexedTo = indexer.lastProcessedBlock.value;
  const headBlock = chainHead.value;

  const matrixRows: MatrixRow[] = [
    {
      label: "TRANSFERS",
      source: "Transfer logs",
      surface: "activity",
      cells: windowRows.map((r) => cell(r.folded?.transfers ?? (r.state === "EMPTY" ? 0 : null), r)),
      format: (v) => integer(Number(v)),
    },
    {
      label: "GROSS VOLUME",
      source: "Token units",
      surface: "activity",
      cells: windowRows.map((r) => cell(r.folded?.volume ?? (r.state === "EMPTY" ? 0 : null), r)),
      format: (v) => compact(Number(v)),
    },
    {
      label: "COUNTERPARTIES",
      source: "Distinct addresses",
      surface: "flow",
      cells: windowRows.map((r) => cell(r.folded?.counterparties ?? (r.state === "EMPTY" ? 0 : null), r)),
      format: (v) => integer(Number(v)),
    },
  ];

  const cpColumns: LedgerColumn[] = [
    { key: "addr", label: "ADDRESS", width: "minmax(160px, 1.6fr)" },
    { key: "dir", label: "DIRECTION", width: "minmax(100px, 0.8fr)" },
    { key: "tx", label: "TRANSFERS", width: "minmax(90px, 0.7fr)", align: "right" },
    { key: "in", label: "RECEIVED", width: "minmax(100px, 0.8fr)", align: "right" },
    { key: "out", label: "SENT", width: "minmax(100px, 0.8fr)", align: "right", hideBelow: "sm" },
    { key: "cp", label: "PEERS", width: "minmax(80px, 0.6fr)", align: "right", hideBelow: "md" },
  ];

  return (
    <>
      <Shell>
        <div className="band-dense">
          <p className="label-s">
            ASSET PASSPORT · CHAIN {CHAIN.id}
            {indexedTo !== null
              ? ` · INDEXED TO ${blockLabel(indexedTo)}`
              : headBlock !== null
                ? ` · CHAIN HEAD ${blockLabel(headBlock)}`
                : ""}
          </p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-5">
            <div className="min-w-0">
              <h1 className="font-display text-[2.25rem] leading-none tracking-[-0.025em] text-ink sm:text-display-l">
                {asset.symbol}
              </h1>
              <p className="mt-2 text-body text-ink-muted">{asset.name}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StateTag state="OK" label={ASSET_TYPE_LABEL[asset.asset_type] ?? asset.asset_type} />
              {asset.verified ? <StateTag state="OK" label="VERIFIED CONTRACT" /> : <StateTag state="EMPTY" label="UNVERIFIED" />}
            </div>
          </div>

          {/* The one place this page says what mode it is in. */}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border border-rule bg-surface px-4 py-2.5">
            <StateTag state={modeState} surface="activity" />
            <p className="min-w-0 max-w-[74ch] text-body-s text-ink-muted">{modeDetail}</p>
            {hasValue(chainHead) ? (
              <p className="label-s ml-auto shrink-0 text-ink-faint">
                CHAIN HEAD {blockLabel(chainHead.value)} · {relativeTime(chainHead.observedAt, now)}
              </p>
            ) : null}
          </div>
        </div>
      </Shell>

      <Tape label={`${asset.symbol} status`}>
        {/*
          A cell with a value prints it. A cell without one prints an em dash and
          stops there: the state is said once, by the mode line above. No `?? 0`
          anywhere — defaulting an absent count to zero would publish a
          fabricated measurement, which is the one thing a tape must never do.
        */}
        <TapeMeasure
          label="PRICE"
          surface="price"
          measurement={
            price
              ? measured(price.price, { source: price.source }, { observedAt: price.observedAt })
              : dexMarket?.primary
                ? measured(
                    dexMarket.primary.priceUsd,
                    { source: `${dexMarket.provider ?? "provider"} · dex spot · pool ${dexMarket.primary.pairAddress}` },
                    { observedAt: dexMarket.observedAt ?? undefined },
                  )
                : unavailable<number>(ORACLE)
          }
          format={(v) => `$${compact(Number(v), 4)}`}
        />
        <TapeMeasure
          label="TRANSFERS 24H"
          surface="activity"
          measurement={cell(windowRows[2].folded?.transfers, windowRows[2])}
          format={(v) => integer(Number(v))}
        />
        <TapeMeasure
          label="GROSS VOLUME 24H"
          surface="activity"
          measurement={cell(windowRows[2].folded?.volume, windowRows[2])}
          format={(v) => compact(Number(v))}
        />
        <TapeMeasure
          label="COUNTERPARTIES 24H"
          surface="flow"
          measurement={cell(windowRows[2].folded?.counterparties, windowRows[2])}
          format={(v) => integer(Number(v))}
        />
        {/* Real over RPC, with or without a database. */}
        <TapeMeasure label="CHAIN HEAD" surface="network" measurement={chainHead} format={(v) => blockLabel(Number(v))} />
        <TapeMeasure
          label="INDEXED TO"
          surface="network"
          measurement={withFreshness(indexer.lastProcessedBlock, now)}
          format={(v) => blockLabel(Number(v))}
        />
        <TapeStatic label="DECIMALS" value={String(asset.decimals)} />
        <TapeStatic label="UPDATED" value={relativeTime(indexer.updatedAt, now)} />
      </Tape>

      <Shell>
        <div className="band-dense">
          <Split
            ratio="rail"
            gap="gap-6"
            align="stretch"
            left={
              <MarketChartPanel
                contract={asset.contract_address}
                symbol={asset.symbol}
                height={360}
                hasOnchainSeries={hasOnchainSeries}
              />
            }
            right={
              <RailColumn revision={asset.id}>
                {/*
                  One market voice, beside the chart it belongs to.

                  This slot held a panel fed by a second, older market pipeline
                  that has no coverage on this chain and therefore announced
                  that no venue quoted the contract — while the observed pools
                  were listed further down the same page. The second pipeline is
                  gone rather than hidden, and the real observation stands here.
                */}
                {dexMarket ? <DexMarkets market={dexMarket} /> : null}
                <CapitalFlowModule window="7D" activity={{ ...activity24h, ...deriveActivity(window7d, now) }} edges={edges} assets={[asset]} />
                <NetworkActivityModule window="7D" activity={{ ...activity24h, ...deriveActivity(window7d, now) }} />
                <TopFlowsModule edges={edges} assets={[asset]} window="7D" state={window7d.state} />
              </RailColumn>
            }
          />
        </div>
      </Shell>

      <Shell>
        <div className="band-dense">
          <h2 className="label mb-4 border-b border-rule pb-2.5 text-ink-muted">OBSERVED ACROSS WINDOWS</h2>
          <Matrix columns={[...WINDOWS]} rows={matrixRows} caption={`${asset.symbol} metrics by observation window`} />

          <div className="mt-4 border border-rule">
            <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-rule px-4 py-2.5">
              <h3 className="label text-ink">WITHHELD FROM THIS MATRIX</h3>
              <span className="label-s text-ink-faint">NOT A PER-WINDOW MEASURE</span>
            </header>
            <ul className="flex flex-col">
              {withheldMetrics(history?.points.length ?? 0, dexMarket?.markets.length ?? 0).map(([metric, why]) => (
                <li
                  key={metric}
                  className="grid grid-cols-1 gap-x-6 gap-y-1 border-b border-rule-faint px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(9rem,1fr)_minmax(0,3fr)]"
                >
                  <span className="label-s text-ink-muted">{metric}</span>
                  <span className="text-body-s text-ink-faint">{why}</span>
                </li>
              ))}
            </ul>
            <Methodology>
              Each column is an independent query over that trailing window, computed at request time from indexed
              Transfer logs. GROSS VOLUME is the sum of transfer amounts in token units — it is not a net flow and not a
              dollar figure. COUNTERPARTIES counts distinct addresses that appear as sender or recipient; it is not a
              holder count, which would require reconstructing balances over the full history. Cells reading PARTIAL hit
              the per-window row cap and are a lower bound. A metric listed above is one that does not fold into a
              trailing window — it is named and explained rather than drawn as a row of dashes.
            </Methodology>
          </div>
        </div>
      </Shell>

      <Shell>
        <div className="band-signature">
          <Figure
            index="01"
            caption={
              // A caption counting nodes is a claim about what was observed. With
              // nothing observed it would read "0 nodes, 0 relationships from 0
              // transfers", which asserts an empty market rather than an empty index.
              graph.shown.nodes > 0 ? (
                <>
                  {asset.symbol} asset graph over 7D — {integer(graph.shown.nodes)} nodes,{" "}
                  {integer(graph.shown.edges)} relationships from {integer(graph.totals.transfers)} transfers.
                </>
              ) : (
                <>{asset.symbol} asset graph over 7D.</>
              )
            }
            provenance="ROBINHOOD CHAIN RPC · ERC-20 TRANSFER LOGS INDEXED BY FOLDMARK"
          >
            <div className="flex h-[24rem] min-h-0">
              <TopologyView
                graph={graph}
                emptyHint={`No transfer of ${asset.symbol} was observed in the last seven days, so there is no relationship to draw.`}
              />
            </div>
          </Figure>
        </div>
      </Shell>

      <Shell>
        <div className="band-dense">
          <Split
            ratio="8:4"
            gap="gap-6"
            left={
              <>
                <h2 className="label mb-4 border-b border-rule pb-2.5 text-ink-muted">COUNTERPARTY LEDGER · 7D</h2>
                <Ledger columns={cpColumns} caption={`Addresses that moved ${asset.symbol} in the last seven days`} minWidth={640}>
                  {counterparties.length ? (
                    counterparties.map((c) => {
                      const flow = flowForAsset(c, asset.id);
                      const inbound = flow?.inbound ?? 0;
                      const outbound = flow?.outbound ?? 0;
                      return (
                      <LedgerRow key={c.address} columns={cpColumns} href={`/wallet/${c.address}`}>
                        <LedgerCell column={cpColumns[0]}>
                          <span className="tabular font-mono text-data text-ink">{shortAddress(c.address, 10, 8)}</span>
                        </LedgerCell>
                        <LedgerCell column={cpColumns[1]}>
                          <span className="label-s">{inbound >= outbound ? "NET RECEIVER" : "NET SENDER"}</span>
                        </LedgerCell>
                        <LedgerCell column={cpColumns[2]}>
                          <span className="tabular font-mono text-data-s text-ink">{integer(c.transfers)}</span>
                        </LedgerCell>
                        <LedgerCell column={cpColumns[3]}>
                          <span className="tabular font-mono text-data-s text-ink">{compact(inbound)}</span>
                        </LedgerCell>
                        <LedgerCell column={cpColumns[4]}>
                          <span className="tabular font-mono text-data-s text-ink-muted">{compact(outbound)}</span>
                        </LedgerCell>
                        <LedgerCell column={cpColumns[5]}>
                          <span className="tabular font-mono text-data-s text-ink-muted">{integer(c.counterparties)}</span>
                        </LedgerCell>
                      </LedgerRow>
                      );
                    })
                  ) : (
                    <LedgerEmpty
                      state={window7d.state}
                      surface="flow"
                      detail="Addresses appear here once they send or receive this asset within the window."
                    />
                  )}
                </Ledger>
              </>
            }
            right={
              <div className="flex flex-col gap-6">
                {history ? (
                  <PriceHistoryPanel history={history} coverage={notionalCoverage} symbol={asset.symbol} />
                ) : null}

                {ownership ? (
                  <ObservedOwnership ownership={ownership} decimals={asset.decimals} symbol={asset.symbol} />
                ) : null}

                <Panel>
                  <PanelHeader title="CONTRACT" />
                  <div className="px-4 py-3">
                    <p className="tabular font-mono text-data break-all text-ink">{asset.contract_address}</p>
                    <div className="mt-3">
                      <ExplorerLink address={asset.contract_address} explorer={CHAIN.explorer}>
                        View on Blockscout
                      </ExplorerLink>
                    </div>
                  </div>
                </Panel>

                <Panel>
                  <PanelHeader title="DATA SOURCES" />
                  <ul className="flex flex-col">
                    {[
                      ["IDENTITY", asset.source ?? "On-chain contract metadata"],
                      ["TRANSFERS", "Robinhood Chain RPC — eth_getLogs, Transfer topic"],
                      ["BLOCK TIME", "Block header timestamp, resolved per block"],
                      ["CHAIN HEAD", "Robinhood Chain RPC — read live, independent of the index"],
                      ["REFERENCE CHART", "TradingView — the underlying instrument, never the onchain token price"],
                      ["EXPLORER", CHAIN.explorer.replace("https://", "")],
                      ["PRICE", `No oracle wired to chain ${CHAIN.id}`],
                    ].map(([k, v]) => (
                      <li key={k} className="flex flex-col gap-0.5 border-b border-rule-faint px-4 py-2.5 last:border-b-0">
                        <span className="label-s">{k}</span>
                        <span className="text-body-s text-ink-muted">{v}</span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              </div>
            }
          />
        </div>
      </Shell>
    </>
  );
}

/**
 * One tape cell.
 *
 * With a value it is an ordinary TapeCell. Without one it prints an em dash and
 * stops: the per-cell status caption is what turned a tape of unobserved cells
 * into a row of shouting, and this page says that once instead. The sentence is
 * kept for screen readers, where a dash on its own carries nothing.
 */
function TapeMeasure({
  label,
  measurement,
  format,
  surface = "generic",
}: {
  label: string;
  measurement: Measured<number | string>;
  format?: (value: number | string) => string;
  surface?: Surface;
}) {
  if (hasValue(measurement)) {
    return <TapeCell label={label} measurement={measurement} format={format} surface={surface} />;
  }
  return (
    <div className="flex min-w-[9.5rem] shrink-0 flex-col justify-center gap-1 border-r border-rule py-3 pr-6 last:border-r-0 sm:min-w-[11rem]">
      <dt className="label-s">{label}</dt>
      <dd>
        <span aria-hidden className="font-mono text-data leading-none text-ink-dim">
          &mdash;
        </span>
        <span className="sr-only">{presentMissing(measurement.state, surface).detail}</span>
      </dd>
    </div>
  );
}

/**
 * The chain, stated as fact.
 *
 * Chain name, chain id and the head block are true without a database — the
 * head is read over RPC on every request. On a page that otherwise has nothing
 * to report, these are the values that make the product demonstrably connected
 * rather than merely waiting.
 */
function ChainFacts({ head, now }: { head: Measured<number>; now: number }) {
  const live = hasValue(head);
  const facts: ReadonlyArray<readonly [string, string]> = [
    ["CHAIN", CHAIN.name],
    ["CHAIN ID", String(CHAIN.id)],
    ["CHAIN HEAD", live ? blockLabel(head.value) : "—"],
    ["HEAD READ", live ? relativeTime(head.observedAt, now) : "—"],
  ];
  return (
    <dl className="grid grid-cols-2 gap-px border-t border-rule bg-rule sm:grid-cols-4">
      {facts.map(([k, v]) => (
        <div key={k} className="flex flex-col gap-1 bg-surface px-4 py-3">
          <dt className="label-s">{k}</dt>
          <dd className={`tabular font-mono text-data-s ${v === "—" ? "text-ink-dim" : "text-ink"}`}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Reshape a per-asset window into the activity shape the rail modules expect. */
function deriveActivity(
  row: { window: FlowWindow; state: ReturnType<typeof indexing>["state"]; capped: boolean; rows: { from_address: string; to_address: string; asset_id: string | null; timestamp: string }[] },
  now: number,
) {
  const addresses = new Set<string>();
  const pairs = new Set<string>();
  for (const r of row.rows) {
    addresses.add(r.from_address);
    addresses.add(r.to_address);
    pairs.add(r.from_address + ">" + r.to_address);
  }
  const span = { "1H": 3_600_000, "6H": 21_600_000, "24H": 86_400_000, "7D": 604_800_000, "30D": 2_592_000_000 }[row.window];
  // Intervals the row cap never reached come back null, not zero.
  const buckets = bucketise(row.rows, now - span, span, row.capped);
  return {
    state: row.state,
    window: row.window,
    transfers: row.rows.length,
    activeAddresses: addresses.size,
    activeAssets: row.rows.some((r) => r.asset_id) ? 1 : 0,
    uniquePairs: pairs.size,
    capped: row.capped,
    buckets,
    bucketMinutes: Math.round(span / 24 / 60000),
  };
}
