import { shortAddress } from "@/lib/format";
import type { AssetMarketSnapshot } from "@/server/db/rest-queries";

/**
 * Observed DEX markets for one asset.
 *
 * Every figure here is provider-reported and says so. The distinctions this
 * panel refuses to blur:
 *
 *   DEX SPOT is not the reference chart. The TradingView panel elsewhere on
 *   this page shows an external instrument for context; these prices come from
 *   pools on this chain and the two are never mixed.
 *
 *   Liquidity is per pool. Pools are listed separately rather than summed,
 *   because depth in one market does not make another market deep.
 *
 *   24h volume is trading activity, not capital inflow. It is labelled as
 *   volume and never folded into a flow figure.
 *
 *   A listed market is not verification. Being quoted by a venue says a market
 *   exists, not that anyone confirmed what this contract is.
 */
export function DexMarkets({ market }: { market: AssetMarketSnapshot }) {
  // Nothing has asked the provider yet. An empty card claiming "no market"
  // would be a measurement nobody took.
  if (market.status === "UNCHECKED") return null;

  const usd = (n: number | null, digits = 2) =>
    n === null
      ? "—"
      : `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

  if (market.status === "NO_MATCH") {
    return (
      <section className="border border-rule">
        <header className="flex items-baseline justify-between border-b border-rule px-4 py-2.5">
          <h2 className="label text-ink-muted">DEX MARKETS</h2>
          <span className="label-s text-ink-faint">NO MARKET</span>
        </header>
        <p className="px-4 py-3 text-body-s text-ink-muted">
          {market.provider ?? "The market provider"} was asked for pools holding this exact contract and reported none.
          That is an answer about this address, not about its ticker.
        </p>
      </section>
    );
  }

  const primary = market.primary;

  return (
    <section className="border border-rule">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule px-4 py-2.5">
        <h2 className="label text-ink-muted">DEX MARKETS</h2>
        <span className="label-s text-ink-faint">
          {market.markets.length} POOL{market.markets.length === 1 ? "" : "S"} · {market.provider ?? "PROVIDER"}
        </span>
      </header>

      {primary ? (
        <div className="border-b border-rule-faint px-4 py-3">
          <p className="label-s text-ink-faint">DEX SPOT</p>
          <p className="mt-1 font-mono text-data-l text-ink">{usd(primary.priceUsd, 6)}</p>
          <dl className="mt-2.5 grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-4">
            {[
              ["PAIR", primary.pairName || "—"],
              ["VENUE", primary.venue],
              ["LIQUIDITY", usd(primary.liquidityUsd, 0)],
              ["24H VOLUME", usd(primary.volume24hUsd, 0)],
            ].map(([term, value]) => (
              <div key={term} className="min-w-0">
                <dt className="label-s text-ink-faint">{term}</dt>
                <dd className="truncate font-mono text-data-s text-ink-muted">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="label-s mt-2.5 normal-case tracking-[0.02em] text-ink-faint">
            Featured market is the deepest pool holding this exact contract — a selection, never an average across
            venues. This asset is the {primary.side} token in that pair.
          </p>
        </div>
      ) : null}

      {market.markets.length > 1 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr className="border-b border-rule-faint">
                {["VENUE", "PAIR", "PRICE", "LIQUIDITY", "24H VOLUME"].map((h, i) => (
                  <th
                    key={h}
                    className={`label-s px-4 py-2 font-normal text-ink-faint ${i > 1 ? "text-right" : "text-left"}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {market.markets.slice(0, 12).map((m) => (
                <tr key={m.pairAddress} className="border-b border-rule-faint last:border-0">
                  <td className="px-4 py-2 font-mono text-data-s text-ink-muted">{m.venue}</td>
                  <td className="px-4 py-2 font-mono text-data-s text-ink-muted">
                    <span className="block truncate">{m.pairName || shortAddress(m.pairAddress, 6, 4)}</span>
                  </td>
                  <td className="tabular px-4 py-2 text-right font-mono text-data-s text-ink">{usd(m.priceUsd, 6)}</td>
                  <td className="tabular px-4 py-2 text-right font-mono text-data-s text-ink-muted">
                    {usd(m.liquidityUsd, 0)}
                  </td>
                  <td className="tabular px-4 py-2 text-right font-mono text-data-s text-ink-muted">
                    {usd(m.volume24hUsd, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="label-s border-t border-rule-faint px-4 py-2.5 normal-case tracking-[0.02em] text-ink-faint">
        Source {market.provider ?? "provider"} · network {market.network ?? "—"} · observed{" "}
        {market.observedAt ? new Date(market.observedAt).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "—"}.
        Provider-reported market data. Being quoted by a venue is not verification of this contract, and these prices
        are separate from the reference chart.
      </p>
    </section>
  );
}
