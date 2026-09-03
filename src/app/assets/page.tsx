import type { Metadata } from "next";
import { Shell, PageHead } from "@/components/layout/Frame";
import { Ledger, LedgerRow, LedgerCell, LedgerEmpty, type LedgerColumn } from "@/components/ui/Ledger";
import { Panel, PanelHeader, StateTag, Methodology } from "@/components/ui/primitives";
import { ChipLink, ChipGroup } from "@/components/ui/controls";
import { Sparkline } from "@/components/charts";
import { AssetSearch } from "@/components/forms/AssetSearch";
import { getAssets, getWindowActivity, getLatestPrices, foldByAsset, requestNow,
} from "@/lib/queries";
import { compact, integer, relativeTime, shortAddress } from "@/lib/format";
import { ASSET_TYPE_LABEL, ASSET_TYPES, WINDOWS, CHAIN, type AssetType, type FlowWindow } from "@/config/site";

export const metadata: Metadata = {
  title: "Asset registry",
  description: "Every asset FOLDMARK has observed on Robinhood Chain, with its activity, counterparties and contract.",
};

export const revalidate = 30;

const SORTS = [
  { key: "activity", label: "ACTIVITY" },
  { key: "volume", label: "VOLUME" },
  { key: "counterparties", label: "COUNTERPARTIES" },
  { key: "symbol", label: "SYMBOL" },
] as const;

type SortKey = (typeof SORTS)[number]["key"];

const COLUMNS: LedgerColumn[] = [
  { key: "asset", label: "ASSET", width: "minmax(150px, 1.5fr)" },
  { key: "type", label: "TYPE", width: "minmax(110px, 0.9fr)" },
  { key: "price", label: "PRICE", width: "minmax(90px, 0.8fr)", align: "right" },
  { key: "transfers", label: "TRANSFERS", width: "minmax(120px, 1fr)", align: "right" },
  { key: "volume", label: "GROSS VOLUME", width: "minmax(110px, 0.9fr)", align: "right", hideBelow: "sm" },
  { key: "cp", label: "COUNTERPARTIES", width: "minmax(120px, 0.9fr)", align: "right", hideBelow: "md" },
  { key: "seen", label: "LAST SEEN", width: "minmax(100px, 0.8fr)", align: "right", hideBelow: "lg" },
  { key: "contract", label: "CONTRACT", width: "minmax(120px, 0.9fr)", align: "right", hideBelow: "lg" },
];

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; sort?: string; w?: string }>;
}) {
  const params = await searchParams;
  const query = (params.q ?? "").trim().toLowerCase();
  const typeFilter = (ASSET_TYPES as readonly string[]).includes(params.type ?? "") ? (params.type as AssetType) : null;
  const sort: SortKey = (SORTS.map((s) => s.key) as string[]).includes(params.sort ?? "")
    ? (params.sort as SortKey)
    : "activity";
  const window: FlowWindow = (WINDOWS as readonly string[]).includes(params.w ?? "") ? (params.w as FlowWindow) : "24H";

  const now = await requestNow();
  const [assetsResult, activity] = await Promise.all([getAssets(), getWindowActivity(window, now)]);
  const all = assetsResult.rows;
  const byAsset = foldByAsset(activity.rows, all, window, now);
  const prices = await getLatestPrices(all.map((a) => a.id));

  const typeCounts = new Map<AssetType, number>();
  for (const a of all) typeCounts.set(a.asset_type, (typeCounts.get(a.asset_type) ?? 0) + 1);

  let rows = all;
  if (typeFilter) rows = rows.filter((a) => a.asset_type === typeFilter);
  if (query) {
    rows = rows.filter(
      (a) =>
        a.symbol.toLowerCase().includes(query) ||
        a.name.toLowerCase().includes(query) ||
        a.contract_address.toLowerCase().includes(query),
    );
  }

  rows = [...rows].sort((a, b) => {
    const ax = byAsset.get(a.id);
    const bx = byAsset.get(b.id);
    switch (sort) {
      case "volume":
        return (bx?.volume ?? 0) - (ax?.volume ?? 0);
      case "counterparties":
        return (bx?.counterparties ?? 0) - (ax?.counterparties ?? 0);
      case "symbol":
        return a.symbol.localeCompare(b.symbol);
      default:
        return (bx?.transfers ?? 0) - (ax?.transfers ?? 0);
    }
  });

  const href = (next: Partial<{ q: string; type: string; sort: string; w: string }>) => {
    const sp = new URLSearchParams();
    const q = next.q ?? params.q;
    if (q) sp.set("q", q);
    const t = "type" in next ? next.type : (typeFilter ?? undefined);
    if (t) sp.set("type", t);
    sp.set("sort", next.sort ?? sort);
    sp.set("w", next.w ?? window);
    return `/assets?${sp.toString()}`;
  };

  return (
    <Shell>
      <div className="band-dense">
        <PageHead
          kicker={`ASSET REGISTRY · CHAIN ${CHAIN.id}`}
          title="Every asset the index has observed"
          lede={
            <>
              An asset enters this registry when the indexer observes an ERC-20 Transfer for its contract. A Stock Token
              is identified from its canonical on-chain name, never from its symbol.
            </>
          }
          aside={<StateTag state={assetsResult.state} label={`${integer(all.length)} INDEXED`} />}
        />

        <div className="mt-6 flex flex-col gap-4">
          <AssetSearch initial={params.q ?? ""} type={typeFilter} sort={sort} window={window} />

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <ChipGroup label="Type">
              <ChipLink href={href({ type: undefined })} active={!typeFilter} count={all.length}>
                ALL
              </ChipLink>
              {ASSET_TYPES.map((t) => (
                <ChipLink key={t} href={href({ type: t })} active={typeFilter === t} count={typeCounts.get(t) ?? 0}>
                  {ASSET_TYPE_LABEL[t]}
                </ChipLink>
              ))}
            </ChipGroup>

            <ChipGroup label="Sort">
              {SORTS.map((s) => (
                <ChipLink key={s.key} href={href({ sort: s.key })} active={sort === s.key}>
                  {s.label}
                </ChipLink>
              ))}
            </ChipGroup>

            <ChipGroup label="Window">
              {WINDOWS.map((w) => (
                <ChipLink key={w} href={href({ w })} active={window === w}>
                  {w}
                </ChipLink>
              ))}
            </ChipGroup>
          </div>
        </div>

        <div className="mt-6">
          <Ledger columns={COLUMNS} caption={`Assets indexed on ${CHAIN.name}, activity measured over ${window}`} minWidth={820}>
            {rows.length ? (
              rows.map((a) => {
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
                      {a.verified ? <span className="label-s block text-ink-faint">VERIFIED</span> : null}
                    </LedgerCell>
                    <LedgerCell column={COLUMNS[2]}>
                      <Value value={price ? `$${compact(price.price, 4)}` : null} absent="NO FEED" />
                    </LedgerCell>
                    <LedgerCell column={COLUMNS[3]}>
                      <div className="flex items-center justify-end gap-3">
                        {act && act.transfers > 0 ? (
                          <span className="hidden w-20 sm:block">
                            <Sparkline series={act.buckets} tone="muted" label={`${a.symbol} transfer rate`} />
                          </span>
                        ) : null}
                        <Value value={act ? integer(act.transfers) : null} absent="NONE" />
                      </div>
                    </LedgerCell>
                    <LedgerCell column={COLUMNS[4]}>
                      <Value value={act ? compact(act.volume) : null} absent="NONE" />
                    </LedgerCell>
                    <LedgerCell column={COLUMNS[5]}>
                      <Value value={act ? integer(act.counterparties) : null} absent="NONE" />
                    </LedgerCell>
                    <LedgerCell column={COLUMNS[6]}>
                      <Value value={act?.lastSeen ? relativeTime(act.lastSeen, now) : null} absent="—" />
                    </LedgerCell>
                    <LedgerCell column={COLUMNS[7]}>
                      <span className="tabular font-mono text-data-s text-ink-faint">
                        {shortAddress(a.contract_address)}
                      </span>
                    </LedgerCell>
                  </LedgerRow>
                );
              })
            ) : (
              <LedgerEmpty
                state={all.length ? "EMPTY" : assetsResult.state}
                title={all.length ? "No asset matches this filter" : "No asset indexed yet"}
                detail={
                  all.length
                    ? "Clear the search or widen the type filter."
                    : "Assets are discovered on-chain. The registry fills as the indexer observes Transfer logs."
                }
              />
            )}
          </Ledger>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Panel>
            <PanelHeader title="WHAT THIS TABLE MEASURES" />
            <Methodology label="COLUMN DEFINITIONS">
              <ul className="flex flex-col gap-1.5">
                <li>
                  <strong className="text-ink">PRICE</strong> — most recent stored price observation. No oracle is wired
                  to chain {CHAIN.id} yet, so this reads NO FEED for every asset.
                </li>
                <li>
                  <strong className="text-ink">TRANSFERS</strong> — count of ERC-20 Transfer logs for the contract inside
                  the {window} window.
                </li>
                <li>
                  <strong className="text-ink">GROSS VOLUME</strong> — sum of transfer amounts in token units. It is not
                  a net flow and not a dollar value.
                </li>
                <li>
                  <strong className="text-ink">COUNTERPARTIES</strong> — distinct addresses appearing as sender or
                  recipient in the window. This is not a holder count.
                </li>
              </ul>
            </Methodology>
          </Panel>

          <Panel>
            <PanelHeader title="NOT YET OBSERVED" state="INDEXING" />
            <ul className="flex flex-col">
              {[
                ["HOLDERS", "Requires balance reconstruction from the full transfer history, not a window."],
                ["LIQUIDITY", "Requires DEX pool contracts to be identified on chain " + CHAIN.id + "."],
                ["MARKETS", "Requires a venue registry. None is verified on this chain."],
                ["PROTOCOL EXPOSURE", "Requires contract classification. The protocols table is empty."],
                ["NET FLOW", "Directional flow is meaningful per address, not per token contract — see any wallet page."],
              ].map(([k, why]) => (
                <li key={k} className="flex flex-col gap-0.5 border-b border-rule-faint px-4 py-2.5 last:border-b-0">
                  <span className="label-s text-ink-muted">{k}</span>
                  <span className="text-body-s text-ink-faint">{why}</span>
                </li>
              ))}
            </ul>
            <p className="label-s border-t border-rule px-4 py-2 normal-case tracking-[0.02em] text-ink-faint">
              These columns are withheld rather than shown empty. FOLDMARK does not display a metric it cannot measure.
            </p>
          </Panel>
        </div>
      </div>
    </Shell>
  );
}

function Value({ value, absent }: { value: string | null; absent: string }) {
  return (
    <span
      className={`tabular font-mono text-data-s ${value ? "text-ink" : "uppercase tracking-[0.12em] text-ink-faint"}`}
    >
      {value ?? absent}
    </span>
  );
}
