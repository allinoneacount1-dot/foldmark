import Link from "next/link";
import { Shell } from "@/components/layout/Frame";
import { Display, Lede } from "@/components/ui/primitives";
import { NAV } from "@/config/site";

export default function NotFound() {
  return (
    <Shell>
      <div className="band-quiet">
        <p className="label-s">404 · NOT FOUND</p>
        <Display as="h1" size="l" className="mt-4 max-w-[20ch]">
          There is nothing at this address.
        </Display>
        <Lede className="mt-4">
          The page does not exist. If you were looking for an asset or a wallet, both are addressed by their on-chain
          address — try the registry or the search palette.
        </Lede>
        <ul className="mt-8 flex flex-wrap gap-2">
          {NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="inline-flex h-9 items-center border border-rule px-3 font-mono text-label-s uppercase tracking-[0.16em] text-ink-muted transition-colors duration-[180ms] hover:border-rule-strong hover:text-ink"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Shell>
  );
}
