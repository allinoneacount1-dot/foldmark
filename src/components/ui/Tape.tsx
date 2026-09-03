import type { ReactNode } from "react";
import { hasValue, type Measured } from "@/lib/data-state";
import { presentMissing, type Surface } from "@/lib/presentation-state";

/**
 * The tape: a full-bleed status band of label/value cells split by hairlines.
 *
 * It is the product's signature horizontal member — the thing that makes a
 * page read as an instrument the moment it loads. It never marquees; it
 * scrolls only when it overflows, and it is a focusable region so a keyboard
 * user can reach that scroll.
 */

export function Tape({
  children,
  label = "Market status",
  /** ms to wait before the band appears, so it reads as the page coming online */
  enterDelay,
}: {
  children: ReactNode;
  label?: string;
  enterDelay?: number;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={`w-full overflow-x-auto border-y border-rule bg-surface [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
        enterDelay === undefined ? "" : "m-enter-fade"
      }`}
      style={enterDelay === undefined ? undefined : { animationDelay: `${enterDelay}ms` }}
    >
      <div className="shell">
        <dl className="flex min-w-max items-stretch">{children}</dl>
      </div>
    </div>
  );
}

/**
 * One cell of the band.
 *
 * With a value it prints the value. Without one it prints an em dash and says,
 * beneath it, what is being waited on — the same construction as AbsentValue,
 * so a tape of unobserved cells reads as an instrument warming up rather than a
 * row of the word UNAVAILABLE.
 */
export function TapeCell({
  label,
  measurement,
  format,
  unit,
  emphasis,
  surface = "generic",
}: {
  label: string;
  measurement: Measured<number | string>;
  format?: (value: number | string) => string;
  unit?: string;
  emphasis?: boolean;
  surface?: Surface;
}) {
  const renderable = hasValue(measurement);
  const p = presentMissing(measurement.state, surface);
  return (
    <div className="flex min-w-[9.5rem] shrink-0 flex-col justify-center gap-1 border-r border-rule py-3 pr-6 pl-0 first:pl-0 last:border-r-0 sm:min-w-[11rem]">
      <dt className="label-s">{label}</dt>
      {renderable ? (
        <dd className="flex items-baseline gap-1.5">
          <span className={`tabular font-mono text-data ${emphasis ? "text-signal" : "text-ink"}`}>
            {format ? format(measurement.value) : String(measurement.value)}
          </span>
          {unit ? <span className="label-s text-ink-faint">{unit}</span> : null}
        </dd>
      ) : (
        <dd className="flex flex-col gap-1">
          <span aria-hidden className="font-mono text-data leading-none text-ink-dim">
            &mdash;
          </span>
          <span className="whitespace-nowrap font-mono text-label-s uppercase tracking-[0.16em] text-ink-faint">
            {p.label}
          </span>
          <span className="sr-only">{p.detail}</span>
        </dd>
      )}
    </div>
  );
}

/** A plain cell for values that are not Measured — labels, chain identity. */
export function TapeStatic({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-[9.5rem] shrink-0 flex-col justify-center gap-1 border-r border-rule py-3 pr-6 last:border-r-0 sm:min-w-[11rem]">
      <dt className="label-s">{label}</dt>
      <dd className="tabular font-mono text-data text-ink">{value}</dd>
    </div>
  );
}
