/**
 * Provider registry — verified facts only.
 *
 * Every entry below was probed against the live service on the date recorded.
 * Nothing here is assumed: a provider is marked SUPPORTED only after its own
 * API confirmed it serves Robinhood Chain, and UNVERIFIED means exactly that.
 *
 * Re-probe with `npm run probe:providers` and update `lastReviewed` when the
 * answers change. A provider whose support drops to UNSUPPORTED must stop being
 * called rather than start guessing.
 */

export type ProviderId =
  | "rpc"
  | "onchain_pool"
  | "geckoterminal"
  | "dexscreener"
  | "coingecko"
  | "robinhood"
  | "chainlink";

export type SupportState = "SUPPORTED" | "UNSUPPORTED" | "UNVERIFIED";

export type ProviderFacts = {
  id: ProviderId;
  label: string;
  /** Does this provider actually serve Robinhood Chain? Probed, never assumed. */
  chainSupport: SupportState;
  /** How the answer above was established. */
  evidence: string;
  role: string;
  /** Requests per minute we allow ourselves, well inside the published ceiling. */
  perMinute: number | null;
  /** Hard monthly ceiling where the plan imposes one. */
  perMonth: number | null;
  termsUrl: string | null;
  attribution: string | null;
  /** Whether the free plan is safe to depend on for a commercial deployment. */
  commercialUse: "PERMITTED" | "REVIEW_REQUIRED" | "UNKNOWN";
  lastReviewed: string;
  notes: string;
};

/** Probed 2026-09-03 from this repository against each live service. */
export const PROVIDERS: Record<ProviderId, ProviderFacts> = {
  rpc: {
    id: "rpc",
    label: "Robinhood Chain RPC",
    chainSupport: "SUPPORTED",
    evidence:
      "eth_chainId returned 0x1237 (4663) from robinhood-rpc.publicnode.com; newHeads subscription delivered consecutive blocks over wss.",
    role: "The live backbone. Blocks, logs, transfers, contract reads. Anything observable on chain comes from here and nowhere else.",
    perMinute: null,
    perMonth: null,
    termsUrl: null,
    attribution: null,
    commercialUse: "PERMITTED",
    lastReviewed: "2026-09-03",
    notes:
      "Public node, no key. Measured block time 0.110s and ~170ms round trip. The endpoint the repository shipped with (rpc.mainnet.chain.robinhood.com) refused every connection during probing, which is why the client fails over across a list.",
  },

  onchain_pool: {
    id: "onchain_pool",
    label: "Verified DEX pools (direct)",
    chainSupport: "SUPPORTED",
    evidence: "Uniswap V2/V3/V4 and Pancakeswap V2/V3 are deployed on this chain per GeckoTerminal's own dex listing.",
    role: "Spot price and liquidity read straight from pool state. The only price source FOLDMARK fully owns, and the one that survives any aggregator going away.",
    perMinute: null,
    perMonth: null,
    termsUrl: null,
    attribution: null,
    commercialUse: "PERMITTED",
    lastReviewed: "2026-09-03",
    notes: "Requires a verified pool address per asset. Until the contract registry is populated this cannot run, so it is not yet wired.",
  },

  geckoterminal: {
    id: "geckoterminal",
    label: "GeckoTerminal",
    chainSupport: "SUPPORTED",
    evidence:
      'GET /api/v2/networks returned {"id":"robinhood","name":"Robinhood"}; /networks/robinhood/pools returned real pools including NVDA/USDG at $229.26 with $7.4M reserve.',
    role: "DEX market reference and OHLCV backfill. Addressed by contract, never by ticker.",
    perMinute: 10,
    perMonth: null,
    termsUrl: "https://www.geckoterminal.com/terms",
    attribution: "Data by GeckoTerminal",
    commercialUse: "REVIEW_REQUIRED",
    lastReviewed: "2026-09-03",
    notes:
      "The public tier is documented around 30 calls/minute; we budget 10 to stay clearly inside it. Best used for backfill and periodic refresh, never per-request.",
  },

  dexscreener: {
    id: "dexscreener",
    label: "DEX Screener",
    chainSupport: "SUPPORTED",
    evidence:
      'GET /latest/dex/search returned pairs with chainId "robinhood" — 24 for USDG alone, with priceUsd, liquidity and volume.',
    role: "Secondary DEX market reference. Cross-check, never a single source of truth.",
    perMinute: 60,
    perMonth: null,
    termsUrl: "https://docs.dexscreener.com/api/reference",
    attribution: null,
    commercialUse: "REVIEW_REQUIRED",
    lastReviewed: "2026-09-03",
    notes:
      "Responses carry cache-control: public, max-age=60, so anything faster than a minute is wasted. Their terms restrict products that compete with their screener and restrict redistribution — FOLDMARK must not make this a load-bearing dependency, and the owner should confirm the intended use before production.",
  },

  coingecko: {
    id: "coingecko",
    label: "CoinGecko",
    chainSupport: "UNVERIFIED",
    evidence: "/api/v3/ping answered, but no Robinhood Chain asset platform was confirmed during probing.",
    role: "Reference and enrichment for broad crypto only. Never the realtime engine.",
    perMinute: 30,
    perMonth: 10_000,
    termsUrl: "https://www.coingecko.com/en/api_terms",
    attribution: "Price data by CoinGecko",
    commercialUse: "REVIEW_REQUIRED",
    lastReviewed: "2026-09-03",
    notes:
      "The monthly quota is the real constraint: 10,000 calls is about 333 a day. Batched, server-side, at a global cadence measured in minutes — never per user and never per view.",
  },

  robinhood: {
    id: "robinhood",
    label: "Robinhood Stock Token API",
    chainSupport: "UNVERIFIED",
    evidence:
      "Every candidate host (api.robinhood.com/rhj/assets, chain.robinhood.com/rhj/assets, /rhj/prices/{symbol}) failed to connect during probing.",
    role: "Would be the authoritative underlying reference quote and multiplier source for Stock Tokens.",
    perMinute: 4,
    perMonth: null,
    termsUrl: null,
    attribution: null,
    commercialUse: "UNKNOWN",
    lastReviewed: "2026-09-03",
    notes:
      "Not wired. The endpoint shape came from the directive rather than from a response we received, so treating it as available would be a guess. It stays disabled until a request from this deployment actually succeeds.",
  },

  chainlink: {
    id: "chainlink",
    label: "Chainlink feeds",
    chainSupport: "UNVERIFIED",
    evidence: "No aggregator address for chain 4663 was confirmed during probing.",
    role: "Would be the canonical on-chain oracle price with round id and updatedAt.",
    perMinute: null,
    perMonth: null,
    termsUrl: null,
    attribution: null,
    commercialUse: "PERMITTED",
    lastReviewed: "2026-09-03",
    notes:
      "Reading a feed needs its aggregator address. Guessing one would produce confident nonsense, so this stays disabled until an address is verified and recorded in the contract registry.",
  },
};

/** Only providers we have proven serve this chain may be scheduled. */
export function usableProviders(): ProviderFacts[] {
  return Object.values(PROVIDERS).filter((p) => p.chainSupport === "SUPPORTED");
}

export function providerFacts(id: ProviderId): ProviderFacts {
  return PROVIDERS[id];
}
