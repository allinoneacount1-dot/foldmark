# FOLDMARK

**Market Intelligence Layer for Robinhood Chain**

> Markets have structure. FOLDMARK makes it visible.

FOLDMARK turns raw Robinhood Chain activity into readable financial structure.

An asset is more than a ticker or a price.

Behind it are:

- addresses
- counterparties
- markets
- liquidity
- protocols
- capital flows
- relationships

FOLDMARK connects those relationships into a readable market map.

## What is FOLDMARK?

FOLDMARK is an onchain market intelligence system built for Robinhood Chain.

It observes market activity, normalizes blockchain observations, and transforms
those observations into structured relationships that humans and machines can
interpret.

Traditional products answer different questions:

| Product | Question |
| --- | --- |
| Explorer | What happened? |
| Chart | What did price do? |
| Portfolio | What do I own? |
| DEX | What can I trade? |
| **FOLDMARK** | **How is the market structured, and where is capital moving?** |

FOLDMARK is not intended to replace an explorer, exchange, wallet, portfolio
tracker or charting platform. It is the market context layer around them.

## Product

### Fabric

FOLDMARK's market topology surface.

Fabric maps observed assets, addresses, venues, protocols and directed
relationships into a readable graph. Node shape carries class, position encodes
role — assets inner, venues and protocols around them, addresses on the rim —
and an arrowhead states which way value moved.

Measured Fabric is built from real observations. Architecture Preview is a
separate mode drawn from generic category placeholders; it is labelled as such
and is never presented as observed market activity.

### Flows

A structured view of how value moves between observed entities and
counterparties.

Supported relationships are classified into semantic flow classes:

`DEX_BUY` · `DEX_SELL` · `LP_DEPOSIT` · `LP_WITHDRAW` · `LEND` · `BORROW` ·
`REPAY` · `BRIDGE_IN` · `BRIDGE_OUT` · `WALLET_TRANSFER` · `UNCLASSIFIED`

Direction decides meaning: the same pool and the same address are a buy or a
sell depending only on which way value went. Unknown relationships remain
`UNCLASSIFIED` until sufficient evidence exists.

`LP_DEPOSIT`, `LP_WITHDRAW` and `LEND` are reserved names in the vocabulary that
the current classifier does not yet assign.

### Asset Passports

A contextual intelligence surface for individual assets.

Depending on available evidence and coverage, an Asset Passport can expose
canonical contract identity, activity, counterparties, market and flow
relationships, price provenance, liquidity, protocol exposure, coverage,
freshness and source information.

### Protocols

A verification-aware contract and protocol intelligence surface.

Protocol identity is not inferred from ticker, name or behaviour alone.

### FOLDMARK Intelligence

A conversational product intelligence layer.

It combines deterministic canonical product knowledge, current page context,
application state, and optional external language-model reasoning. Canonical
FOLDMARK semantics remain controlled by the deterministic knowledge layer: the
meaning of a term is fixed text, not generated, and cannot vary between two
readings of it.

## Data Principles

FOLDMARK is built around explicit data truth.

- Observed ≠ Identified
- Identified ≠ Categorized
- Categorized ≠ Verified
- Reference price ≠ Onchain price
- Reference price ≠ Oracle price
- Reference price ≠ DEX spot price
- Unknown ≠ Wallet
- Unknown ≠ Protocol
- Unknown ≠ DEX
- `UNCLASSIFIED` is a valid state
- Token transfer ≠ Economic inflow
- Non-comparable token units are never silently combined as capital
- Missing measurements are never replaced with synthetic financial data
- Architecture Preview ≠ Measured observation
- Market recognition ≠ Authoritative verification

FOLDMARK prefers **unknown over incorrect**.

A transfer carries the timestamp of its block, never the moment ingestion ran.
A price is aligned to the time of the transfer it values, with no look-ahead.

## Architecture

```text
Robinhood Chain
      ↓
Persistent ingestion
      ↓
Normalized observations
      ↓
PostgreSQL / Supabase
      ↓
Flow + relationship engines
      ↓
FOLDMARK API
      ↓
Fabric / Flows / Assets / Protocols / Intelligence
```

Where applicable, observations retain source, chain, block, transaction,
timestamp, provenance, freshness and coverage.

The product preserves traceability from visible market structure back to the
underlying observations: an edge on the canvas resolves to an aggregate, which
resolves to stored transfers, which resolve to a transaction hash and block on
chain.

## Robinhood Chain

FOLDMARK currently targets Robinhood Chain mainnet.

Chain ID: `4663`

For onchain assets, canonical identity is:

```text
CHAIN + CONTRACT ADDRESS
```

Ticker and token name alone are not authoritative identifiers.

## Technology

- **Next.js 16** and **React 19**, App Router
- **TypeScript**, strict
- **Tailwind CSS v4**
- **Vercel** — application host and server runtime
- **PostgreSQL / Supabase** — persistent observation store, read over SQL where a
  direct connection is available and over PostgREST otherwise
- **Robinhood Chain RPC** — block, log and contract reads
- **viem / wagmi** — chain types and client
- **TradingView** — reference-market charts, kept strictly separate from onchain
  price
- **OpenRouter** — optional reasoning layer behind the deterministic knowledge base
- **Vitest** — test suite
- **GitHub Actions** — hosted ingestion scheduler

## Status

FOLDMARK is under active development.

Live in production:

- measured market topology built from indexed transfers
- capital-flow classification
- asset intelligence surfaces
- provenance-aware observations and data states
- hosted ingestion running on a fixed schedule, independent of any local machine
- FOLDMARK Intelligence

Partial or not yet implemented:

- **Coverage is partial by design.** Chain 4663 produces roughly 9.7 blocks per
  second, and the RPC caps a log query at ten blocks. Ingestion therefore follows
  the head within a bounded budget rather than claiming continuous history, and
  coverage is reported as `PARTIAL` wherever that is the case.
- **Nothing is `VERIFIED`.** Verification requires an authoritative issuer source
  confirming an exact contract on an exact chain. No such source is wired, so no
  asset carries the badge.
- **The contracts registry is empty**, so every observed counterparty is
  unidentified and flows classify as `UNCLASSIFIED`. That is the correct output
  of the rules, not a gap being hidden.
- Price, liquidity, holder and protocol-exposure enrichment are not yet populated.

FOLDMARK does not generate fake financial data to fill unavailable measurements.

## Development

```bash
npm install
npm run dev
```

Quality gates:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Configuration

Environment variable **names** only. Values belong in the deployment
environment, never in the repository. See `.env.example`.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Direct Postgres connection. Preferred when reachable. |
| `SUPABASE_URL` | Observation store over PostgREST, used when SQL is unavailable. |
| `SUPABASE_SERVICE_ROLE_JWT` | Service credential for that path. Server-only. |
| `ROBINHOOD_RPC_URL` | Chain RPC endpoint for logs, blocks and contract reads. |
| `NEXT_PUBLIC_ROBINHOOD_RPC` | Public fallback RPC for chain health display. |
| `INGEST_SECRET` | Shared secret authorising the hosted ingestion endpoint. |
| `OPENROUTER_API_KEY` | Optional. Enables the reasoning layer. |
| `OPENROUTER_MODEL` | Optional. Overrides the default model. |
| `OPENROUTER_BASE_URL` | Optional. Overrides the provider base URL. |

No credential is ever exposed through a `NEXT_PUBLIC_` variable or sent to the
browser. The application talks to its own API; the API holds the credentials.

## License

FOLDMARK is open source and released under the [MIT License](LICENSE).
