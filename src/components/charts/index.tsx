/**
 * FOLDMARK chart language.
 *
 * Inline SVG, no charting library, server-renderable. Every chart is drawn on a
 * unit viewBox and stretched by CSS, so a chart costs one element and never
 * needs a resize observer.
 *
 * Rules: thin strokes, no axis furniture beyond a baseline, no gradients, no
 * area fills below 8% opacity, accent only on the current/net value. A chart is
 * never rendered from fabricated numbers — callers pass real series or render a
 * state instead.
 */

import { compact, integer } from "@/lib/format";
import { bucketTotal, uncoveredIntervals, type Bucket } from "@/lib/buckets";

/** The instrument with no signal: frame, grid and axes, drawn without a series. */
export { ChartFrame, EmptyChartSurface } from "./ChartSurface";

/* ------------------------------------------------------------- sparkline */

/**
 * A line over intervals, where an unread interval is a BREAK and not a zero.
 *
 * The series may contain nulls: intervals the row cap never reached. Drawing
 * through them would invent a shape — usually a long flat run at the baseline,
 * which reads as "nothing happened" when the truth is "nobody looked". So the
 * path is split into segments at every null, and the gap is left empty.
 */
export function Sparkline({
  series,
  width = 160,
  height = 32,
  tone = "ink",
  label,
}: {
  series: readonly Bucket[];
  width?: number;
  height?: number;
  tone?: "ink" | "signal" | "muted";
  label?: string;
}) {
  const known = series.filter((v): v is number => v !== null);

  // Fewer than two observations is not a line. The slot keeps its baseline and
  // holds a dash, the same way a metric does — it occupies the space without
  // asserting a shape.
  if (known.length < 2) {
    return (
      <div
        className="flex h-8 w-full items-center justify-center border-b border-rule-faint"
        role="img"
        aria-label={label ? `${label}: no series observed` : "No series observed"}
      >
        <span aria-hidden className="font-mono text-label-s leading-none text-ink-faint/70">
          &mdash;
        </span>
      </div>
    );
  }

  const max = Math.max(...known);
  const min = Math.min(...known);
  const span = max - min || 1;
  const stepX = width / (series.length - 1);
  const pad = 2;
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);

  /**
   * One path per run of known intervals. A null ends the current run rather
   * than being interpolated across, so an unread stretch shows as a gap in the
   * line — visibly different from a run of real zeros, which draws flat along
   * the baseline.
   */
  const segments: string[] = [];
  let current: string[] = [];
  for (const [i, v] of series.entries()) {
    if (v === null) {
      if (current.length > 1) segments.push(current.join(" "));
      current = [];
      continue;
    }
    current.push(`${current.length === 0 ? "M" : "L"}${(i * stepX).toFixed(2)} ${y(v).toFixed(2)}`);
  }
  if (current.length > 1) segments.push(current.join(" "));

  const stroke = tone === "signal" ? "var(--color-signal)" : tone === "muted" ? "var(--color-ink-faint)" : "var(--color-ink-muted)";

  const last = series[series.length - 1];
  const unread = uncoveredIntervals(series);
  const gapNote = unread ? ` (${unread} of ${series.length} intervals not read)` : "";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-8 w-full"
      role={label ? "img" : "presentation"}
      aria-label={label ? `${label}${gapNote}` : undefined}
    >
      {segments.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={stroke} strokeWidth="1" vectorEffect="non-scaling-stroke" />
      ))}
      {last === null ? null : (
        <circle cx={width} cy={y(last)} r="1.6" fill="var(--color-signal)" vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  );
}

/* ------------------------------------------------------------- histogram */

/**
 * Bars over intervals, where an unread interval draws NOTHING.
 *
 * Three states, and they must look different from each other: a bar (activity),
 * a hairline on the baseline (observed, and genuinely zero), and empty space
 * (never read, because the row cap stopped short). Collapsing the last two is
 * how a LIMIT clause gets published as a measurement of quiet.
 */
export function Histogram({
  buckets,
  height = 44,
  label,
  bucketMinutes,
}: {
  buckets: readonly Bucket[];
  height?: number;
  label: string;
  bucketMinutes?: number;
}) {
  const known = buckets.filter((b): b is number => b !== null);
  const max = Math.max(...known, 0);
  const total = bucketTotal(buckets);
  const unread = uncoveredIntervals(buckets);
  const gapNote = unread ? `, ${unread} intervals not read` : "";

  if (!buckets.length || max === 0) {
    return (
      <div
        className="flex items-end gap-[2px]"
        style={{ height }}
        role="img"
        aria-label={
          known.length
            ? `${label}: no activity observed${gapNote}`
            : `${label}: no interval was read`
        }
      >
        {(buckets.length ? buckets : Array.from({ length: 24 }, () => 0 as Bucket)).map((v, i) => (
          <span
            key={i}
            aria-hidden
            className={v === null ? "flex-1" : "flex-1 bg-rule-faint"}
            style={{ height: 1 }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className="flex items-end gap-[2px]"
      style={{ height }}
      role="img"
      aria-label={`${label}: ${integer(total)} across ${buckets.length - unread} of ${buckets.length} intervals${bucketMinutes ? ` of ${bucketMinutes} minutes` : ""}${gapNote}`}
    >
      {buckets.map((v, i) => {
        // Never read: the column is left empty. It is not a zero and must not
        // borrow the baseline hairline that a real zero uses.
        if (v === null) return <span key={i} aria-hidden className="flex-1" />;
        const h = v === 0 ? 1 : Math.max(2, Math.round((v / max) * height));
        const isLast = i === buckets.length - 1;
        return (
          <span
            key={i}
            aria-hidden
            className={v === 0 ? "flex-1 bg-rule-faint" : isLast ? "flex-1 bg-signal" : "flex-1 bg-ink-faint"}
            style={{ height: h }}
          />
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- ledger */

/**
 * A magnitude row: label, proportional rule, value. The bar is a rule that
 * grows, not a rounded pill — it reads as a ledger entry.
 */
export function MagnitudeRow({
  label,
  value,
  fraction,
  tone = "ink",
  meta,
}: {
  label: string;
  value: string;
  fraction: number;
  tone?: "ink" | "signal" | "negative";
  meta?: string;
}) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0)) * 100;
  const bar = tone === "signal" ? "bg-signal" : tone === "negative" ? "bg-negative" : "bg-ink-faint";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 py-2">
      <span className="truncate font-mono text-data text-ink-muted">{label}</span>
      <span className="tabular font-mono text-data text-ink">{value}</span>
      <span aria-hidden className="col-span-2 block h-[3px] bg-rule-faint">
        <span className={`block h-full ${bar}`} style={{ width: `${pct}%` }} />
      </span>
      {meta ? <span className="col-span-2 font-mono text-label-s uppercase tracking-[0.14em] text-ink-faint">{meta}</span> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ flow */

/** Inflow / outflow around a shared centre line. */
export function FlowBar({ inflow, outflow, scale }: { inflow: number; outflow: number; scale: number }) {
  const denom = scale || 1;
  const inPct = Math.min(100, (inflow / denom) * 100);
  const outPct = Math.min(100, (outflow / denom) * 100);
  return (
    <div
      className="flex h-[6px] w-full items-stretch"
      role="img"
      aria-label={`Inflow ${compact(inflow)}, outflow ${compact(outflow)}`}
    >
      <span className="flex flex-1 justify-end bg-rule-faint">
        <span aria-hidden className="block h-full bg-negative/70" style={{ width: `${outPct}%` }} />
      </span>
      <span aria-hidden className="w-px bg-rule-strong" />
      <span className="flex flex-1 bg-rule-faint">
        <span aria-hidden className="block h-full bg-signal" style={{ width: `${inPct}%` }} />
      </span>
    </div>
  );
}

/* ---------------------------------------------------------- distribution */

export function DistributionBar({
  segments,
}: {
  segments: { label: string; value: number; tone: "signal" | "ink" | "muted" | "faint" }[];
}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (total <= 0) return <div className="h-[6px] w-full bg-rule-faint" role="presentation" />;
  const TONE = { signal: "bg-signal", ink: "bg-ink", muted: "bg-ink-muted", faint: "bg-ink-faint" } as const;
  return (
    <div
      className="flex h-[6px] w-full overflow-hidden"
      role="img"
      aria-label={segments.map((s) => `${s.label} ${Math.round((s.value / total) * 100)}%`).join(", ")}
    >
      {segments.map((s) => (
        <span
          key={s.label}
          aria-hidden
          className={TONE[s.tone]}
          style={{ width: `${(s.value / total) * 100}%` }}
          title={s.label}
        />
      ))}
    </div>
  );
}
