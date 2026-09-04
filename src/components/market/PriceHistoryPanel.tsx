import type { PriceHistory } from "@/server/market/historical";
import type { NotionalCoverage } from "@/server/market/historical";

/**
 * Observed price history and pricing coverage.
 *
 * Two things this panel is careful about.
 *
 * The series is drawn from the observations that exist and nothing else. There
 * is no interpolation between points and no line continued across a gap: where
 * FOLDMARK did not observe, the chart is empty, because a smooth line across a
 * gap asserts prices nobody recorded.
 *
 * The coverage figure sits beside the total rather than under it. A USD notional
 * covering a fraction of transfers is not a smaller version of the real number —
 * it is a different quantity — and a reader has to be able to see which.
 */
export function PriceHistoryPanel({
  history,
  coverage,
  symbol,
}: {
  history: PriceHistory;
  coverage: NotionalCoverage | null;
  symbol: string;
}) {
  if (!history.points.length) return null;

  const prices = history.points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;

  const usd = (n: number, digits = 2) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

  const t = (iso: string | null) => (iso ? iso.replace("T", " ").slice(0, 19) + " UTC" : "—");

  /**
   * Points are plotted against their real timestamps, so an irregular
   * observation cadence looks irregular. Spacing them evenly would imply a
   * regular sampling that never happened.
   */
  const firstMs = Date.parse(history.points[0].observedAt);
  const lastMs = Date.parse(history.points[history.points.length - 1].observedAt);
  const timeSpan = lastMs - firstMs || 1;
  const W = 640;
  const H = 88;

  const coords = history.points.map((p) => ({
    x: ((Date.parse(p.observedAt) - firstMs) / timeSpan) * W,
    y: H - ((p.price - min) / span) * (H - 12) - 6,
    p,
  }));

  const pct = coverage ? Math.round(coverage.coverageRatio * 100) : null;

  return (
    <section className="border border-rule">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule px-4 py-2.5">
        <h2 className="label text-ink-muted">PRICE HISTORY · DEX_SPOT</h2>
        <span className="label-s text-ink-faint">
          {history.points.length} OBSERVATION{history.points.length === 1 ? "" : "S"}
        </span>
      </header>

      <div className="px-4 py-4">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-[88px] w-full"
          role="img"
          aria-label={`${symbol} observed DEX spot prices, ${history.points.length} observations between ${t(history.firstObservedAt)} and ${t(history.lastObservedAt)}`}
        >
          {coords.length > 1 ? (
            <polyline
              points={coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ")}
              fill="none"
              stroke="#C7FF4A"
              strokeWidth="1.2"
              strokeOpacity="0.85"
            />
          ) : null}
          {coords.map((c, i) => (
            <circle key={i} cx={c.x} cy={c.y} r="2" fill="#C7FF4A" fillOpacity="0.9" />
          ))}
        </svg>

        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-4">
          {[
            ["LOW", usd(min, 6)],
            ["HIGH", usd(max, 6)],
            ["FIRST OBSERVED", t(history.firstObservedAt)],
            ["LAST OBSERVED", t(history.lastObservedAt)],
          ].map(([term, value]) => (
            <div key={term} className="min-w-0">
              <dt className="label-s text-ink-faint">{term}</dt>
              <dd className="truncate font-mono text-data-s text-ink-muted">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {coverage ? (
        <div className="border-t border-rule-faint px-4 py-3">
          <p className="label-s text-ink-faint">USD NOTIONAL · OBSERVED TRANSFERS</p>
          <p className="mt-1 font-mono text-data-l text-ink">
            {coverage.notional.usd === null ? "—" : usd(coverage.notional.usd, 2)}
          </p>
          <p className="label-s mt-1 text-ink-dim">
            {pct}% OF TRANSFERS PRICED · {coverage.priced.toLocaleString("en-US")} priced ·{" "}
            {coverage.unpriced.toLocaleString("en-US")} unpriced
          </p>
          {coverage.priceHistoryStartsAfterOldestMovement ? (
            <p className="label-s mt-2 normal-case tracking-[0.02em] text-ink-faint">
              Price observations begin after the oldest transfer in view, so transfers before that point have no
              observation at or before them and are left unpriced. Valuing them with a later quote would be
              look-ahead.
            </p>
          ) : null}
          <p className="label-s mt-2 normal-case tracking-[0.02em] text-ink-faint">{coverage.methodology}</p>
        </div>
      ) : null}

      <p className="label-s border-t border-rule-faint px-4 py-2.5 normal-case tracking-[0.02em] text-ink-faint">
        Observed prices only, from {history.provider ?? "the market provider"}
        {history.pairs.length ? ` across ${history.pairs.length} pool${history.pairs.length === 1 ? "" : "s"}` : ""}. No
        interpolation and no candles: where FOLDMARK did not observe, nothing is drawn. This is an on-chain DEX price
        and is separate from any reference chart.
      </p>
    </section>
  );
}
