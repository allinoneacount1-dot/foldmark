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
    kind: "UNAVAILABLE",
    input: "Would require identified DEX pool contracts.",
    computation: "Not computed in this deployment.",
    caveat: `No pool contract is identified on chain ${CHAIN.id}, so every liquidity field reads DATA UNAVAILABLE.`,
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
    kind: "UNAVAILABLE",
    input: "Would require a price oracle or a venue with observable trades.",
    computation: "Read from the prices table when populated; the table is empty in this deployment.",
    caveat: `No oracle is wired to chain ${CHAIN.id}. Every price field reads DATA UNAVAILABLE rather than estimating.`,
  },
];

export const KIND_LABEL: Record<Definition["kind"], string> = {
  RAW: "RAW · DIRECTLY OBSERVED",
  DERIVED: "DERIVED · CALCULATED FROM OBSERVED DATA",
  INTERPRETED: "INTERPRETED · RULE-BASED CONTEXT",
  UNAVAILABLE: "UNAVAILABLE · NOT MEASURED HERE",
};

/* --------------------------------------------------------------- sources */

export type Source = {
  name: string;
  purpose: string;
  dataType: string;
  freshness: string;
  status: "LIVE" | "PLANNED";
  fallback: string;
};

export const SOURCES: Source[] = [
  {
    name: `${CHAIN.name} RPC`,
    purpose: "Chain head, Transfer logs, block timestamps, contract metadata calls.",
    dataType: "JSON-RPC — eth_blockNumber, eth_getLogs, eth_getBlockByNumber, eth_call",
    freshness: "Per indexer run; chain head is read live on every request.",
    status: "LIVE",
    fallback: "Requests fail closed: the surface reports DATA UNAVAILABLE rather than serving a cached guess.",
  },
  {
    name: "On-chain contract metadata",
    purpose: "Asset identity — name(), symbol(), decimals() — and Stock Token verification.",
    dataType: "ERC-20 view calls",
    freshness: "Read once at discovery, then stored.",
    status: "LIVE",
    fallback: "A contract that does not answer these calls is simply not registered as an asset.",
  },
  {
    name: "FOLDMARK index (Postgres)",
    purpose: "Normalised transfers, assets, wallets, flow windows and the indexer cursor.",
    dataType: "Relational storage",
    freshness: "Advances with the indexer cursor; the lag is published on every page.",
    status: "LIVE",
    fallback: "If storage is unreachable every dependent figure reads DATA UNAVAILABLE.",
  },
  {
    name: "Blockscout explorer",
    purpose: "Outbound verification links for addresses and contracts.",
    dataType: "Hyperlink target only — no data is ingested from it.",
    freshness: "n/a",
    status: "LIVE",
    fallback: "n/a",
  },
  {
    name: "Price oracle",
    purpose: "Would populate the prices table, and with it OHLC candles and any currency figure.",
    dataType: "Oracle reads or venue trades",
    freshness: "n/a",
    status: "PLANNED",
    fallback: `Not wired to chain ${CHAIN.id}. Every price and currency field reads DATA UNAVAILABLE.`,
  },
  {
    name: "Verified protocol contract registry",
    purpose: "Would enable flow classification and protocol exposure.",
    dataType: "Address → protocol mapping",
    freshness: "n/a",
    status: "PLANNED",
    fallback: "Until it exists every flow reads UNCLASSIFIED and the protocol registry is empty.",
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
  { title: "Price pipeline", detail: "Populate the prices table so OHLC candles and currency figures become real.", status: "PLANNED" },
  { title: "Protocol contract registry", detail: "Address-to-protocol mapping, which unlocks flow classification and protocol exposure.", status: "PLANNED" },
  { title: "Balance reconstruction", detail: "Full-history replay to derive holder counts and true portfolio positions.", status: "PLANNED" },
  { title: "Historical analytics", detail: "Retention beyond the rolling window, enabling longer comparisons.", status: "PLANNED" },
  { title: "API keys, rate limits and webhooks", detail: "Authenticated access for integrators and agents.", status: "PLANNED" },
];

/* ------------------------------------------------------------ limitations */

export const LIMITATIONS: { title: string; detail: string }[] = [
  {
    title: "No price data",
    detail: `No oracle or observable venue is wired to chain ${CHAIN.id}. Price, market capitalisation, portfolio value and any currency-denominated figure read DATA UNAVAILABLE. OHLC candles cannot be produced until the prices table is populated.`,
  },
  {
    title: "No flow classification",
    detail: "The contracts registry is empty, so no counterparty can be identified as a DEX, lending market or bridge. Every flow is returned as UNCLASSIFIED.",
  },
  {
    title: "No protocol coverage",
    detail: "The protocols registry is empty. Protocol exposure on assets and wallets is therefore withheld rather than estimated.",
  },
  {
    title: "Rolling window, not full history",
    detail: "The index holds recent blocks rather than the chain from genesis. Holder counts and lifetime figures are not derivable, and long windows may be PARTIAL.",
  },
  {
    title: "Row caps produce lower bounds",
    detail: "Aggregation runs over a bounded row window because the storage client cannot express GROUP BY. When a query reaches its cap the result is reported as PARTIAL and every count is a lower bound.",
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
