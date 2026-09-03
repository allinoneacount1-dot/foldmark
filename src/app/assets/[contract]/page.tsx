import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Shell, Split, RailColumn } from "@/components/layout/Frame";
import { Tape, TapeCell, TapeStatic } from "@/components/ui/Tape";
import { Figure } from "@/components/ui/Figure";
import { Matrix, type MatrixRow } from "@/components/ui/Matrix";
import { Ledger, LedgerRow, LedgerCell, LedgerEmpty, type LedgerColumn } from "@/components/ui/Ledger";
import { Panel, PanelHeader, StateTag, Methodology } from "@/components/ui/primitives";
import { ExplorerLink } from "@/components/ui/controls";
import { MarketChart } from "@/components/charts/MarketChart";
import { TopologyView } from "@/components/graph/TopologyView";
import { CapitalFlowModule, NetworkActivityModule, TopFlowsModule } from "@/components/intelligence/rail";
import { MarketPanel } from "@/components/intelligence/MarketPanel";
import { getMarketSnapshot } from "@/server/market-data";
import { markViewed } from "@/server/market-data/scheduler";
import {
  getAssetByAddress,
  getIndexerStatus,
  getTransfersSince,
  getWindowActivity,
  getLatestPrices,
  foldByAsset,
  foldByAddress,
  foldEdges,
  since,
  requestNow,
} from "@/lib/queries";
import { buildAssetGraph } from "@/lib/graph";
import { measured, indexing, unavailable, withFreshness, type Measured } from "@/lib/data-state";
import { blockLabel, compact, integer, isAddress, relativeTime, shortAddress } from "@/lib/format";
import { ASSET_TYPE_LABEL, CHAIN, WINDOWS, type FlowWindow } from "@/config/site";

export const revalidate = 30;

const INDEX = { source: "FOLDMARK indexer", method: "ERC-20 Transfer logs from Robinhood Chain RPC" };
const ORACLE = { source: "Price oracle", method: "Latest stored price observation for this asset" };

export async function generateMetadata({ params }: { params: Promise<{ contract: string }> }): Promise<Metadata> {
  const { contract } = await params;
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
  const now = await requestNow();

  const [indexer, activity24h] = await Promise.all([getIndexerStatus(), getWindowActivity("24H", now)]);

  if (!asset) {
    return (
      <Shell>
        <div className="band-dense">
          <p className="label-s">ASSET PASSPORT · CHAIN {CHAIN.id}</p>
          <h1 className="mt-3 font-mono text-[1.25rem] break-all text-ink">{contract}</h1>
          <Panel className="mt-6">
            <PanelHeader title="NOT IN THE INDEX" state="INDEXING" />
            <div className="flex flex-col items-start gap-3 px-4 py-8">
              <StateTag state="INDEXING" />
              <p className="font-display text-[1.5rem] text-ink">This contract has not been observed</p>
              <p className="measure text-body-s text-ink-muted">
                FOLDMARK indexes a contract once it emits an ERC-20 Transfer that the indexer reaches. That this address
                is absent is a statement about the index, not about the contract.
              </p>
              <ExplorerLink address={contract} explorer={CHAIN.explorer}>
                Inspect on Blockscout
              </ExplorerLink>
            </div>
          </Panel>
        </div>
      </Shell>
    );
  }

  // one query per window, folded into the matrix
  const windowRows = await Promise.all(
    WINDOWS.map(async (w) => {
      const res = await getTransfersSince(since(w, now), { assetId: asset.id, limit: 2000 });
      const folded = foldByAsset(res.rows, [asset], w, now).get(asset.id);
      return { window: w, state: res.state, capped: res.capped, folded, rows: res.rows };
    }),
  );

  const window7d = windowRows.find((r) => r.window === "7D")!;
  const graph = buildAssetGraph(window7d.rows, asset, { limit: 7 });
  const counterparties = foldByAddress(window7d.rows, [asset], 12);
  const edges = foldEdges(window7d.rows, [asset], 8);
  // Viewing an asset promotes it to the fastest refresh tier for the next few
  // minutes: the free quota is spent where someone is actually looking.
  markViewed(asset.contract_address);
  const [prices, market] = await Promise.all([
    getLatestPrices([asset.id]),
    getMarketSnapshot(asset.contract_address),
  ]);
  const price = prices.get(asset.id);

  const cell = (value: number | null | undefined, state: (typeof windowRows)[number]): Measured<number | string> =>
    value === null || value === undefined
      ? state.state === "UNAVAILABLE"
        ? unavailable(INDEX)
        : indexing(INDEX)
      : measured(value, INDEX, { observedAt: indexer.updatedAt, state: state.capped ? "PARTIAL" : "OK" });

  const matrixRows: MatrixRow[] = [
    {
      label: "TRANSFERS",
      source: "Transfer logs",
      cells: windowRows.map((r) => cell(r.folded?.transfers ?? (r.state === "EMPTY" ? 0 : null), r)),
      format: (v) => integer(Number(v)),
    },
    {
      label: "GROSS VOLUME",
      source: "Token units",
      cells: windowRows.map((r) => cell(r.folded?.volume ?? (r.state === "EMPTY" ? 0 : null), r)),
      format: (v) => compact(Number(v)),
    },
    {
      label: "COUNTERPARTIES",
      source: "Distinct addresses",
      cells: windowRows.map((r) => cell(r.folded?.counterparties ?? (r.state === "EMPTY" ? 0 : null), r)),
      format: (v) => integer(Number(v)),
    },
    {
      label: "PRICE",
      source: "No oracle wired to chain " + CHAIN.id,
      cells: WINDOWS.map(() => unavailable<number | string>(ORACLE)),
    },
    {
      label: "LIQUIDITY",
      source: "No DEX pool identified",
      cells: WINDOWS.map(() => unavailable<number | string>({ source: "DEX pool registry" })),
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
            ASSET PASSPORT · CHAIN {CHAIN.id} · INDEXED TO {blockLabel(indexer.lastProcessedBlock.value)}
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
        </div>
      </Shell>

      <Tape label={`${asset.symbol} status`}>
        <TapeCell
          label="PRICE"
          measurement={
            market?.canonical
              ? measured(
                  market.canonical.price,
                  { source: `${market.canonical.source} · ${market.canonical.priceType.replace("_", " ").toLowerCase()}` },
                  { observedAt: market.canonical.observedAt },
                )
              : price
                ? measured(price.price, { source: price.source }, { observedAt: price.observedAt })
                : unavailable<number>(ORACLE)
          }
          format={(v) => `$${compact(Number(v), 4)}`}
        />
        <TapeCell label="TRANSFERS 24H" measurement={cell(windowRows[2].folded?.transfers ?? 0, windowRows[2])} format={(v) => integer(Number(v))} />
        <TapeCell label="GROSS VOLUME 24H" measurement={cell(windowRows[2].folded?.volume ?? 0, windowRows[2])} format={(v) => compact(Number(v))} />
        <TapeCell label="COUNTERPARTIES 24H" measurement={cell(windowRows[2].folded?.counterparties ?? 0, windowRows[2])} format={(v) => integer(Number(v))} />
        <TapeCell label="INDEXED TO" measurement={withFreshness(indexer.lastProcessedBlock, now)} format={(v) => blockLabel(Number(v))} />
        <TapeStatic label="DECIMALS" value={String(asset.decimals)} />
        <TapeStatic label="UPDATED" value={relativeTime(indexer.updatedAt, now)} />
      </Tape>

      <Shell>
        <div className="band-dense">
          <Split
            ratio="rail"
            gap="gap-6"
            align="stretch"
            left={<MarketChart contract={asset.contract_address} symbol={asset.symbol} height={360} />}
            right={
              <RailColumn revision={asset.id}>
                <MarketPanel snapshot={market} symbol={asset.symbol} now={now} />
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
            <Methodology>
              Each column is an independent query over that trailing window, computed at request time from indexed
              Transfer logs. GROSS VOLUME is the sum of transfer amounts in token units — it is not a net flow and not a
              dollar figure. COUNTERPARTIES counts distinct addresses that appear as sender or recipient; it is not a
              holder count, which would require reconstructing balances over the full history. Cells reading PARTIAL hit
              the per-window row cap and are a lower bound.
            </Methodology>
          </div>
        </div>
      </Shell>

      <Shell>
        <div className="band-signature">
          <Figure
            index="01"
            caption={
              <>
                {asset.symbol} asset graph over 7D — {integer(graph.shown.nodes)} nodes, {integer(graph.shown.edges)}{" "}
                relationships from {integer(graph.totals.transfers)} transfers.
              </>
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
                    counterparties.map((c) => (
                      <LedgerRow key={c.address} columns={cpColumns} href={`/wallet/${c.address}`}>
                        <LedgerCell column={cpColumns[0]}>
                          <span className="tabular font-mono text-data text-ink">{shortAddress(c.address, 10, 8)}</span>
                        </LedgerCell>
                        <LedgerCell column={cpColumns[1]}>
                          <span className="label-s">{c.inbound >= c.outbound ? "NET RECEIVER" : "NET SENDER"}</span>
                        </LedgerCell>
                        <LedgerCell column={cpColumns[2]}>
                          <span className="tabular font-mono text-data-s text-ink">{integer(c.transfers)}</span>
                        </LedgerCell>
                        <LedgerCell column={cpColumns[3]}>
                          <span className="tabular font-mono text-data-s text-ink">{compact(c.inbound)}</span>
                        </LedgerCell>
                        <LedgerCell column={cpColumns[4]}>
                          <span className="tabular font-mono text-data-s text-ink-muted">{compact(c.outbound)}</span>
                        </LedgerCell>
                        <LedgerCell column={cpColumns[5]}>
                          <span className="tabular font-mono text-data-s text-ink-muted">{integer(c.counterparties)}</span>
                        </LedgerCell>
                      </LedgerRow>
                    ))
                  ) : (
                    <LedgerEmpty
                      state={window7d.state}
                      title="No counterparty observed in 7D"
                      detail="Addresses appear here once they send or receive this asset within the window."
                    />
                  )}
                </Ledger>
              </>
            }
            right={
              <div className="flex flex-col gap-6">
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
  const buckets = new Array<number>(24).fill(0);
  for (const r of row.rows) {
    const t = new Date(r.timestamp).getTime();
    const idx = Math.min(23, Math.max(0, Math.floor(((t - (now - span)) / span) * 24)));
    buckets[idx] += 1;
  }
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
