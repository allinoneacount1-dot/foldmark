import type { CSSProperties, ReactNode } from "react";
import { type DataState, type Provenance } from "@/lib/data-state";
import { present, presentMissing, type Surface } from "@/lib/presentation-state";

/* ---------------------------------------------------------------- surface */

/**
 * A module bounded by hairlines. FOLDMARK does not use cards: a Panel is a
 * region of the grid with rules on its edges, not a floating rounded box.
 */
export function Panel({
  children,
  className = "",
  tone = "surface",
  as: As = "section",
}: {
  children: ReactNode;
  className?: string;
  tone?: "void" | "surface" | "raised";
  as?: "section" | "div" | "aside" | "article";
}) {
  const bg = tone === "void" ? "bg-void" : tone === "raised" ? "bg-raised" : "bg-surface";
  return <As className={`border border-rule ${bg} ${className}`}>{children}</As>;
}

export function PanelHeader({
  title,
  meta,
  state,
  action,
  surface = "generic",
}: {
  title: string;
  meta?: ReactNode;
  state?: DataState;
  action?: ReactNode;
  /** What this panel holds, so its chip says the honest thing for that kind of value. */
  surface?: Surface;
}) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-rule px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <h3 className="label text-ink">{title}</h3>
        {meta ? <span className="label-s truncate text-ink-faint">{meta}</span> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {state ? <StateTag state={state} surface={surface} /> : null}
        {action}
      </div>
    </header>
  );
}

export function PanelBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`p-4 ${className}`}>{children}</div>;
}

/* ------------------------------------------------------------ typography */

/** Section marker: the numbered rule that opens a composition block. */
export function SectionMarker({ index, title, className = "" }: { index: string; title: string; className?: string }) {
  return (
    <div className={`flex items-baseline gap-3 border-b border-rule pb-2.5 ${className}`}>
      <span className="label-s tabular text-ink-faint">{index}</span>
      <span className="label text-ink-muted">{title}</span>
    </div>
  );
}

export function Display({
  children,
  size = "l",
  className = "",
  as: As = "h2",
}: {
  children: ReactNode;
  size?: "xl" | "l" | "m";
  className?: string;
  as?: "h1" | "h2" | "h3" | "p";
}) {
  const step =
    size === "xl"
      ? "text-[2.5rem] sm:text-[3.25rem] lg:text-display-xl"
      : size === "l"
        ? "text-[2rem] sm:text-[2.375rem] lg:text-display-l"
        : "text-[1.5rem] sm:text-display-m";
  return (
    <As className={`font-display font-normal leading-[0.95] tracking-[-0.025em] text-ink ${step} ${className}`}>
      {children}
    </As>
  );
}

export function Lede({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <p className={`max-w-[58ch] text-body text-ink-muted ${className}`} style={style}>
      {children}
    </p>
  );
}

/* ----------------------------------------------------------------- state */

/**
 * How a state chip is coloured.
 *
 * UNAVAILABLE was red, which was right when the chip said DATA UNAVAILABLE and
 * meant something had gone wrong. It now says SYNCING, and a red SYNCING reads
 * as a failure the reader is supposed to act on. Waiting for a first
 * observation is an ordinary state, so it is toned like one — quiet, not
 * alarming. Red is kept for the surfaces that genuinely report a fault, which
 * is the API and the status page.
 */
const STATE_TONE: Record<DataState, string> = {
  OK: "border-signal/30 text-signal",
  PARTIAL: "border-rule-strong text-ink-muted",
  STALE: "border-rule-strong text-ink-muted",
  EMPTY: "border-rule text-ink-faint",
  INDEXING: "border-rule text-ink-dim",
  UNAVAILABLE: "border-rule text-ink-dim",
};

/**
 * The state chip.
 *
 * Says the state in the reader's terms. `surface` picks the sentence: the same
 * missing value is a price not yet observed, a graph with nothing to draw, or a
 * registry still filling, and those read differently to a person even though
 * they are one state to the machine.
 */
export function StateTag({
  state,
  label,
  surface = "generic",
}: {
  state: DataState;
  label?: string;
  surface?: Surface;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 border px-1.5 py-0.5 font-mono text-label-s uppercase tracking-[0.18em] ${STATE_TONE[state]}`}
    >
      {state === "OK" ? <span aria-hidden className="h-1 w-1 bg-signal" /> : null}
      {label ?? present(state, surface).label}
    </span>
  );
}

/**
 * What a metric shows when there is nothing real to show.
 *
 * An em dash where the figure would be, and the state said underneath it. The
 * dash is presentation — it occupies the slot without asserting anything. A
 * number in that slot would be an assertion, which is why one never appears
 * here however empty the screen looks.
 *
 * The previous behaviour put the raw state word in the value slot, so a column
 * of metrics read as a column of the word UNAVAILABLE. That told a reader about
 * our infrastructure when they had asked about a market.
 */
export function AbsentValue({
  state,
  className = "",
  surface = "generic",
}: {
  state: DataState;
  className?: string;
  surface?: Surface;
}) {
  // presentMissing, not present: the slot is empty, so a label claiming a last
  // observation would describe something the reader cannot see.
  const p = presentMissing(state, surface);
  return (
    <span className={`flex flex-col gap-1 ${className}`}>
      <span aria-hidden className="font-mono text-data leading-none text-ink-dim">
        &mdash;
      </span>
      <span className="font-mono text-label-s uppercase tracking-[0.16em] text-ink-faint">{p.label}</span>
      <span className="sr-only">{p.detail}</span>
    </span>
  );
}

/* ------------------------------------------------------------ provenance */

export function ProvenanceLine({ provenance, observedAt }: { provenance: Provenance; observedAt?: string | null }) {
  return (
    <p className="font-mono text-label-s uppercase tracking-[0.14em] text-ink-faint">
      <span className="text-ink-dim">SOURCE</span> {provenance.source}
      {observedAt ? <span className="text-ink-faint"> · {observedAt}</span> : null}
    </p>
  );
}

/** Collapsible methodology. Always says how a number was produced. */
export function Methodology({ children, label = "METHODOLOGY" }: { children: ReactNode; label?: string }) {
  return (
    <details className="group border-t border-rule">
      <summary className="label flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-ink-dim m-fast hover:text-ink">
        <span>{label}</span>
        <span aria-hidden className="text-ink-faint m-micro group-open:rotate-180">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25">
            <path d="m4.5 6 3.5 3.5L11.5 6" />
          </svg>
        </span>
      </summary>
      <div className="border-t border-rule-faint px-4 py-3 text-body-s text-ink-muted">{children}</div>
    </details>
  );
}

/* ---------------------------------------------------------------- states */

/**
 * A region with nothing in it yet.
 *
 * `title` and `detail` are optional now: given a surface, the honest sentence
 * for this state is already known, so a caller that has nothing more specific
 * to say gets copy written for the case rather than a generic fallback. A
 * caller that does know better still overrides both.
 */
export function EmptyState({
  state,
  title,
  detail,
  action,
  surface = "generic",
}: {
  state: DataState;
  title?: string;
  detail?: ReactNode;
  action?: ReactNode;
  surface?: Surface;
}) {
  const p = present(state, surface);
  return (
    <div className="flex flex-col items-start gap-3 px-4 py-10 sm:px-6">
      <StateTag state={state} surface={surface} />
      <p className="font-display text-[1.25rem] leading-tight tracking-[-0.02em] text-ink">{title ?? p.headline}</p>
      <div className="max-w-[52ch] text-body-s text-ink-muted">{detail ?? p.detail}</div>
      {action}
    </div>
  );
}

/**
 * Skeleton rows for a Suspense boundary.
 *
 * It says "structure is arriving" and nothing else: no numerals, no colour, no
 * chart shape. A loading state must never be mistakable for data, so it cannot
 * imply a value, a direction or a magnitude.
 */
export function LoadingRows({ rows = 5, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`divide-y divide-rule-faint ${className}`} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5">
          <span aria-hidden className="m-skeleton h-2 w-24" style={{ animationDelay: `${i * 90}ms` }} />
          <span aria-hidden className="m-skeleton h-2 flex-1 opacity-60" style={{ animationDelay: `${i * 90 + 45}ms` }} />
          <span aria-hidden className="m-skeleton h-2 w-16" style={{ animationDelay: `${i * 90 + 90}ms` }} />
        </div>
      ))}
    </div>
  );
}

/**
 * The disclosure that keeps a window honest.
 *
 * A panel labelled 7D that draws on 40 minutes of index is making a claim it
 * cannot support. This is where the product says so — inline, next to the
 * figures, not buried in a methodology drawer — because the correction only
 * works if it is read at the same moment as the number it qualifies.
 *
 * Renders nothing when coverage is complete: a notice that always appears stops
 * being read.
 */
export function CoverageNote({ note, tone = "warn" }: { note: string | null; tone?: "warn" | "quiet" }) {
  if (!note) return null;
  return (
    <p
      role="note"
      className={`label-s border-t px-4 py-2 normal-case tracking-[0.02em] ${
        tone === "warn" ? "border-rule bg-raised text-ink-muted" : "border-rule-faint text-ink-faint"
      }`}
    >
      {note}
    </p>
  );
}
