import Link from "next/link";
import { DocTitle, DocSection, P, List, Note, DocFooterNav, DocTable } from "@/components/docs/DocShell";
import { CodeBlock } from "@/components/docs/CodeBlock";
import { CHAIN } from "@/config/site";

export const metadata = {
  title: "Architecture",
  description: "The modules behind the interface: indexer, normaliser, storage, flow engine, relationship engine, API and client.",
};

type Module = { id: string; name: string; file: string; does: string; guarantees: string };

const MODULES: Module[] = [
  {
    id: "indexer",
    name: "Indexer",
    file: "src/lib/indexer.ts",
    does: "Reads Transfer logs for tracked contracts across a block range, resolves each distinct block to its header timestamp, and upserts normalised rows. Discovers new assets by reading contract metadata on-chain.",
    guarantees:
      "Cursor-driven and idempotent — upserts key on (tx_hash, log_index) so a replay cannot double count. A log whose block time cannot be resolved is skipped rather than stamped with a wrong time.",
  },
  {
    id: "normaliser",
    name: "Normalisation",
    file: "src/lib/format.ts",
    does: "Converts base units to token units at each asset's own decimals, lowercases addresses, and formats every value for display with tabular numerals.",
    guarantees: "Base-unit conversion uses BigInt so an 18-decimal value never loses precision to a float.",
  },
  {
    id: "storage",
    name: "Storage",
    file: "supabase.sql",
    does: "Postgres holding indexer_state, assets, transfers, wallets, flow_windows, protocols, contracts, prices and relationships.",
    guarantees:
      "Unique constraints on (tx_hash, log_index) and on (entity_type, entity_id, window) make writes safe to repeat. The schema is idempotent and can be re-applied.",
  },
  {
    id: "read-layer",
    name: "Read layer",
    file: "src/lib/queries.ts",
    does: "Every query the product makes. Folds bounded row windows in memory into per-asset, per-address and per-window aggregates.",
    guarantees:
      "Returns a state alongside every result. A query that reaches its row cap is reported PARTIAL rather than presented as complete.",
  },
  {
    id: "flow-engine",
    name: "Flow engine",
    file: "src/lib/indexer.ts — recomputeAddressFlows",
    does: "After a run that commits transfers, recomputes directional inflow, outflow and net flow per address for all five windows and writes the top ranked addresses to flow_windows.",
    guarantees:
      "Net flow is written per address only. Asset-level rows are actively deleted, because a transfer moves balance between holders without changing supply.",
  },
  {
    id: "relationship-engine",
    name: "Relationship engine",
    file: "src/lib/graph.ts",
    does: "Folds a window of transfers into a semantic graph: net senders on the left lane, assets in the centre, net receivers on the right, with weighted directed edges.",
    guarantees:
      "Layout is a pure function of the ranked data, so server and client agree and the same input always draws the same map. Nodes with no drawn edge are omitted rather than floated.",
  },
  {
    id: "market-data",
    name: "Market data layer",
    file: "src/server/market-data/**",
    does: "Normalises every external price source behind one MarketSnapshot. Holds the provider registry, the rate budget, the cache with request coalescing, and the reconciliation rules.",
    guarantees:
      "The interface has never seen a provider response. A provider can be throttled, replaced or removed inside this directory without touching a component. Every outbound call asks the budget first, and a hundred readers produce one request.",
  },
  {
    id: "rpc-failover",
    name: "RPC failover client",
    file: "src/server/market-data/providers/rpc.ts",
    does: "Chain reads across an ordered list of endpoints, remembering which one answered last. Also measures and enforces the free endpoint's log window.",
    guarantees:
      "A single dead endpoint degrades rather than breaks: the URL this repository shipped with refuses every connection, which is what had put DATA UNAVAILABLE across the whole product.",
  },
  {
    id: "price-pipeline",
    name: "Price pipeline",
    file: "src/lib/ohlc.ts",
    does: "Aggregates stored price observations into OHLC buckets and decides which intervals the available data can honestly support. The observations themselves arrive from the market data layer and are persisted on every ingestion pass.",
    guarantees:
      "A bucket with no observation produces no candle. An interval is offered only when at least four of its buckets contain data. Nothing is carried forward.",
  },
  {
    id: "api",
    name: "API",
    file: "src/app/api/v1/**",
    does: "Serves the same measurements the interface renders, with states, sources and methodology attached.",
    guarantees: "Reads through the same read layer as the pages, so the API and the UI cannot disagree.",
  },
  {
    id: "client",
    name: "Web client",
    file: "src/app/**, src/components/**",
    does: "Server components render measurements; a small number of client components own interaction — the graph canvas, the chart, the command palette and the wallet connection.",
    guarantees:
      "A value only reaches the screen through a component that accepts a Measured, so an absent number cannot be papered over by a caller passing a dash.",
  },
];

export default function ArchitecturePage() {
  return (
    <article>
      <DocTitle
        kicker="SYSTEM"
        title="Architecture"
        lede="A mental model of the system beneath the interface, and the guarantee each module is responsible for. Every module named here exists in the repository at the path shown."
      />

      <div className="mt-12 flex flex-col gap-10">
        <DocSection id="pipeline" title="The pipeline">
          <div className="border border-rule bg-surface p-5">
            <pre className="overflow-x-auto font-mono text-data-s leading-[1.9] text-ink-muted">
{`${CHAIN.name.toUpperCase()}  ·  chain ${CHAIN.id}  ·  0.101s per block  ·  ~852,000 blocks/day
   │
   │  wss newHeads ─────────────┐        https eth_getLogs · eth_getBlockByNumber · eth_call
   ▼                            │
LIVE FOLLOWER                   │        RPC FAILOVER CLIENT
scripts/live-indexer.mjs        │        ordered endpoints, last-good preferred
   │  follows the head because  │
   │  the free node retains     │
   │  only ~48 blocks of logs   │
   └────────────┬───────────────┘
                ▼
         INDEXER  ·  block-time resolved  ·  gaps recorded, never skipped
                │
                ▼
         POSTGRES   assets · transfers · wallets · prices · flow_windows
                │
                ├──▶ FLOW ENGINE           inflow / outflow / net per address
                ├──▶ RELATIONSHIP ENGINE   directed edges → market topology
                └──▶ CANDLE ENGINE         OHLC from stored observations

MARKET DATA LAYER  ·  server-side only  ·  budget + cache + coalescing
   │
   ├── GeckoTerminal   DEX spot + OHLCV backfill   10 req/min budget
   ├── DEX Screener    second DEX quote            60s cache, matches theirs
   └── (reconcile)     ranked by type, then depth and age — never averaged
                │
                ▼
         MarketSnapshot   canonical price + every observation + divergence
                │
                ├──▶ WEB UI   context, visually
                └──▶ API      context, structurally  ──▶  AGENTS`}
            </pre>
          </div>
          <Note>
            The read layer is the only path to data. A page cannot reach storage directly, which is why the interface
            and the API can never report different numbers for the same question.
          </Note>
        </DocSection>

        <DocSection id="modules" title="Modules">
          <div className="flex flex-col gap-px bg-rule">
            {MODULES.map((m) => (
              <div key={m.id} id={m.id} className="scroll-mt-[calc(var(--nav-height)+1.5rem)] bg-void p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <a href={`#${m.id}`} className="label text-ink">
                    {m.name}
                  </a>
                  <code className="font-mono text-label-s text-ink-faint">{m.file}</code>
                </div>
                <p className="mt-2 max-w-[68ch] text-body-s text-ink-muted">{m.does}</p>
                <p className="mt-1.5 max-w-[68ch] text-body-s text-ink-faint">
                  <span className="label-s mr-2">GUARANTEE</span>
                  {m.guarantees}
                </p>
              </div>
            ))}
          </div>
        </DocSection>

        <DocSection id="idempotency" title="Why a replay is safe">
          <P>
            The indexer can be run again over a range it has already processed without corrupting anything. That
            property is what makes a cron-driven pipeline trustworthy.
          </P>
          <CodeBlock
            language="ts"
            caption="src/lib/indexer.ts — idempotent write"
            code={`await sb
  .from("transfers")
  .upsert(rows, { onConflict: "tx_hash,log_index", ignoreDuplicates: true, count: "exact" });

// The cursor advances only after the write, so a crash mid-run replays the
// same range rather than skipping it.
await sb.from("indexer_state").upsert(
  { chain_id: ${CHAIN.id}, last_processed_block: Number(toBlock), updated_at: new Date().toISOString() },
  { onConflict: "chain_id" },
);`}
          />
          <List
            items={[
              "A transfer is keyed by (tx_hash, log_index) — the only pair that is unique for an ERC-20 log.",
              "Flow windows are keyed by (entity_type, entity_id, window), so a recompute replaces rather than accumulates.",
              "Assets are keyed by contract address, so rediscovery is a no-op.",
              "The cursor advances last. A failure leaves the range to be re-read, never silently skipped.",
            ]}
          />
        </DocSection>

        <DocSection id="rendering" title="Rendering model">
          <DocTable
            caption="Where work happens"
            columns={["SURFACE", "WHERE IT RUNS", "WHY"]}
            rows={[
              ["Pages, ledgers, tapes, matrices", "Server components", "Data stays on the server; the client ships no query code."],
              ["Topology canvas", "Client, canvas 2D", "Interaction requires it. It draws on demand — there is no animation loop."],
              ["Market chart", "Client, lazily imported", "The charting library only loads once there is real data to draw."],
              ["Command palette, wallet, forms", "Client", "They own keyboard, focus and connection state."],
              ["Filters and windows", "URL state, server-rendered", "A view is shareable, survives reload, and works without JavaScript."],
            ]}
          />
          <P>
            Motion is scoped to two jobs — smoothing the scroll and revealing a section once as it enters. Nothing
            loops, and the graph is completely still when nothing is happening. The rationale is in{" "}
            <Link href="/docs" className="text-ink underline-offset-4 hover:underline">
              the overview
            </Link>
            .
          </P>
        </DocSection>

        <DocSection id="deployment" title="Deployment shape">
          <List
            items={[
              "Next.js App Router on Vercel. Pages revalidate on a short interval; API routes are dynamic.",
              "Postgres via Supabase, reached only through the read layer with a service-role key held server-side.",
              "One scheduled invocation of /api/cron/index advances the indexer. A shared secret gates it when CRON_SECRET is set.",
              "scripts/local_indexer.mjs drives the same endpoint on a tighter local cadence — there is one indexer implementation, not two.",
              "No client-side secret exists: the browser never talks to storage or to the RPC directly.",
            ]}
          />
        </DocSection>
      </div>

      <DocFooterNav current="/docs/architecture" />
    </article>
  );
}
