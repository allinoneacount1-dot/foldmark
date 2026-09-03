import type { Metadata } from "next";
import { Shell, Split, PageHead } from "@/components/layout/Frame";
import { Panel, PanelHeader, EmptyState, StateTag } from "@/components/ui/primitives";
import { Ledger, LedgerRow, LedgerCell, LedgerEmpty, type LedgerColumn } from "@/components/ui/Ledger";
import { AddressLookup } from "@/components/forms/AddressLookup";
import {
  getAssets,
  getWindowActivity,
  getObservedWallets,
  foldByAddress,
  dominantFlow,
  countRows,
  requestNow,
} from "@/lib/queries";
import { compact, integer, relativeTime, shortAddress } from "@/lib/format";
import { CHAIN } from "@/config/site";

export const metadata: Metadata = {
  title: "Wallet explorer",
  description: "Inspect any public Robinhood Chain address: exposure, counterparties, capital movement and activity.",
};

export const revalidate = 30;

/**
 * This table spans every asset, so it carries no RECEIVED / SENT column.
 *
 * A received figure summed over NVDA, AAPL and USDG has no unit and no meaning.
 * What is comparable across assets is counted: transfers, assets touched,
 * counterparties. The one amount shown is scoped to a single named asset.
 */
const COLUMNS: LedgerColumn[] = [
  { key: "addr", label: "ADDRESS", width: "minmax(170px, 1.6fr)" },
  { key: "tx", label: "TRANSFERS", width: "minmax(90px, 0.7fr)", align: "right" },
  { key: "assets", label: "ASSETS", width: "minmax(80px, 0.6fr)", align: "right" },
  { key: "peers", label: "COUNTERPARTIES", width: "minmax(110px, 0.8fr)", align: "right" },
  { key: "main", label: "LARGEST FLOW", width: "minmax(140px, 1fr)", align: "right", hideBelow: "sm" },
];

export default async function WalletsPage() {
  const now = await requestNow();
  const [assetsResult, activity, observed, walletCount] = await Promise.all([
    getAssets(),
    getWindowActivity("24H", now),
    getObservedWallets(40),
    countRows("wallets"),
  ]);

  const active = foldByAddress(activity.rows, assetsResult.rows, 20);
  const symbols = new Map(assetsResult.rows.map((a) => [a.id, a.symbol]));

  return (
    <Shell>
      <div className="band-dense">
        <PageHead
          kicker={`WALLET INTELLIGENCE · CHAIN ${CHAIN.id}`}
          title="Read any address as a position"
          lede="Paste a public address to see what it holds exposure to, who it trades against and how value has moved through it. No connection and no signature required."
          aside={
            <StateTag
              state={walletCount.state}
              label={walletCount.value !== null ? `${integer(walletCount.value)} OBSERVED` : undefined}
            />
          }
        />

        <div className="mt-6">
          <AddressLookup />
        </div>

        <div className="mt-8">
          <Split
            ratio="8:4"
            gap="gap-6"
            left={
              <>
                <h2 className="label mb-4 border-b border-rule pb-2.5 text-ink-muted">MOST ACTIVE · 24H</h2>
                <Ledger
                  columns={COLUMNS}
                  caption="Addresses ranked by transfers observed in the last 24 hours"
                  minWidth={720}
                >
                  {active.length ? (
                    active.map((a) => {
                      const largest = dominantFlow(a, "inbound") ?? dominantFlow(a, "outbound");
                      const largestSymbol = largest ? (symbols.get(largest.assetId) ?? null) : null;
                      return (
                      <LedgerRow key={a.address} columns={COLUMNS} href={`/wallet/${a.address}`}>
                        <LedgerCell column={COLUMNS[0]}>
                          <span className="tabular font-mono text-data text-ink">{shortAddress(a.address, 12, 8)}</span>
                        </LedgerCell>
                        <LedgerCell column={COLUMNS[1]}>
                          <span className="tabular font-mono text-data-s text-ink">{integer(a.transfers)}</span>
                        </LedgerCell>
                        <LedgerCell column={COLUMNS[2]}>
                          <span className="tabular font-mono text-data-s text-ink-muted">{integer(a.assets)}</span>
                        </LedgerCell>
                        <LedgerCell column={COLUMNS[3]}>
                          <span className="tabular font-mono text-data-s text-ink-muted">{integer(a.counterparties)}</span>
                        </LedgerCell>
                        <LedgerCell column={COLUMNS[4]}>
                          {largest ? (
                            <span className="tabular font-mono text-data-s text-signal">
                              {compact(Math.max(largest.inbound, largest.outbound))}{" "}
                              <span className="text-ink-faint">{largestSymbol ?? "UNKNOWN"}</span>
                            </span>
                          ) : (
                            <span className="label-s text-ink-faint">—</span>
                          )}
                        </LedgerCell>
                      </LedgerRow>
                      );
                    })
                  ) : (
                    <LedgerEmpty
                      state={activity.state}
                      title="No address active in the last 24 hours"
                      detail="Addresses appear here as soon as the indexer observes a transfer involving them."
                    />
                  )}
                </Ledger>
                <p className="label-s mt-3 normal-case tracking-[0.02em] text-ink-faint">
                  Ranked by transfers observed, which is comparable across assets. LARGEST FLOW names one asset and
                  quotes the amount in that asset&rsquo;s units — amounts are never added together across assets. Open
                  an address to see received against sent per asset. Nothing here is a claim about intent or balances
                  held.
                </p>
              </>
            }
            right={
              <div className="flex flex-col gap-6">
                <Panel>
                  <PanelHeader
                    title="RECENTLY SEEN"
                    meta="BY LAST ACTIVITY"
                    state={observed.rows.length ? observed.state : "INDEXING"}
                  />
                  {observed.rows.length ? (
                    <ul className="max-h-[22rem] overflow-y-auto">
                      {observed.rows.map((w) => (
                        <li key={w.address}>
                          <a
                            href={`/wallet/${w.address}`}
                            className="flex items-baseline justify-between gap-3 border-b border-rule-faint px-4 py-2.5 m-fast last:border-b-0 hover:bg-raised"
                          >
                            <span className="tabular truncate font-mono text-data-s text-ink">
                              {shortAddress(w.address, 10, 6)}
                            </span>
                            <span className="label-s shrink-0 text-ink-faint">{relativeTime(w.last_seen, now)}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState
                      state={observed.state}
                      title="No wallet observed yet"
                      detail="The wallet table is populated by the indexer from transfer participants."
                    />
                  )}
                </Panel>

                <Panel>
                  <PanelHeader title="WHAT A WALLET PAGE SHOWS" />
                  <ul className="flex flex-col">
                    {[
                      ["ASSET EXPOSURE", "Net movement per asset across the window, from transfer logs."],
                      ["COUNTERPARTIES", "Every address this one traded against, ranked by transfers."],
                      ["CAPITAL MOVEMENT", "Received against sent per asset, with the net in that asset's units."],
                      ["ACTIVITY TIMELINE", "Transfers bucketed over the window."],
                      ["RELATIONSHIP GRAPH", "The address at the centre of its observed neighbourhood."],
                    ].map(([k, v]) => (
                      <li key={k} className="flex flex-col gap-0.5 border-b border-rule-faint px-4 py-2.5 last:border-b-0">
                        <span className="label-s text-ink-muted">{k}</span>
                        <span className="text-body-s text-ink-faint">{v}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="label-s border-t border-rule px-4 py-2 normal-case tracking-[0.02em] text-ink-faint">
                    Portfolio value in a currency is withheld: no price oracle is wired to chain {CHAIN.id}.
                  </p>
                </Panel>
              </div>
            }
          />
        </div>
      </div>
    </Shell>
  );
}
