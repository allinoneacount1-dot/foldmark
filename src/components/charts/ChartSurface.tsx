import type { ReactNode } from "react";
import type { DataState } from "@/lib/data-state";
import type { Surface } from "@/lib/presentation-state";
import { StateTag } from "@/components/ui/primitives";

/**
 * The chart instrument with no signal in it.
 *
 * A chart that has nothing to draw is not a broken panel and it is not an
 * error. It is an instrument that is switched on and listening. So the frame
 * stays: the plot region, its grid, the price gutter down the right, the time
 * axis along the bottom. Only the series is missing, because the series is the
 * one thing that would have to be invented.
 *
 * What is deliberately NOT here:
 *
 *   no series          not a candle, not a line, not a random walk, not a
 *                      greyed "sample". A drawn line is a claim about a market.
 *   no axis numbers    the gutters carry tick dashes, never figures. An axis
 *                      labelled with a made-up range is fabricated data wearing
 *                      the costume of an axis.
 *   no moving value    the scan sweeps the whole plot at a fixed cadence and is
 *                      not attached to any position, so nothing here can be
 *                      misread as price movement.
 *
 * The em dashes in the gutters are the same convention AbsentValue uses: a dash
 * holds the slot a figure will occupy without asserting anything about it.
 */

/** Grid divisions. Fractions of the plot, so the gutter dashes align exactly. */
const ROWS = [0.2, 0.4, 0.6, 0.8];
const COLS = [1 / 6, 2 / 6, 0.5, 4 / 6, 5 / 6];

const GUTTER = "w-14";
const TICK = "font-mono text-label-s leading-none text-ink-faint/70";

/**
 * Plot area, grid and axis frame, with the children laid over the plot.
 *
 * `scan` runs one slow sweep across the plot — the instrument listening. It is
 * off wherever the product cannot honestly claim to be listening, and CSS turns
 * it off entirely under prefers-reduced-motion.
 */
export function ChartFrame({
  scan = false,
  children,
  className = "",
}: {
  scan?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`absolute inset-0 flex flex-col ${className}`}>
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1 overflow-hidden">
          <div aria-hidden className="absolute inset-0">
            {ROWS.map((r) => (
              <span key={`r${r}`} className="absolute inset-x-0 h-px bg-rule-faint" style={{ top: `${r * 100}%` }} />
            ))}
            {COLS.map((c) => (
              <span key={`c${c}`} className="absolute inset-y-0 w-px bg-rule-faint" style={{ left: `${c * 100}%` }} />
            ))}
          </div>

          {scan ? <span aria-hidden className="m-chart-scan pointer-events-none absolute inset-0" /> : null}

          {children}
        </div>

        {/* price scale — ticks only. A range we have not observed is a range we may not label. */}
        <div aria-hidden className={`relative shrink-0 border-l border-rule ${GUTTER}`}>
          {ROWS.map((r) => (
            <span key={r} className={`absolute right-2 -translate-y-1/2 ${TICK}`} style={{ top: `${r * 100}%` }}>
              &mdash;
            </span>
          ))}
        </div>
      </div>

      {/* time axis — same rule: the frame is real, the labels are not invented. */}
      <div aria-hidden className="flex h-6 shrink-0 border-t border-rule">
        <div className="relative min-w-0 flex-1">
          {COLS.map((c) => (
            <span
              key={c}
              className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 ${TICK}`}
              style={{ left: `${c * 100}%` }}
            >
              &mdash;
            </span>
          ))}
        </div>
        <div className={`shrink-0 border-l border-rule ${GUTTER}`} />
      </div>
    </div>
  );
}

/**
 * The framed instrument plus the sentence that says what it is waiting for.
 *
 * Copy comes from the presentation layer — `present(state, "chart")` — so this
 * component decides layout and never wording for a data state. `headline` and
 * `detail` are passed in by the caller that already knows which sentence is the
 * honest one for its case.
 *
 * `status` is the receiver line, e.g. SOURCE — CONNECTING. It reports the link,
 * not the market.
 */
export function EmptyChartSurface({
  state,
  stateLabel,
  surface = "chart",
  headline,
  detail,
  status,
  action,
  scan = true,
  busy = false,
}: {
  state?: DataState;
  stateLabel?: string;
  surface?: Surface;
  headline?: string;
  detail?: ReactNode;
  status: string;
  action?: ReactNode;
  scan?: boolean;
  busy?: boolean;
}) {
  return (
    <ChartFrame scan={scan}>
      <div
        className="absolute inset-0 flex items-center px-5 sm:px-7"
        aria-live="polite"
        aria-busy={busy || undefined}
      >
        <div className="flex max-w-[46ch] flex-col items-start gap-2.5">
          {state ? <StateTag state={state} surface={surface} label={stateLabel} /> : null}

          {headline ? (
            <p className="font-display text-[1.375rem] leading-tight tracking-[-0.02em] text-ink">{headline}</p>
          ) : null}

          {detail ? <div className="text-body-s text-ink-muted">{detail}</div> : null}

          <p className="flex items-center gap-2 font-mono text-label-s uppercase tracking-[0.18em] text-ink-dim">
            <span
              aria-hidden
              className={`h-1 w-1 shrink-0 ${scan ? "m-receiver bg-signal" : "bg-ink-faint"}`}
            />
            {status}
          </p>

          {action}
        </div>
      </div>
    </ChartFrame>
  );
}
