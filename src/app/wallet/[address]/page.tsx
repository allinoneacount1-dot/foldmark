import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Shell, Split, PageHead } from "@/components/layout/Frame";
import { Tape, TapeCell, TapeStatic } from "@/components/ui/Tape";
import { Figure } from "@/components/ui/Figure";
import { Panel, PanelHeader, EmptyState, Methodology, StateTag } from "@/components/ui/primitives";
import { ChipLink, ChipGroup, ExplorerLink } from "@/components/ui/controls";
import { Ledger, LedgerRow, LedgerCell, LedgerEmpty, type LedgerColumn } from "@/components/ui/Ledger";
import { Histogram, MagnitudeRow, FlowBar } from "@/components/charts";
import { TopologyView } from "@/components/graph/TopologyView";
import { getAssets, getIndexerStatus, getTransfersSince, since, requestNow,
} from "@/lib/queries";
import { buildMarketGraph } from "@/lib/graph";
import { measured, indexing, type Measured } from "@/lib/data-state";
import { blockLabel, compact, fromBaseUnits, integer, isAddress, relativeTime, shortAddress, signed } from "@/lib/format";
import { WINDOWS, WINDOW_MS, CHAIN, ASSET_TYPE_LABEL, type FlowWindow } from "@/config/site";

export const revalidate = 30;

const INDEX = { source: "FOLDMARK indexer", method: "ERC-20 Transfer logs involving this address" };

export async function generateMetadata({ params }: { params: Promise<{ address: string }> }): Promise<Metadata> {
  const { address } = await params;
  return {
    title: isAddress(address) ? `${shortAddress(address, 8, 6)} — wallet` : "Invalid address",
    description: `Observed activity, exposure and counterparties for ${address} on ${CHAIN.name}.`,
  };
}

export default async function WalletPage({
  params,
  searchParams,
}: {
  params: Promise<{ address: string }>;
  searchParams: Promise<{ w?: string }>;
}) {
  const { address: raw } = await params;
  const sp = await searchParams;
  if (!isAddress(raw)) notFound();

  const address = raw.toLowerCase();
  const window: FlowWindow = (WINDOWS as readonly string[]).includes(sp.w ?? "") ? (sp.w as FlowWindow) : "7D";
  const now = await requestNow();

  const [indexer, assetsResult, transfers] = await Promise.all([
    getIndexerStatus(),
    getAssets(),
    getTransfersSince(since(window, now), { address, limit: 2000 }),
  ]);

  const assets = assetsResult.rows;
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const rows = transfers.rows;

  /**
   * Fold this address' own position.
   *
   * A wallet touches several assets, so nothing here accumulates one running
   * total of "value". Amounts live inside an asset — where they have a unit and
   * a meaning — and everything above that level is a count. Adding this
   * address' NVDA to its USDG would produce a headline number describing
   * nothing that happened.
   */
  type Flow = { inbound: number; outbound: number; transfers: number };
  const newFlow = (): Flow => ({ inbound: 0, outbound: 0, transfers: 0 });

  let transfersIn = 0;
  let transfersOut = 0;
  const counterparties = new Map<string, { transfers: number; inTransfers: number; byAsset: Map<string, Flow> }>();
  const exposure = new Map<string, Flow>();
  const span = WINDOW_MS[window];
  const buckets = new Array<number>(24).fill(0);

  for (const r of rows) {
    const decimals = assetById.get(r.asset_id ?? "")?.decimals ?? 18;
    const amount = fromBaseUnits(r.amount, decimals);
    const isIn = r.to_address === address;
    const peer = isIn ? r.from_address : r.to_address;
    const assetId = r.asset_id ?? "";

    if (isIn) transfersIn += 1;
    else transfersOut += 1;

    const cp = counterparties.get(peer) ?? { transfers: 0, inTransfers: 0, byAsset: new Map<string, Flow>() };
    cp.transfers += 1;
    if (isIn) cp.inTransfers += 1;
    const cpFlow = cp.byAsset.get(assetId) ?? newFlow();
    if (isIn) cpFlow.inbound += amount;
    else cpFlow.outbound += amount;
    cpFlow.transfers += 1;
    cp.byAsset.set(assetId, cpFlow);
    counterparties.set(peer, cp);

    if (r.asset_id) {
      const ex = exposure.get(r.asset_id) ?? newFlow();
      if (isIn) ex.inbound += amount;
      else ex.outbound += amount;
      ex.transfers += 1;
      exposure.set(r.asset_id, ex);
    }

    const t = new Date(r.timestamp).getTime();
    const idx = Math.min(23, Math.max(0, Math.floor(((t - (now - span)) / span) * 24)));
    buckets[idx] += 1;
  }

  /** The asset a relationship is mostly made of, so magnitude keeps its unit. */
  const dominant = (byAsset: Map<string, Flow>) => {
    let best: { assetId: string; flow: Flow } | null = null;
    for (const [assetId, flow] of byAsset) {
      if (!best || flow.transfers > best.flow.transfers) best = { assetId, flow };
    }
    return best;
  };

  const rankedCounterparties = [...counterparties.entries()]
    .map(([addr, v]) => ({ address: addr, ...v, main: dominant(v.byAsset) }))
    .sort((a, b) => b.transfers - a.transfers)
    .slice(0, 12);

  // Ranked by transfers: an exposure list spans assets, so summed units cannot
  // order it. Each row still shows its own in / out, in its own symbol.
  const rankedExposure = [...exposure.entries()]
    .map(([id, v]) => ({ asset: assetById.get(id), ...v, net: v.inbound - v.outbound }))
    .filter((e) => e.asset)
    .sort((a, b) => b.transfers - a.transfers);

  const graph = buildMarketGraph(rows, assets, { limitAddresses: 6, limitAssets: 6 });
  const has = rows.length > 0;

  const m = (v: number): Measured<number> =>
    has ? measured(v, INDEX, { observedAt: indexer.updatedAt, state: transfers.capped ? "PARTIAL" : "OK" }) : indexing(INDEX);

  // A counterparty can trade several assets with this wallet, so the amount
  // columns are replaced by one asset-scoped figure plus counts.
  const cpColumns: LedgerColumn[] = [
    { key: "addr", label: "COUNTERPARTY", width: "minmax(160px, 1.5fr)" },
    { key: "dir", label: "DIRECTION", width: "minmax(110px, 0.8fr)" },
    { key: "tx", label: "TRANSFERS", width: "minmax(90px, 0.7fr)", align: "right" },
    { key: "assets", label: "ASSETS", width: "minmax(80px, 0.6fr)", align: "right" },
    { key: "main", label: "MOSTLY", width: "minmax(150px, 1.1fr)", align: "right", hideBelow: "sm" },
  ];

  return (
    <>
      <Shell>
        <div className="band-dense">
          <PageHead
            kicker={`WALLET · CHAIN ${CHAIN.id} · INDEXED TO ${blockLabel(indexer.lastProcessedBlock.value)}`}
            title={<span className="tabular font-mono text-[1.375rem] break-all sm:text-[1.75rem]">{address}</span>}
            aside={
              <div className="flex flex-col items-start gap-3 lg:items-end">
                <ChipGroup label="Window">
                  {WINDOWS.map((w) => (
                    <ChipLink key={w} href={`/wallet/${address}?w=${w}`} active={w === window}>
                      {w}
                    </ChipLink>
                  ))}
                </ChipGroup>
                <ExplorerLink address={address} explorer={CHAIN.explorer}>
                  Blockscout
                </ExplorerLink>
              </div>
            }
          />
        </div>
      </Shell>

      <Tape label="Wallet position">
        {/* Counts, not amounts: this line summarises a wallet across assets. */}
        <TapeCell label={`RECEIVED ${window}`} measurement={m(transfersIn)} format={(v) => integer(Number(v))} />
        <TapeCell label={`SENT ${window}`} measurement={m(transfersOut)} format={(v) => integer(Number(v))} />
        <TapeStatic label="NET FLOW" value="PER ASSET" />
        <TapeCell label="TRANSFERS" measurement={m(rows.length)} format={(v) => integer(Number(v))} />
        <TapeCell label="COUNTERPARTIES" measurement={m(counterparties.size)} format={(v) => integer(Number(v))} />
        <TapeCell label="ASSETS TOUCHED" measurement={m(exposure.size)} format={(v) => integer(Number(v))} />
        <TapeStatic label="PORTFOLIO VALUE" value="NO ORACLE" />
        <TapeStatic label="UPDATED" value={relativeTime(indexer.updatedAt, now)} />
      </Tape>

      <Shell>
        <div className="band-dense">
          {has ? (
            <Split
              ratio="7:5"
              gap="gap-6"
              left={
                <div className="flex flex-col gap-6">
                  <Panel>
                    <PanelHeader title="ASSET EXPOSURE" meta={window} state={transfers.state} />
                    <div className="flex flex-col">
                      {rankedExposure.map((e) => (
                        <div key={e.asset!.id} className="border-b border-rule-faint px-4 py-3 last:border-b-0">
                          <div className="flex items-baseline justify-between gap-3">
                            <Link href={`/assets/${e.asset!.contract_address}`} className="min-w-0">
                              <span className="font-mono text-data text-ink hover:underline">{e.asset!.symbol}</span>
                              <span className="label-s ml-2 text-ink-faint">
                                {ASSET_TYPE_LABEL[e.asset!.asset_type] ?? e.asset!.asset_type}
                              </span>
                            </Link>
                            <span
                              className={`tabular shrink-0 font-mono text-data ${
                                e.net >= 0 ? "text-signal" : "text-negative"
                              }`}
                            >
                              {signed(e.net)}
                            </span>
                          </div>
                          <div className="mt-2">
                            <FlowBar
                              inflow={e.inbound}
                              outflow={e.outbound}
                              scale={Math.max(e.inbound, e.outbound, 1)}
                            />
                          </div>
                          <p className="label-s mt-1.5 text-ink-faint">
                            {integer(e.transfers)} TX · IN {compact(e.inbound)} · OUT {compact(e.outbound)}{" "}
                            {e.asset!.symbol}
                          </p>
                        </div>
                      ))}
                    </div>
                    <p className="label-s border-t border-rule px-4 py-2 normal-case tracking-[0.02em] text-ink-faint">
                      Net is movement inside the window, in each asset&rsquo;s own units — never added across assets.
                      It is not a balance: a balance requires the full transfer history for the address. Rows are
                      ordered by transfers, the one quantity comparable between assets.
                    </p>
                  </Panel>

                  <Figure
                    index="01"
                    caption={`Activity timeline over ${window}, in ${Math.round(span / 24 / 60000)}-minute intervals.`}
                    provenance="ROBINHOOD CHAIN RPC · ERC-20 TRANSFER LOGS"
                  >
                    <div className="px-4 py-5">
                      <Histogram buckets={buckets} height={64} label={`Transfers per interval over ${window}`} />
                    </div>
                  </Figure>

                  <div>
                    <h2 className="label mb-3 border-b border-rule pb-2.5 text-ink-muted">COUNTERPARTY LEDGER</h2>
                    <Ledger columns={cpColumns} caption={`Addresses this wallet traded against over ${window}`} minWidth={680}>
                      {rankedCounterparties.length ? (
                        rankedCounterparties.map((c) => (
                          <LedgerRow key={c.address} columns={cpColumns} href={`/wallet/${c.address}`}>
                            <LedgerCell column={cpColumns[0]}>
                              <span className="tabular font-mono text-data text-ink">{shortAddress(c.address, 10, 8)}</span>
                            </LedgerCell>
                            <LedgerCell column={cpColumns[1]}>
                              <span className="label-s">
                                {c.inTransfers > 0 && c.inTransfers < c.transfers
                                  ? "BOTH WAYS"
                                  : c.inTransfers > 0
                                    ? "SENT TO US"
                                    : "WE SENT"}
                              </span>
                            </LedgerCell>
                            <LedgerCell column={cpColumns[2]}>
                              <span className="tabular font-mono text-data-s text-ink">{integer(c.transfers)}</span>
                            </LedgerCell>
                            <LedgerCell column={cpColumns[3]}>
                              <span className="tabular font-mono text-data-s text-ink-muted">{integer(c.byAsset.size)}</span>
                            </LedgerCell>
                            <LedgerCell column={cpColumns[4]}>
                              {c.main ? (
                                <span className="tabular font-mono text-data-s text-ink-muted">
                                  {compact(Math.max(c.main.flow.inbound, c.main.flow.outbound))}{" "}
                                  <span className="text-ink-faint">
                                    {assetById.get(c.main.assetId)?.symbol ?? "UNKNOWN"}
                                  </span>
                                </span>
                              ) : (
                                <span className="label-s text-ink-faint">—</span>
                              )}
                            </LedgerCell>
                          </LedgerRow>
                        ))
                      ) : (
                        <LedgerEmpty state={transfers.state} title="No counterparty in window" />
                      )}
                    </Ledger>
                  </div>
                </div>
              }
              right={
                <div className="flex flex-col gap-6">
                  <Figure
                    index="02"
                    caption={`Neighbourhood over ${window} — ${integer(graph.shown.nodes)} nodes, ${integer(graph.shown.edges)} relationships.`}
                    provenance="ERC-20 TRANSFER LOGS INDEXED BY FOLDMARK"
                  >
                    <div className="flex h-[20rem] min-h-0">
                      <TopologyView graph={graph} emptyHint="This address has no observed relationship in the window." />
                    </div>
                  </Figure>

                  <Panel>
                    <PanelHeader title="TOP RELATIONSHIPS" meta={window} state={transfers.state} />
                    <div className="px-4 py-2">
                      {rankedCounterparties.slice(0, 6).map((c) => (
                        <MagnitudeRow
                          key={c.address}
                          label={shortAddress(c.address, 8, 6)}
                          value={integer(c.transfers)}
                          fraction={c.transfers / (rankedCounterparties[0].transfers || 1)}
                          tone={c.inTransfers * 2 >= c.transfers ? "signal" : "ink"}
                          meta={
                            c.main
                              ? `MOSTLY ${assetById.get(c.main.assetId)?.symbol ?? "UNKNOWN"} · ${integer(c.byAsset.size)} ASSET${c.byAsset.size === 1 ? "" : "S"}`
                              : `${integer(c.byAsset.size)} ASSETS`
                          }
                        />
                      ))}
                    </div>
                  </Panel>

                  <div className="border border-rule">
                    <div className="flex items-center justify-between border-b border-rule px-4 py-2.5">
                      <span className="label text-ink">DATA CONDITION</span>
                      <StateTag state={transfers.state} />
                    </div>
                    <Methodology>
                      Every figure is folded at request time from transfers where this address appears as sender or
                      recipient inside the {window} window. Amounts are token units at each asset&apos;s own decimals and
                      are not summed across assets, because adding units of different tokens would be meaningless.
                      Portfolio value in a currency is withheld while no price oracle is wired to chain {CHAIN.id}.
                    </Methodology>
                  </div>
                </div>
              }
            />
          ) : (
            <Panel>
              <PanelHeader title="NO ACTIVITY IN WINDOW" state={transfers.state} />
              <EmptyState
                state={transfers.state}
                title="Nothing observed for this address"
                detail={
                  <>
                    The indexer has recorded no transfer involving this address inside the {window} window. It may be
                    inactive, it may transact in assets FOLDMARK does not track yet, or the indexer may not have reached
                    its blocks — the cursor is currently at {blockLabel(indexer.lastProcessedBlock.value)}.
                  </>
                }
                action={
                  <div className="mt-1">
                    <ExplorerLink address={address} explorer={CHAIN.explorer}>
                      Check the full history on Blockscout
                    </ExplorerLink>
                  </div>
                }
              />
            </Panel>
          )}
        </div>
      </Shell>
    </>
  );
}
