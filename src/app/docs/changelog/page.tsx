import { DocTitle, DocSection, P, Note, DocFooterNav } from "@/components/docs/DocShell";

export const metadata = {
  title: "Changelog",
  description: "Real implementation history for FOLDMARK, taken from the repository — no invented releases.",
};

type Release = {
  date: string;
  title: string;
  added?: string[];
  changed?: string[];
  fixed?: string[];
  removed?: string[];
};

/**
 * Derived from the repository's own commit history. Nothing here is invented,
 * and no release predates the first commit.
 */
const RELEASES: Release[] = [
  {
    date: "2026-09-04",
    title: "Product completion — design system, dashboard, docs",
    added: [
      "Design token layer: four surfaces, four ink steps, three hairlines, a three-tier type scale and a named rhythm scale.",
      "Composition primitives — Shell, Band, Split, RailColumn, Tape, Ledger, Matrix, Figure, Metric — replacing hand-typed layout.",
      "A custom 16-unit icon system with a single geometry, replacing glyph and emoji placeholders.",
      "/dashboard — market workspace combining the chart, the intelligence rail and the topology.",
      "Market chart on TradingView Lightweight Charts, fed by FOLDMARK data with candle, line and area modes.",
      "OHLC aggregation with interval availability derived from real observation density.",
      "Deterministic market topology: source, asset and destination lanes folded from observed transfers.",
      "Intelligence rail modules — capital flow, network activity, top flows, structure change.",
      "/protocol/[id], /methodology and the full /docs surface.",
      "Command palette on ⌘K with grouped, keyboard-navigable results.",
      "API: /flows, /protocols, /events, /assets/[contract]/candles and /assets/[contract]/flows.",
      "loading, error, global-error and not-found boundaries.",
      "Official X account wired through a single social config.",
    ],
    changed: [
      "Canonical logo now renders from the owner's master raster through one BrandLogo component, in stacked, horizontal, mark and wordmark variants.",
      "Asset passport moved to /assets/[contract]; the old /asset/[contract] path permanently redirects.",
      "Indexer stamps every transfer with its block header timestamp instead of ingestion time, so windows measure market activity rather than indexer throughput.",
      "Net flow is computed per address across all five windows; asset-level rows are retired.",
      "Search reads the same tables the pages read, so search and pages can no longer disagree.",
      "Filters and observation windows are URL state, making every view shareable and reload-safe.",
      "Motion reduced to smooth scroll and a single reveal per section; the graph is still when nothing is happening.",
      "Display typography moved to a geometric grotesque that rhymes with the wordmark.",
    ],
    fixed: [
      "Header logo was a hand-authored SVG approximation of the mark; it is now the owner's artwork.",
      "A lime drop-shadow glow was baked onto the logo on every route.",
      "Favicon shipped the full lockup cropped mid-word; it is now a multi-size icon cut from the mark.",
      "The topology inspector could never open, because the drag flag was set on pointer-down unconditionally.",
      "Graph node positions came from Math.random() while the legend claimed radius encoded activity.",
      "Font variables were declared as literal family names, so all three faces silently fell back.",
      "The asset registry substituted six hardcoded rows when the database returned nothing, labelled LIVE.",
      "Landing and developer pages published an invented API payload the route never returns.",
      "A hardcoded 68% bar was presented as a measured capital movement figure.",
      "Three protocol names were stamped VERIFIED from string literals.",
      "flow_windows stored gross volume in net_flow with outflow pinned to zero, so every asset read as net inflow.",
      "Filter and time-range chips were inert spans with no state and no handler.",
      "Lenis' animation frame loop was never cancelled, and scroll reveals did not rebuild on client navigation.",
    ],
    removed: [
      "FabricCanvas, with its synthetic hub node, fabricated edges and permanent animation loop.",
      "Hardcoded asset, protocol and composability fallbacks across pages and API routes.",
      "Placeholder seed assets with null-ish contract addresses.",
      "Next.js starter artwork and the redrawn logo files.",
      "Unused graph and database dependencies that were never imported.",
    ],
  },
  {
    date: "2026-09-03",
    title: "Live data pipeline",
    added: [
      "Local indexer running on a two-minute cadence.",
      "Flows, wallets and search reading from the database instead of hardcoded lists.",
      "Asset passport activity and topology nodes sourced from indexed data.",
    ],
    changed: ["Flow engine computes real transfer volume rather than a fixed split."],
    fixed: ["Explorer repointed to the live Blockscout deployment; RPC endpoint corrected."],
  },
  {
    date: "2026-09-02",
    title: "Indexing, discovery and identity",
    added: [
      "Indexer, Supabase schema and scheduled ingestion — the first real-data pipeline.",
      "On-chain asset auto-discovery from contract metadata, removing the third-party price-site dependency.",
      "Wallet connection via wagmi against chain 4663, with chain switching and ENS resolution.",
      "Scroll motion layer.",
    ],
    changed: [
      "Project renamed to FOLDMARK.",
      "Indexer batch sizing and address filtering tuned repeatedly to fit the scheduled execution budget.",
      "Cron schedule reduced to the hosting tier's limit.",
    ],
    fixed: [
      "Service-role credentials prioritised so row-level security stopped blocking writes.",
      "Canonical RPC endpoint and chain id corrected.",
    ],
  },
  {
    date: "2026-09-02",
    title: "First release",
    added: ["Initial application: real-data-only market surface for Robinhood Chain."],
  },
];

const SECTIONS: [keyof Release, string][] = [
  ["added", "ADDED"],
  ["changed", "CHANGED"],
  ["fixed", "FIXED"],
  ["removed", "REMOVED"],
];

export default function ChangelogPage() {
  return (
    <article>
      <DocTitle
        kicker="SYSTEM"
        title="Changelog"
        lede="Implementation history taken from the repository. There is no backdated history and no invented release — the record starts where the project does."
      />

      <div className="mt-12 flex flex-col gap-10">
        {RELEASES.map((release, i) => (
          <DocSection key={`${release.date}-${i}`} id={`r-${i}`} title={release.title} kicker={release.date}>
            {SECTIONS.map(([key, label]) => {
              const items = release[key] as string[] | undefined;
              if (!items?.length) return null;
              return (
                <div key={label}>
                  <p className="label-s border-b border-rule pb-1.5">{label}</p>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {items.map((item) => (
                      <li key={item} className="flex gap-3 text-body-s text-ink-muted">
                        <span aria-hidden className="mt-[0.65em] h-px w-3 shrink-0 bg-rule-strong" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </DocSection>
        ))}

        <DocSection id="notes" title="How this list is maintained">
          <P>
            Entries are written from commits that actually landed. A change appears here only once it is in the
            repository, which means the changelog can lag a deployment but can never lead one.
          </P>
          <Note>
            Items under REMOVED are as important as those under ADDED. Most of this release was spent deleting things
            that displayed numbers nobody measured.
          </Note>
        </DocSection>
      </div>

      <DocFooterNav current="/docs/changelog" />
    </article>
  );
}
