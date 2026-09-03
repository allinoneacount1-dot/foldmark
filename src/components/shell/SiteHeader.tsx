"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { ConnectButton } from "@/components/ConnectButton";
import { CommandPalette, useCommandPalette } from "@/components/CommandPalette";
import { IconSearch, IconMenu, IconClose, IconX } from "@/components/icons";
import { NAV } from "@/config/site";
import { SOCIAL_HANDLES, SOCIAL_LABELS, SOCIAL_LINKS } from "@/config/social";

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function SiteHeader() {
  const pathname = usePathname();
  const { open, setOpen } = useCommandPalette();

  // The drawer is open only for the route it was opened on, so navigating —
  // including with the back button — closes it without an effect.
  const [drawer, setDrawer] = useState<{ open: boolean; at: string }>({ open: false, at: pathname });
  const menu = drawer.open && drawer.at === pathname;
  const setMenu = (next: boolean | ((v: boolean) => boolean)) =>
    setDrawer((cur) => ({ open: typeof next === "function" ? next(cur.open && cur.at === pathname) : next, at: pathname }));

  // lock the page behind the drawer while it is open
  useEffect(() => {
    if (!menu) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [menu]);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-rule bg-void">
        <div className="mx-auto flex h-[var(--nav-height)] max-w-[1560px] items-center gap-6 px-4 md:px-6">
          <Link
            href="/"
            aria-label="FOLDMARK — home"
            className="flex shrink-0 items-center transition-opacity duration-[180ms] hover:opacity-80"
          >
            <span className="hidden sm:block">
              <BrandLogo variant="horizontal" height={30} priority />
            </span>
            <span className="sm:hidden">
              <BrandLogo variant="mark" height={26} priority />
            </span>
          </Link>

          <nav aria-label="Primary" className="hidden min-w-0 flex-1 lg:block">
            <ul className="flex items-center gap-0.5">
              {NAV.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`relative flex h-[var(--nav-height)] items-center px-3 font-mono text-label-s uppercase tracking-[0.16em] transition-colors duration-[180ms] ${
                        active ? "text-ink" : "text-ink-dim hover:text-ink"
                      }`}
                    >
                      {item.label}
                      {active ? <span aria-hidden className="absolute inset-x-3 bottom-0 h-px bg-signal" /> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Search — Command K"
              className="hidden h-8 items-center gap-2 border border-rule px-2.5 font-mono text-label-s uppercase tracking-[0.16em] text-ink-dim transition-colors duration-[180ms] hover:border-rule-strong hover:text-ink sm:flex"
            >
              <IconSearch size={13} />
              <span className="hidden md:inline">SEARCH</span>
              <kbd className="border border-rule px-1 py-px text-[9px] tracking-[0.1em] text-ink-faint">⌘K</kbd>
            </button>

            <ConnectButton />

            <button
              type="button"
              onClick={() => setMenu((v) => !v)}
              aria-label={menu ? "Close menu" : "Open menu"}
              aria-expanded={menu}
              aria-controls="site-menu"
              className="grid h-11 w-11 place-items-center text-ink-muted transition-colors duration-[180ms] hover:text-ink lg:hidden"
            >
              {menu ? <IconClose size={17} /> : <IconMenu size={17} />}
            </button>
          </div>
        </div>
      </header>

      {menu ? (
        <div
          id="site-menu"
          className="fixed inset-x-0 top-[var(--nav-height)] bottom-0 z-40 overflow-y-auto border-t border-rule bg-void lg:hidden"
        >
          <nav aria-label="Primary mobile" className="mx-auto max-w-[1560px] px-4 py-2">
            <ul>
              {NAV.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href} className="border-b border-rule-faint">
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex min-h-[52px] items-center justify-between gap-3 font-mono text-label uppercase tracking-[0.16em] ${
                        active ? "text-ink" : "text-ink-muted"
                      }`}
                    >
                      {item.label}
                      {active ? <span aria-hidden className="h-1.5 w-1.5 bg-signal" /> : null}
                    </Link>
                  </li>
                );
              })}
              <li className="border-b border-rule-faint">
                <button
                  type="button"
                  onClick={() => {
                    setMenu(false);
                    setOpen(true);
                  }}
                  className="flex min-h-[52px] w-full items-center gap-3 font-mono text-label uppercase tracking-[0.16em] text-ink-muted"
                >
                  <IconSearch size={14} />
                  SEARCH
                </button>
              </li>
              <li>
                <a
                  href={SOCIAL_LINKS.x}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={SOCIAL_LABELS.x}
                  className="flex min-h-[52px] items-center gap-3 font-mono text-label tracking-[0.16em] text-ink-muted transition-colors duration-[180ms] hover:text-signal"
                >
                  <IconX size={13} />
                  {SOCIAL_HANDLES.x}
                </a>
              </li>
            </ul>
          </nav>
        </div>
      ) : null}

      <CommandPalette open={open} onClose={() => setOpen(false)} />
    </>
  );
}
