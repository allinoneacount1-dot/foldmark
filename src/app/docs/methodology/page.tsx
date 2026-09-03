import Link from "next/link";
import { DocTitle, DocSection, P, Note, DocFooterNav } from "@/components/docs/DocShell";
import { StateTag } from "@/components/ui/primitives";
import { DEFINITIONS, KIND_LABEL } from "@/content/docs";
import { getIndexerStatus, countRows, requestNow,
} from "@/lib/queries";
import { STATE_LABEL, type DataState } from "@/lib/data-state";
import { blockLabel, integer, relativeTime } from "@/lib/format";
import { WINDOWS, CHAIN } from "@/config/site";

export const metadata = {
  title: "Methodology",
  description: "How every figure FOLDMARK publishes is computed, and exactly where each one stops being reliable.",
};

export const revalidate = 60;

const STATES: { state: DataState; meaning: string }[] = [
  { state: "OK", meaning: "Measured from indexed data, inside the freshness budget." },
  { state: "PARTIAL", meaning: "Measured, but the query reached its row cap. Treat the value as a lower bound." },
  { state: "STALE", meaning: "Measured, but the observation is older than the freshness budget." },
  { state: "EMPTY", meaning: "The query succeeded and nothing was observed. Zero is the real answer." },
  { state: "INDEXING", meaning: "The pipeline has not reached this entity yet. No value is implied." },
  { state: "UNAVAILABLE", meaning: "The source is unreachable or not configured for this deployment." },
];

export default async function DocsMethodology() {
  const now = await requestNow();
  const [indexer, assets, transfers, wallets] = await Promise.all([
    getIndexerStatus(),
    countRows("assets"),
    countRows("transfers"),
    countRows("wallets"),
  ]);

  return (
    <article>
      <DocTitle
        kicker="DATA"
        title="Methodology"
        lede="FOLDMARK publishes no metric it cannot explain. Each definition states its input, its computation and its limits. If a figure is not defined here, it is not shown anywhere in the product or returned by the API."
      />

      <div className="mt-8 grid gap-px border border-rule bg-rule sm:grid-cols-4">
        {[
          ["INDEXED TO", blockLabel(indexer.lastProcessedBlock.value)],
          ["CHAIN HEAD", blockLabel(indexer.chainHead.value)],
          ["LAG", indexer.lagBlocks.value !== null ? `${integer(indexer.lagBlocks.value)} BLOCKS` : "—"],
          ["CURSOR UPDATED", relativeTime(indexer.updatedAt, now)],
        ].map(([k, v]) => (
          <div key={k} className="bg-void p-4">
            <p className="label-s">{k}</p>
            <p className="tabular mt-1.5 font-mono text-data text-ink">{v}</p>
          </div>
        ))}
      </div>

      <div className="mt-12 flex flex-col gap-10">
        <DocSection id="definitions" title="Definitions">
          <P>
            Each entry is tagged with how much evidence stands behind it — see{" "}
            <Link href="/docs/data-sources#trust" className="text-ink underline-offset-4 hover:underline">
              trust levels
            </Link>
            . Every heading is deep-linkable.
          </P>
          <dl className="flex flex-col gap-px bg-rule">
            {DEFINITIONS.map((d) => (
              <div key={d.id} id={d.id} className="scroll-mt-[calc(var(--nav-height)+1.5rem)] bg-void p-4">
                <dt className="flex flex-wrap items-baseline justify-between gap-2">
                  <a href={`#${d.id}`} className="label text-ink">
                    {d.term}
                  </a>
                  <span className="label-s text-ink-faint">{KIND_LABEL[d.kind]}</span>
                </dt>
                <dd className="mt-2 flex flex-col gap-1.5">
                  <p className="text-body-s text-ink-muted">
                    <span className="label-s mr-2 text-ink-faint">INPUT</span>
                    {d.input}
                  </p>
                  <p className="text-body-s text-ink-muted">
                    <span className="label-s mr-2 text-ink-faint">COMPUTED</span>
                    {d.computation}
                  </p>
                  {d.caveat ? (
                    <p className="text-body-s text-ink-faint">
                      <span className="label-s mr-2">LIMIT</span>
                      {d.caveat}
                    </p>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
        </DocSection>

        <DocSection id="states" title="Data states">
          <P>
            A state is what appears wherever a value cannot be measured. It is never replaced by an estimate, a
            placeholder or a sample.
          </P>
          <ul className="flex flex-col gap-px bg-rule">
            {STATES.map(({ state, meaning }) => (
              <li key={state} className="flex flex-col gap-2 bg-void p-4 sm:flex-row sm:items-baseline sm:gap-4">
                <span className="shrink-0">
                  <StateTag state={state} />
                </span>
                <span className="text-body-s text-ink-muted">{meaning}</span>
              </li>
            ))}
          </ul>
        </DocSection>

        <DocSection id="windows" title="Observation windows">
          <P>
            Every window is computed at request time against the trailing period, using block timestamps rather than
            ingestion times — so a window measures market activity, not indexer throughput.
          </P>
          <ul className="flex flex-wrap gap-1.5">
            {WINDOWS.map((w) => (
              <li
                key={w}
                className="border border-rule px-2.5 py-1 font-mono text-label-s uppercase tracking-[0.14em] text-ink-muted"
              >
                {w}
              </li>
            ))}
          </ul>
          <Note>
            Aggregation runs over a bounded row window because the storage client cannot express GROUP BY. When a query
            reaches that cap the result is reported PARTIAL and every count derived from it is a lower bound.
          </Note>
        </DocSection>

        <DocSection id="index-contents" title="What the index currently holds">
          <ul className="flex flex-col gap-px bg-rule">
            {(
              [
                ["ASSETS", assets],
                ["TRANSFERS", transfers],
                ["ADDRESSES", wallets],
              ] as const
            ).map(([label, m]) => (
              <li key={label} className="flex items-baseline justify-between gap-3 bg-void px-4 py-3">
                <span className="label-s">{label}</span>
                <span className="tabular font-mono text-data text-ink">
                  {m.value !== null ? integer(m.value) : STATE_LABEL[m.state]}
                </span>
              </li>
            ))}
          </ul>
          <P>
            These counts describe chain {CHAIN.id} as of the indexer cursor above, not the chain head. The gap between
            them is published on every surface so it can never be mistaken for live state.
          </P>
        </DocSection>

        <DocSection id="no-prediction" title="FOLDMARK observes, it does not predict">
          <P>
            Nothing in the product or the API is a forecast, a recommendation or investment advice. Descriptions such as
            &ldquo;flow accelerating&rdquo; or &ldquo;large activity observed&rdquo; state what was measured inside a
            window. They carry no claim about what happens next.
          </P>
          <P>
            There is also no composite score. Any index FOLDMARK ever publishes must state its inputs, its window, its
            computation and its update time — as{" "}
            <Link href="/docs/methodology#structure-change" className="text-ink underline-offset-4 hover:underline">
              STRUCTURE CHANGE
            </Link>{" "}
            does. No black-box number ships.
          </P>
        </DocSection>
      </div>

      <DocFooterNav current="/docs/methodology" />
    </article>
  );
}
