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
    file: "db/migrations/0001_foldmark_schema.sql",
    does: "Neon Postgres holding indexer_state, assets, transfers, wallets, contracts, protocols, flow_windows, price_observations, canonical_prices, market_state and provider_refresh_state.",
    guarantees:
      "Every table carries the key that makes a write safe to repeat: transfers on (tx_hash, log_index), flow_windows on (entity_type, entity_id, window), price_observations on (asset_id, source, price_type, fetched_at, pair_key). The file is idempotent — every object is declared if not exists — so it can be applied to an existing database without dropping anything.",
  },
  {
    id: "db-client",
    name: "Database client",
    file: "src/server/db/client.ts",
    does: "The only path to Postgres. A tagged-template SQL client whose interpolated values always become bound parameters, one small pooled connection shared by Vercel and the runner, and a health probe that tells NOT_CONFIGURED apart from UNREACHABLE.",
    guarantees:
      "Values interpolated into a tagged template are sent as bound parameters, so there is no code path that builds SQL by concatenating a caller's value. The connection string is read from DATABASE_URL only — never from a NEXT_PUBLIC_ variable — so it cannot reach a browser bundle. With no DATABASE_URL every caller receives null and the surface renders UNAVAILABLE instead of throwing, which is how a fresh clone builds with no secrets.",
  },
  {
    id: "read-layer",
    name: "Read layer",
    file: "src/lib/queries.ts",
    does: "Every query the product makes, written as SQL against the schema above. Folds bounded row windows into per-asset, per-address and per-window aggregates.",
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
WINDOWS PERSISTENT RUNNER       │        RPC FAILOVER CLIENT
scripts/live-indexer.mjs        │        ordered endpoints, last-good preferred
   │  follows the head because  │
   │  the free node retains     │
   │  only ~48 blocks of logs   │
   └────────────┬───────────────┘
                │  POST /api/cron/index  ◀── the daily VERCEL CRON calls this
                ▼                            same route. A fallback so a
         INGESTION                           deployment with no runner still
         chain logs + provider prices        writes something; one pass a day
         block time resolved                 cannot hold a five-second log
         gaps recorded, never skipped        window, so it replaces nothing
                │
                ▼
         NEON POSTGRES   assets · transfers · wallets · flow_windows
                │        price_observations · canonical_prices · indexer_state
                │
                │  one entry point: src/server/db/client.ts — parameterised SQL,
                │  server-side only, no ORM and no client-side database access
                │
                ├──▶ FLOW ENGINE           inflow / outflow / net per address, per asset
                ├──▶ RELATIONSHIP ENGINE   directed edges → market topology
                └──▶ CANDLE ENGINE         OHLC from stored observations

MARKET DATA LAYER  ·  server-side only  ·  budget + cache + coalescing
   │   called during ingestion; every observation is stored with its provenance
   ├── GeckoTerminal   DEX spot + OHLCV backfill   10 req/min budget
   ├── DEX Screener    second DEX quote            off unless DEXSCREENER_ENABLED
   └── (reconcile)     ranked by type, then depth and age — never averaged
                │
                ▼
         MarketSnapshot   canonical price + every observation + divergence
                │
                └──▶ price_observations · canonical_prices, above

VERCEL  ·  Next.js server components + the FOLDMARK API
   │   reads Postgres through the read layer — the browser reaches neither the
   │   database nor the RPC, and holds no secret
   ├──▶ USERS    context, visually
   └──▶ AGENTS   context, structurally`}
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
            property is what makes a restartable pipeline trustworthy — and it is load-bearing here, because the
            runner reconnects after every dropped socket and the daily cron may cover a range the runner already took.
          </P>
          <CodeBlock
            language="text"
            caption="SQL — the idempotent write, src/lib/indexer.ts"
            code={`-- Every value is bound, never spliced into the statement text.
insert into transfers
  (tx_hash, log_index, block_number, chain_id, asset_id,
   from_address, to_address, amount, timestamp)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
on conflict (tx_hash, log_index) do nothing;

-- The cursor advances only after the write, so a crash mid-run replays the
-- same range rather than skipping it.
insert into indexer_state (chain_id, last_processed_block, updated_at)
values ($1, $2, now())
on conflict (chain_id) do update
   set last_processed_block = excluded.last_processed_block,
       updated_at           = excluded.updated_at;`}
          />
          <List
            items={[
              "A transfer is keyed by (tx_hash, log_index) — the only pair that is unique for an ERC-20 log.",
              "Flow windows are keyed by (entity_type, entity_id, window), so a recompute replaces rather than accumulates.",
              "Assets are keyed by (chain_id, contract_address), so rediscovery is a no-op. Never by symbol: anyone can deploy a second contract calling itself NVDA.",
              "A price observation is keyed by (asset_id, source, price_type, fetched_at, pair_key), and pair_key is NOT NULL. A nullable pair address made every pairless observation distinct to Postgres, which is a unique index that permits unlimited duplicates.",
              "The cursor advances last. A failure leaves the range to be re-read, never silently skipped.",
            ]}
          />
        </DocSection>

        <DocSection id="testing" title="What the tests protect">
          <P>
            The suite does not chase coverage of the interface. It covers the rules that decide whether a number on
            screen is true, because those are the failures that look exactly like working software: every figure
            renders, every chart draws, and the answer is wrong.
          </P>
          <DocTable
            caption="Test suites and the failure each one exists to prevent"
            columns={["SUITE", "THE MISTAKE IT CATCHES"]}
            rows={[
              [
                "unit-safety",
                "Adding one NVDA to one AAPL and calling it two. Cross-asset rankings ordered by whichever token has the fewest decimals.",
              ],
              [
                "provenance",
                "A cache read recorded as a new observation, turning one real quote into a hundred rows of history that never happened.",
              ],
              [
                "coverage",
                "A cursor advancing past blocks the node refused to serve, and a 7D label over forty minutes of index.",
              ],
              [
                "providers",
                "Reading a provider's response wrong — most easily by labelling a token's total reserve across all pools as the depth behind one quote.",
              ],
            ]}
          />
          <P>
            Nothing in the suite reaches the network or a database. Provider tests run against responses recorded from
            the live services, so the suite tests this repository rather than whether a third party is up. It runs on
            every push and every pull request, with no secrets available to it — which is also how the build is kept
            working from a fresh clone.
          </P>
          <Note>
            Three real defects were found by writing these tests rather than by using the product: a cache state that
            was declared but never emitted, an unrecognised chart interval that produced one candle stamped{" "}
            <code className="font-mono text-ink">NaN</code> spanning the whole dataset, and an unparseable observation
            time being bucketed at epoch zero.
          </Note>
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
              "Neon Postgres, reached only through src/server/db/client.ts. DATABASE_URL is server-side and there is no ORM — the read layer is SQL written against the schema in db/migrations.",
              "The schema is applied with npm run db:migrate, and npm run db:status reports what is applied without changing anything. Migrations are plain SQL files, applied in filename order, each inside its own transaction and recorded in a ledger so a re-run is a no-op.",
              "The persistent runner is the primary writer. scripts/live-indexer.mjs follows the chain head over WebSocket and drives /api/cron/index; scripts/install-live-indexer.ps1 registers it as a Windows scheduled task that restarts itself, rotates its log and writes a heartbeat.",
              "One scheduled Vercel invocation of /api/cron/index a day is the fallback, not the pipeline: a daily pass cannot hold a five-second log window, so with the runner stopped the chain index is gapped and says so. A shared secret gates the route when CRON_SECRET is set.",
              "The runner holds no database credential. It calls the deployment over HTTP and the deployment does the writing, so a workstation never becomes a second thing with write access to Postgres.",
              "scripts/local_indexer.mjs drives the same endpoint on a tighter local cadence — there is one ingestion implementation, not two.",
              "No client-side secret exists: the browser never talks to storage or to the RPC directly.",
              "With no DATABASE_URL the application still builds and runs — every dependent surface renders UNAVAILABLE rather than throwing. That is what lets CI build a fresh clone with no secrets at all.",
            ]}
          />
        </DocSection>
      </div>

      <DocFooterNav current="/docs/architecture" />
    </article>
  );
}
