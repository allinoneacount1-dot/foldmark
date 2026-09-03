import Link from "next/link";
import { DocTitle, DocSection, P, Note, DocFooterNav } from "@/components/docs/DocShell";
import { StateTag } from "@/components/ui/primitives";
import { LIMITATIONS, ROADMAP } from "@/content/docs";

export const metadata = {
  title: "Limitations & roadmap",
  description: "What FOLDMARK cannot measure today, why, and what is live, in development or planned.",
};

const STATUS_TONE = {
  LIVE: "OK",
  "IN DEVELOPMENT": "PARTIAL",
  PLANNED: "INDEXING",
} as const;

export default function LimitationsPage() {
  const grouped = (["LIVE", "IN DEVELOPMENT", "PLANNED"] as const).map((status) => ({
    status,
    items: ROADMAP.filter((r) => r.status === status),
  }));

  return (
    <article>
      <DocTitle
        kicker="SYSTEM"
        title="Limitations and roadmap"
        lede="Everything FOLDMARK cannot currently measure, stated plainly. A product that names its gaps is easier to trust than one that hides them behind a full-looking screen."
      />

      <div className="mt-12 flex flex-col gap-10">
        <DocSection id="limitations" title="Known limitations">
          <P>
            Each of these produces a visible state in the product rather than a missing section. If you see{" "}
            <code className="font-mono text-ink">DATA UNAVAILABLE</code> or{" "}
            <code className="font-mono text-ink">UNCLASSIFIED</code>, one of the entries below is the reason.
          </P>
          <div className="flex flex-col gap-px bg-rule">
            {LIMITATIONS.map((l) => (
              <div key={l.title} className="bg-void p-4">
                <h3 className="label text-ink">{l.title}</h3>
                <p className="mt-1.5 max-w-[68ch] text-body-s text-ink-muted">{l.detail}</p>
              </div>
            ))}
          </div>
          <Note tone="warn">
            The two that matter most are the missing price source and the empty contracts registry. Between them they
            account for every withheld price, liquidity, market, holder and protocol figure in the product — and for
            every flow being UNCLASSIFIED.
          </Note>
        </DocSection>

        <DocSection id="roadmap" title="Roadmap">
          <P>
            Grouped by what is actually true today. No dates are given, because none have been committed — a roadmap
            with invented dates is the same failure as a dashboard with invented numbers.
          </P>
          {grouped.map(({ status, items }) =>
            items.length ? (
              <div key={status}>
                <div className="flex items-baseline gap-3 border-b border-rule pb-2">
                  <StateTag state={STATUS_TONE[status]} label={status} />
                  <span className="label-s text-ink-faint">{items.length}</span>
                </div>
                <ul className="mt-2 flex flex-col gap-px bg-rule">
                  {items.map((r) => (
                    <li key={r.title} className="bg-void px-4 py-3">
                      <p className="font-mono text-data text-ink">{r.title}</p>
                      <p className="mt-1 max-w-[68ch] text-body-s text-ink-muted">{r.detail}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
        </DocSection>

        <DocSection id="dependency" title="What unlocks the most">
          <P>
            Two inputs would change the product more than any amount of interface work:
          </P>
          <ol className="flex flex-col gap-3">
            <li className="border-l-2 border-signal/50 py-1 pl-4">
              <p className="label text-ink">A price source</p>
              <p className="mt-1 text-body-s text-ink-muted">
                Populating the prices table turns on OHLC candles, currency-denominated flow, portfolio value and market
                capitalisation. The aggregation and the chart are already built and tested against the schema — they are
                waiting on observations, not on code.
              </p>
            </li>
            <li className="border-l-2 border-signal/50 py-1 pl-4">
              <p className="label text-ink">A verified contract registry</p>
              <p className="mt-1 text-body-s text-ink-muted">
                Mapping addresses to protocols turns on{" "}
                <Link href="/docs/flow-classification" className="text-ink underline-offset-4 hover:underline">
                  flow classification
                </Link>
                , protocol exposure on assets and wallets, and venue nodes in the topology. Historical flows can be
                relabelled from the transfers already stored.
              </p>
            </li>
          </ol>
        </DocSection>

        <DocSection id="what-wont-change" title="What will not change">
          <P>
            Some limitations are deliberate and will survive every future release, because removing them would make the
            product less trustworthy rather than more complete.
          </P>
          <ul className="flex flex-col gap-2">
            {[
              "No address will ever be attributed to a real-world identity without an explicit, cited, trusted source.",
              "No metric will ship without a published methodology.",
              "No value will be estimated, carried forward or sampled to fill a gap.",
              "No flow will be labelled by inference. UNCLASSIFIED stays until a registry says otherwise.",
              "No forecast, score or recommendation will be presented as intelligence.",
            ].map((item) => (
              <li key={item} className="flex gap-3 text-body text-ink-muted">
                <span aria-hidden className="mt-[0.6em] h-px w-3 shrink-0 bg-rule-strong" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </DocSection>
      </div>

      <DocFooterNav current="/docs/limitations" />
    </article>
  );
}
