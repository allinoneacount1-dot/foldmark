import type { Entry } from "@/lib/intelligence/types";

/**
 * Market vocabulary.
 *
 * These belong to the `pricing` domain and are kept in their own file because
 * they arrived with DEX enrichment. They are canonical definitions: the meaning
 * of DEX_SPOT, of liquidity, of a pool, and of the several distinctions the
 * product refuses to blur. A reasoning layer may reason over them; it may not
 * replace them.
 */
export const MARKET_ENTRIES: Entry[] = [
  {
    id: "pricing.dex_spot_definition",
    domain: "pricing",
    title: "What DEX_SPOT means",
    patterns: [
      "what is dex_spot",
      "what is dex spot",
      "dex spot price",
      "what does dex_spot mean",
      "explain dex spot",
      "what is the onchain price",
      "where does the dex price come from",
    ],
    keywords: ["dex_spot", "spot", "onchain", "price", "pool"],
    entities: ["DEX_SPOT", "ONCHAIN"],
    answer:
      "DEX_SPOT is a price observed in a specific liquidity pool on this chain. It is the rate at which that one pool was trading the asset when the observation was taken.\n\nIt is tied to a pool, not to the asset in the abstract. Two pools holding the same contract can quote different prices at the same moment, and FOLDMARK reports them separately rather than reconciling them into a single number.\n\nA DEX_SPOT figure always carries the pool it came from, the venue, and the time it was read. A price without those is not a measurement, it is a rumour.",
    shortAnswer:
      "A price observed in one specific pool on this chain, carrying the pool, venue and observation time.",
    detail:
      "FOLDMARK stores four price kinds and never collapses them: DEX_SPOT is a venue-specific on-chain market, ORACLE is an oracle observation, REFERENCE is an external instrument shown for context, and AGGREGATED would combine sources under a stated method. Only DEX_SPOT is produced by market enrichment. Reference data never populates it.",
    followups: ["pricing.pool_definition", "pricing.multiple_prices", "pricing.tradingview_separation"],
    actions: [{ label: "OPEN ASSETS", href: "/assets" }],
  },
  {
    id: "pricing.pool_definition",
    domain: "pricing",
    title: "What a pool is",
    patterns: [
      "what is a pool",
      "what is a liquidity pool",
      "explain pools",
      "what does pool mean",
      "what is a dex pool",
    ],
    keywords: ["pool", "liquidity", "venue", "amm"],
    answer:
      "A pool is a contract holding reserves of two assets and quoting a price between them. Trades happen against those reserves rather than against another person's order.\n\nA pool has its own address, which is what makes it identifiable. FOLDMARK records that address, and where a pool address appears in observed transfers the topology draws it as a venue rather than as an anonymous address.\n\nThat identification is evidence-driven. A pool is a venue because a market provider reported it holding this exact contract, not because it looked busy.",
    shortAnswer: "A contract holding reserves of two assets and quoting a price between them.",
    followups: ["pricing.pair_definition", "pricing.dex_spot_definition", "fabric.nodes"],
  },
  {
    id: "pricing.pair_definition",
    domain: "pricing",
    title: "What a market pair is",
    patterns: [
      "what is a pair",
      "what is a market pair",
      "what does pair mean",
      "what is base and quote",
      "base token vs quote token",
    ],
    keywords: ["pair", "base", "quote", "market"],
    answer:
      "A pair is the two assets a pool trades between, written base first: SPY / WETH means SPY priced in WETH.\n\nWhich side an asset sits on matters. In SPY / WETH, SPY is the base. In ICOIN / AAPL, AAPL is the quote. A price field labelled for the base side is the base token's price, so reading it for an asset that happens to be the quote would report a completely different token's value.\n\nFOLDMARK resolves the side by matching contract addresses, and records which side an asset was on in each pool.",
    shortAnswer:
      "The two assets a pool trades between, base first. Which side an asset is on decides which price belongs to it.",
    followups: ["pricing.pool_definition", "pricing.dex_spot_definition", "assets.identity"],
  },
  {
    id: "pricing.liquidity_definition",
    domain: "pricing",
    title: "What liquidity means here",
    patterns: [
      "what is liquidity",
      "what does liquidity mean",
      "explain liquidity",
      "what is reserve",
      "how liquid is it",
    ],
    keywords: ["liquidity", "reserve", "depth", "tvl"],
    answer:
      "Liquidity is the value held in a pool's reserves. It describes how much can move through that market before the price shifts materially.\n\nIt is a property of one pool. FOLDMARK does not add liquidity across pools into a single total: depth in one market does not make another market deep, and a sum would imply a pot of capital that does not exist as one pot.\n\nLiquidity is not volume, and neither is market capitalisation. They answer different questions and are reported separately.",
    shortAnswer: "The value held in one pool's reserves. Reported per pool, never summed across them.",
    followups: ["pricing.liquidity_pair_specific", "pricing.volume_definition", "pricing.primary_market"],
  },
  {
    id: "pricing.liquidity_pair_specific",
    domain: "pricing",
    title: "Why liquidity is pair-specific",
    patterns: [
      "why is liquidity pair specific",
      "why not total liquidity",
      "why dont you sum liquidity",
      "why is liquidity per pool",
    ],
    keywords: ["liquidity", "pair", "sum", "total"],
    answer:
      "Because a trade executes against one pool's reserves, not against every pool at once. A trader who can move a certain size in a deep pool cannot necessarily move it in a shallow one, even for the same asset.\n\nAdding the two together would produce a figure that describes no market a person can actually trade in, and would make a thinly traded asset look deep because it is listed in many places.\n\nFOLDMARK lists each market with its own depth. If a combined figure is ever added, it will state the method that produced it.",
    shortAnswer:
      "A trade executes against one pool, so summing pools describes a market nobody can trade in.",
    followups: ["pricing.liquidity_definition", "pricing.primary_market"],
  },
  {
    id: "pricing.volume_definition",
    domain: "pricing",
    title: "What trading volume is, and is not",
    patterns: [
      "what is volume",
      "what is trading volume",
      "what is 24h volume",
      "is volume the same as inflow",
      "does volume mean capital coming in",
    ],
    keywords: ["volume", "24h", "trading", "inflow"],
    answer:
      "Volume is the value traded through a market over a window, here twenty-four hours as the provider reports it.\n\nVolume is not capital inflow. The same funds trading back and forth produce volume without any net capital entering the asset, so a high figure describes activity rather than accumulation.\n\nFOLDMARK keeps volume out of its capital-flow figures for that reason. Flows are built from observed transfers and their direction; volume is provider-reported market activity shown beside them.",
    shortAnswer:
      "Value traded through a market over a window. It measures activity, not capital entering the asset.",
    followups: ["pricing.liquidity_definition", "flows.what_is", "pricing.dex_spot_definition"],
  },
  {
    id: "pricing.multiple_prices",
    domain: "pricing",
    title: "Why one asset has several prices",
    patterns: [
      "why does an asset have multiple prices",
      "why are there different prices",
      "why do pools show different prices",
      "which price is correct",
      "why is the price different in each pool",
    ],
    keywords: ["multiple", "prices", "different", "pools"],
    entities: ["DEX_SPOT"],
    answer:
      "Because each pool is its own market. Pools hold different reserves, see different trades, and drift apart until someone arbitrages the gap. Two pools quoting the same contract at slightly different prices is normal, not an error.\n\nFOLDMARK shows each one rather than picking a number and hiding the rest. Reconciling them into a single figure would conceal exactly the structure the product exists to make visible.\n\nWhere one price is featured, it is a named selection from a named pool, not a blend.",
    shortAnswer:
      "Each pool is a separate market with its own reserves and trades, so prices differ. FOLDMARK shows each.",
    followups: ["pricing.primary_market", "pricing.dex_spot_definition", "pricing.liquidity_definition"],
  },
  {
    id: "pricing.primary_market",
    domain: "pricing",
    title: "What the featured market is",
    patterns: [
      "what is the primary market",
      "which market is featured",
      "how do you pick the price",
      "what is the main pool",
      "how is the featured price chosen",
    ],
    keywords: ["primary", "featured", "selection", "deepest"],
    answer:
      "When FOLDMARK shows one price for an asset, it is the price from the deepest pool holding that exact contract.\n\nDepth is the tiebreak because a price backed by more reserves is harder to move and is the one a reader is best served by. The choice is deterministic: the same set of pools always features the same market.\n\nThis is a selection, never an average. Averaging prices across venues produces a number no market ever traded at, and attributing it to the asset would be inventing a quote.",
    shortAnswer:
      "The price from the deepest pool holding that exact contract. A selection, never an average.",
    detail:
      "The methodology is stated on the enrichment status endpoint so it can be checked rather than assumed. If a future version combines venues, it will be labelled AGGREGATED and carry its method, because a combined figure is a different kind of claim from an observed one.",
    followups: ["pricing.multiple_prices", "pricing.liquidity_definition", "pricing.dex_spot_definition"],
  },
  {
    id: "pricing.tradingview_separation",
    domain: "pricing",
    title: "Why the reference chart and the DEX price never mix",
    patterns: [
      "why dont you mix tradingview and dex price",
      "is tradingview the dex price",
      "why is the chart different from the price",
      "why are reference and onchain separate",
      "does the chart show the token price",
    ],
    keywords: ["tradingview", "reference", "chart", "separate", "onchain"],
    entities: ["TRADINGVIEW", "REFERENCE", "DEX_SPOT"],
    answer:
      "They measure different markets. The reference chart shows an external instrument for context; DEX_SPOT is a price observed in a pool on this chain. The two can diverge for real reasons, and that divergence is information.\n\nMixing them would destroy it. A reference price presented as an on-chain price would tell a reader the token traded somewhere it did not, at a level it may never have reached here.\n\nSo reference data never populates DEX_SPOT, canonical prices, notional or liquidity. The separation is enforced in code and covered by tests, not left to discipline.",
    shortAnswer:
      "They are different markets that can genuinely diverge. Reference data never feeds an on-chain price field.",
    followups: ["pricing.dex_spot_definition", "pricing.reference_market", "pricing.tradingview"],
  },
  {
    id: "pricing.listing_not_verification",
    domain: "pricing",
    title: "Why a market listing is not verification",
    patterns: [
      "does a market listing mean verified",
      "why isnt a listed token verified",
      "does geckoterminal listing mean verified",
      "is a listed asset verified",
      "why doesnt a dex listing verify the contract",
    ],
    keywords: ["listing", "verified", "verification", "market", "provider"],
    answer:
      "A market listing says a pool exists holding this contract. It says nothing about what the contract is.\n\nVerification is a claim about identity: that an authoritative issuer confirmed this exact address on this exact chain. A venue quoting a token has not made that claim and is not positioned to.\n\nFOLDMARK previously granted VERIFIED on the strength of an aggregator recognising a contract. That was wrong, it was withdrawn from every asset it had been applied to, and enrichment now writes verified as false on everything it records.",
    shortAnswer:
      "A listing proves a pool exists, not what the contract is. Verification needs an issuer confirming the exact address.",
    followups: ["protocols.verified", "methodology.evidence_ladder", "methodology.unknown_stays_unknown"],
    actions: [{ label: "OPEN PROTOCOLS", href: "/protocols" }],
  },
  {
    id: "pricing.stale_market",
    domain: "pricing",
    title: "What STALE market data means",
    patterns: [
      "what does stale mean",
      "what is stale market data",
      "why does it say stale",
      "is stale data wrong",
    ],
    keywords: ["stale", "freshness", "old", "observed"],
    entities: ["STALE"],
    answer:
      "STALE means the last observation was real but is older than the freshness budget for this kind of data.\n\nIt is shown rather than hidden, with the time it was actually taken. A previous valid observation is more useful than a blank, and far more useful than a fresh-looking number that was quietly carried forward.\n\nWhat FOLDMARK will not do is relabel it. Stale data is never presented as current, and a provider outage never causes a stored observation to be deleted or replaced with an estimate.",
    shortAnswer:
      "The observation was real but is older than the freshness budget. Shown with its true timestamp, never relabelled as current.",
    followups: ["data.states", "data.freshness", "pricing.dex_spot_definition"],
  },
  {
    id: "pricing.no_market",
    domain: "pricing",
    title: "What NO MARKET means",
    patterns: [
      "what does no market mean",
      "why is there no market",
      "why no dex market for this asset",
      "what if an asset has no pool",
    ],
    keywords: ["no market", "none", "unsupported", "coverage"],
    answer:
      "NO MARKET means the provider was asked for pools holding this exact contract and reported none.\n\nThat is an answer about the address, not about the ticker. A token with a familiar symbol can still have no market here, and FOLDMARK will not borrow a market from a different contract that shares the name.\n\nIt is also different from not having asked. An asset nobody has checked shows nothing at all rather than claiming an absence it has not established.",
    shortAnswer:
      "The provider was asked about this exact contract and reported no pools. Different from not having asked.",
    followups: ["pricing.market_coverage", "assets.identity", "methodology.unknown_stays_unknown"],
  },
  {
    id: "pricing.market_coverage",
    domain: "pricing",
    title: "What market coverage means",
    patterns: [
      "what is market coverage",
      "how many assets have markets",
      "what does coverage mean for markets",
      "do all assets have prices",
    ],
    keywords: ["coverage", "markets", "how many", "partial"],
    answer:
      "Market coverage is how many of FOLDMARK's observed assets a provider actually has markets for. It is never assumed to be all of them.\n\nThe count separates three states: assets with markets, assets the provider reported no market for, and assets nobody has checked yet. Collapsing those would turn an unasked question into a negative finding.\n\nMarket coverage is also separate from chain coverage. The index following the head is one claim; a provider knowing about a pool is another, and they are reported independently.",
    shortAnswer:
      "How many observed assets a provider has markets for, split from those checked and found empty and those not yet checked.",
    followups: ["pricing.no_market", "data.coverage", "data.states"],
  },
];
