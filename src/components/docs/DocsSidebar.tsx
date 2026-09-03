"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { DOCS_NAV } from "@/content/docs";
import { IconChevron } from "@/components/icons";

/**
 * Documentation navigation.
 *
 * A sticky rail on wide screens; a disclosure above the content on narrow ones,
 * so a phone reader is never asked to scroll past a full tree to reach the page
 * they opened.
 */
export function DocsSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const current = DOCS_NAV.flatMap((g) => g.links).find((l) => l.href === pathname);

  return (
    <>
      {/* narrow: disclosure */}
      <div className="border-b border-rule py-3 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="docs-nav-mobile"
          className="flex w-full items-center justify-between gap-3 py-1"
        >
          <span className="min-w-0 text-left">
            <span className="label-s block">DOCUMENTATION</span>
            <span className="mt-0.5 block truncate font-mono text-data text-ink">{current?.label ?? "Overview"}</span>
          </span>
          <span
            aria-hidden
            className={`shrink-0 text-ink-faint transition-transform duration-[180ms] ${open ? "rotate-180" : ""}`}
          >
            <IconChevron size={16} />
          </span>
        </button>
        {open ? (
          <nav id="docs-nav-mobile" aria-label="Documentation" className="mt-2 border-t border-rule-faint pt-2">
            <Tree pathname={pathname} onNavigate={() => setOpen(false)} />
          </nav>
        ) : null}
      </div>

      {/* wide: sticky rail */}
      <nav
        aria-label="Documentation"
        className="hidden lg:sticky lg:top-[var(--nav-height)] lg:block lg:max-h-[calc(100dvh-var(--nav-height))] lg:self-start lg:overflow-y-auto lg:border-r lg:border-rule lg:py-12 lg:pr-6"
      >
        <Tree pathname={pathname} />
      </nav>
    </>
  );
}

function Tree({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <div className="flex flex-col gap-6">
      {DOCS_NAV.map((group) => (
        <div key={group.group}>
          <p className="label-s pb-2">{group.group}</p>
          <ul className="flex flex-col">
            {group.links.map((link) => {
              const active = pathname === link.href;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-[36px] items-center border-l px-3 text-body-s transition-colors duration-[180ms] ${
                      active
                        ? "border-signal bg-surface text-ink"
                        : "border-rule-faint text-ink-muted hover:border-rule-strong hover:text-ink"
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
