import type { Metadata } from "next";
import Link from "next/link";
import { Shell, PageHead } from "@/components/layout/Frame";
import { Panel, PanelHeader, EmptyState, StateTag } from "@/components/ui/primitives";
import { AddressLookup } from "@/components/forms/AddressLookup";
import { getAssets, getObservedWallets, getProtocols, getContracts } from "@/lib/queries";
import { isAddress, shortAddress } from "@/lib/format";
import { ASSET_TYPE_LABEL, CHAIN } from "@/config/site";

export const metadata: Metadata = {
  title: "Search",
  description: "Search indexed assets, observed wallets, protocols and contracts on Robinhood Chain.",
};

export const revalidate = 30;

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const raw = (q ?? "").trim();
  const query = raw.toLowerCase();

  const [assets, wallets, protocols, contracts] = await Promise.all([
    getAssets(),
    getObservedWallets(500),
    getProtocols(),
    getContracts(),
  ]);

  const matchedAssets = query
    ? assets.rows.filter(
        (a) =>
          a.symbol.toLowerCase().includes(query) ||
          a.name.toLowerCase().includes(query) ||
          a.contract_address.toLowerCase().includes(query),
      )
    : assets.rows.slice(0, 8);

  const matchedWallets = query ? wallets.rows.filter((w) => w.address.toLowerCase().includes(query)) : [];
  const matchedProtocols = query
    ? protocols.rows.filter((p) => p.name.toLowerCase().includes(query) || p.category.toLowerCase().includes(query))
    : [];
  const matchedContracts = query ? contracts.rows.filter((c) => c.address.toLowerCase().includes(query)) : [];

  const total = matchedAssets.length + matchedWallets.length + matchedProtocols.length + matchedContracts.length;
  const unseenAddress = isAddress(raw) && !matchedWallets.some((w) => w.address.toLowerCase() === query);

  return (
    <Shell>
      <div className="band-dense">
        <PageHead
          kicker="SEARCH"
          title={raw ? `Results for “${raw}”` : "Search the index"}
          lede="Every result comes from what the indexer has observed. Nothing is matched against a hardcoded list."
          aside={raw ? <StateTag state={total ? "OK" : "EMPTY"} label={`${total} MATCH${total === 1 ? "" : "ES"}`} /> : null}
        />

        <form method="get" action="/search" className="mt-6 flex w-full max-w-[42rem]">
          <input
            name="q"
            defaultValue={raw}
            autoFocus
            placeholder="Symbol, name, contract or address"
            aria-label="Search assets, wallets, protocols and contracts"
            autoComplete="off"
            spellCheck={false}
            className="h-12 min-w-0 flex-1 border border-rule-strong bg-surface px-3 font-mono text-data text-ink placeholder:text-ink-faint focus:outline-none"
          />
          <button
            type="submit"
            className="-ml-px h-12 shrink-0 border border-rule-strong px-5 font-mono text-label-s uppercase tracking-[0.16em] text-ink m-fast hover:bg-ink hover:text-void"
          >
            SEARCH
          </button>
        </form>
        <p className="label-s mt-2 text-ink-faint">PRESS ⌘K ANYWHERE FOR THE COMMAND PALETTE</p>

        {unseenAddress ? (
          <div className="mt-6 border border-rule bg-surface px-4 py-3">
            <p className="label-s">VALID ADDRESS, NOT YET OBSERVED</p>
            <p className="mt-1.5 text-body-s text-ink-muted">
              This is a well-formed address that the indexer has not seen on chain {CHAIN.id}. You can still open its
              page — it will show exactly what the index holds.
            </p>
            <Link href={`/wallet/${raw.toLowerCase()}`} className="label mt-2 inline-block text-ink m-fast hover:text-signal">
              OPEN WALLET →
            </Link>
          </div>
        ) : null}

        {/*
          items-start. These four panels hold wildly different amounts — twelve
          asset rows beside an empty-state sentence — and a stretching grid pads
          the shorter one out with its own surface tone until the row is square.
          That padding is a coloured rectangle with nothing in it, so a panel is
          allowed to be short.
        */}
        <div className="mt-8 grid items-start gap-6 lg:grid-cols-2">
          <Panel>
            <PanelHeader
              title="ASSETS"
              meta={raw ? `${matchedAssets.length}` : "MOST RECENT"}
              state={matchedAssets.length ? "OK" : assets.state}
            />
            {matchedAssets.length ? (
              <ul>
                {matchedAssets.slice(0, 12).map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/assets/${a.contract_address}`}
                      className="flex items-baseline justify-between gap-3 border-b border-rule-faint px-4 py-3 m-fast last:border-b-0 hover:bg-raised"
                    >
                      <span className="min-w-0">
                        <span className="font-mono text-data text-ink">{a.symbol}</span>
                        <span className="ml-2 truncate text-body-s text-ink-faint">{a.name}</span>
                      </span>
                      <span className="label-s shrink-0">{ASSET_TYPE_LABEL[a.asset_type] ?? a.asset_type}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState state={assets.state} title="No asset matches" />
            )}
          </Panel>

          <Panel>
            <PanelHeader title="WALLETS" meta={`${matchedWallets.length}`} state={matchedWallets.length ? "OK" : "EMPTY"} />
            {matchedWallets.length ? (
              <ul>
                {matchedWallets.slice(0, 12).map((w) => (
                  <li key={w.address}>
                    <Link
                      href={`/wallet/${w.address}`}
                      className="flex items-baseline justify-between gap-3 border-b border-rule-faint px-4 py-3 m-fast last:border-b-0 hover:bg-raised"
                    >
                      <span className="tabular truncate font-mono text-data text-ink">{shortAddress(w.address, 12, 8)}</span>
                      <span className="label-s shrink-0">OBSERVED</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-4 py-6">
                <p className="text-body-s text-ink-muted">
                  {raw ? "No observed wallet matches this string." : "Paste an address to inspect it directly."}
                </p>
                <div className="mt-4">
                  <AddressLookup />
                </div>
              </div>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="PROTOCOLS" meta={`${matchedProtocols.length}`} state={matchedProtocols.length ? "OK" : protocols.state} />
            {matchedProtocols.length ? (
              <ul>
                {matchedProtocols.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/protocol/${p.id}`}
                      className="flex items-baseline justify-between gap-3 border-b border-rule-faint px-4 py-3 m-fast last:border-b-0 hover:bg-raised"
                    >
                      <span className="font-mono text-data text-ink">{p.name}</span>
                      <span className="label-s shrink-0">{p.category}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                state={protocols.state}
                title="No protocol matches"
                detail={`No protocol is verified on chain ${CHAIN.id} yet, so this section is empty by design.`}
              />
            )}
          </Panel>

          <Panel>
            <PanelHeader title="CONTRACTS" meta={`${matchedContracts.length}`} state={matchedContracts.length ? "OK" : contracts.state} />
            {matchedContracts.length ? (
              <ul>
                {matchedContracts.slice(0, 12).map((c) => (
                  <li key={c.address}>
                    <Link
                      href={`/wallet/${c.address}`}
                      className="flex items-baseline justify-between gap-3 border-b border-rule-faint px-4 py-3 m-fast last:border-b-0 hover:bg-raised"
                    >
                      <span className="tabular truncate font-mono text-data text-ink">{shortAddress(c.address, 12, 8)}</span>
                      <span className="label-s shrink-0">{c.contract_type ?? "UNTYPED"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState state={contracts.state} title="No contract matches" />
            )}
          </Panel>
        </div>
      </div>
    </Shell>
  );
}
