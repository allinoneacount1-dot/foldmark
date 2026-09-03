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

/* ------------------------------------------------------------- sparkline */

export function Sparkline({
  series,
  width = 160,
  height = 32,
  tone = "ink",
  label,
}: {
  series: number[];
  width?: number;
  height?: number;
  tone?: "ink" | "signal" | "muted";
  label?: string;
}) {
  if (series.length < 2) {
    return <div className="h-8 w-full border-b border-rule-faint" role="presentation" />;
  }

  const max = Math.max(...series);
  const min = Math.min(...series);
  const span = max - min || 1;
  const stepX = width / (series.length - 1);
  const pad = 2;
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);

  const d = series.map((v, i) => `${i === 0 ? "M" : "L"}${(i * stepX).toFixed(2)} ${y(v).toFixed(2)}`).join(" ");
  const stroke = tone === "signal" ? "var(--color-signal)" : tone === "muted" ? "var(--color-ink-faint)" : "var(--color-ink-muted)";

  const last = series[series.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-8 w-full"
      role={label ? "img" : "presentation"}
      aria-label={label}
    >
      <path d={d} fill="none" stroke={stroke} strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <circle cx={width} cy={y(last)} r="1.6" fill="var(--color-signal)" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* ------------------------------------------------------------- histogram */

export function Histogram({
  buckets,
  height = 44,
  label,
  bucketMinutes,
}: {
  buckets: number[];
  height?: number;
  label: string;
  bucketMinutes?: number;
}) {
  const max = Math.max(...buckets, 0);
  const total = buckets.reduce((a, b) => a + b, 0);

  if (!buckets.length || max === 0) {
    return (
      <div className="flex items-end gap-[2px]" style={{ height }} role="img" aria-label={`${label}: no activity observed`}>
        {Array.from({ length: buckets.length || 24 }, (_, i) => (
          <span key={i} aria-hidden className="flex-1 bg-rule-faint" style={{ height: 1 }} />
        ))}
      </div>
    );
  }

  return (
    <div
      className="flex items-end gap-[2px]"
      style={{ height }}
      role="img"
      aria-label={`${label}: ${integer(total)} across ${buckets.length} intervals${bucketMinutes ? ` of ${bucketMinutes} minutes` : ""}`}
    >
      {buckets.map((v, i) => {
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
