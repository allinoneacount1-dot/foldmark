import type { ReactNode } from "react";
import Link from "next/link";
import { DOCS_NAV } from "@/content/docs";
import { IconCopy } from "@/components/icons";

/**
 * Documentation primitives.
 *
 * Docs inherit the FOLDMARK palette but drop the cinematic pacing: reading
 * comes first. Long measure, generous leading, hairline structure, anchored
 * headings, no motion behind text.
 */

/* -------------------------------------------------------------- headings */

export function DocTitle({ kicker, title, lede }: { kicker: string; title: string; lede?: ReactNode }) {
  return (
    <header className="border-b border-rule pb-6">
      <p className="label-s">{kicker}</p>
      <h1 className="mt-3 font-display text-[2rem] leading-[1.02] tracking-[-0.025em] text-ink sm:text-[2.5rem]">
        {title}
      </h1>
      {lede ? <div className="mt-4 max-w-[68ch] text-body text-ink-muted">{lede}</div> : null}
    </header>
  );
}

/** A section with a deep-linkable anchor. */
export function DocSection({
  id,
  title,
  children,
  kicker,
}: {
  id: string;
  title: string;
  children: ReactNode;
  kicker?: string;
}) {
  return (
    <section id={id} className="scroll-mt-[calc(var(--nav-height)+1.5rem)] border-t border-rule pt-8">
      {kicker ? <p className="label-s mb-2">{kicker}</p> : null}
      <h2 className="group flex items-baseline gap-3 font-display text-[1.5rem] leading-tight tracking-[-0.02em] text-ink">
        <a href={`#${id}`} className="no-underline">
          {title}
          <span
            aria-hidden
            className="ml-2 align-middle font-mono text-[0.7em] text-ink-faint opacity-0 m-fast group-hover:opacity-100"
          >
            #
          </span>
        </a>
      </h2>
      <div className="mt-4 flex max-w-[72ch] flex-col gap-4">{children}</div>
    </section>
  );
}

export function DocSub({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <div id={id} className="scroll-mt-[calc(var(--nav-height)+1.5rem)]">
      <h3 className="label text-ink">{title}</h3>
      <div className="mt-2 flex flex-col gap-3">{children}</div>
    </div>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="text-body text-ink-muted">{children}</p>;
}

export function Note({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "warn" }) {
  return (
    <aside
      className={`border-l-2 py-2 pl-4 text-body-s ${
        tone === "warn" ? "border-negative/60 text-ink-muted" : "border-rule-strong text-ink-muted"
      }`}
    >
      {children}
    </aside>
  );
}

export function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-body text-ink-muted">
          <span aria-hidden className="mt-[0.6em] h-px w-3 shrink-0 bg-rule-strong" />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ code */

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="border border-rule bg-surface px-1 py-0.5 font-mono text-[0.9em] text-ink">{children}</code>
  );
}

export { CodeBlock } from "@/components/docs/CodeBlock";

/* ----------------------------------------------------------------- table */

export function DocTable({
  columns,
  rows,
  caption,
}: {
  columns: string[];
  rows: ReactNode[][];
  caption: string;
}) {
  return (
    <div className="w-full overflow-x-auto border border-rule">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-rule bg-surface">
            {columns.map((c) => (
              <th key={c} scope="col" className="label-s px-4 py-2.5 align-bottom">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-rule-faint last:border-b-0">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 align-top text-body-s text-ink-muted">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------- nav */

export function DocFooterNav({ current }: { current: string }) {
  const flat = DOCS_NAV.flatMap((g) => g.links);
  const index = flat.findIndex((l) => l.href === current);
  const prev = index > 0 ? flat[index - 1] : null;
  const next = index >= 0 && index < flat.length - 1 ? flat[index + 1] : null;

  if (!prev && !next) return null;

  return (
    <nav aria-label="Documentation pagination" className="mt-12 grid gap-px border-t border-rule bg-rule sm:grid-cols-2">
      {prev ? (
        <Link href={prev.href} className="group bg-void px-4 py-4 m-fast hover:bg-surface">
          <span className="label-s">← PREVIOUS</span>
          <span className="mt-1 block font-mono text-data text-ink">{prev.label}</span>
        </Link>
      ) : (
        <span className="bg-void" />
      )}
      {next ? (
        <Link
          href={next.href}
          className="group bg-void px-4 py-4 text-right m-fast hover:bg-surface"
        >
          <span className="label-s">NEXT →</span>
          <span className="mt-1 block font-mono text-data text-ink">{next.label}</span>
        </Link>
      ) : (
        <span className="bg-void" />
      )}
    </nav>
  );
}

export function CopyHint() {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-label-s uppercase tracking-[0.14em] text-ink-faint">
      <IconCopy size={11} /> COPY
    </span>
  );
}
