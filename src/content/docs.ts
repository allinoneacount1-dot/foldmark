/**
 * Documentation content model.
 *
 * Definitions, sources and the navigation tree live here so a term is written
 * once and reused by every surface that explains it. If a metric is not in
 * DEFINITIONS it is not rendered anywhere in the product.
 */

import { CHAIN } from "@/config/site";

export type DocLink = { label: string; href: string; summary?: string };
export type DocGroup = { group: string; links: DocLink[] };

export const DOCS_NAV: DocGroup[] = [
  {
    group: "START",
    links: [
      { label: "Overview", href: "/docs", summary: "What FOLDMARK is, and what it is not." },
      { label: "Getting started", href: "/docs/getting-started", summary: "Five minutes from landing to a query." },
    ],
  },
  {
    group: "CONCEPTS",
    links: [
      { label: "Core concepts", href: "/docs/concepts", summary: "Asset, wallet, protocol, flow, fabric." },
      { label: "Stock Tokens", href: "/docs/stock-tokens", summary: "Canonical identification, and why symbols are not enough." },
    ],
  },
  {
    group: "DATA",
    links: [
      { label: "Data sources", href: "/docs/data-sources", summary: "Every source, its freshness and its fallback." },
      { label: "Methodology", href: "/docs/methodology", summary: "How each figure is computed, and its limits." },
      { label: "Flow classification", href: "/docs/flow-classification", summary: "Why UNCLASSIFIED is a feature." },
    ],
  },
  {
    group: "BUILD",
    links: [
      { label: "API reference", href: "/docs/api", summary: "Every route, parameter, response and error." },
      { label: "Agents", href: "/docs/agents", summary: "Consuming FOLDMARK as structured context." },
    ],
  },
  {
    group: "SYSTEM",
    links: [
      { label: "Architecture", href: "/docs/architecture", summary: "Indexer, engines, storage, interfaces." },
      { label: "Security & privacy", href: "/docs/security", summary: "Read-only scope, and what is never requested." },
      { label: "Status", href: "/docs/status", summary: "Live health of every dependency." },
      { label: "Limitations & roadmap", href: "/docs/limitations", summary: "What is missing, and what is planned." },
      { label: "Changelog", href: "/docs/changelog", summary: "Real implementation history." },
    ],
  },
];

export const DOCS_FLAT: DocLink[] = DOCS_NAV.flatMap((g) => g.links);

/* ----------------------------------------------------------- definitions */

export type Definition = {
  id: string;
  term: string;
  kind: "RAW" | "DERIVED" | "INTERPRETED" | "UNAVAILABLE";
  input: string;
  computation: string;
  caveat?: string;
};

/**
 * RAW          directly observed on chain
 * DERIVED      computed from observed data by a stated rule
 * INTERPRETED  rule-based context that depends on a registry
 * UNAVAILABLE  not measurable in this deployment
 */
export const DEFINITIONS: Definition[] = [
  {
    id: "transfers",
    term: "TRANSFERS",
    kind: "RAW",
    input: "ERC-20 Transfer logs for tracked contracts, read from the chain RPC.",
    computation: "Count of log entries whose block timestamp falls inside the selected window.",
    caveat: "A window that reaches the per-query row cap is reported as PARTIAL and is a lower bound.",
  },
  {
    id: "gross-volume",
    term: "GROSS VOLUME",
    kind: "DERIVED",
    input: "The value field of each Transfer log, and the asset's decimals().",
    computation: "Sum of transfer amounts converted to token units at the asset's own decimals.",
    caveat: "Not a net figure and not a currency figure. Units are never summed across different assets.",
  },
  {
    id: "counterparties",
    term: "COUNTERPARTIES",
    kind: "DERIVED",
    input: "The from and to addresses of every transfer in the window.",
    computation: "Cardinality of the set of distinct addresses appearing on either side.",
    caveat: "Not a holder count. Holders require balance reconstruction over the full history.",
  },
  {
    id: "active-addresses",
    term: "ACTIVE ADDRESSES",
    kind: "DERIVED",
    input: "All transfers in the window across all tracked assets.",
    computation: "Distinct addresses appearing as sender or recipient.",
  },
  {
    id: "active-assets",
    term: "ACTIVE ASSETS",
    kind: "DERIVED",
    input: "All transfers in the window.",
    computation: "Distinct asset contracts with at least one observed transfer.",
  },
  {
    id: "directed-pairs",
    term: "DIRECTED PAIRS",
    kind: "DERIVED",
    input: "All transfers in the window.",
    computation: "Distinct ordered pairs (sender, recipient). A→B and B→A count separately.",
  },
  {
    id: "inflow-outflow",
    term: "INFLOW / OUTFLOW",
    kind: "DERIVED",
    input: "Transfers where a given address is the recipient (inflow) or the sender (outflow).",
    computation: "Sum of amounts in token units, per address, per window.",
  },
  {
    id: "net-flow",
    term: "NET FLOW",
    kind: "DERIVED",
    input: "Inflow and outflow for one address.",
    computation: "Value received minus value sent, per address, in token units.",
    caveat:
      "Defined only per address. It is not defined per token contract, because a transfer moves balance between holders without changing supply — so FOLDMARK publishes no asset-level net flow.",
  },
  {
    id: "structure-change",
    term: "STRUCTURE CHANGE",
    kind: "DERIVED",
    input: "Directed address pairs in the current window, and in the immediately preceding window of equal length.",
    computation:
      "NEW RELATIONSHIPS counts pairs present now and absent before. NOT REPEATED counts pairs present before and absent now.",
    caveat: "A count of observed relationships, not a score. No weighting, no hidden model, no smoothing.",
  },
  {
    id: "indexer-lag",
    term: "INDEXER LAG",
    kind: "DERIVED",
    input: "eth_blockNumber from the RPC, and the indexer cursor in storage.",
    computation: "Chain head minus last processed block.",
    caveat: "A large lag means every figure below it describes an older state of the chain.",
  },
  {
    id: "data-freshness",
    term: "DATA FRESHNESS",
    kind: "DERIVED",
    input: "The indexer cursor's updated_at timestamp.",
    computation: "Values older than fifteen minutes are marked STALE.",
  },
  {
    id: "node-position",
    term: "NODE POSITION",
    kind: "DERIVED",
    input: "The folded window of transfers.",
    computation:
      "Net senders are placed on the left lane, assets on the centre lane, net receivers on the right lane, ordered by rank within each lane.",
    caveat: "A deterministic function of the data. Nothing is randomised or physically simulated.",
  },
  {
    id: "node-radius",
    term: "NODE RADIUS / EDGE WEIGHT",
    kind: "DERIVED",
    input: "Value moved through a node, and value moved along an edge.",
    computation: "Square root of the value, normalised against the largest in the current view.",
  },
  {
    id: "ohlc",
    term: "OHLC CANDLE",
    kind: "DERIVED",
    input: "Stored price observations for the asset inside the bucket.",
    computation: "open = first observation, high = maximum, low = minimum, close = last. Volume is summed observed volume.",
    caveat:
      "A bucket with no observation produces no candle. No price is carried forward to fill a gap, and no candle is synthesised.",
  },
  {
    id: "classification",
    term: "FLOW CLASSIFICATION",
    kind: "INTERPRETED",
    input: "The counterparty address of a transfer, checked against the contracts registry.",
    computation: "A flow is labelled only when its counterparty contract is registered and verified.",
    caveat: "Everything else stays UNCLASSIFIED. An unknown label is preferred to a wrong one.",
  },
  {
    id: "liquidity",
    term: "LIQUIDITY",
    kind: "DERIVED",
    input: "Total reserve reported for the pool behind the chosen quote.",
    computation: "Taken as reported by the market source alongside the price it quoted.",
    caveat:
      "This is pool reserve, not depth at a given size, and it covers only pools the source knows about. It is not a market-wide liquidity figure.",
  },
  {
    id: "holders",
    term: "HOLDERS",
    kind: "UNAVAILABLE",
    input: "Would require balance reconstruction across the complete transfer history.",
    computation: "Not computed in this deployment.",
    caveat: "The indexer holds a rolling window, not full history, so a holder count cannot yet be derived honestly.",
  },
  {
    id: "price",
    term: "PRICE",
    kind: "DERIVED",
    input:
      "DEX spot quotes for the asset's contract, each with the pool reserve behind it. GeckoTerminal is called; DEX Screener is implemented but only called where a deployment sets DEXSCREENER_ENABLED.",
    computation:
      "Sources are ranked by price type, then by confidence — derived from pool depth and observation age — and the highest ranked observation is displayed. Prices are never averaged.",
    caveat:
      "This is a DEX spot price, not an issuer reference quote and not an oracle reading. No Robinhood price API or Chainlink feed is wired for this chain, so those two authorities are absent from the ranking.",
  },
  {
    id: "price-divergence",
    term: "SOURCE DIVERGENCE",
    kind: "DERIVED",
    input: "Two or more quotes of the same price type for one contract.",
    computation:
      "The spread between the highest and lowest is reported when it exceeds the tolerance for the shallower venue: 8% below $10k of reserve, 4% below $100k, 2% below $1M, 1% above.",
    caveat:
      "A spread is an observation about venues, not an arbitrage claim. Execution, slippage and depth at size are not modelled. With one price source enabled there is nothing to compare, so no divergence is reported — that silence is a missing second source, not two venues agreeing.",
  },
  {
    id: "log-window",
    term: "LOG WINDOW",
    kind: "RAW",
    input: "Measured by binary search against the free public endpoint.",
    computation:
      "The endpoint serves eth_getLogs for roughly the last 48-52 blocks and refuses older ranges as archive requests.",
    caveat:
      "At 0.101s per block that is about five seconds of history, against roughly 852,000 blocks a day. A cursor further behind cannot be caught up without an archive node, so the abandoned span is recorded as a gap rather than skipped silently.",
  },
];

export const KIND_LABEL: Record<Definition["kind"], string> = {
  RAW: "RAW · DIRECTLY OBSERVED",
  DERIVED: "DERIVED · CALCULATED FROM OBSERVED DATA",
  INTERPRETED: "INTERPRETED · RULE-BASED CONTEXT",
  UNAVAILABLE: "UNAVAILABLE · NOT MEASURED HERE",
};

/* --------------------------------------------------------------- sources */

/**
 * LIVE      wired and called by this deployment
 * DISABLED  implemented, and deliberately not called here — the reason is in `fallback`
 * PLANNED   not wired. Never presented as a source of any number on screen.
 */
export type Source = {
  name: string;
  purpose: string;
  dataType: string;
  freshness: string;
  status: "LIVE" | "DISABLED" | "PLANNED";
  fallback: string;
};

export const SOURCES: Source[] = [
  {
    name: `${CHAIN.name} RPC — publicnode`,
    purpose: "Chain head, Transfer logs, block timestamps, contract metadata calls. The live backbone.",
    dataType: "JSON-RPC over HTTPS, plus a newHeads subscription over WebSocket",
    freshness: "Event-driven. Measured block time 0.101s, round trip ~170-400ms.",
    status: "LIVE",
    fallback:
      "The client holds an ordered endpoint list and fails over. If none answers, chain figures read DATA UNAVAILABLE rather than serving a stale guess.",
  },
  {
    name: "On-chain contract metadata",
    purpose: "Asset identity — name(), symbol(), decimals() — and Stock Token verification.",
    dataType: "ERC-20 view calls",
    freshness: "Read once at discovery, then stored.",
    status: "LIVE",
    fallback: "A contract that does not answer these calls is never registered as an asset.",
  },
  {
    name: "GeckoTerminal",
    purpose: "DEX spot price and liquidity, addressed by contract. Also the OHLCV backfill source.",
    dataType: "Public REST API",
    freshness: "Refreshed on a 45s cache with a 60s stale window; budgeted at 10 calls/minute.",
    status: "LIVE",
    fallback: "Absent quotes simply do not appear. Nothing is estimated in their place.",
  },
  {
    name: "DEX Screener",
    purpose: "Would be a second independent DEX quote, cross-checking GeckoTerminal.",
    dataType: "Public REST API",
    freshness: "Their own responses carry max-age=60, so the cache matches it. Polling faster buys nothing.",
    status: "DISABLED",
    fallback:
      "Implemented and probed as supporting this chain, and still not called unless DEXSCREENER_ENABLED is set: their terms restrict redistribution and products that compete with their screener, and that review is not finished. It is a cross-check, never a load-bearing dependency, so the product loses no capability while it is off — divergence simply cannot be reported from a single source.",
  },
  {
    name: "FOLDMARK index — Neon Postgres",
    purpose:
      "Normalised transfers, assets, wallets, price observations, canonical prices, flow windows and the indexer cursor. Written by the persistent runner through the deployment's ingest route; read by every page and every API route.",
    dataType: "Postgres, reached with parameterised SQL through one server-side client. No ORM, and no client-side access.",
    freshness: "Advances with the indexer cursor; the lag is published on every page.",
    status: "LIVE",
    fallback:
      "If the database is unreachable, or DATABASE_URL is unset, every dependent figure reads DATA UNAVAILABLE. Nothing cached or approximate is served in its place.",
  },
  {
    name: "Blockscout explorer",
    purpose: "Outbound verification links for addresses and contracts.",
    dataType: "Hyperlink target only — no data is ingested.",
    freshness: "n/a",
    status: "LIVE",
    fallback: "n/a",
  },
  {
    name: "CoinGecko",
    purpose: "Would provide broad crypto reference pricing and metadata.",
    dataType: "Public REST API",
    freshness: "n/a",
    status: "PLANNED",
    fallback:
      "Reachable, but no Robinhood Chain asset platform was confirmed, so it is not called. Its free quota is 10,000 calls a month — about 333 a day — which would only ever be spent server-side and batched.",
  },
  {
    name: "Robinhood Stock Token API",
    purpose: "Would be the authoritative underlying reference quote and multiplier source.",
    dataType: "REST",
    freshness: "n/a",
    status: "PLANNED",
    fallback:
      "Every candidate host failed to connect during probing. Treating it as available would be a guess, so it stays disabled until a request from this deployment actually succeeds.",
  },
  {
    name: "Chainlink feeds",
    purpose: "Would be the canonical on-chain oracle price, with round id and updatedAt.",
    dataType: "On-chain aggregator reads",
    freshness: "n/a",
    status: "PLANNED",
    fallback:
      `Reading a feed needs its aggregator address, and none is verified for chain ${CHAIN.id}. Guessing one would produce confident nonsense.`,
  },
  {
    name: "Archive node",
    purpose: "Would allow the indexer to backfill history older than the free endpoint's log window.",
    dataType: "JSON-RPC with archive access",
    freshness: "n/a",
    status: "PLANNED",
    fallback:
      "The free endpoint serves roughly 48 blocks of logs. Older ranges are refused, so gaps are recorded and reported rather than silently skipped.",
  },
];

/* -------------------------------------------------------- classification */

export type FlowClass = { code: string; meaning: string; requires: string };

export const FLOW_CLASSES: FlowClass[] = [
  { code: "WALLET_TRANSFER", meaning: "Value moved between two addresses that are not known venues.", requires: "Both sides absent from the contract registry." },
  { code: "DEX_BUY", meaning: "Value moved out of a DEX pool to a wallet.", requires: "The counterparty is a registered DEX pool." },
  { code: "DEX_SELL", meaning: "Value moved from a wallet into a DEX pool.", requires: "The counterparty is a registered DEX pool." },
  { code: "LP_DEPOSIT", meaning: "Liquidity added to a pool.", requires: "Registered pool plus a mint of pool tokens." },
  { code: "LP_WITHDRAW", meaning: "Liquidity removed from a pool.", requires: "Registered pool plus a burn of pool tokens." },
  { code: "LENDING_DEPOSIT", meaning: "Collateral or supply entering a lending market.", requires: "Registered lending market contract." },
  { code: "LENDING_WITHDRAW", meaning: "Supply leaving a lending market.", requires: "Registered lending market contract." },
  { code: "BORROW", meaning: "Debt drawn against collateral.", requires: "Registered lending market plus a borrow event." },
  { code: "REPAY", meaning: "Debt repaid.", requires: "Registered lending market plus a repay event." },
  { code: "BRIDGE_IN", meaning: "Value entering the chain through a bridge.", requires: "Registered bridge contract." },
  { code: "BRIDGE_OUT", meaning: "Value leaving the chain through a bridge.", requires: "Registered bridge contract." },
  { code: "UNCLASSIFIED", meaning: "The counterparty is not identified, so the intent of the transfer is unknown.", requires: "Nothing — this is the default and the current state of every flow." },
];

/* -------------------------------------------------------------- glossary */

export const GLOSSARY: { term: string; definition: string }[] = [
  { term: "Asset", definition: "A token contract the indexer has observed emitting a Transfer log on the chain." },
  { term: "Stock Token", definition: "An asset whose canonical on-chain name identifies it as a Robinhood Stock Token. Never called a tokenized stock or tokenized equity." },
  { term: "Wallet", definition: "Any address observed as the sender or recipient of a transfer. It carries no identity claim." },
  { term: "Protocol", definition: "A named piece of infrastructure whose contracts are registered and verified. Nothing is promoted to a protocol by behaviour alone." },
  { term: "Market", definition: "A venue where an asset trades. Requires a verified venue contract; none is registered on this chain." },
  { term: "Relationship", definition: "A directed pair of entities connected by observed value movement." },
  { term: "Counterparty", definition: "The other address in a transfer, from the perspective of the entity being viewed." },
  { term: "Capital flow", definition: "Value moving between addresses, measured in token units and directed from sender to recipient." },
  { term: "Liquidity", definition: "Depth available to trade an asset. Not measurable in this deployment." },
  { term: "Fabric", definition: "The market rendered as a network of entities and their relationships." },
  { term: "Freshness", definition: "How recently the underlying observation was made, against a fifteen-minute budget." },
  { term: "Indexer", definition: "The process that reads chain logs, resolves block times and writes normalised rows." },
  { term: "Observation window", definition: "The trailing period a figure was computed over: 1H, 6H, 24H, 7D or 30D." },
  { term: "Unclassified", definition: "A deliberate state meaning the counterparty is unidentified, so the flow's intent is unknown." },
];

/* -------------------------------------------------------------- roadmap */

export type RoadmapItem = { title: string; detail: string; status: "LIVE" | "IN DEVELOPMENT" | "PLANNED" };

export const ROADMAP: RoadmapItem[] = [
  { title: "Transfer indexing with block time", detail: "Transfer logs resolved to their block timestamp before storage.", status: "LIVE" },
  { title: "Asset registry and auto-discovery", detail: "Assets discovered from on-chain contract metadata, never seeded.", status: "LIVE" },
  { title: "Market topology", detail: "Deterministic source → asset → destination graph from observed transfers.", status: "LIVE" },
  { title: "Per-address net flow", detail: "Directional flow precomputed per address across all five windows.", status: "LIVE" },
  { title: "Machine-readable context API", detail: "Every measurement available as JSON with states and provenance.", status: "LIVE" },
  {
    title: "Postgres storage with a parameterised SQL layer",
    detail:
      "Neon Postgres reached through one server-side client, with the schema in db/migrations applied by npm run db:migrate. No ORM, no vendor SDK, and no database access from the browser.",
    status: "LIVE",
  },
  {
    title: "DEX price ingestion",
    detail:
      "Prices observed from free public DEX sources — GeckoTerminal here, DEX Screener where a deployment enables it — reconciled by depth and age rather than averaged, and persisted with full provenance on every ingestion pass.",
    status: "LIVE",
  },
  { title: "Provider budget and circuit breaking", detail: "Every outbound call is budgeted, cached and coalesced; a failing provider is stood down rather than hammered.", status: "LIVE" },
  {
    title: "Live chain follower",
    detail:
      "A persistent WebSocket follower — the pipeline’s primary writer — that indexes blocks while their logs are still inside the free endpoint’s window. Installable as a Windows scheduled task that restarts itself and writes a heartbeat.",
    status: "LIVE",
  },
  { title: "Issuer reference and oracle prices", detail: "Wire the Robinhood Stock Token API and a verified Chainlink aggregator so the two highest-authority price types enter the ranking.", status: "PLANNED" },
  { title: "Archive backfill", detail: "Recover log history older than the free endpoint’s window, which needs an archive node.", status: "PLANNED" },
  { title: "Protocol contract registry", detail: "Address-to-protocol mapping, which unlocks flow classification and protocol exposure.", status: "PLANNED" },
  { title: "Balance reconstruction", detail: "Full-history replay to derive holder counts and true portfolio positions.", status: "PLANNED" },
  { title: "Historical analytics", detail: "Retention beyond the rolling window, enabling longer comparisons.", status: "PLANNED" },
  { title: "API keys, rate limits and webhooks", detail: "Authenticated access for integrators and agents.", status: "PLANNED" },
];

/* ------------------------------------------------------------ limitations */

export const LIMITATIONS: { title: string; detail: string }[] = [
  {
    title: "No issuer reference price, and no oracle",
    detail:
      "Price is observed from DEX pools only. The Robinhood Stock Token API did not answer from this deployment and no Chainlink aggregator address is verified for this chain, so the two highest-authority price types — issuer reference and on-chain oracle — are absent from the ranking. What is shown is a DEX spot price, labelled as such.",
  },
  {
    title: "Log history is about five seconds deep",
    detail:
      "The free public endpoint serves eth_getLogs for roughly 52 blocks and refuses older ranges as archive requests. At 0.100s per block the chain produces about 860,000 blocks a day, so any gap in coverage is unrecoverable without a paid archive node. Gaps are counted and reported rather than skipped silently. Measured 2026-09-04.",
  },
  {
    title: "Token amounts are never added across assets",
    detail:
      "One NVDA plus one AAPL plus one USDG is not three of anything. Any figure spanning several assets is therefore a count — transfers, counterparties, assets touched — or a USD notional conversion. Amounts appear only beside their own symbol, and cross-asset rankings use counts, which are comparable.",
  },
  {
    title: "Notional value is priced at the moment of each transfer",
    detail:
      "A USD total values every transfer at a price observed at or before that transfer, within 15 minutes of it — never at the current quote. Pricing a day-old transfer with a two-minute-old quote would look like a measurement and describe nothing that happened. Transfers with no such price are excluded and counted, and the total is marked PARTIAL with the number of transfers priced against the number observed.",
  },
  {
    title: "Notional coverage depends on how often prices are ingested",
    detail:
      "A transfer can only be priced if an observation exists near it in time. The scheduled route runs once a day, which is far too sparse to price a live window, so meaningful notional coverage requires the continuous head-follower (scripts/live-indexer.mjs) to be running — it refreshes prices on every block it ingests. Without it, most transfers are correctly reported as unpriced rather than valued at a distant quote.",
  },
  {
    title: "An index window can be shorter than its label",
    detail:
      "A 7D panel drawn from forty minutes of index is not a 7D panel. Every windowed surface reads how far back the index reaches unbroken, and reports PARTIAL with the actual reach when it cannot span its own period. The figure is then a lower bound over that shorter span.",
  },
  {
    title: "DEX Screener is off unless a deployment enables it",
    detail:
      "Their terms restrict redistribution and products that compete with their screener, which is a question about the business rather than the chain. The provider is probed as supporting Robinhood Chain and is still not called unless DEXSCREENER_ENABLED is set. The provider status endpoint reports chain support and enablement as separate facts.",
  },
  {
    title: "Continuous ingestion needs a process, not a cron",
    detail:
      "Because of the log window, chain indexing must follow the head over a WebSocket. Serverless hosting cannot hold that connection open, so scripts/live-indexer.mjs runs as a persistent process and is the pipeline's primary writer; the daily Vercel cron calls the same ingest route and is a fallback, not a substitute. Price ingestion has no such constraint and does run on the scheduled route.",
  },
  {
    title: "The primary writer is one machine",
    detail:
      "Chain coverage advances while that runner is up and stops while it is not — a reboot, a lost network or a stopped scheduled task becomes a gap that no later pass can recover, because the logs have left the free endpoint's window. Those gaps are counted in indexer_state and reported as PARTIAL coverage rather than closed over, so a window can be honest about being shorter than its label.",
  },
  {
    title: "No flow classification",
    detail: "A counterparty the contracts registry has no entry for is not identified as a DEX, lending market or bridge, and a flow across it is returned as UNCLASSIFIED.",
  },
  {
    title: "No protocol coverage",
    detail: "The protocols registry is empty. Protocol exposure on assets and wallets is therefore withheld rather than estimated.",
  },
  {
    title: "Rolling window, not full history",
    detail:
      "The index holds what it has observed since it started following the chain, not the chain from genesis. Holder counts and lifetime figures are not derivable, and long windows may be PARTIAL.",
  },
  {
    title: "Row caps produce lower bounds",
    detail:
      "Aggregation runs over a bounded row window rather than an unbounded scan, so a busy window can reach the cap. When it does, the result is reported as PARTIAL and every count inside it is a lower bound rather than a total.",
  },
  {
    title: "Indexer lag",
    detail: "Figures describe the chain as of the indexer cursor, not the chain head. The gap is published on every surface so it can never be mistaken for live state.",
  },
  {
    title: "Single provider dependency",
    detail: "Chain reads depend on one RPC endpoint. If it is unreachable the product reports DATA UNAVAILABLE rather than degrading silently.",
  },
  {
    title: "No identity attribution",
    detail: "Addresses are never mapped to real-world identities. FOLDMARK describes observed behaviour and nothing else.",
  },
];
