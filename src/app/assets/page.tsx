import type { Metadata } from "next";
import { Shell, PageHead } from "@/components/layout/Frame";
import { Ledger, LedgerRow, LedgerCell, LedgerEmpty, type LedgerColumn } from "@/components/ui/Ledger";
import { Panel, PanelHeader, StateTag, Methodology } from "@/components/ui/primitives";
import { ChipLink, ChipGroup } from "@/components/ui/controls";
import { Sparkline } from "@/components/charts";
import { AssetSearch } from "@/components/forms/AssetSearch";
import { getAssets, getWindowActivity, getLatestPrices, getChainHead, foldByAsset, requestNow,
} from "@/lib/queries";
import { present } from "@/lib/presentation-state";
import { hasValue, type DataState, type Measured } from "@/lib/data-state";
import { blockLabel, compact, integer, relativeTime, shortAddress } from "@/lib/format";
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

/**
 * What a row in this registry carries once a contract has been observed.
 *
 * An empty registry used to be an 820-pixel table with a single sentence
 * floating in it, which reads as a page that failed rather than a page nothing
 * has been given to list yet. This is the alternative: the same search, the
 * same filters, the same headers, and beneath them a description of the five
 * things the registry captures per asset. It is non-numeric by construction —
 * no symbol, no contract, no figure — because a placeholder row would be an
 * invented asset however it were styled, and this product does not invent rows.
 */
const CAPTURES: ReadonlyArray<readonly [string, string]> = [
  [
    "PRICE",
    "The canonical quote for a contract, reconciled across every venue observed quoting it, with the disagreeing quotes kept beside it.",
  ],
  ["FLOW", "Transfers folded into direction, size and counterparty across the window selected above."],
  ["LIQUIDITY", "Depth behind the venue that produced a quote, read from the pool itself rather than inferred."],
  [
    "RELATIONSHIPS",
    "Which addresses move an asset, and which addresses they move it with — the edges of the asset graph.",
  ],
  ["MARKETS", "Every venue observed quoting the contract, and how far apart those venues are."],
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
  // The chain head is read over RPC and owes nothing to the database. It stays
  // true when every other figure on this page is still waiting, which is the
  // difference between a product that is listening and one that is broken.
  const [assetsResult, activity, chainHead] = await Promise.all([
    getAssets(),
    getWindowActivity(window, now),
    getChainHead(),
  ]);
  const all = assetsResult.rows;
  const byAsset = foldByAsset(activity.rows, all, window, now);
  const prices = await getLatestPrices(all.map((a) => a.id));

  // Whether the registry query succeeded, as distinct from returning nothing.
  const registryAnswered = assetsResult.state !== "UNAVAILABLE";

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

  /**
   * What an activity cell says when it has nothing in it.
   *
   * NONE is a measurement: the window was queried and held no transfer. Until
   * the index reaches this window there is no measurement to report — and that
   * is said once, above the table, instead of being stamped into three cells of
   * every row. The cell holds an em dash, which has exactly one meaning on this
   * surface and never means zero.
   */
  const activityPending = activity.state === "INDEXING" || activity.state === "UNAVAILABLE";
  const absentActivity = activityPending ? "—" : "NONE";
  const showActivityMode = rows.length > 0 && activityPending;

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
          aside={
            <StateTag
              state={assetsResult.state}
              surface="registry"
              /* A count of 0 INDEXED would be a claim about the chain. Until the
                 registry query returns rows, the chip says what it is doing. */
              label={all.length ? `${integer(all.length)} INDEXED` : undefined}
            />
          }
        />

        <div className="mt-6 flex flex-col gap-4">
          <AssetSearch initial={params.q ?? ""} type={typeFilter} sort={sort} window={window} />

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <ChipGroup label="Type">
              {/*
                A count is shown only when the registry actually answered. An
                empty list because the index has nothing yet is a real zero; an
                empty list because the query failed is not, and both arrive here
                as `all.length === 0`. Rendering "0" in the second case states a
                fact about the chain that was never measured, so the chip simply
                carries no count until the registry is readable.
              */}
              <ChipLink
                href={href({ type: undefined })}
                active={!typeFilter}
                count={registryAnswered ? all.length : undefined}
              >
                ALL
              </ChipLink>
              {ASSET_TYPES.map((t) => (
                <ChipLink
                  key={t}
                  href={href({ type: t })}
                  active={typeFilter === t}
                  count={registryAnswered ? (typeCounts.get(t) ?? 0) : undefined}
                >
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

        {/* The one place the table says its activity columns are still waiting. */}
        {showActivityMode ? (
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border border-rule bg-surface px-4 py-2.5">
            <StateTag state={activity.state} surface="activity" />
            <p className="min-w-0 max-w-[74ch] text-body-s text-ink-muted">
              Activity over {window} has not been measured yet, so TRANSFERS, GROSS VOLUME and COUNTERPARTIES hold an em
              dash. A dash is a value that was not observed — it is never a zero.
            </p>
            <ChainHeadLine head={chainHead} now={now} />
          </div>
        ) : null}

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
                        <Value value={act ? integer(act.transfers) : null} absent={absentActivity} />
                      </div>
                    </LedgerCell>
                    <LedgerCell column={COLUMNS[4]}>
                      <Value value={act ? compact(act.volume) : null} absent={absentActivity} />
                    </LedgerCell>
                    <LedgerCell column={COLUMNS[5]}>
                      <Value value={act ? integer(act.counterparties) : null} absent={absentActivity} />
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
            ) : all.length ? (
              /* A filtered-out table is a measured result and says so. */
              <LedgerEmpty
                state="EMPTY"
                surface="registry"
                title="No asset matches this filter"
                detail="Clear the search or widen the type filter."
              />
            ) : (
              /* An unfilled registry is not a measured result, and it gets a
                 designed body rather than one sentence in an empty table. */
              <RegistryEmpty state={assetsResult.state} head={chainHead} now={now} />
            )}
          </Ledger>
        </div>

        {/*
          items-start. WHAT THIS TABLE MEASURES is a header and a closed
          methodology drawer; NOT YET OBSERVED is five rows and a footnote. A
          stretching grid made the first panel as tall as the second and filled
          the difference with its own surface tone — a couple of hundred pixels
          of empty panel that says nothing. A panel ends where its content does.
        */}
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
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
                <li>
                  An em dash is a value that was not observed. NONE is a measurement — the window was queried and held
                  nothing. The two are never interchanged.
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

/**
 * The registry with no rows in it.
 *
 * The table keeps its search, filters, sort and headers — a reader can still
 * see exactly what this surface is and operate every control on it — and the
 * body says what the registry captures per asset instead of leaving a wide
 * empty rectangle. Nothing here is an asset: no symbol, no contract address,
 * no figure. The chain head at the foot is a real reading taken over RPC on
 * this request.
 */
function RegistryEmpty({ state, head, now }: { state: DataState; head: Measured<number>; now: number }) {
  const p = present(state, "registry");
  return (
    <div className="border-b border-rule-faint last:border-b-0">
      <div className="flex flex-col items-start gap-3 px-4 py-9 sm:px-6">
        <StateTag state={state} surface="registry" />
        <p className="font-display text-[1.5rem] leading-tight tracking-[-0.02em] text-ink">{p.headline}</p>
        <p className="measure text-body-s text-ink-muted">{p.detail}</p>
      </div>

      <p className="label-s border-t border-rule px-4 pt-3 text-ink-dim sm:px-6">
        WHAT A ROW CARRIES ONCE A CONTRACT IS OBSERVED
      </p>
      <ul className="mt-2 flex flex-col">
        {CAPTURES.map(([k, v]) => (
          <li
            key={k}
            className="grid grid-cols-1 gap-x-6 gap-y-1 border-b border-rule-faint px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(10rem,1fr)_minmax(0,3fr)] sm:px-6"
          >
            <span className="label-s text-ink-muted">{k}</span>
            <span className="text-body-s text-ink-faint">{v}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-rule px-4 py-2 sm:px-6">
        <p className="label-s text-ink-faint">
          SOURCE ROBINHOOD CHAIN RPC · NO ASSET IS LISTED UNTIL A TRANSFER IS OBSERVED
        </p>
        <ChainHeadLine head={head} now={now} />
      </div>
    </div>
  );
}

/**
 * The chain head, or nothing at all.
 *
 * Printed only when it was actually read. A dash here would say the RPC
 * answered with an unknown block, which is a different and untrue statement
 * from having no reading to show.
 */
function ChainHeadLine({ head, now }: { head: Measured<number>; now: number }) {
  if (!hasValue(head)) return null;
  return (
    <p className="label-s ml-auto shrink-0 text-ink-faint">
      CHAIN HEAD {blockLabel(head.value)} · {relativeTime(head.observedAt, now)}
    </p>
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
