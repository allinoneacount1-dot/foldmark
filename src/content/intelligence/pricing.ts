import type { Entry } from "@/lib/intelligence/types";

/**
 * Pricing — what a price on a FOLDMARK surface is a price OF.
 *
 * This domain covers the four price types FOLDMARK records and keeps apart
 * (REFERENCE, ORACLE, DEX_SPOT, AGGREGATED), the reference-market allowlist and
 * the TradingView chart that renders from it, the REFERENCE / ONCHAIN split, and
 * the notional method that values an observed transfer at a price observed at
 * or before it.
 *
 * The load-bearing distinction throughout: the underlying instrument's market
 * and a pool on Robinhood Chain are different markets. Every entry here exists
 * to stop those two being read as one number.
 */
export const PRICING_ENTRIES: Entry[] = [
  {
    id: "pricing.price_types",
    domain: "pricing",
    title: "The four price types",
    patterns: [
      "what are the price types",
      "price types",
      "what is price_type",
      "explain price types",
      "reference oracle dex spot aggregated",
      "why are there four kinds of price",
      "what kinds of price does foldmark record",
      "price_type meaning",
      "types of price observation",
      "how many price types are there",
    ],
    keywords: ["price_type", "reference", "oracle", "dex_spot", "aggregated", "prices", "kinds", "observation"],
    answer:
      "A price observation in FOLDMARK carries exactly one of four types: REFERENCE, ORACLE, DEX_SPOT or AGGREGATED. The schema constrains the column to that set, so an observation with no stated type cannot be written.\n\nThey describe four different quantities. REFERENCE is the underlying instrument's quote from its issuer. ORACLE is an on-chain feed reading, with a round and an update time. DEX_SPOT is what the token actually trades at in a specific pool. AGGREGATED is a provider's own cross-venue blend.\n\nThey are never collapsed into one another. An illiquid pool legitimately disagreeing with a reference quote is information, and averaging the two would destroy it. Reconciliation therefore chooses one observation to display rather than blending them, and keeps every other observation attached beside it.",
    shortAnswer:
      "REFERENCE, ORACLE, DEX_SPOT and AGGREGATED. Four different quantities, recorded separately and never averaged into one another.",
    detail:
      "The constraint lives in the price_observations table: price_type must be one of 'REFERENCE', 'ORACLE', 'DEX_SPOT' or 'AGGREGATED'. The same four values are the PriceType union in the market-data layer, so the database and the interface cannot drift apart on what a price is.\n\nReconciliation ranks by type first, highest authority first: REFERENCE, then ORACLE, then DEX_SPOT, then AGGREGATED. Within a type, observation quality breaks the tie, and observation time breaks that. The type ranking is the first sort key precisely because the types are not interchangeable.\n\nDivergence is only ever computed within a single type. A gap between a reference quote and a pool price is not a divergence; it is two different markets being two different markets, which is the thing this product exists to show rather than to hide.\n\nEach type also carries its own freshness budget, because the sources update at different cadences: 30 seconds for REFERENCE, 120 for ORACLE, 90 for DEX_SPOT, 300 for AGGREGATED. An observation older than its budget reads as STALE rather than being quietly re-served as current.",
    followups: ["pricing.dex_spot", "pricing.reference_price_type", "pricing.canonical_price", "data.freshness"],
    entities: ["REFERENCE", "ORACLE", "DEX_SPOT", "AGGREGATED"],
    routes: ["/assets"],
  },

  {
    id: "pricing.reference_price_type",
    domain: "pricing",
    title: "REFERENCE price type",
    patterns: [
      "what is a reference price",
      "reference price",
      "what does reference mean in price type",
      "explain reference price type",
      "issuer reference",
      "reference price_type meaning",
      "what is issuer reference on the market panel",
      "is reference the token price",
    ],
    keywords: ["reference", "issuer", "underlying", "price_type", "quote"],
    answer:
      "REFERENCE is the underlying instrument's own quote, from its issuer. It describes the thing a Robinhood Stock Token claims to track, not the token itself.\n\nIt ranks highest in reconciliation because an issuer quoting its own instrument is the most authoritative statement available about that instrument. That ranking is about the underlying, and says nothing about what the token trades at on Robinhood Chain.\n\nThe market panel labels this type ISSUER REFERENCE so the reader is never left inferring which market a number belongs to. Its freshness budget is 30 seconds, the tightest of the four.\n\nNo issuer reference source is wired today. The Robinhood Stock Token API is the candidate for it, and every candidate host failed to connect during probing, so it is recorded as UNVERIFIED and stays disabled. This price type is also a different thing from the TradingView reference chart, which is an embedded third-party widget rather than an observation FOLDMARK records.",
    shortAnswer:
      "The underlying instrument's quote from its issuer. It describes what the token tracks, not what the token trades at. No source for it is wired today.",
    followups: ["pricing.price_types", "pricing.reference_market", "pricing.mapping_not_token_price"],
    entities: ["REFERENCE"],
  },

  {
    id: "pricing.oracle_price",
    domain: "pricing",
    title: "ORACLE price type",
    patterns: [
      "what is an oracle price",
      "oracle price",
      "what does oracle mean in price type",
      "explain oracle price type",
      "does foldmark use chainlink",
      "is there an oracle feed",
      "oracle price_type meaning",
      "where do oracle prices come from",
    ],
    keywords: ["oracle", "chainlink", "feed", "round", "aggregator", "price_type"],
    answer:
      "ORACLE is an on-chain oracle reading, carrying a round and an update time rather than a fetched quote. In the type ranking it sits below REFERENCE and above DEX_SPOT.\n\nNo oracle source is wired on Robinhood Chain today. Reading a feed requires its aggregator address, and no aggregator address for this chain has been confirmed, so the Chainlink provider is recorded as UNVERIFIED and stays disabled. Guessing an address would produce a confident number with nothing behind it.\n\nThe type exists in the schema and in the ranking ahead of any source that can fill it. That ordering is deliberate: the shape of the answer is decided before there is a number, so a source can be wired later without the display rule being invented around whatever it returns.",
    shortAnswer:
      "An on-chain oracle reading with a round and an update time. The type exists, but no oracle source is wired for this chain today.",
    followups: ["pricing.price_types", "pricing.dex_spot", "data.provenance"],
    entities: ["ORACLE"],
  },

  {
    id: "pricing.dex_spot",
    domain: "pricing",
    title: "DEX_SPOT price type",
    patterns: [
      "what is dex spot",
      "dex spot",
      "dex_spot meaning",
      "explain dex spot price",
      "what does dex spot mean",
      "what is the on chain price",
      "what price does the token actually trade at",
      "venue price",
      "pool price",
    ],
    keywords: ["dex_spot", "spot", "pool", "venue", "onchain", "pair", "reserve"],
    answer:
      "DEX_SPOT is what a token actually trades at in a specific pool. It is a venue-specific on-chain market price, not a market-wide one.\n\nThis is the price the product is ultimately for. It comes only through FOLDMARK's own observation pipeline: quotes fetched for a contract address on this chain, reconciled, and stored with the pair address and the venue that produced them. Reference data never populates it.\n\nA DEX_SPOT quote is only as meaningful as the depth behind it. That is why an observation carries a liquidity figure and, where the provider states what that figure counts, its basis - and why observation quality weights depth most heavily. A price against a thin pool is a real print and a weak measurement at the same time.",
    shortAnswer:
      "The price a token actually trades at in one specific pool on chain. Venue-specific, produced only by FOLDMARK's own observation pipeline.",
    detail:
      "DEX_SPOT observations are addressed by contract address on a chain id, never by ticker. A row records the price, the source, the pair address, the venue id, the liquidity figure and the basis of that liquidity figure, plus four separate timestamps: when the provider says the value was true, when the network call completed, the observation time adopted, and when the row was written. Collapsing any pair of those would let a cache read masquerade as a new observation.\n\nTwo sources are relevant on this chain. GeckoTerminal is enabled by default and carries a required attribution. DEX Screener is opt-in per deployment, off unless an environment flag turns it on, because its terms restrict redistribution and restrict competing products. A third path, reading pool state directly, is the only price source FOLDMARK would fully own; it needs a confirmed pool address per asset and is not yet wired.\n\nNo database is connected in the current deployment, so no observation is stored and there is no DEX_SPOT price for any asset today. Where the ONCHAIN tab has no series, that is the honest state rather than a gap to fill. Nothing is estimated, carried forward or interpolated in place of a quote that was never observed.",
    followups: ["pricing.price_types", "pricing.reference_vs_onchain", "pricing.liquidity_basis", "pricing.no_price_yet"],
    entities: ["DEX_SPOT"],
    routes: ["/assets"],
  },

  {
    id: "pricing.aggregated_price",
    domain: "pricing",
    title: "AGGREGATED price type",
    patterns: [
      "what is an aggregated price",
      "aggregated price",
      "aggregated price_type meaning",
      "explain aggregated price type",
      "does foldmark average prices",
      "why is aggregate ranked last",
      "what does aggregate mean on the market panel",
    ],
    keywords: ["aggregated", "aggregate", "blend", "cross-venue", "average", "price_type"],
    answer:
      "AGGREGATED is a provider's own cross-venue blend, arriving already combined. FOLDMARK records it as one source's stated figure, labelled AGGREGATE in the market panel.\n\nIt ranks lowest of the four types. A blend has already discarded the disagreement between the venues inside it, and that disagreement is the part FOLDMARK wants to keep.\n\nFOLDMARK does not build blends of its own across sources. Combining is only appropriate where a stated methodology supports it, and pooling two providers' quotes into one series would print highs and lows no venue ever traded through.",
    shortAnswer:
      "A provider's own cross-venue blend, recorded as that provider's figure. It ranks lowest, and FOLDMARK does not create blends of its own.",
    followups: ["pricing.price_types", "pricing.canonical_price", "pricing.source_divergence"],
    entities: ["AGGREGATED"],
  },

  {
    id: "pricing.reference_market",
    domain: "pricing",
    title: "Reference markets",
    patterns: [
      "what is a reference market",
      "reference market",
      "what is the reference chart",
      "why is there a stock chart here",
      "why is apple on this page",
      "explain reference markets",
      "what instrument is being charted",
      "where does the reference market come from",
      "what does mapped underlying mean",
    ],
    keywords: ["reference", "market", "underlying", "mapping", "allowlist", "instrument", "chart"],
    answer:
      "A Robinhood Stock Token is a claim about an underlying instrument. When someone has recorded which instrument an address is intended to track, the underlying's real market is useful context to show beside the token, and the reference chart is where it appears. Recording that intention is not the same as confirming the claim.\n\nThe mapping from a token to an instrument is an allowlist keyed on chain id and contract address, and nothing else. An address either appears in that file because a person put it there, or it has no reference market. The allowlist ships deliberately empty of guesses and currently holds no entries at all, so no asset has a mapping today; entries are added only as addresses are confirmed.\n\nWhen an asset has no mapping, the chart still shows a real market, but an explicitly labelled benchmark rather than a claim about that asset. The caption names the market and the instrument, and the panel footer says MAPPED UNDERLYING or BENCHMARK MARKET so the two cases are never read as the same statement.",
    shortAnswer:
      "The underlying instrument charted beside a token, selected from an allowlist keyed on chain id and contract address. Without a mapping the chart shows a labelled benchmark instead, which is every asset today because the allowlist is empty.",
    detail:
      "The lookup function takes a chain id and a contract address. There is no parameter through which a token's own symbol, name or metadata could influence which instrument is chosen. That signature is the safeguard, not a convenience.\n\nA mapping record carries the chain id, the lowercase contract address, the exchange-qualified TradingView symbol, the instrument's display name, the market it trades on, and a written statement of how the mapping was established. A mapping with no evidence is a mapping nobody should trust, so evidence is a required field rather than an optional note.\n\nA mapped asset charts its underlying and offers no instrument selector. The instrument is not the reader's choice; it is what the mapping says. The benchmark selector appears only where there is no mapping to override.",
    followups: ["pricing.allowlist", "pricing.tradingview", "pricing.mapping_not_verification", "pricing.benchmark_markets"],
    actions: [{ label: "OPEN ASSETS", href: "/assets" }],
    entities: ["REFERENCE"],
    routes: ["/assets"],
  },

  {
    id: "pricing.tradingview",
    domain: "pricing",
    title: "The TradingView chart",
    patterns: [
      "what is tradingview doing here",
      "tradingview",
      "why is there a tradingview chart",
      "why is the chart from tradingview",
      "what is the candle chart at the top",
      "explain the tradingview widget",
      "who provides the chart data",
      "is the chart real",
      "the chart says source tradingview",
    ],
    keywords: ["tradingview", "chart", "widget", "candles", "embed", "reference"],
    answer:
      "The reference chart is TradingView's Advanced Real-Time Chart, embedded, carrying TradingView's own market data. It is present because it works with no database, no indexer and no price history of FOLDMARK's own, so a visitor sees a real interactive instrument from the first page load rather than an explanation of why there is no chart.\n\nIt shows the mapped underlying instrument where an asset has a mapping and a labelled benchmark where it does not, sourced and labelled as TradingView's either way. The reference-market allowlist is currently empty, so what renders today is always a benchmark. The header reads SOURCE - TRADINGVIEW, the footer repeats NOT THE ONCHAIN TOKEN PRICE, and the panel keeps it on a separate tab from anything FOLDMARK observed.\n\nThe symbol is selected from the reference-market allowlist by contract address. A token's own name or symbol cannot select an instrument.\n\nData status varies by instrument and exchange, and many equity feeds are delayed. The widget renders its own status and FOLDMARK does not add a realtime claim over the top of it.",
    shortAnswer:
      "An embedded TradingView chart showing an allowlisted underlying instrument, or a labelled benchmark where there is no mapping. It sits on its own tab, sourced and labelled as TradingView's rather than as a FOLDMARK measurement.",
    detail:
      "The widget is created by injecting TradingView's embed script with a configuration read once at mount, so a symbol change remounts it. Candles are one-minute, on the reasoning that the chart has to be visibly a live market the instant it paints; an hourly series on a quiet afternoon looks static enough to read as broken.\n\nUntil the widget puts an iframe on the page, a frame is drawn underneath saying what is being waited for. That frame carries no series, no axis figures and no numbers of any kind. It is furniture, and the widget covers it on arrival. The underlay is dismissed by the arrival of the iframe rather than by the script loading, because a blocked embed frequently loads its script and then renders nothing.\n\nIf the embed never renders, the frame says so and names the likely cause - a network policy or a browser extension - and states that FOLDMARK's own data is unaffected. A chart that fails is reported as a chart that failed, not as an absence of market activity.",
    followups: ["pricing.tradingview_not_our_price", "pricing.tradingview_data_control", "pricing.reference_market", "pricing.reference_vs_onchain"],
    entities: ["REFERENCE"],
    routes: ["/assets"],
  },

  {
    id: "pricing.tradingview_not_our_price",
    domain: "pricing",
    title: "TradingView is not the FOLDMARK price",
    patterns: [
      "is tradingview the foldmark price",
      "is that chart the token price",
      "is this the price of the token",
      "does the chart show what the token trades at",
      "why does the chart say not the onchain token price",
      "is the reference chart foldmark data",
      "is the chart price the real price",
    ],
    keywords: ["tradingview", "not", "price", "token", "underlying", "chart"],
    answer:
      "No. The reference chart is market context for the underlying instrument. It is not a FOLDMARK on-chain measurement and it is not the token's price.\n\nA pool on Robinhood Chain and the underlying on its own exchange are different markets, and they can diverge for entirely real reasons: depth, hours, demand for the token itself. A product that blurred those two would be making the most consequential mistake available to it.\n\nSo reference data never populates DEX_SPOT, canonical prices, market state, notional, liquidity, flows or wallet balances. Those come only from FOLDMARK's own observation pipeline, and the ONCHAIN tab is where they appear.",
    shortAnswer:
      "No. It is the underlying instrument's market, shown as context. The token's own price would be a DEX_SPOT observation on the ONCHAIN tab.",
    followups: ["pricing.reference_vs_onchain", "pricing.dex_spot", "pricing.mapping_not_token_price"],
    entities: ["REFERENCE", "DEX_SPOT"],
    routes: ["/assets"],
  },

  {
    id: "pricing.tradingview_data_control",
    domain: "pricing",
    title: "Who serves the TradingView data",
    patterns: [
      "does foldmark store tradingview data",
      "is tradingview data on chain",
      "who controls the reference data",
      "does foldmark serve the chart data",
      "is the reference chart onchain",
      "where is the tradingview data stored",
      "does foldmark own the chart data",
    ],
    keywords: ["tradingview", "store", "control", "serve", "onchain", "third-party"],
    answer:
      "TradingView data is served by TradingView. FOLDMARK does not control it, does not store it, and it is not on-chain.\n\nThe embed fetches and renders it in the reader's browser. Nothing from it is written to FOLDMARK's price tables, so it cannot reach a canonical price, a notional total or any figure derived from observation.\n\nThat separation is exactly why the panel has two tabs rather than one chart with two sources behind it. REFERENCE is somebody else's market data about somebody else's instrument. ONCHAIN is what FOLDMARK observed on Robinhood Chain.",
    shortAnswer:
      "TradingView serves it. FOLDMARK does not control it, does not store it, and it is not on-chain data.",
    followups: ["pricing.tradingview", "pricing.reference_vs_onchain", "data.provenance"],
    entities: ["REFERENCE"],
  },

  {
    id: "pricing.reference_vs_onchain",
    domain: "pricing",
    title: "REFERENCE and ONCHAIN tabs",
    patterns: [
      "what is the difference between reference and onchain",
      "reference vs onchain",
      "what do the two chart tabs mean",
      "why are there two tabs on the chart",
      "what does the onchain tab show",
      "what does the reference tab show",
      "which tab is the real price",
      "explain the chart tabs",
    ],
    keywords: ["reference", "onchain", "tabs", "chart", "panel", "difference"],
    answer:
      "The chart panel has two tabs because it is showing two markets, and they must never be read as one.\n\nREFERENCE is the underlying instrument, from TradingView. It works with no database, no indexer and no price history of FOLDMARK's own, and its tab meta names the exchange or reads BENCHMARK when the asset has no mapping.\n\nONCHAIN is where what FOLDMARK itself observed on Robinhood Chain appears: canonical prices built from venue quotes it fetched and reconciled. Its tab meta names the chain id, and the panel header reads FOLDMARK OBSERVED while it is open.\n\nREFERENCE is the default while no on-chain series exists, so a visitor lands on a working chart. No canonical price series exists today, so REFERENCE is the tab that opens. Once canonical prices exist for an asset, ONCHAIN is what the product is for and becomes the default for it.",
    shortAnswer:
      "REFERENCE is the underlying instrument from TradingView. ONCHAIN is what FOLDMARK observed on Robinhood Chain. Separate tabs, separate sources, separate labels.",
    detail:
      "The two tabs are separately sourced and separately labelled, and the reference feed never writes to FOLDMARK's own price tables. The split is structural rather than cosmetic: there is no code path by which a TradingView value becomes a canonical price.\n\nA chart is mounted only once its tab has been opened, and then stays mounted. Mounting while hidden is the trap - a hidden container has no layout box, an autosizing widget measures it at mount, and the chart then renders as an empty strip even after the tab is opened. Never unmounting avoids re-creating the widget on every switch, because a flash on a price surface reads as data changing.\n\nWhich tab opens first is decided by whether canonical prices exist for that asset, not by preference. That is the one place the product lets available data choose the view.",
    followups: ["pricing.tradingview_not_our_price", "pricing.dex_spot", "pricing.no_price_yet", "data.states"],
    entities: ["REFERENCE", "DEX_SPOT"],
    routes: ["/assets"],
  },

  {
    id: "pricing.allowlist",
    domain: "pricing",
    title: "The reference-market allowlist",
    patterns: [
      "what is the allowlist",
      "reference market allowlist",
      "how is the reference instrument chosen",
      "why is the mapping keyed on address",
      "how does foldmark decide which chart to show",
      "why not use the token symbol",
      "explain the reference mapping",
      "who decides the reference market",
    ],
    keywords: ["allowlist", "mapping", "address", "chainid", "contract", "symbol", "ticker"],
    answer:
      "The mapping from a token to a reference instrument is an allowlist keyed on the pair (chainId, contractAddress) and nothing else.\n\nThe lookup takes an address. It never takes a symbol and never takes a name, so there is no parameter through which token-supplied metadata could influence which instrument is charted.\n\nAn address is in the allowlist because a person put it there, together with a written statement of how the mapping was established. There is no derivation, no fuzzy match and no fallback to a ticker.\n\nThe list is deliberately conservative and currently contains no entries, so every asset falls back to a labelled benchmark. An asset with no confirmed mapping simply has no reference market, which is a smaller loss than charting the wrong company beside a contract.",
    shortAnswer:
      "An allowlist keyed on chain id plus contract address. A person adds an entry with evidence; nothing about a token's own metadata can select one.",
    detail:
      "The allowlist is the load-bearing safeguard, so the failure mode it was designed around is worth stating precisely. Deriving a ticker from a token's own metadata would mean anyone able to deploy an ERC-20 could choose which financial instrument FOLDMARK charts beside their contract.\n\nDeploy something called \"Apple - Robinhood Token\", and a metadata-driven product would render NASDAQ:AAPL next to it, lending a real company's price history to an unrelated address. That is not a cosmetic bug. It is the product endorsing a token's claim about itself, using a chart the reader has every reason to trust.\n\nKeying on the address closes that path completely rather than filtering it. A deployer controls their token's name, symbol and every other field of its metadata; they do not control which addresses a person has written into FOLDMARK's allowlist.",
    followups: ["pricing.ticker_attack", "pricing.reference_market", "pricing.mapping_not_verification", "assets.identity"],
    entities: ["REFERENCE"],
  },

  {
    id: "pricing.ticker_attack",
    domain: "pricing",
    title: "The attack the allowlist prevents",
    patterns: [
      "what attack does the allowlist prevent",
      "why not derive the ticker from metadata",
      "could someone fake a reference chart",
      "what stops a token borrowing apple price history",
      "why is the mapping not based on the token name",
      "how could a deployer abuse the chart",
      "what is the risk with reference charts",
    ],
    keywords: ["attack", "spoof", "metadata", "ticker", "deployer", "erc20", "impersonation"],
    answer:
      "If the reference instrument were derived from a token's own metadata, the deployer of that token would be choosing which financial instrument FOLDMARK charts beside their contract.\n\nThe concrete case: deploy an ERC-20 named to suggest a well-known company, and a metadata-driven product renders that company's real chart next to an unrelated address. The token borrows a real price history it has no relationship to, and the product supplies the endorsement.\n\nFOLDMARK closes that path by keying the mapping on (chainId, contractAddress) and passing only an address to the lookup. Metadata has no route into the decision, so there is nothing for a deployer to influence.",
    shortAnswer:
      "A deployer naming their token after a real company could otherwise make FOLDMARK chart that company beside their contract. Keying the mapping on the address removes that path.",
    followups: ["pricing.allowlist", "pricing.mapping_not_verification", "assets.identity", "methodology.evidence_ladder"],
    entities: ["REFERENCE"],
  },

  {
    id: "pricing.mapping_not_verification",
    domain: "pricing",
    title: "A mapping is not verification",
    patterns: [
      "does a reference mapping mean the asset is verified",
      "is a mapped asset verified",
      "why is verified still dark when there is a chart",
      "does the reference chart verify the token",
      "mapping vs verification",
      "why does a mapping not count as verification",
      "is the reference market proof",
    ],
    keywords: ["mapping", "verification", "verified", "candidate", "status", "evidence"],
    answer:
      "A reference mapping means someone recorded that an address is intended to track an instrument, and that the reference chart is worth showing alongside it. That is the whole of the claim.\n\nIt is not verification. Verification requires an authoritative issuer source confirming the exact contract on the exact chain, and it lives in a separate column, assets.verification_status, with values OBSERVED, CANDIDATE and VERIFIED.\n\nA reference mapping is presentation metadata. It never writes to that column, never sets the verified mirror, and never promotes a CANDIDATE. The two things are separately sourced on purpose.\n\nNo authoritative issuer source is wired today, so nothing is VERIFIED. An asset with a reference chart beside it is an asset with a reference chart beside it, and nothing more has been established.",
    shortAnswer:
      "No. A mapping is presentation metadata recorded by a person. Verification needs an authoritative issuer source confirming the exact contract, and it lives in a separate column that a mapping never touches.",
    detail:
      "The evidence required by each is different in kind. A mapping is justified by an address having been observed on this chain with a recorded intended underlying, which is enough to justify showing a chart beside it. Verification is justified only by an issuer publishing the address itself for this chain. A ticker, a symbol or a token name is never sufficient evidence for the second.\n\nThe separation is enforced structurally: verification_status is one of three states, a boolean could not express them, and the convenience column verified is a mirror kept in sync by a database trigger so it cannot drift. There is no write path from the reference-market configuration to either.\n\nThis is why the VERIFIED stage of the classification pipeline renders unlit. The honest best state for any asset today is CATEGORIZED, and a reference chart does not move it.",
    followups: ["protocols.verified", "protocols.classification_pipeline", "pricing.reference_market", "methodology.evidence_ladder"],
    entities: ["REFERENCE"],
  },

  {
    id: "pricing.mapping_not_token_price",
    domain: "pricing",
    title: "A mapping does not make the reference price the token's price",
    patterns: [
      "does the mapping mean the token trades at that price",
      "if it is mapped is the reference price the token price",
      "why can the token price differ from the underlying",
      "can the two markets diverge",
      "does a mapped chart show what the token is worth",
      "why is the reference price different from the pool price",
      "should the token track the underlying exactly",
    ],
    keywords: ["mapping", "diverge", "underlying", "pool", "price", "difference"],
    answer:
      "A mapping records an intention: this address is meant to track that instrument. It does not assert that the two prices agree.\n\nThe underlying's market and a pool on Robinhood Chain are different markets. They can diverge for real reasons - the depth available on each, the hours each trades, and demand for the token itself as distinct from demand for the underlying.\n\nSo a mapped asset's reference chart is still context, not a quote for the token. What the token trades at would be a DEX_SPOT observation, produced by FOLDMARK's own pipeline and shown on the ONCHAIN tab.\n\nWhen sources of the same type disagree, FOLDMARK reports the spread rather than smoothing it. A reference quote and a pool price are not the same type and are never compared as if they were.",
    shortAnswer:
      "No. A mapping records an intention to track, not an agreement of prices. Two different markets can diverge for real reasons.",
    followups: ["pricing.dex_spot", "pricing.source_divergence", "pricing.reference_vs_onchain"],
    entities: ["REFERENCE", "DEX_SPOT"],
  },

  {
    id: "pricing.benchmark_markets",
    domain: "pricing",
    title: "Benchmark markets",
    patterns: [
      "what are the benchmark markets",
      "benchmark market",
      "why is ether being charted",
      "what are the buttons above the chart",
      "why does it say benchmark instead of a company",
      "which benchmarks can i choose",
      "what is the default chart symbol",
      "why is ethusd the default",
    ],
    keywords: ["benchmark", "ethusd", "coinbase", "nasdaq", "default", "selector"],
    answer:
      "When an asset has no confirmed mapping the chart still shows a real market, but as an explicitly labelled benchmark rather than a claim about that asset. The caption names exactly which market it is, so nothing is implied about the token beside it.\n\nThe benchmark list is COINBASE:ETHUSD (Ether), NASDAQ:AAPL (Apple), NASDAQ:NVDA (NVIDIA) and NASDAQ:TSLA (Tesla). Ether leads and is the default because it is a continuously traded venue pair - it paints candles at any hour, including when every equity market is closed.\n\nEvery entry has to be renderable by the embedded widget specifically, which is a narrower set than TradingView's own site. Index symbols that resolve on the website answer that the symbol does not exist inside the embed, which is worse than an empty chart: the product looks broken and blames itself for something merely unavailable.\n\nThe benchmark selector appears only where there is no mapping. A mapped asset charts its underlying and offers no choice, because the instrument is not the reader's decision.",
    shortAnswer:
      "Four labelled fallback instruments - Ether on Coinbase, plus Apple, NVIDIA and Tesla on NASDAQ - shown when an asset has no confirmed mapping. Ether is the default because it trades continuously.",
    followups: ["pricing.reference_market", "pricing.tradingview", "pricing.allowlist"],
    entities: ["REFERENCE"],
    routes: ["/assets"],
  },

  {
    id: "pricing.notional",
    domain: "pricing",
    title: "Notional value",
    patterns: [
      "what is notional",
      "notional value",
      "how does foldmark calculate notional",
      "explain notional",
      "what is the dollar value of flow",
      "how is flow valued in usd",
      "notional meaning",
      "why is there a notional total",
    ],
    keywords: ["notional", "usd", "value", "flow", "total", "valuation"],
    answer:
      "Notional is the honest single number for observed flow. Token units do not add up - one NVDA plus one AAPL plus one USDG is not three of anything - so FOLDMARK reports flow per asset and ranks by counts, and notional is what makes a cross-asset total possible at all.\n\nEach movement is valued at its own moment rather than at the current price, using a price observation aligned to the transfer's own timestamp. A movement with no aligned price is excluded and counted, never interpolated and never carried forward.\n\nThe result therefore reports how many movements were priced and how many were not, so a partial total can never be mistaken for a complete one. Its state is OK when every movement was priced, PARTIAL when some were excluded, and UNAVAILABLE when none could be priced.",
    shortAnswer:
      "A USD total for observed flow, where every movement is valued at a price observed at or before it. Movements that cannot be priced are excluded and counted, not estimated.",
    detail:
      "The trap this method exists to avoid is subtler than refusing to add token units. It is pricing the past with the present. A 24H window holds transfers from every hour of that day, and multiplying all of them by the newest quote values a transfer from twenty-three hours ago at today's price. The result looks like a measurement, carries a plausible number, and describes nothing that happened.\n\nThe accounting is deliberately complete. Movements the indexer could not fully identify still arrive at the calculation and are still counted, with a reason recorded: the asset was never identified, the decimals are unknown so the amount has no scale, no price series exists for the asset, no observation exists at or before the movement, or the nearest usable observation is too far away. Dropping such transfers before the count would shrink the denominator and inflate coverage - the total would quietly become \"of the transfers we could price, we priced all of them\", which measures nothing.\n\nAlongside the total, the result carries the coverage fraction, the excluded count broken down by reason, which assets could not be priced and why, the largest alignment gap actually used, and the policy that produced it. A reader can act on the shortfall rather than only being told there is one.",
    followups: ["pricing.point_in_time", "pricing.unpriced_transfer", "pricing.amounts_not_comparable", "data.coverage"],
    actions: [{ label: "OPEN METHODOLOGY", href: "/methodology" }],
    routes: ["/flows"],
  },

  {
    id: "pricing.point_in_time",
    domain: "pricing",
    title: "Point-in-time price alignment",
    patterns: [
      "how is a transfer priced",
      "point in time pricing",
      "what price is used for a transfer",
      "how does foldmark align price to a transfer",
      "what is the alignment tolerance",
      "why 15 minutes",
      "explain price alignment",
      "is the current price used for old transfers",
    ],
    keywords: ["alignment", "timestamp", "tolerance", "15", "minutes", "point-in-time", "price"],
    answer:
      "Every movement is priced at its own moment. FOLDMARK finds the price observation nearest that movement's timestamp, and only an observation at or before the movement may price it.\n\nThe gap between the two must be within fifteen minutes. That budget is chosen to be long enough that a quiet asset with sparse quotes can still be valued, and short enough that the price and the transfer belong to the same market conditions. Beyond it the number stops being a measurement.\n\nThe timestamp used is the transfer's own, not the window it falls in, and the observation time used is when the market was observed, not when the row was written. Those two distinctions are what keep the alignment meaningful.\n\nNothing is interpolated, carried forward, or priced by a neighbouring asset.",
    shortAnswer:
      "A transfer is valued using the nearest price observation at or before it, and only if the gap is within fifteen minutes. Otherwise it is excluded.",
    detail:
      "The alignment policy is explicit rather than implied by the implementation: a maximum gap, and a no-look-ahead flag that stays on. Series are sorted once per asset so the lookup is a binary search for the last observation at or before the movement; a window can hold thousands of transfers against hundreds of observations per asset, and a linear scan per transfer would turn the job into a quadratic one.\n\nUnder no-look-ahead the last observation at or before the movement is the only candidate - the most recent thing that was actually knowable when the transfer happened. A code path exists for taking the nearer of the two neighbours instead, but FOLDMARK does not use it. It is there so the policy reads as a stated choice rather than an accident.\n\nObservations that cannot be placed in time are dropped from the series before alignment, as are non-finite or non-positive prices. An observation that cannot be dated cannot align to anything.\n\nThe largest gap actually used is reported alongside the total, so a reader can see whether a result leaned on the edge of the tolerance or sat comfortably inside it.",
    followups: ["pricing.no_lookahead", "pricing.unpriced_transfer", "pricing.notional", "data.freshness"],
    routes: ["/flows"],
  },

  {
    id: "pricing.no_lookahead",
    domain: "pricing",
    title: "No look-ahead",
    patterns: [
      "what is look ahead",
      "no look ahead",
      "why can a later price not be used",
      "does foldmark use future prices",
      "explain look ahead bias",
      "why only prices before the transfer",
      "look-ahead meaning",
    ],
    keywords: ["look-ahead", "lookahead", "future", "backtest", "bias", "prior"],
    answer:
      "Pricing a transfer with a quote from after it is look-ahead: using information that did not exist yet. It is how backtests lie, and it is disallowed here.\n\nSo only an observation at or before a movement may price it. The candidate is the most recent quote that was actually knowable at the moment the transfer happened.\n\nWhen no such observation exists, the movement is excluded with the reason recorded, rather than reaching backwards from a later quote. A number that used tomorrow's price is not a record of what was knowable at the time, however close it looks.",
    shortAnswer:
      "Only a price observed at or before a transfer may value it. Using a later quote would be using information that did not exist yet.",
    followups: ["pricing.point_in_time", "pricing.notional", "methodology.evidence_ladder"],
  },

  {
    id: "pricing.unpriced_transfer",
    domain: "pricing",
    title: "Transfers with no aligned price",
    patterns: [
      "why does a transfer have no notional",
      "why is this transfer not valued",
      "what happens when there is no price for a transfer",
      "why is notional partial",
      "why is coverage less than 100",
      "unpriced transfer",
      "why was a movement excluded",
      "what does excluded mean in notional",
    ],
    keywords: ["excluded", "unpriced", "coverage", "partial", "no_series", "missing"],
    answer:
      "A transfer with no price observation inside the alignment window contributes no notional. It is excluded from the total and counted, with the reason kept.\n\nThe reasons are specific rather than a single failure: the token was never identified so there is nothing to price, the token is known but its decimals are not so the amount has no scale, no price series exists for the asset at all, observations exist but none at or before this movement, the nearest usable observation is further away than the policy allows, the movement carries no readable timestamp, or its amount is not a finite number.\n\nThe alternative would be to borrow a nearby or later price, which would produce a fuller-looking total describing something that did not happen. Excluding and reporting is the smaller loss.\n\nThat is why a notional figure always travels with a coverage fraction. The total is a total of what was priced, never an estimate of the rest.",
    shortAnswer:
      "It contributes nothing and is counted as excluded, with a specific reason. The total stays a total of what was priced rather than borrowing a price it did not have.",
    followups: ["pricing.notional", "pricing.point_in_time", "data.coverage", "data.empty_vs_indexing"],
    routes: ["/flows"],
  },

  {
    id: "pricing.amounts_not_comparable",
    domain: "pricing",
    title: "Amounts in different assets are not comparable",
    patterns: [
      "why can you not add token amounts",
      "why are amounts not comparable",
      "why is flow reported per asset",
      "can i compare a usdg transfer to an nvda transfer",
      "why is edge thickness not based on amount",
      "why do you rank by counts instead of size",
      "why not sum the token amounts",
    ],
    keywords: ["amounts", "units", "decimals", "comparable", "counts", "intensity"],
    answer:
      "Token units do not add up. One NVDA plus one AAPL plus one USDG is not three of anything, so FOLDMARK reports flow per asset and ranks by counts rather than by summed amounts.\n\nDecimals make it worse than merely meaningless. Assets carry different decimal scales, so a raw amount comparison can be off by orders of magnitude for reasons that have nothing to do with value.\n\nThis is why edge stroke weight in Fabric is derived from transfer count, not from token amount. Scaling a stroke by amount would let a stablecoin edge overwhelm an equity edge purely because of decimals, and the map would be reporting a formatting artefact as structure.\n\nNotional exists precisely to make a cross-asset total possible without that mistake, by converting each movement to USD at a price aligned to its own moment before anything is summed.",
    shortAnswer:
      "Different assets carry different units and different decimal scales, so summing raw amounts measures nothing. FOLDMARK ranks by counts, and uses notional when a cross-asset total is needed.",
    detail:
      "Two separate consequences follow from the same rule, and they show up in different parts of the product.\n\nIn Fabric, edge intensity comes from transfer count. The stroke is thicker because value moved along that path more often, not because the numbers attached to it were larger. That keeps the visual comparable across assets with wildly different decimals and price scales.\n\nIn Flows, the per-asset breakdown is the primary reporting form, and notional is offered as the single figure only where prices could actually be aligned. Where they could not, the product shows the per-asset counts rather than a total it cannot support.\n\nThe amount field in a movement is nullable for exactly this reason: when the indexer knows a transfer happened but not the token's decimals, the amount has no scale. Such a movement still reaches the calculation and is still counted, recorded as unpriced because its scale is unknown rather than dropped as if it had not occurred.",
    followups: ["pricing.notional", "fabric.edges", "flows.what_is", "assets.asset_types"],
    routes: ["/flows", "/fabric"],
  },

  {
    id: "pricing.canonical_price",
    domain: "pricing",
    title: "Canonical prices and reconciliation",
    patterns: [
      "what is a canonical price",
      "canonical price",
      "how does foldmark choose which price to show",
      "why not average the sources",
      "what is reconciliation",
      "how is the displayed price picked",
      "which source wins",
      "explain price reconciliation",
    ],
    keywords: ["canonical", "reconcile", "sources", "average", "rank", "chosen"],
    answer:
      "When several sources quote the same asset they will disagree, and the disagreement is information. Reconciliation therefore chooses one observation to display by a stated rule and keeps every other observation attached beside it.\n\nIt never averages. An illiquid pool and a deep one are not two samples of the same quantity, and pooling two providers into one series would print a high and a low no venue ever traded through.\n\nThe rule is: rank by price type first, then by observation quality, then by observation time. Never by whichever number looks better. The row that results names the raw observation it selected, so a past decision stays auditable.\n\nThe market panel shows the chosen value, its type, its source, its venue and its age, then lists the other sources underneath - including the ones that disagreed.",
    shortAnswer:
      "One observation is chosen to display by a stated ranking, and the others are kept beside it. Sources are never averaged into a single number.",
    detail:
      "Observations are first filtered to those with a finite positive price whose freshness is not UNAVAILABLE. The survivors are scored and sorted: price type is the first key, observation quality the second, observation time the third, with a small tolerance on quality so a trivial difference does not outrank recency.\n\nThe reason canonical prices live in their own table rather than being computed at read time is auditability. Charts read that table by default, and a single provider's raw series only when a request names that provider. Each canonical row records which raw observation it selected, so a decision made under one rule stays inspectable after the rule changes.\n\nEvery reconciled snapshot carries a written methodology line stating the ranking, that prices are never averaged across sources or across types, and that a spread wider than the tolerance for the shallower venue is reported rather than smoothed away. When no source returns a usable quote, that line says so plainly instead of leaving an unexplained blank.",
    followups: ["pricing.price_types", "pricing.source_divergence", "pricing.observation_quality", "data.provenance"],
    entities: ["DEX_SPOT", "AGGREGATED"],
    routes: ["/assets"],
  },

  {
    id: "pricing.source_divergence",
    domain: "pricing",
    title: "Source divergence",
    patterns: [
      "what is source divergence",
      "source divergence",
      "why does it show a spread percentage",
      "why do two sources disagree",
      "what does the red divergence number mean",
      "is divergence an arbitrage opportunity",
      "explain the spread between sources",
      "why is divergence shown instead of averaged",
    ],
    keywords: ["divergence", "spread", "disagree", "tolerance", "sources", "venues"],
    answer:
      "When two sources of the same price type quote an asset far enough apart, the panel reports the spread instead of smoothing it. It names the lowest quote, the highest quote and the percentage between them.\n\nHow far is far enough scales with depth. A thin pool moving a few percent from a deep one is ordinary; two deep venues doing the same is not, so the tolerance tightens as the shallower side gets deeper.\n\nDivergence is only computed within a single price type. A reference quote and a pool price are different quantities, so a gap between them is not a divergence and is never presented as one.\n\nThe panel states plainly that this is an observation about venues, not an arbitrage claim. Execution and depth at size are not modelled.",
    shortAnswer:
      "A reported spread between two same-type sources that disagree by more than the tolerance for the shallower venue. It is an observation about venues, not an arbitrage claim.",
    followups: ["pricing.canonical_price", "pricing.liquidity_basis", "pricing.price_types"],
    routes: ["/assets"],
  },

  {
    id: "pricing.observation_quality",
    domain: "pricing",
    title: "Observation quality",
    patterns: [
      "what is observation quality",
      "observation quality",
      "what does the quality number mean",
      "is that a confidence score",
      "how is observation quality calculated",
      "why is it not called confidence",
      "what does 0.62 mean on the market panel",
    ],
    keywords: ["quality", "confidence", "score", "depth", "recency", "authority"],
    answer:
      "Observation quality is how well a price observation is supported by depth and how recent it is. It runs from zero to one and appears on the market panel beside the price.\n\nIt is deliberately not called confidence. Confidence reads as a prediction, and this is not one - it says nothing about where a price is going.\n\nIt is derived from evidence rather than from a model: the depth behind the quote, which dominates, then the age of the observation, then the authority of its price type. Nothing in it is tuned to make a number look good.\n\nA quote against a deep reserve is worth far more than the same quote against a shallow one. That is why depth carries the largest weight, and why a liquidity figure travels with every observation that has one.",
    shortAnswer:
      "A zero-to-one measure of how well an observation is supported by depth and recency. It is not a prediction and is deliberately not labelled confidence.",
    followups: ["pricing.canonical_price", "pricing.liquidity_basis", "pricing.dex_spot"],
    routes: ["/assets"],
  },

  {
    id: "pricing.liquidity_basis",
    domain: "pricing",
    title: "Liquidity basis",
    patterns: [
      "what is liquidity basis",
      "pair reserve vs total reserve",
      "what does total reserve mean",
      "what does pair reserve mean",
      "why does the liquidity label change",
      "is that the pool depth",
      "why is it not just called liquidity",
      "explain the reserve figure",
    ],
    keywords: ["liquidity", "reserve", "basis", "pair", "depth", "pool"],
    answer:
      "A liquidity figure is meaningless without saying what it counts, so the basis travels with the value and the label follows the basis.\n\nPAIR RESERVE is the reserve held by the single pair that produced the quote. That is the depth behind this price.\n\nTOTAL RESERVE is the token's reserve summed across every pool the provider knows about. It is an upper bound on what could be traded against, not the depth behind this one quote. Calling it pool reserve would be a different and wrong claim.\n\nWhere a basis was recorded, the panel prints its label and a note explaining which of the two it is, so the number cannot be read as the other one. Where a provider stated no basis, the figure appears under the bare heading RESERVE and carries no note, which is the limit of what that observation supports rather than a third kind of measurement.",
    shortAnswer:
      "What a liquidity number actually counts: the reserve of the single pair that produced the quote, or the token's reserve across every pool a provider knows. The label says which, wherever the provider stated it.",
    followups: ["pricing.dex_spot", "pricing.observation_quality", "pricing.source_divergence"],
    routes: ["/assets"],
  },

  {
    id: "pricing.no_price_yet",
    domain: "pricing",
    title: "When there is no price",
    patterns: [
      "why is there no price for this asset",
      "why does it say market price unavailable",
      "no price shown",
      "why is the onchain chart empty",
      "why is the price blank",
      "what does data unavailable mean on the price panel",
      "will a price appear later",
      "why no market price",
    ],
    keywords: ["unavailable", "empty", "missing", "price", "blank", "nothing"],
    answer:
      "When no venue has been observed quoting a contract on this chain, the price slot holds an em dash and a pending label such as AWAITING VENUE DATA rather than a number. The machine state stays UNAVAILABLE, and every internal decision reads that state rather than the reader-facing wording.\n\nNothing is estimated, carried forward or interpolated to fill the gap. A price appears the moment one is observed, and not before.\n\nThe reference chart is unaffected by this, because it is served by TradingView and does not depend on FOLDMARK's pipeline. A working reference chart beside an on-chain panel with no price is the correct picture, not an inconsistency: the charted instrument's own market is trading and no quote for this contract has been observed.\n\nUNAVAILABLE is not a measurement of zero activity. It means no trustworthy source answered, which is a different claim from having looked and found nothing.",
    shortAnswer:
      "The state is UNAVAILABLE and nothing is shown in place of a number. A price appears when one is observed; nothing is estimated in the meantime.",
    followups: ["data.states", "data.empty_vs_indexing", "pricing.reference_vs_onchain", "pricing.dex_spot"],
    actions: [{ label: "OPEN METHODOLOGY", href: "/methodology" }],
    routes: ["/assets"],
  },
];
