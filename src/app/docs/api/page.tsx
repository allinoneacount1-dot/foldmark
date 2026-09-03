import Link from "next/link";
import { DocTitle, DocSection, P, Note, DocFooterNav, DocTable } from "@/components/docs/DocShell";
import { CodeBlock } from "@/components/docs/CodeBlock";
import { StateTag } from "@/components/ui/primitives";
import { getAssets } from "@/lib/queries";
import { SITE, CHAIN, WINDOWS } from "@/config/site";
import { INTERVALS } from "@/lib/ohlc";

export const metadata = {
  title: "API reference",
  description: "Every FOLDMARK endpoint: parameters, responses, errors, freshness and worked examples.",
};

export const revalidate = 300;

type Endpoint = {
  id: string;
  path: string;
  summary: string;
  params?: { name: string; values: string; required?: boolean; note?: string }[];
  returns: string;
  errors: { code: string; when: string }[];
  freshness: string;
  example: string;
};

export default async function ApiReference() {
  const { rows } = await getAssets();
  const symbol = rows[0]?.symbol ?? "SYMBOL";
  const contract = rows[0]?.contract_address ?? "0x0000000000000000000000000000000000000000";

  const windowParam = { name: "window", values: WINDOWS.join(" · "), note: "Defaults to 24H." };

  const ENDPOINTS: Endpoint[] = [
    {
      id: "network",
      path: "/api/v1/network",
      summary: "Chain head, indexer cursor, lag, and 24H totals. The health check for everything else.",
      returns: "chain, chain_head, last_processed_block, lag_blocks, totals, window_24h, sources, methodology",
      errors: [{ code: "503", when: "The chain RPC is unreachable. The body still carries the state and the reason." }],
      freshness: "Chain head is read live on every request; totals follow the indexer cursor.",
      example: `curl ${SITE.url}/api/v1/network`,
    },
    {
      id: "assets",
      path: "/api/v1/assets",
      summary: "The asset registry with per-window activity for each entry.",
      params: [windowParam],
      returns: "assets[], count, state, window, activity_state, methodology",
      errors: [],
      freshness: "Follows the indexer cursor. An empty array with state INDEXING is a valid answer, not an error.",
      example: `curl "${SITE.url}/api/v1/assets?window=24H"`,
    },
    {
      id: "asset",
      path: "/api/v1/assets/{contract}",
      summary: "Asset passport: identity, activity, top counterparties, and the fields that are withheld.",
      params: [windowParam],
      returns: "asset, observation_window, state, activity, price, liquidity, holders, top_counterparties",
      errors: [{ code: "404", when: "The contract has not been observed by the indexer." }],
      freshness: "Computed at request time from stored transfers.",
      example: `curl ${SITE.url}/api/v1/assets/${contract}`,
    },
    {
      id: "candles",
      path: "/api/v1/assets/{contract}/candles",
      summary: "OHLC when price observations exist; otherwise the observed activity series, clearly labelled.",
      params: [
        { name: "interval", values: INTERVALS.join(" · "), note: "Only intervals in intervals.available are honoured." },
        { name: "range", values: WINDOWS.join(" · "), note: "Defaults to 7D." },
      ],
      returns: "series, price_state, activity_state, interval, intervals, candles[], volume[], observations, provenance",
      errors: [{ code: "404", when: "The contract has not been observed by the indexer." }],
      freshness: "Computed at request time. series is 'price' only when real observations exist.",
      example: `curl "${SITE.url}/api/v1/assets/${contract}/candles?range=7D&interval=1H"`,
    },
    {
      id: "asset-flows",
      path: "/api/v1/assets/{contract}/flows",
      summary: "Directed value edges touching one asset, plus per-address totals.",
      params: [windowParam, { name: "limit", values: "1–100", note: "Defaults to 20." }],
      returns: "asset, window, state, partial, edges[], addresses[]",
      errors: [{ code: "404", when: "The contract has not been observed." }],
      freshness: "Computed at request time.",
      example: `curl "${SITE.url}/api/v1/assets/${contract}/flows?window=24H"`,
    },
    {
      id: "wallet",
      path: "/api/v1/wallets/{address}",
      summary: "Wallet context: capital movement, asset exposure and counterparties for a public address.",
      params: [{ ...windowParam, note: "Defaults to 7D." }],
      returns: "address, capital_movement, asset_exposure[], counterparties[], portfolio_value, protocol_exposure, indexer",
      errors: [{ code: "400", when: "The address is not 0x followed by 40 hexadecimal characters." }],
      freshness: "Computed at request time from stored transfers.",
      example: `curl ${SITE.url}/api/v1/wallets/0x0000000000000000000000000000000000000000`,
    },
    {
      id: "flows",
      path: "/api/v1/flows",
      summary: "Directed value edges across the whole chain, plus precomputed per-address net flow.",
      params: [windowParam, { name: "limit", values: "1–100", note: "Defaults to 20." }],
      returns: "window, state, partial, edges[], top_addresses[], precomputed_net_flow",
      errors: [],
      freshness: "Edges are computed at request time; precomputed_net_flow follows the last indexer run.",
      example: `curl "${SITE.url}/api/v1/flows?window=24H&limit=20"`,
    },
    {
      id: "fabric",
      path: "/api/v1/fabric",
      summary: "The market topology as nodes and edges — the same graph the canvas draws.",
      params: [
        windowParam,
        { name: "type", values: "stock_token · crypto · stablecoin · other" },
        { name: "limit", values: "3–40", note: "Nodes per lane. Defaults to 12." },
      ],
      returns: "nodes[], edges[], totals, shown, truncated, methodology",
      errors: [],
      freshness: "Computed at request time.",
      example: `curl "${SITE.url}/api/v1/fabric?window=24H&limit=12"`,
    },
    {
      id: "protocols",
      path: "/api/v1/protocols",
      summary: "The verified protocol registry and the contracts attributed to each entry.",
      returns: "protocols[], count, state, unattributed_contracts, methodology",
      errors: [],
      freshness: "Registry read. An empty array is the current, honest answer for this chain.",
      example: `curl ${SITE.url}/api/v1/protocols`,
    },
    {
      id: "events",
      path: "/api/v1/events",
      summary: "The event ledger: most recent observed transfers, newest block first.",
      params: [{ name: "limit", values: "1–200", note: "Defaults to 50." }],
      returns: "events[], count, state, methodology",
      errors: [],
      freshness: "Follows the indexer cursor.",
      example: `curl "${SITE.url}/api/v1/events?limit=50"`,
    },
    {
      id: "search",
      path: "/api/v1/search",
      summary: "Substring search across indexed assets, observed wallets, protocols and contracts.",
      params: [{ name: "q", values: "any string", required: true }],
      returns: "hits[], counts, is_address, is_tx_hash, indexer_state",
      errors: [],
      freshness: "Reads the same tables the pages read, so search and pages never disagree.",
      example: `curl "${SITE.url}/api/v1/search?q=${symbol}"`,
    },
    {
      id: "context",
      path: "/api/v1/context/{asset}",
      summary: "Unified agent context for one asset, addressed by symbol or contract.",
      params: [windowParam],
      returns: "asset, observation_window, activity, price, liquidity, net_flow, top_counterparties, indexer, sources, methodology",
      errors: [{ code: "404", when: "No asset resolves for that symbol or contract." }],
      freshness: "Computed at request time. Shares its builder with the landing page sample.",
      example: `curl "${SITE.url}/api/v1/context/${symbol}?window=24H"`,
    },
  ];

  return (
    <article>
      <DocTitle
        kicker="BUILD"
        title="API reference"
        lede={
          <>
            Plain HTTP, JSON responses, no authentication. Every route below exists in this deployment — nothing is
            documented ahead of implementation. Base URL{" "}
            <code className="font-mono text-ink">{SITE.url}/api/v1</code>.
          </>
        }
      />

      <div className="mt-12 flex flex-col gap-10">
        <DocSection id="contract" title="Response contract">
          <P>Every response carries the context needed to interpret it, not just the values.</P>
          <DocTable
            caption="Common response fields"
            columns={["FIELD", "MEANING"]}
            rows={[
              [<code key="a" className="font-mono text-ink">state</code>, "OK · PARTIAL · STALE · EMPTY · INDEXING · UNAVAILABLE"],
              [<code key="b" className="font-mono text-ink">observation_window</code>, "The trailing period every figure was computed over"],
              [<code key="c" className="font-mono text-ink">partial</code>, "True when a query reached its row cap; counts are lower bounds"],
              [<code key="d" className="font-mono text-ink">sources</code>, "Where the values came from"],
              [<code key="e" className="font-mono text-ink">methodology</code>, "How they were computed, in one paragraph"],
              [<code key="f" className="font-mono text-ink">updated_at</code>, "When the response was generated"],
            ]}
          />
          <Note>
            A state is not an error. <code className="font-mono text-ink">INDEXING</code> with a 200 means the request
            succeeded and the index genuinely holds nothing for that entity yet.
          </Note>
        </DocSection>

        <DocSection id="errors" title="Error model">
          <DocTable
            caption="Error and state model"
            columns={["CODE / STATE", "MEANING", "WHAT TO DO"]}
            rows={[
              ["400", "Malformed input — for example an address that is not 0x plus 40 hex characters.", "Fix the request."],
              ["404", "The entity is not in the index.", "Treat as absence from the index, not as non-existence on chain."],
              ["503", "A required upstream is unreachable. Returned by /network when the RPC fails.", "Retry; the body names the failing source."],
              ["INDEXING", "200 response. The pipeline has not reached this entity.", "Poll, or read /network to see the lag."],
              ["PARTIAL", "200 response. A row cap was reached.", "Treat counts as lower bounds; narrow the window."],
              ["STALE", "200 response. The observation is older than fifteen minutes.", "Check /network for indexer health."],
              ["UNAVAILABLE", "200 or 503. The source is not wired in this deployment.", "The field will not appear until the source exists."],
              ["UNCLASSIFIED", "200 response. The flow is real but its counterparty is unidentified.", "Do not infer intent from it."],
            ]}
          />
          <P>
            There are no API keys and no rate limits in this deployment. Both are{" "}
            <Link href="/docs/limitations#roadmap" className="text-ink underline-offset-4 hover:underline">
              planned
            </Link>
            ; until they exist, please be considerate with polling — the indexer and the API share one upstream RPC.
          </P>
        </DocSection>

        <DocSection id="endpoints" title="Endpoints">
          <div className="flex flex-col gap-px bg-rule">
            {ENDPOINTS.map((e) => (
              <div key={e.id} id={e.id} className="scroll-mt-[calc(var(--nav-height)+1.5rem)] bg-void p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <a href={`#${e.id}`} className="min-w-0 font-mono text-data text-ink">
                    <span className="text-ink-faint">GET</span> {e.path}
                  </a>
                  <StateTag state="OK" label="ACTIVE" />
                </div>
                <p className="mt-2 max-w-[68ch] text-body-s text-ink-muted">{e.summary}</p>

                {e.params?.length ? (
                  <dl className="mt-3 flex flex-col gap-1.5">
                    {e.params.map((p) => (
                      <div key={p.name} className="flex flex-wrap items-baseline gap-x-3">
                        <dt className="font-mono text-data-s text-ink">
                          {p.name}
                          {p.required ? <span className="text-negative"> *</span> : null}
                        </dt>
                        <dd className="text-body-s text-ink-faint">
                          {p.values}
                          {p.note ? ` — ${p.note}` : ""}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}

                <p className="mt-3 text-body-s text-ink-muted">
                  <span className="label-s mr-2 text-ink-faint">RETURNS</span>
                  <code className="font-mono text-data-s">{e.returns}</code>
                </p>
                <p className="mt-1.5 text-body-s text-ink-faint">
                  <span className="label-s mr-2">FRESHNESS</span>
                  {e.freshness}
                </p>
                {e.errors.length ? (
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {e.errors.map((err) => (
                      <li key={err.code} className="text-body-s text-ink-faint">
                        <span className="label-s mr-2">{err.code}</span>
                        {err.when}
                      </li>
                    ))}
                  </ul>
                ) : null}

                <div className="mt-3">
                  <CodeBlock language="bash" caption="EXAMPLE REQUEST" code={e.example} />
                </div>
              </div>
            ))}
          </div>
        </DocSection>

        <DocSection id="example-response" title="Worked response">
          <P>
            An abridged <code className="font-mono text-ink">/api/v1/network</code> response. The live version is one
            click away at{" "}
            <a href="/api/v1/network" className="text-ink underline-offset-4 hover:underline">
              /api/v1/network
            </a>
            .
          </P>
          <CodeBlock
            language="json"
            caption="GET /api/v1/network"
            code={`{
  "chain": { "id": ${CHAIN.id}, "name": "${CHAIN.name}", "explorer": "${CHAIN.explorer}" },
  "chain_head": 1284412,
  "last_processed_block": 1284398,
  "lag_blocks": 14,
  "indexer_updated_at": "2026-09-04T00:41:12.004Z",
  "totals": { "assets": 13, "transfers": 8241, "wallets": 612 },
  "window_24h": {
    "state": "OK",
    "transfers": 128,
    "active_addresses": 74,
    "active_assets": 6,
    "directed_pairs": 96,
    "partial": false
  },
  "sources": ["${CHAIN.name} RPC — eth_blockNumber", "FOLDMARK indexer"],
  "methodology": "Chain head is read live from the RPC..."
}`}
          />
          <Note tone="warn">
            The numbers above are illustrative of the <em>shape</em> of the response, not a claim about the current
            chain. Every real figure in the product and the API is measured — call the endpoint for live values.
          </Note>
        </DocSection>
      </div>

      <DocFooterNav current="/docs/api" />
    </article>
  );
}
