import type { MarketPrice } from "@/server/market-data/types";
import type { CacheState } from "@/server/market-data/cache";
import type { TransferRow, AssetRow } from "@/lib/queries";

/**
 * Fixtures.
 *
 * The provider responses below are trimmed copies of real answers recorded from
 * the live services during provider probing, not invented shapes. A fixture
 * that does not match reality tests the fixture.
 */

export const NVDA = "0x1111111111111111111111111111111111111111";
export const AAPL = "0x2222222222222222222222222222222222222222";
export const USDG = "0x3333333333333333333333333333333333333333";

export const ASSETS: AssetRow[] = [
  {
    id: "asset-nvda",
    contract_address: NVDA,
    symbol: "NVDA",
    name: "NVIDIA",
    asset_type: "stock_token",
    verified: false,
    decimals: 18,
    source: "indexer",
  },
  {
    id: "asset-aapl",
    contract_address: AAPL,
    symbol: "AAPL",
    name: "Apple",
    asset_type: "stock_token",
    verified: false,
    decimals: 18,
    source: "indexer",
  },
  {
    id: "asset-usdg",
    contract_address: USDG,
    symbol: "USDG",
    name: "Global Dollar",
    asset_type: "stablecoin",
    verified: false,
    decimals: 6,
    source: "indexer",
  },
];

let seq = 0;

/** One ERC-20 Transfer row as the indexer writes it. */
export function transfer(opts: {
  assetId: string;
  from: string;
  to: string;
  /** Amount in base units, as a decimal string — how Postgres stores it. */
  amount: string;
  at?: string;
  block?: number;
}): TransferRow {
  seq += 1;
  return {
    tx_hash: `0x${String(seq).padStart(64, "0")}`,
    log_index: seq,
    block_number: opts.block ?? 1_000_000 + seq,
    asset_id: opts.assetId,
    from_address: opts.from,
    to_address: opts.to,
    amount: opts.amount,
    timestamp: opts.at ?? "2026-09-04T12:00:00.000Z",
  };
}

/** A market observation, with every field the persistence rules examine. */
export function observation(over: Partial<MarketPrice> = {}): MarketPrice {
  const fetchedAt = over.fetchedAt ?? "2026-09-04T12:00:00.000Z";
  return {
    assetId: null,
    contractAddress: NVDA,
    chainId: 4663,
    price: 229.26,
    currency: "USD",
    priceType: "DEX_SPOT",
    source: "geckoterminal",
    observedAt: fetchedAt,
    fetchedAt,
    providerTimestamp: null,
    cacheState: "MISS" as CacheState,
    blockNumber: null,
    pairAddress: "0xpair0000000000000000000000000000000000aa",
    dexId: "uniswap_v3",
    liquidityUsd: 7_400_000,
    liquidityBasis: "PAIR_RESERVE",
    confidence: 0.8,
    freshness: "LIVE",
    ...over,
  };
}

/**
 * GeckoTerminal multi-token response, trimmed from a real answer for the
 * Robinhood network. Note total_reserve_in_usd — the token's reserve across
 * every pool, not the pair's.
 */
export const GECKOTERMINAL_TOKENS = {
  data: [
    {
      id: `robinhood_${NVDA}`,
      type: "token",
      attributes: {
        address: NVDA,
        name: "NVIDIA",
        symbol: "NVDA",
        decimals: 18,
        price_usd: "229.26",
        total_reserve_in_usd: "7412880.55",
      },
    },
  ],
};

/** DEX Screener search response, trimmed from a real answer. */
export const DEXSCREENER_PAIRS = {
  pairs: [
    {
      chainId: "robinhood",
      dexId: "uniswap",
      pairAddress: "0xpair0000000000000000000000000000000000bb",
      baseToken: { address: NVDA, symbol: "NVDA" },
      quoteToken: { address: USDG, symbol: "USDG" },
      priceUsd: "229.41",
      liquidity: { usd: 1_204_551.2 },
      pairCreatedAt: 1_756_000_000_000,
    },
  ],
};
