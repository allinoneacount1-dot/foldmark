import Link from "next/link";
import { DocTitle, DocSection, P, List, Note, DocFooterNav, DocTable } from "@/components/docs/DocShell";
import { DOCS_NAV } from "@/content/docs";
import { CHAIN, SITE } from "@/config/site";

export const metadata = {
  title: "Overview",
  description: "What FOLDMARK is, what it is not, and how raw chain activity becomes structured market context.",
};

export default function DocsOverview() {
  return (
    <article>
      <DocTitle
        kicker="FOLDMARK DOCS"
        title="Financial context, structured."
        lede={
          <>
            How FOLDMARK turns raw {CHAIN.name} activity into structured market intelligence for humans, applications
            and autonomous agents. Real data, explicit methodology, traceable sources.
          </>
        }
      />

      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href="/docs/getting-started"
          className="inline-flex h-10 items-center border border-signal bg-signal px-4 font-mono text-label-s uppercase tracking-[0.16em] text-void m-fast hover:border-ink hover:bg-ink"
        >
          GET STARTED
        </Link>
        <Link
          href="/docs/api"
          className="inline-flex h-10 items-center border border-rule-strong px-4 font-mono text-label-s uppercase tracking-[0.16em] text-ink m-fast hover:bg-ink hover:text-void"
        >
          VIEW API
        </Link>
      </div>

      <div className="mt-12 flex flex-col gap-10">
        <DocSection id="what-it-is" title="What FOLDMARK is">
          <P>
            FOLDMARK is a market intelligence layer for {CHAIN.name} — more precisely, a{" "}
            <strong className="text-ink">financial context layer</strong>. It connects assets, wallets, protocols,
            markets, liquidity, counterparties and capital flows into a readable financial structure.
          </P>
          <P>
            The premise is simple: <strong className="text-ink">every asset has more than a price.</strong> It has
            holders, liquidity, counterparties, markets, protocol exposure and capital flows. Those signals only mean
            something together. Markets have structure — FOLDMARK makes it visible.
          </P>
          <DocTable
            caption="What each kind of interface answers"
            columns={["SURFACE", "QUESTION IT ANSWERS"]}
            rows={[
              ["Block explorer", "What happened?"],
              ["Trading chart", "What did price do?"],
              ["Portfolio tracker", "What do I own?"],
              ["DEX", "What can I trade?"],
              [
                <span key="f" className="font-mono text-data text-ink">
                  FOLDMARK
                </span>,
                <span key="a" className="text-ink">
                  How is this market structured, and where is capital moving?
                </span>,
              ],
            ]}
          />
        </DocSection>

        <DocSection id="what-it-is-not" title="What FOLDMARK is not">
          <P>Being explicit here matters more than being flattering.</P>
          <List
            items={[
              "Not a centralised exchange, and not a DEX. Nothing here executes a trade.",
              "Not a wallet. FOLDMARK never holds keys and never moves funds.",
              "Not a block explorer replacement. It reads the same chain, but answers a different question.",
              "Not a TradingView clone. The chart is one layer of context, not the product.",
              "Not an investment adviser. Nothing here is a recommendation.",
              "Not a predictive signal engine, and not a guaranteed-alpha system. FOLDMARK observes, structures and contextualises. It does not forecast.",
            ]}
          />
          <Note>
            Language such as &ldquo;flow accelerating&rdquo; or &ldquo;large activity observed&rdquo; describes what was
            measured in a window. It carries no claim about what happens next.
          </Note>
        </DocSection>

        <DocSection id="how-it-works" title="How it works">
          <P>
            Every figure in the product traces back through this pipeline. Each stage is a real module in the
            repository, described in <Link href="/docs/architecture" className="text-ink underline-offset-4 hover:underline">Architecture</Link>.
          </P>
          <div className="border border-rule bg-surface p-5">
            <pre className="overflow-x-auto font-mono text-data-s leading-[1.9] text-ink-muted">
{`${CHAIN.name.toUpperCase()}
   │
   ▼
RPC · Transfer logs · block headers · contract calls        [RAW]
   │
   ▼
NORMALISATION       decimals, addresses, block timestamps
   │
   ▼
INDEXER             cursor-driven, restart-safe, idempotent
   │
   ▼
POSTGRES            assets · transfers · wallets · flow_windows
   │
   ├──▶ FLOW ENGINE          directional flow per address     [DERIVED]
   │
   ├──▶ RELATIONSHIP ENGINE  directed edges, market topology  [DERIVED]
   │
   ▼
FOLDMARK DATA MODEL   every value carries a state and a source
   │
   ├──▶ WEB UI      context, visually
   └──▶ API         context, structurally  ──▶ AGENTS`}
            </pre>
          </div>
          <Note>
            A stage that cannot produce a value emits a state — <code className="font-mono text-ink">INDEXING</code>,{" "}
            <code className="font-mono text-ink">PARTIAL</code>,{" "}
            <code className="font-mono text-ink">DATA UNAVAILABLE</code>,{" "}
            <code className="font-mono text-ink">UNCLASSIFIED</code> — and the state propagates all the way to the
            screen. Nothing is filled in.
          </Note>
        </DocSection>

        <DocSection id="information-hierarchy" title="How to read the product">
          <P>Every surface sits somewhere on this ladder, and lets you step down it toward evidence.</P>
          <DocTable
            caption="Information hierarchy"
            columns={["LEVEL", "QUESTION", "WHERE"]}
            rows={[
              ["1", "What is happening?", "Network pulse, active assets, capital movement — the dashboard tape."],
              ["2", "Where is it happening?", "Assets, markets, protocols, wallets."],
              ["3", "Why does the structure look like this?", "Flows, relationships, counterparties, protocol exposure."],
              ["4", "Show me the evidence.", "Transactions, contracts, source, methodology, timestamp."],
            ]}
          />
        </DocSection>

        <DocSection id="honesty" title="The data contract">
          <P>
            One rule outranks the rest: <strong className="text-ink">an empty truthful state beats a beautiful fake
            one.</strong> FOLDMARK does not seed data, does not carry a value forward to fill a gap, does not estimate a
            missing number and does not label a relationship it cannot evidence.
          </P>
          <List
            items={[
              <>
                Missing because the pipeline has not reached it → <code className="font-mono text-ink">INDEXING</code>
              </>,
              <>
                Measured but capped or partial → <code className="font-mono text-ink">PARTIAL DATA</code>
              </>,
              <>
                Source unreachable or not wired → <code className="font-mono text-ink">DATA UNAVAILABLE</code>
              </>,
              <>
                Relationship real but intent unknown → <code className="font-mono text-ink">UNCLASSIFIED</code>
              </>,
            ]}
          />
          <P>
            Where this deployment currently has gaps — price, liquidity, holders, protocol classification — they are
            listed in full under{" "}
            <Link href="/docs/limitations" className="text-ink underline-offset-4 hover:underline">
              Limitations
            </Link>
            . Nothing is hidden to make the product look more finished than it is.
          </P>
        </DocSection>

        <DocSection id="where-next" title="Where to go next">
          <div className="grid gap-px bg-rule sm:grid-cols-2">
            {DOCS_NAV.flatMap((g) => g.links)
              .filter((l) => l.href !== "/docs")
              .map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="bg-void p-4 m-fast hover:bg-surface"
                >
                  <span className="font-mono text-data text-ink">{link.label}</span>
                  {link.summary ? <span className="mt-1 block text-body-s text-ink-faint">{link.summary}</span> : null}
                </Link>
              ))}
          </div>
          <P>
            Or start from the product: {" "}
            <Link href="/dashboard" className="text-ink underline-offset-4 hover:underline">the dashboard</Link>,{" "}
            <Link href="/fabric" className="text-ink underline-offset-4 hover:underline">the market topology</Link>, or{" "}
            <Link href="/assets" className="text-ink underline-offset-4 hover:underline">the asset registry</Link>.
            The API mirrors all three at <code className="font-mono text-ink">{SITE.url}/api/v1</code>.
          </P>
        </DocSection>
      </div>

      <DocFooterNav current="/docs" />
    </article>
  );
}
