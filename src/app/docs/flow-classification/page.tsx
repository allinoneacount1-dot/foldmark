import Link from "next/link";
import { DocTitle, DocSection, P, List, Note, DocFooterNav, DocTable } from "@/components/docs/DocShell";
import { CodeBlock } from "@/components/docs/CodeBlock";
import { FLOW_CLASSES } from "@/content/docs";
import { CHAIN } from "@/config/site";

export const metadata = {
  title: "Flow classification",
  description: "The classification vocabulary, what each label requires as evidence, and why UNCLASSIFIED is a feature.",
};

export default function FlowClassificationPage() {
  return (
    <article>
      <DocTitle
        kicker="DATA"
        title="Flow classification"
        lede="A transfer says value moved. It does not say why. FOLDMARK labels a flow only when the counterparty contract is registered and verified — and returns UNCLASSIFIED for everything else, deliberately."
      />

      <div className="mt-12 flex flex-col gap-10">
        <DocSection id="unclassified" title="UNCLASSIFIED is a feature">
          <P>
            The cheapest way to make a product look complete is to guess. A heuristic that calls any high-degree address
            a DEX would fill every row with a confident label and would be wrong often enough to make the whole dataset
            untrustworthy — including the parts that were right.
          </P>
          <P>
            FOLDMARK takes the opposite position: <strong className="text-ink">unknown outranks incorrect.</strong> A
            reader can act on a gap. They cannot act on a label that is right most of the time without knowing which
            times.
          </P>
          <Note tone="warn">
            A flow between two addresses the contracts registry has no entry for is returned{" "}
            <strong className="text-ink">UNCLASSIFIED</strong> — not WALLET_TRANSFER, which would claim the registry was
            consulted and found both sides ordinary. How much of a window that covers depends on what the registry
            holds, and is shown on{" "}
            <Link href="/flows" className="text-ink underline-offset-4 hover:underline">
              the flow observatory
            </Link>{" "}
            rather than asserted here.
          </Note>
        </DocSection>

        <DocSection id="vocabulary" title="The vocabulary">
          <P>
            Each label carries a hard evidence requirement. A flow can only take a label when that requirement is met —
            there is no confidence score and no partial credit.
          </P>
          <DocTable
            caption="Flow classification vocabulary"
            columns={["CODE", "MEANING", "REQUIRES"]}
            rows={FLOW_CLASSES.map((c) => [
              <code key={c.code} className="font-mono text-data text-ink">
                {c.code}
              </code>,
              c.meaning,
              <span key={`${c.code}-r`} className="text-ink-faint">
                {c.requires}
              </span>,
            ])}
          />
        </DocSection>

        <DocSection id="pipeline" title="How a label would be assigned">
          <P>
            Classification is the last stage of the flow engine, and it is a lookup rather than an inference. The
            registry is the only authority.
          </P>
          <CodeBlock
            language="text"
            caption="Classification path"
            code={`transfer (from, to, asset, amount)
    │
    ▼
is RECIPIENT in the contracts registry?  ──no──▶  is SENDER in the registry?  ──no──▶  UNCLASSIFIED
    │ yes                                             │ yes
    ▼                                                 ▼
read protocol_id and contract_type          read protocol_id and contract_type
    │                                            │
    ▼                                            ▼
DEX pool      → DEX_SELL                    DEX pool      → DEX_BUY
lending mkt   → LENDING_DEPOSIT             lending mkt   → LENDING_WITHDRAW
bridge        → BRIDGE_OUT                  bridge        → BRIDGE_IN
    │
    ▼
label recorded with the registry entry that justified it`}
          />
          <List
            items={[
              "The registry is populated by explicit verification, never by observation of behaviour.",
              "A label always carries the registry entry that produced it, so it can be audited.",
              "If a contract is later found to be misclassified, correcting the registry corrects every historical label.",
              "No label is ever produced by a model, a score or a similarity measure.",
            ]}
          />
        </DocSection>

        <DocSection id="candidates" title="Candidates, not conclusions">
          <P>
            FOLDMARK does surface addresses that <em>behave</em> like infrastructure — many distinct counterparties in a
            window — on the{" "}
            <Link href="/protocols" className="text-ink underline-offset-4 hover:underline">
              protocols page
            </Link>
            . They are labelled UNCLASSIFIED COUNTERPARTIES and nothing more.
          </P>
          <P>
            A high counterparty count is a reason to look. It is not evidence of what a contract does, and it never
            promotes an address to a named protocol.
          </P>
        </DocSection>

        <DocSection id="unlock" title="What would change this">
          <P>
            A single input unlocks the entire vocabulary above: an address-to-protocol mapping for chain {CHAIN.id},
            with each entry verified. Once the contracts registry is populated, classification runs without any other
            change to the pipeline, and historical flows can be relabelled from the same stored transfers.
          </P>
          <P>
            Until then, the state is published rather than papered over. See{" "}
            <Link href="/docs/limitations" className="text-ink underline-offset-4 hover:underline">
              Limitations
            </Link>
            .
          </P>
        </DocSection>
      </div>

      <DocFooterNav current="/docs/flow-classification" />
    </article>
  );
}
