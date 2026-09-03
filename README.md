# FOLDMARK

Market intelligence layer for **Robinhood Chain** (chain id `4663`).

FOLDMARK reads the chain, stores what it observed, and renders that — assets,
wallets, transfers, counterparties, capital flows and DEX prices — as one market
map for people and one JSON surface for agents.

## The rule everything else follows

A number reaches the screen only when it was measured. Nothing is estimated,
interpolated, averaged across venues, or carried forward. Where a value is
unknown the product renders an explicit state instead of a figure:

| State | Meaning |
| --- | --- |
| `OK` | Measured, complete, fresh. |
| `PARTIAL` | Measured, but the window is shorter than its label or the query reached its row cap. Every count inside it is a lower bound. |
| `STALE` | Measured, but older than the fifteen-minute freshness budget. |
| `EMPTY` | Measured, and there was nothing there. |
| `INDEXING` | Not measured yet. |
| `UNAVAILABLE` | Not measurable in this deployment. |

The reasoning behind this is in [`docs/PHILOSOPHY.md`](docs/PHILOSOPHY.md).

## Architecture

```
ROBINHOOD CHAIN  ·  RPC over HTTPS + newHeads over WebSocket
        │
        ▼
WINDOWS PERSISTENT RUNNER              scripts/live-indexer.mjs
  follows the head, drives ingestion    the primary writer
        │
        │  POST /api/cron/index         ← the daily Vercel cron calls the same
        ▼                                 route, as a fallback
NEON POSTGRES                          db/migrations/0001_foldmark_schema.sql
  assets · transfers · wallets · flow_windows · price_observations ·
  canonical_prices · indexer_state
        │
        │  src/server/db/client.ts — parameterised SQL, server-side only
        ▼
VERCEL                                 Next.js App Router + the FOLDMARK API
        │
        ├──▶ USERS    context, visually
        └──▶ AGENTS   context, structurally
```

**Why a persistent runner rather than a cron.** The free public RPC serves
`eth_getLogs` for roughly the last 48–52 blocks and refuses older ranges as
archive requests. At about 0.101s per block that is some five seconds of history
against roughly 852,000 blocks a day, so a scheduled job does not fall behind
and catch up — it misses everything in between, permanently. Ingestion therefore
follows the chain head over a WebSocket, which serverless hosting cannot hold
open. The runner is the pipeline; the once-a-day Vercel cron keeps prices and
asset discovery moving when no runner is up, and cannot keep chain coverage
continuous. Gaps are counted in `indexer_state` and reported, never closed over.

**Why the runner talks HTTP.** It drives the same ingest route the cron does, so
there is one ingestion implementation rather than two that drift apart. It holds
no database credential: `DATABASE_URL` lives on the deployment, so a workstation
never becomes a second thing with write access to Postgres.

**Why plain SQL.** One entry point — `src/server/db/client.ts` — with no ORM and
no vendor SDK. Values interpolated into its tagged template are sent as bound
parameters, so no code path can build a statement by concatenating a caller's
value. With no `DATABASE_URL` every caller receives `null` and the surface
renders `UNAVAILABLE` rather than throwing, which is how CI builds a fresh clone
with no secrets at all.

## Getting started

Requires Node 20+ and a Postgres 15+ database. Neon's free tier is what this is
built against; nothing here is Neon-specific.

```bash
npm install
cp .env.example .env.local     # paste your pooled connection string into DATABASE_URL
npm run db:migrate             # apply db/migrations in filename order
npm run dev                    # http://localhost:3000
```

Full database walkthrough: [`docs/NEON-SETUP.md`](docs/NEON-SETUP.md).

The app also runs without `DATABASE_URL`. It simply has nothing to show, and
says so on every surface rather than inventing something.

## Ingestion

```bash
npm run live                   # follow the head — the primary writer
npm run live -- --once         # one ingest pass, then exit
npm run index                  # local poller against the same route
npm run probe:providers        # what the market providers actually answer
```

To keep it running unattended on Windows:

```powershell
.\scripts\install-live-indexer.ps1 -BaseUrl https://your-deployment.vercel.app
```

That registers a scheduled task which starts at boot, restarts itself, rotates a
log and writes a heartbeat under `%LOCALAPPDATA%\foldmark\logs`. Remove it with
`-Uninstall`.

If the ingest route is gated by `CRON_SECRET`, set it in the user environment —
never as a command-line argument, which would put it in shell history and in the
scheduled-task definition:

```powershell
[Environment]::SetEnvironmentVariable("CRON_SECRET", "<value>", "User")
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js development, production build, production server. |
| `npm run db:migrate` | Apply every migration not yet recorded. Each file runs inside its own transaction. |
| `npm run db:status` | Report what is applied. Changes nothing. |
| `npm run live` | Follow the chain head and drive ingestion. |
| `npm run index` / `index:once` | Poll the ingest route locally. |
| `npm run probe:providers` | Probe the market data providers and print what they return. |
| `npm test` | Vitest. Touches no network and no database. |
| `npm run typecheck` / `lint` | `tsc --noEmit`, ESLint. |

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | for any data | Pooled Postgres connection string. Server-only; never under a `NEXT_PUBLIC_` name. |
| `NEXT_PUBLIC_ROBINHOOD_RPC` | no | Chain RPC endpoint. Defaults to the public node. |
| `FOLDMARK_RPC_URLS` | no | Comma-separated failover list for server-side chain reads. |
| `FOLDMARK_WS_URL` | no | WebSocket endpoint the runner subscribes to. |
| `FOLDMARK_BASE_URL` | no | Deployment the runner drives. Defaults to `http://localhost:3000`. |
| `CRON_SECRET` | no | When set, the ingest route requires `Authorization: Bearer <it>`. |
| `DEXSCREENER_ENABLED` | no | Opt in to the second DEX quote. Off by default. |

`.env.example` is the annotated template. `.env*` is gitignored.

## Layout

```
db/migrations/           the schema, one idempotent SQL file per migration
scripts/                 migrate, live indexer, Windows installer, provider probe
src/app/                 routes: pages, /api/v1/**, /api/cron/index, /docs/**
src/components/          design primitives, docs shell, charts, topology canvas
src/lib/                 indexer, read layer, formatting, OHLC, graph folding
src/server/db/           the only path to Postgres
src/server/market-data/  provider registry, budget, cache, reconciliation
src/content/docs.ts      definitions, sources, roadmap, limitations — written once
tests/                   unit safety, provenance, coverage, provider parsing
```

## What this does not do

Measured limits, not a roadmap dressed up as features. The full list is at
`/docs/limitations` in the running app.

- **No history beyond the log window.** The free endpoint refuses ranges older
  than roughly 48–52 blocks; backfill needs an archive node. The index is a
  rolling window rather than the chain from genesis, so holder counts and
  lifetime figures are not derivable and long windows may report `PARTIAL`.
- **No issuer reference price and no oracle.** The Robinhood Stock Token API did
  not answer from this deployment, and no Chainlink aggregator is verified for
  chain 4663. What is shown is a DEX spot price, labelled as one.
- **No stock token is `VERIFIED`.** Metadata that looks like a Robinhood Stock
  Token makes a contract a `CANDIDATE`. Promotion requires an authoritative
  source confirming that exact contract address, and none is wired.
- **DEX Screener is off.** Implemented, probed as supporting this chain, and not
  called unless a deployment sets `DEXSCREENER_ENABLED` — their terms restrict
  redistribution and competing products, and that review is not finished. With
  one price source there is nothing to cross-check, so no divergence is
  reported.
- **No flow classification, no protocol coverage.** The contracts and protocols
  registries are empty, so every flow is `UNCLASSIFIED` and protocol exposure is
  withheld rather than guessed.
- **No identity attribution.** Addresses are never mapped to real-world
  identities.
- **Token amounts are never summed across assets.** One NVDA plus one AAPL is
  not two of anything. Cross-asset figures are counts, or a USD notional priced
  at the moment of each transfer.

## Further reading

- [`docs/PHILOSOPHY.md`](docs/PHILOSOPHY.md) — why the product refuses to fill a blank.
- [`docs/NEON-SETUP.md`](docs/NEON-SETUP.md) — database setup, start to finish.
- [`docs/BRAND.md`](docs/BRAND.md) — identity, and the rules around the mark.
- `/docs` in the running app — architecture, methodology, data sources, API
  reference, status and limitations.
