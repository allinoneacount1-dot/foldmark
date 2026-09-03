import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { IconX } from "@/components/icons";
import { CHAIN, FOOTER_NAV, SITE } from "@/config/site";
import { SOCIAL_HANDLES, SOCIAL_LABELS, SOCIAL_LINKS } from "@/config/social";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-rule bg-void">
      <div className="mx-auto max-w-[1560px] px-4 md:px-6">
        <div className="grid gap-10 py-12 md:grid-cols-[minmax(0,1.5fr)_repeat(2,minmax(0,1fr))_auto] md:gap-12">
          <div className="flex flex-col items-start gap-5">
            <BrandLogo variant="master" height={72} />
            <p className="max-w-[34ch] text-body-s text-ink-muted">{SITE.positioning}</p>
          </div>

          {FOOTER_NAV.map((group) => (
            <nav key={group.group} aria-label={group.group}>
              <h2 className="label-s border-b border-rule pb-2.5">{group.group}</h2>
              <ul className="mt-3 flex flex-col gap-2.5">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-body-s text-ink-muted underline-offset-4 m-fast hover:text-ink hover:underline"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <div>
            <h2 className="label-s border-b border-rule pb-2.5">SOCIAL</h2>
            <a
              href={SOCIAL_LINKS.x}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={SOCIAL_LABELS.x}
              className="mt-3 inline-flex items-center gap-2.5 border border-rule px-3 py-2.5 text-ink-muted m-fast hover:border-signal/40 hover:text-signal"
            >
              <IconX size={14} />
              <span className="font-mono text-data-s tracking-[0.04em]">{SOCIAL_HANDLES.x}</span>
            </a>
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t border-rule py-6 md:flex-row md:items-start md:justify-between">
          <p className="label-s max-w-[62ch] normal-case tracking-[0.02em] text-ink-faint">
            FOLDMARK is an independent analytics application built on {CHAIN.name} (chain {CHAIN.id}). It is not
            affiliated with, endorsed by, or operated by Robinhood Markets, Inc. Stock Tokens are identified from their
            canonical on-chain contract metadata. Nothing here is investment advice.
          </p>
          <p className="label-s shrink-0 text-ink-faint">
            {SITE.name} · CHAIN {CHAIN.id}
          </p>
        </div>
      </div>
    </footer>
  );
}
