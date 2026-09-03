import Link from "next/link";
import { DocTitle, DocSection, P, List, Note, DocFooterNav } from "@/components/docs/DocShell";
import { CodeBlock } from "@/components/docs/CodeBlock";
import { getAssets } from "@/lib/queries";
import { SITE, CHAIN } from "@/config/site";

export const metadata = {
  title: "Getting started",
  description: "Five minutes from opening FOLDMARK to querying it programmatically.",
};

export const revalidate = 300;

export default async function GettingStarted() {
  const { rows } = await getAssets();
  const sample = rows[0];
  const symbol = sample?.symbol ?? "SYMBOL";
  const contract = sample?.contract_address ?? "0x…";

  return (
    <article>
      <DocTitle
        kicker="START"
        title="Getting started"
        lede="Five steps take you from a single asset to the whole market and out to the API. Nothing here requires an account, a key or a wallet connection."
      />

      <div className="mt-12 flex flex-col gap-10">
        <DocSection id="explore" title="1 — Explore an asset">
          <P>
            Open the{" "}
            <Link href="/assets" className="text-ink underline-offset-4 hover:underline">
              asset registry
            </Link>
            . Every row is a contract the indexer has actually observed emitting a Transfer on chain {CHAIN.id}; nothing
            is seeded. Open one to reach its passport.
          </P>
          <P>
            The passport answers what the asset is inside the network: its identity and contract, its activity across
            five observation windows, the addresses moving it, and its own graph. Columns that cannot be measured in
            this deployment are named and withheld rather than shown empty.
          </P>
        </DocSection>

        <DocSection id="relationships" title="2 — Inspect its relationships">
          <P>
            On the passport, the asset graph places the asset at the centre with its real counterparties around it.
            Hover a node for a preview, click for an inspector, click an edge to read the relationship, or press Enter
            on a focused node to isolate its neighbourhood.
          </P>
          <Note>
            Every node exists because the indexer saw it and every edge because value actually moved along it. Position
            is a deterministic function of the data — there is no physics simulation and no randomness.
          </Note>
        </DocSection>

        <DocSection id="flows" title="3 — Compare capital flow">
          <P>
            The{" "}
            <Link href="/flows" className="text-ink underline-offset-4 hover:underline">
              flow observatory
            </Link>{" "}
            ranks directed value edges for the window you choose, and shows top sources, top destinations and per-address
            net flow. Net flow is defined per address only — a transfer moves balance between holders without changing a
            token&apos;s supply, so no asset-level net flow is published.
          </P>
        </DocSection>

        <DocSection id="topology" title="4 — Open the market topology">
          <P>
            <Link href="/fabric" className="text-ink underline-offset-4 hover:underline">
              /fabric
            </Link>{" "}
            is the market as a network. Capital reads left to right: net senders, then assets, then net receivers.
            Filters for asset type and window are links, so any view you reach is shareable as a URL and survives a
            reload.
          </P>
        </DocSection>

        <DocSection id="query" title="5 — Query the API">
          <P>
            Everything above is available as JSON. The API is the same intelligence layer addressed structurally rather
            than visually — same measurements, same states, same provenance.
          </P>

          <CodeBlock
            language="bash"
            caption="curl — network pulse"
            code={`curl ${SITE.url}/api/v1/network`}
          />

          <CodeBlock
            language="bash"
            caption={`curl — one asset's context`}
            code={`curl ${SITE.url}/api/v1/context/${symbol}?window=24H`}
          />

          <CodeBlock
            language="ts"
            caption="TypeScript — read the registry, then one asset"
            code={`type AssetsResponse = {
  assets: Array<{
    symbol: string;
    contract: string;
    type: "stock_token" | "crypto" | "stablecoin" | "other";
    verified: boolean;
    activity: { window: string; transfers?: number; state?: string };
  }>;
  count: number;
  state: "OK" | "INDEXING" | "UNAVAILABLE";
};

const base = "${SITE.url}/api/v1";

const registry: AssetsResponse = await fetch(\`\${base}/assets?window=24H\`).then((r) => r.json());

// A state is not an error. It tells you what the index holds right now.
if (registry.state !== "OK") {
  console.log("index is", registry.state);
}

for (const asset of registry.assets) {
  const passport = await fetch(\`\${base}/assets/\${asset.contract}?window=24H\`).then((r) => r.json());
  console.log(asset.symbol, passport.activity);
}`}
          />

          <Note>
            There is no SDK. If a page or a snippet ever shows one, it is wrong — the API is plain HTTP and JSON, and
            that is the whole interface.
          </Note>
        </DocSection>

        <DocSection id="reading-states" title="Reading a response">
          <P>
            Any field may carry a state instead of a value. Treat a state as information, not as a failure: it tells you
            precisely why a number is absent.
          </P>
          <CodeBlock
            language="json"
            caption={`GET /api/v1/assets/${contract.slice(0, 10)}… — abridged`}
            code={`{
  "asset": { "symbol": "${symbol}", "verified": true },
  "observation_window": "24H",
  "state": "OK",
  "activity": { "transfers": 128, "gross_volume": 4210.55, "counterparties": 37 },
  "price": { "state": "DATA UNAVAILABLE", "reason": "No price oracle is wired to chain ${CHAIN.id}" },
  "liquidity": { "state": "DATA UNAVAILABLE" },
  "holders": { "state": "DATA UNAVAILABLE" }
}`}
          />
          <List
            items={[
              <>
                <strong className="text-ink">OK</strong> — measured inside the freshness budget.
              </>,
              <>
                <strong className="text-ink">PARTIAL</strong> — measured, but the query hit its row cap. A lower bound.
              </>,
              <>
                <strong className="text-ink">STALE</strong> — measured, but older than fifteen minutes.
              </>,
              <>
                <strong className="text-ink">EMPTY</strong> — the query ran and nothing was observed. Zero is the answer.
              </>,
              <>
                <strong className="text-ink">INDEXING</strong> — the pipeline has not reached this entity.
              </>,
              <>
                <strong className="text-ink">DATA UNAVAILABLE</strong> — the source is unreachable or not wired here.
              </>,
            ]}
          />
          <P>
            The full contract, including errors and freshness, is in the{" "}
            <Link href="/docs/api" className="text-ink underline-offset-4 hover:underline">
              API reference
            </Link>
            .
          </P>
        </DocSection>
      </div>

      <DocFooterNav current="/docs/getting-started" />
    </article>
  );
}
