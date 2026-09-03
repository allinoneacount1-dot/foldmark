import Link from "next/link";
import { DocTitle, DocSection, P, List, Note, DocFooterNav } from "@/components/docs/DocShell";
import { CodeBlock } from "@/components/docs/CodeBlock";
import { getAssets } from "@/lib/queries";
import { SITE } from "@/config/site";

export const metadata = {
  title: "Agents",
  description: "How autonomous systems should consume FOLDMARK: structured context, explicit states, traceable provenance.",
};

export const revalidate = 300;

export default async function AgentsPage() {
  const { rows } = await getAssets();
  const symbol = rows[0]?.symbol ?? "SYMBOL";

  return (
    <article>
      <DocTitle
        kicker="BUILD"
        title="Agents"
        lede="FOLDMARK provides market context in structured form for autonomous systems. Humans receive that context visually; machines receive it structurally. Same intelligence layer, two interfaces."
      />

      <div className="mt-12 flex flex-col gap-10">
        <DocSection id="positioning" title="What this is, precisely">
          <P>
            <strong className="text-ink">An agent consumes structured market context.</strong> That is the whole claim.
            FOLDMARK does not predict, score or recommend, and an integration should not present it as though it did.
          </P>
          <List
            items={[
              "Correct: an agent reads observed flows, relationships and states, and reasons over them.",
              "Incorrect: presenting FOLDMARK output as a signal, a forecast or an alpha source.",
              "Correct: citing a measurement together with its window, its source and its state.",
              "Incorrect: dropping the state and treating an absent value as zero.",
            ]}
          />
        </DocSection>

        <DocSection id="entry-point" title="One call for one asset">
          <P>
            <code className="font-mono text-ink">/api/v1/context/{"{asset}"}</code> is the intended entry point. It
            resolves by symbol or contract and returns identity, activity, flow posture, counterparties, indexer state,
            sources and methodology in a single response.
          </P>
          <CodeBlock language="bash" caption="One asset, full context" code={`curl "${SITE.url}/api/v1/context/${symbol}?window=24H"`} />
          <P>
            The same builder renders the sample on the landing page, so what an agent receives is exactly what a human
            sees documented — there is no separate machine surface that can drift.
          </P>
        </DocSection>

        <DocSection id="states" title="Read the states, not just the values">
          <P>
            The single most important rule for an integration: a field may carry a state instead of a number, and the
            state is meaningful. Collapsing it to <code className="font-mono text-ink">0</code> or{" "}
            <code className="font-mono text-ink">null</code> destroys the distinction between &ldquo;nothing
            happened&rdquo; and &ldquo;we cannot see&rdquo;.
          </P>
          <CodeBlock
            language="ts"
            caption="Handling states correctly"
            code={`type Measured<T> =
  | { state: "OK" | "PARTIAL" | "STALE"; value: T }
  | { state: "EMPTY" }                    // observed, and the answer is genuinely nothing
  | { state: "INDEXING" }                 // not reached yet — absence of knowledge
  | { state: "DATA UNAVAILABLE"; reason?: string };  // source not wired

function usable<T>(m: Measured<T>): T | undefined {
  return "value" in m ? m.value : undefined;
}

const ctx = await fetch(\`${SITE.url}/api/v1/context/${symbol}\`).then((r) => r.json());

// EMPTY means zero activity. INDEXING means we do not know. They are not the same claim.
if (ctx.activity?.state === "INDEXING") {
  // do not reason over this asset yet
}

// Price is withheld in this deployment; never substitute an estimate.
if (ctx.price?.state === "DATA UNAVAILABLE") {
  // reason about flow and structure instead
}`}
          />
        </DocSection>

        <DocSection id="what-to-consume" title="What to consume">
          <List
            items={[
              <>
                <strong className="text-ink">Identity</strong> — always key on the contract address. Symbols are not
                unique on a public chain.
              </>,
              <>
                <strong className="text-ink">Activity</strong> — transfers, gross volume and counterparties, always with
                the <code className="font-mono text-ink">observation_window</code> that produced them.
              </>,
              <>
                <strong className="text-ink">Flows</strong> — directed edges from{" "}
                <code className="font-mono text-ink">/api/v1/flows</code>, and per-address net flow. Note the{" "}
                <code className="font-mono text-ink">classification</code> field: today it is always UNCLASSIFIED.
              </>,
              <>
                <strong className="text-ink">Relationships</strong> — nodes and edges from{" "}
                <code className="font-mono text-ink">/api/v1/fabric</code>, with deterministic positions you can rely on
                across calls.
              </>,
              <>
                <strong className="text-ink">Freshness</strong> — always read{" "}
                <code className="font-mono text-ink">/api/v1/network</code> for the indexer lag before acting on
                anything time-sensitive.
              </>,
              <>
                <strong className="text-ink">Provenance</strong> — every response names its sources and its
                methodology. Carry them through to whatever you produce.
              </>,
            ]}
          />
        </DocSection>

        <DocSection id="loop" title="A reasonable polling loop">
          <CodeBlock
            language="ts"
            caption="Check freshness, then read"
            code={`const base = "${SITE.url}/api/v1";

async function snapshot(window = "24H") {
  const network = await fetch(\`\${base}/network\`).then((r) => r.json());

  // The lag tells you how far behind the chain these figures are.
  if (typeof network.lag_blocks === "number" && network.lag_blocks > 500) {
    return { stale: true, lag: network.lag_blocks };
  }

  const [assets, flows, fabric] = await Promise.all([
    fetch(\`\${base}/assets?window=\${window}\`).then((r) => r.json()),
    fetch(\`\${base}/flows?window=\${window}&limit=25\`).then((r) => r.json()),
    fetch(\`\${base}/fabric?window=\${window}\`).then((r) => r.json()),
  ]);

  return {
    stale: false,
    observedAt: network.indexer_updated_at,
    lag: network.lag_blocks,
    assets: assets.assets,
    edges: flows.edges,          // every edge is UNCLASSIFIED in this deployment
    graph: { nodes: fabric.nodes, edges: fabric.edges },
    partial: flows.partial || assets.activity_state === "PARTIAL",
  };
}`}
          />
          <Note>
            There are no API keys or rate limits yet, and the indexer shares its upstream RPC with the API. Poll on the
            order of the indexer cadence rather than in a tight loop.
          </Note>
        </DocSection>

        <DocSection id="attribution" title="Citing FOLDMARK output">
          <P>
            If an agent surfaces a FOLDMARK figure to a person, carry three things with it: the observation window, the
            state, and the source. A number without its window is not a measurement — it is a rumour.
          </P>
          <P>
            The full computation behind any field is in{" "}
            <Link href="/docs/methodology" className="text-ink underline-offset-4 hover:underline">
              Methodology
            </Link>
            , and what is deliberately withheld is in{" "}
            <Link href="/docs/limitations" className="text-ink underline-offset-4 hover:underline">
              Limitations
            </Link>
            .
          </P>
        </DocSection>
      </div>

      <DocFooterNav current="/docs/agents" />
    </article>
  );
}
