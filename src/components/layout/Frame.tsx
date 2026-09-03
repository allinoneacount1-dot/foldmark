import type { ReactNode } from "react";
import { SectionMarker } from "@/components/ui/primitives";

/**
 * Composition primitives.
 *
 * A page declares structure — shell, band rhythm, column ratio — instead of
 * typing padding. This is what keeps the pacing deliberate rather than six
 * sections that all happen to be py-14.
 */

export function Shell({
  children,
  bleed = false,
  className = "",
}: {
  children: ReactNode;
  bleed?: boolean;
  className?: string;
}) {
  return <div className={`${bleed ? "w-full" : "shell"} ${className}`}>{children}</div>;
}

export function Band({
  rhythm = "dense",
  marker,
  children,
  className = "",
  bleed = false,
  tone,
  reveal = true,
  id,
}: {
  rhythm?: "quiet" | "dense" | "signature" | "none";
  marker?: { index: string; title: string };
  children: ReactNode;
  className?: string;
  bleed?: boolean;
  tone?: "surface";
  reveal?: boolean;
  id?: string;
}) {
  const pad = rhythm === "none" ? "" : `band-${rhythm}`;
  return (
    <section
      id={id}
      data-reveal={reveal ? "" : undefined}
      className={`${tone === "surface" ? "bg-surface" : ""} ${className}`}
    >
      <div className={bleed ? "w-full" : "shell"}>
        <div className={pad}>
          {marker ? (
            <div data-reveal-item={reveal ? "" : undefined} className="mb-8">
              <SectionMarker index={marker.index} title={marker.title} />
            </div>
          ) : null}
          {children}
        </div>
      </div>
    </section>
  );
}

const RATIO = {
  "8:4": "lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]",
  "7:5": "lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]",
  "5:7": "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]",
  rail: "lg:grid-cols-[minmax(0,1fr)_var(--width-rail)]",
} as const;

/** Asymmetry as a named ratio, never an ad-hoc fractional pair. */
export function Split({
  left,
  right,
  ratio = "8:4",
  gap = "gap-8",
  className = "",
  align = "start",
}: {
  left: ReactNode;
  right: ReactNode;
  ratio?: keyof typeof RATIO;
  gap?: string;
  className?: string;
  align?: "start" | "center" | "stretch";
}) {
  const alignment = align === "center" ? "items-center" : align === "stretch" ? "items-stretch" : "items-start";
  return (
    <div className={`grid grid-cols-1 ${RATIO[ratio]} ${gap} ${alignment} ${className}`}>
      <div className="min-w-0">{left}</div>
      <div className="min-w-0">{right}</div>
    </div>
  );
}

/** The intelligence rail: one ruled column, not a stack of floating cards. */
export function RailColumn({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <aside
      aria-label="Intelligence rail"
      className={`flex flex-col gap-px bg-rule lg:sticky lg:top-[var(--nav-height)] lg:max-h-[calc(100dvh-var(--nav-height))] lg:overflow-y-auto ${className}`}
    >
      {children}
    </aside>
  );
}

export function PageHead({
  kicker,
  title,
  lede,
  aside,
}: {
  kicker: string;
  title: ReactNode;
  lede?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6 border-b border-rule pb-6 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <p className="label-s">{kicker}</p>
        <h1 className="mt-3 font-display text-[2rem] leading-[0.95] tracking-[-0.025em] text-ink sm:text-display-l">
          {title}
        </h1>
        {lede ? <div className="measure mt-4 text-body text-ink-muted">{lede}</div> : null}
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  );
}
