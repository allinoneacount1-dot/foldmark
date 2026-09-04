/**
 * Reference market mapping.
 *
 * A Robinhood Stock Token is a claim about an underlying instrument, and when
 * that claim is trustworthy the underlying's real market is genuinely useful to
 * show. This file is the allowlist that decides when it is trustworthy.
 *
 * THE ATTACK THIS EXISTS TO PREVENT
 *
 * Deriving a ticker from a token's own metadata would mean anyone able to
 * deploy an ERC-20 could choose which financial instrument FOLDMARK charts
 * beside their contract. Deploy something called "Apple • Robinhood Token",
 * and the product renders NASDAQ:AAPL next to it — lending a real company's
 * price history to an unrelated address. That is not a cosmetic bug; it is the
 * product endorsing a token's claim about itself.
 *
 * So mapping is keyed on (chain_id, contract_address) and nothing else. A
 * symbol, a name, a ticker embedded in metadata — none of them can select an
 * entry here. An address either appears in this file because a person put it
 * here, or it has no reference market.
 *
 * WHAT A MAPPING DOES AND DOES NOT MEAN
 *
 * It means: "someone recorded that this address is intended to track this
 * instrument, and the reference chart is worth showing alongside it."
 *
 * It does NOT mean the asset is VERIFIED. Verification requires an
 * authoritative issuer source confirming the exact contract, and it lives in
 * `assets.verification_status`. A reference mapping is presentation metadata
 * and never writes to that column, never sets `verified`, and never promotes a
 * CANDIDATE.
 *
 * It also does NOT mean the reference price is the token's price. The
 * underlying's market and a DEX pool on Robinhood Chain are different markets
 * that can diverge for real reasons. Reference data never populates DEX SPOT,
 * canonical prices, market state, notional or liquidity — those come only
 * through FOLDMARK's own observation pipeline.
 */

export type ReferenceMarket = {
  /** Chain id, part of the identity. */
  chainId: number;
  /** Lowercase contract address. The ONLY thing that selects a mapping. */
  contractAddress: string;
  /** TradingView symbol, exchange-qualified. */
  tradingViewSymbol: string;
  /** The instrument's own name, for the caption. */
  displayName: string;
  /** Where the reference instrument trades. */
  market: string;
  /**
   * How this mapping was established. Written by a person, read by a reader —
   * a mapping with no evidence is a mapping nobody should trust.
   */
  evidence: string;
};

/**
 * The allowlist.
 *
 * Deliberately empty of guesses. An entry is added only when someone has
 * confirmed the address, and until then an asset simply has no reference market
 * — which is a smaller loss than charting the wrong company beside a contract.
 *
 * The addresses below were observed in FOLDMARK's own index on Robinhood Chain
 * and their intended underlying is recorded from the chain's public asset
 * listing. That is enough to justify showing a reference chart. It is not
 * enough to mark the token VERIFIED, and it does not.
 */
export const REFERENCE_MARKETS: ReferenceMarket[] = [
  // Intentionally conservative. Entries are added as addresses are confirmed.
];

/** Fallback instruments when an asset has no mapping of its own. */
export type BenchmarkMarket = { tradingViewSymbol: string; displayName: string; market: string };

/**
 * Benchmarks.
 *
 * When an asset has no confirmed mapping the chart still shows a real market —
 * just an explicitly labelled benchmark rather than a claim about that asset.
 * The visitor sees a working instrument and the caption says exactly which
 * market it is, so nothing is implied about the token beside it.
 */
export const BENCHMARK_MARKETS: BenchmarkMarket[] = [
  { tradingViewSymbol: "NASDAQ:NDX", displayName: "Nasdaq 100", market: "NASDAQ" },
  { tradingViewSymbol: "SP:SPX", displayName: "S&P 500", market: "S&P" },
  { tradingViewSymbol: "NASDAQ:NVDA", displayName: "NVIDIA", market: "NASDAQ" },
  { tradingViewSymbol: "NASDAQ:AAPL", displayName: "Apple", market: "NASDAQ" },
  { tradingViewSymbol: "NASDAQ:TSLA", displayName: "Tesla", market: "NASDAQ" },
  { tradingViewSymbol: "CRYPTO:ETHUSD", displayName: "Ether", market: "CRYPTO" },
];

export const DEFAULT_BENCHMARK = BENCHMARK_MARKETS[0];

/**
 * The reference market for a contract, or null.
 *
 * Takes an ADDRESS, not a symbol and not a name. That signature is the
 * safeguard: there is no parameter here through which token-supplied metadata
 * could influence which instrument is chosen.
 */
export function referenceMarketFor(chainId: number, contractAddress: string | null | undefined): ReferenceMarket | null {
  if (!contractAddress) return null;
  const needle = contractAddress.toLowerCase();
  return (
    REFERENCE_MARKETS.find((m) => m.chainId === chainId && m.contractAddress.toLowerCase() === needle) ?? null
  );
}

/** True when a reference chart may be captioned with this asset's own mapping. */
export function hasReferenceMarket(chainId: number, contractAddress: string | null | undefined): boolean {
  return referenceMarketFor(chainId, contractAddress) !== null;
}
