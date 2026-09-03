import type { ReactNode } from "react";
import { hasValue, type DataState, type Measured } from "@/lib/data-state";
import { presentMissing, type Surface } from "@/lib/presentation-state";
import { IconSource } from "@/components/icons";

/**
 * What stands in the value slot when there is no value.
 *
 * The same construction as AbsentValue in primitives.tsx: an em dash where the
 * figure would be, the state said underneath it in the reader's terms, and the
 * fuller sentence available to a screen reader. The dash occupies the slot
 * without asserting anything, which is the only thing allowed to occupy it.
 *
 * It is local rather than imported because a metric's dash has to sit on the
 * component's own type scale — a large metric shows a large dash.
 */
function AbsentMetricValue({
  state,
  surface,
  typeScale,
  align = "start",
}: {
  state: DataState;
  surface: Surface;
  typeScale: string;
  align?: "start" | "end";
}) {
  const p = presentMissing(state, surface);
  return (
    <span className={`flex min-w-0 flex-col gap-1 ${align === "end" ? "items-end text-right" : "items-start"}`}>
      <span aria-hidden className={`font-mono ${typeScale} leading-none text-ink-dim`}>
        &mdash;
      </span>
      <span className="font-mono text-label-s uppercase tracking-[0.16em] text-ink-faint">{p.label}</span>
      <span className="sr-only">{p.detail}</span>
    </span>
  );
}

/**
 * A single measured quantity.
 *
 * The component takes a Measured<T>, not a string, so an absent value cannot be
 * papered over by a caller passing "—" or an invented number. If the state is
 * not renderable, a dash holds the slot and the state is said beneath it.
 *
 * `surface` picks which sentence is the honest one: a missing price is a quote
 * not yet observed, a missing holder count is a registry still indexing.
 */
export function Metric({
  label,
  measurement,
  format,
  unit,
  aside,
  size = "md",
  surface = "generic",
}: {
  label: string;
  measurement: Measured<number | string>;
  format?: (value: number | string) => string;
  unit?: string;
  aside?: ReactNode;
  size?: "sm" | "md" | "lg";
  surface?: Surface;
}) {
  const typeScale = size === "lg" ? "text-data-l" : size === "sm" ? "text-data-s" : "text-data";
  const renderable = hasValue(measurement);
  const qualified = renderable && (measurement.state === "PARTIAL" || measurement.state === "STALE");

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="label-s truncate">{label}</span>
        {qualified ? (
          <span className="label-s shrink-0 text-ink-faint">{presentMissing(measurement.state, surface).label}</span>
        ) : null}
      </div>
      <div className="flex items-baseline gap-1.5">
        {renderable ? (
          <>
            <span className={`tabular font-mono ${typeScale} text-ink`}>
              {format ? format(measurement.value) : String(measurement.value)}
            </span>
            {unit ? <span className="font-mono text-label-s uppercase tracking-[0.16em] text-ink-faint">{unit}</span> : null}
          </>
        ) : (
          <AbsentMetricValue state={measurement.state} surface={surface} typeScale={typeScale} />
        )}
      </div>
      {aside}
      <p className="flex items-center gap-1.5 font-mono text-label-s uppercase tracking-[0.14em] text-ink-faint">
        <IconSource size={10} />
        <span className="truncate">{measurement.provenance.source}</span>
      </p>
    </div>
  );
}

/**
 * A key/value line inside a panel — the ledger form of a metric, used where a
 * dense readout beats a grid of tiles.
 */
export function MetricRow({
  label,
  value,
  state,
  source,
  emphasis,
  surface = "generic",
}: {
  label: string;
  value: string | null;
  state: DataState;
  source?: string;
  emphasis?: "signal" | "negative";
  surface?: Surface;
}) {
  const renderable = value !== null && (state === "OK" || state === "PARTIAL" || state === "STALE");
  const tone = emphasis === "signal" ? "text-signal" : emphasis === "negative" ? "text-negative" : "text-ink";
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-rule-faint px-4 py-2.5 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="label-s truncate">{label}</span>
        {source ? <span className="truncate font-mono text-label-s tracking-[0.12em] text-ink-faint">{source}</span> : null}
      </div>
      {renderable ? (
        <span className={`tabular shrink-0 font-mono text-data ${tone}`}>{value}</span>
      ) : (
        // min-w-0 rather than shrink-0: a presentation label is far longer than
        // the state word it replaced, and an item that refuses to shrink would
        // push a ledger row past its container on a narrow viewport.
        <span className="min-w-0 text-right">
          <AbsentMetricValue state={state} surface={surface} typeScale="text-data" align="end" />
        </span>
      )}
    </div>
  );
}

/** A tight grid of metrics separated by rules rather than card gaps. */
export function MetricGrid({ children, columns = 4 }: { children: ReactNode; columns?: 2 | 3 | 4 | 6 }) {
  const cols = {
    2: "grid-cols-2",
    3: "grid-cols-2 sm:grid-cols-3",
    4: "grid-cols-2 sm:grid-cols-4",
    6: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6",
  }[columns];
  return <div className={`grid ${cols} gap-px bg-rule`}>{children}</div>;
}

export function MetricCell({ children }: { children: ReactNode }) {
  return <div className="bg-void p-4">{children}</div>;
}
