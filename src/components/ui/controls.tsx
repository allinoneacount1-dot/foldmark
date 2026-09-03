import Link from "next/link";
import type { ReactNode } from "react";
import { IconArrowRight, IconExternal } from "@/components/icons";

/* --------------------------------------------------------------- buttons */

type Tone = "primary" | "secondary" | "ghost";

const TONE: Record<Tone, string> = {
  primary:
    "on-signal bg-signal text-void hover:bg-ink border border-signal hover:border-ink",
  secondary:
    "border border-rule-strong bg-transparent text-ink hover:bg-ink hover:text-void hover:border-ink",
  ghost: "border border-transparent text-ink-muted hover:text-ink hover:border-rule-strong",
};

const SIZE = {
  sm: "h-8 px-3 text-label-s",
  md: "h-11 px-5 text-label",
} as const;

const BASE =
  "inline-flex items-center justify-center gap-2 font-mono uppercase tracking-[0.16em] " +
  "transition-colors duration-[180ms] ease-out disabled:opacity-40 disabled:pointer-events-none";

export function ActionLink({
  href,
  children,
  tone = "secondary",
  size = "md",
  external,
  className = "",
  ariaLabel,
}: {
  href: string;
  children: ReactNode;
  tone?: Tone;
  size?: keyof typeof SIZE;
  external?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const cls = `${BASE} ${SIZE[size]} ${TONE[tone]} ${className}`;
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls} aria-label={ariaLabel}>
        {children}
        <IconExternal size={13} />
      </a>
    );
  }
  return (
    <Link href={href} className={cls} aria-label={ariaLabel}>
      {children}
      <IconArrowRight size={14} />
    </Link>
  );
}

export function Button({
  children,
  tone = "secondary",
  size = "md",
  className = "",
  ...rest
}: {
  children: ReactNode;
  tone?: Tone;
  size?: keyof typeof SIZE;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`${BASE} ${SIZE[size]} ${TONE[tone]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

/* ----------------------------------------------------------------- chips */

/**
 * Filter chips are real links so filtering survives a page load, works without
 * JavaScript and is shareable as a URL. They are never inert spans.
 */
export function ChipLink({
  href,
  active,
  children,
  count,
  replace = true,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
  count?: number;
  replace?: boolean;
}) {
  return (
    <Link
      href={href}
      replace={replace}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 border px-2.5 font-mono text-label-s uppercase tracking-[0.16em] transition-colors duration-[180ms] ${
        active
          ? "border-ink bg-ink text-void"
          : "border-rule bg-transparent text-ink-dim hover:border-rule-strong hover:text-ink"
      }`}
    >
      {children}
      {typeof count === "number" ? (
        <span className={`tabular ${active ? "text-void/60" : "text-ink-faint"}`}>{count}</span>
      ) : null}
    </Link>
  );
}

export function ChipGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="label-s hidden shrink-0 text-ink-faint sm:inline">{label}</span>
      <div
        role="group"
        aria-label={label}
        className="flex min-w-0 gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- address */

export function ExplorerLink({
  address,
  explorer,
  children,
  className = "",
}: {
  address: string;
  explorer: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={`${explorer}/address/${address}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 font-mono text-data text-ink-muted underline-offset-4 transition-colors duration-[180ms] hover:text-ink hover:underline ${className}`}
    >
      {children ?? address}
      <IconExternal size={12} />
    </a>
  );
}
