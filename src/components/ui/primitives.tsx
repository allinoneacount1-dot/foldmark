import type { CSSProperties, ReactNode } from "react";
import { type DataState, STATE_LABEL, type Provenance } from "@/lib/data-state";

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
}: {
  title: string;
  meta?: ReactNode;
  state?: DataState;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-rule px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <h3 className="label text-ink">{title}</h3>
        {meta ? <span className="label-s truncate text-ink-faint">{meta}</span> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {state ? <StateTag state={state} /> : null}
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

const STATE_TONE: Record<DataState, string> = {
  OK: "border-signal/30 text-signal",
  PARTIAL: "border-rule-strong text-ink-muted",
  STALE: "border-rule-strong text-ink-muted",
  EMPTY: "border-rule text-ink-faint",
  INDEXING: "border-rule text-ink-dim",
  UNAVAILABLE: "border-negative/30 text-negative",
};

export function StateTag({ state, label }: { state: DataState; label?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 border px-1.5 py-0.5 font-mono text-label-s uppercase tracking-[0.18em] ${STATE_TONE[state]}`}
    >
      {state === "OK" ? <span aria-hidden className="h-1 w-1 bg-signal" /> : null}
      {label ?? STATE_LABEL[state]}
    </span>
  );
}

/**
 * What a metric shows when there is nothing real to show. This is the single
 * place the product is allowed to render an absent value.
 */
export function AbsentValue({ state, className = "" }: { state: DataState; className?: string }) {
  return (
    <span className={`font-mono text-data uppercase tracking-[0.14em] text-ink-faint ${className}`}>
      {STATE_LABEL[state]}
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

export function EmptyState({
  state,
  title,
  detail,
  action,
}: {
  state: DataState;
  title: string;
  detail?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 px-4 py-10 sm:px-6">
      <StateTag state={state} />
      <p className="font-display text-[1.25rem] leading-tight tracking-[-0.02em] text-ink">{title}</p>
      {detail ? <div className="max-w-[52ch] text-body-s text-ink-muted">{detail}</div> : null}
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
