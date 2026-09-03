import type { ReactNode } from "react";
import { hasValue, STATE_LABEL, type Measured } from "@/lib/data-state";

/**
 * The tape: a full-bleed status band of label/value cells split by hairlines.
 *
 * It is the product's signature horizontal member — the thing that makes a
 * page read as an instrument the moment it loads. It never marquees; it
 * scrolls only when it overflows, and it is a focusable region so a keyboard
 * user can reach that scroll.
 */

export function Tape({ children, label = "Market status" }: { children: ReactNode; label?: string }) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="w-full overflow-x-auto border-y border-rule bg-surface [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="shell">
        <dl className="flex min-w-max items-stretch">{children}</dl>
      </div>
    </div>
  );
}

export function TapeCell({
  label,
  measurement,
  format,
  unit,
  emphasis,
}: {
  label: string;
  measurement: Measured<number | string>;
  format?: (value: number | string) => string;
  unit?: string;
  emphasis?: boolean;
}) {
  const renderable = hasValue(measurement);
  return (
    <div className="flex min-w-[9.5rem] shrink-0 flex-col justify-center gap-1 border-r border-rule py-3 pr-6 pl-0 first:pl-0 last:border-r-0 sm:min-w-[11rem]">
      <dt className="label-s">{label}</dt>
      <dd className="flex items-baseline gap-1.5">
        {renderable ? (
          <>
            <span className={`tabular font-mono text-data ${emphasis ? "text-signal" : "text-ink"}`}>
              {format ? format(measurement.value) : String(measurement.value)}
            </span>
            {unit ? <span className="label-s text-ink-faint">{unit}</span> : null}
          </>
        ) : (
          <span className="font-mono text-data uppercase tracking-[0.14em] text-ink-faint">
            {STATE_LABEL[measurement.state]}
          </span>
        )}
      </dd>
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
