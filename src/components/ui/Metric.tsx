import type { ReactNode } from "react";
import { hasValue, STATE_LABEL, type DataState, type Measured } from "@/lib/data-state";
import { IconSource } from "@/components/icons";

/**
 * A single measured quantity.
 *
 * The component takes a Measured<T>, not a string, so an absent value cannot be
 * papered over by a caller passing "—" or an invented number. If the state is
 * not renderable, the state itself is what appears.
 */
export function Metric({
  label,
  measurement,
  format,
  unit,
  aside,
  size = "md",
}: {
  label: string;
  measurement: Measured<number | string>;
  format?: (value: number | string) => string;
  unit?: string;
  aside?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const typeScale = size === "lg" ? "text-data-l" : size === "sm" ? "text-data-s" : "text-data";
  const renderable = hasValue(measurement);

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="label-s truncate">{label}</span>
        {measurement.state === "PARTIAL" || measurement.state === "STALE" ? (
          <span className="label-s shrink-0 text-ink-faint">{STATE_LABEL[measurement.state]}</span>
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
          <span className={`font-mono ${typeScale} uppercase tracking-[0.14em] text-ink-faint`}>
            {STATE_LABEL[measurement.state]}
          </span>
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
}: {
  label: string;
  value: string | null;
  state: DataState;
  source?: string;
  emphasis?: "signal" | "negative";
}) {
  const renderable = value !== null && (state === "OK" || state === "PARTIAL" || state === "STALE");
  const tone = emphasis === "signal" ? "text-signal" : emphasis === "negative" ? "text-negative" : "text-ink";
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-rule-faint px-4 py-2.5 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="label-s truncate">{label}</span>
        {source ? <span className="truncate font-mono text-label-s tracking-[0.12em] text-ink-faint">{source}</span> : null}
      </div>
      <span
        className={`tabular shrink-0 font-mono text-data ${
          renderable ? tone : "uppercase tracking-[0.14em] text-ink-faint"
        }`}
      >
        {renderable ? value : STATE_LABEL[state]}
      </span>
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
