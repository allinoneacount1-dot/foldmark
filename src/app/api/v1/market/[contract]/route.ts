import { NextResponse } from "next/server";
import { getMarketSnapshot, requiredAttribution } from "@/server/market-data";
import { getAssetByAddress } from "@/lib/queries";
import { isAddress } from "@/lib/format";
import { CHAIN } from "@/config/site";
import { LIQUIDITY_BASIS_LABEL, LIQUIDITY_BASIS_NOTE } from "@/server/market-data/types";

export const dynamic = "force-dynamic";

/**
 * Market state for one contract, with every source that informed it.
 *
 * The response carries the disagreement rather than hiding it: a canonical
 * price, the observations behind it, and a divergence block when sources are
 * further apart than their depth justifies.
 */
export async function GET(_: Request, { params }: { params: Promise<{ contract: string }> }) {
  const { contract } = await params;

  if (!isAddress(contract)) {
    return NextResponse.json(
      { error: "INVALID_ADDRESS", contract, reason: "An asset is addressed by contract, never by ticker." },
      { status: 400 },
    );
  }

  const [asset, snapshot] = await Promise.all([getAssetByAddress(contract), getMarketSnapshot(contract)]);

  if (!snapshot || !snapshot.canonical) {
    return NextResponse.json({
      contract: contract.toLowerCase(),
      chain_id: CHAIN.id,
      asset: asset ? { symbol: asset.symbol, name: asset.name, decimals: asset.decimals } : null,
      price: { state: "DATA UNAVAILABLE", reason: "No source returned a usable quote for this contract" },
      observations: [],
      attribution: requiredAttribution(),
      updated_at: new Date().toISOString(),
      methodology: snapshot?.methodology ?? "No market source is wired for this contract.",
    });
  }

  const c = snapshot.canonical;
  return NextResponse.json({
    contract: snapshot.contractAddress,
    chain_id: snapshot.chainId,
    asset: asset ? { symbol: asset.symbol, name: asset.name, decimals: asset.decimals } : null,
    price: {
      value: c.price,
      currency: c.currency,
      /**
       * What this number is. DEX_SPOT is the last trade price at one venue, not
       * a consolidated market price and not a settlement or reference rate.
       */
      price_type: c.priceType,
      source: c.source,
      /** The venue that printed it, so the quote can be traced to a market. */
      venue: c.dexId,
      pair_address: c.pairAddress,
      /**
       * Three distinct times. observed_at is when the market was true,
       * fetched_at is when our call completed, persisted_at is when a row was
       * written. Collapsing them is how a product invents history.
       */
      observed_at: c.observedAt,
      fetched_at: c.fetchedAt,
      provider_timestamp: c.providerTimestamp,
      persisted_at: null,
      cache_state: c.cacheState,
      freshness: c.freshness,
      freshness_ms: Date.now() - new Date(c.observedAt).getTime(),
      liquidity_usd: c.liquidityUsd,
      liquidity_basis: c.liquidityBasis,
      liquidity_label: c.liquidityBasis ? LIQUIDITY_BASIS_LABEL[c.liquidityBasis] : null,
      liquidity_note: c.liquidityBasis ? LIQUIDITY_BASIS_NOTE[c.liquidityBasis] : null,
      /**
       * Observation quality from depth and age. It is NOT a prediction, a
       * probability, or a score of how likely the price is to hold.
       */
      observation_quality: c.confidence,
    },
    observations: snapshot.observations.map((o) => ({
      price: o.price,
      price_type: o.priceType,
      source: o.source,
      venue: o.dexId,
      pair_address: o.pairAddress,
      liquidity_usd: o.liquidityUsd,
      liquidity_basis: o.liquidityBasis,
      liquidity_label: o.liquidityBasis ? LIQUIDITY_BASIS_LABEL[o.liquidityBasis] : null,
      observation_quality: o.confidence,
      freshness: o.freshness,
      observed_at: o.observedAt,
      fetched_at: o.fetchedAt,
      cache_state: o.cacheState,
    })),
    /** How to read the fields above, so a consumer cannot mistake one for another. */
    field_semantics: {
      price_type:
        "DEX_SPOT is the last price printed at one venue. It is not a consolidated market price, a settlement price, or a reference rate.",
      observation_quality:
        "0..1, derived from observed depth and the age of the quote. It describes how well the observation is supported, not how likely the price is to hold. Nothing here predicts.",
      liquidity_basis:
        "PAIR_RESERVE is the reserve of the pair that produced the quote. TOKEN_TOTAL_RESERVE is the token's reserve across every pool the provider knows about, which is an upper bound and not the depth behind this quote.",
      times:
        "observed_at is when the market was true; fetched_at is when our network call completed; persisted_at is when a row was written, and is null on a read because a read does not write history.",
      cache_state:
        "MISS and REFRESHED mean a network call happened. FRESH, COALESCED and STALE_WHILE_REVALIDATE mean this value was already held — such a value is served but never recorded as a new observation.",
    },
    divergence: snapshot.divergence
      ? {
          spread_pct: snapshot.divergence.spreadPct,
          highest: { price: snapshot.divergence.highest.price, source: snapshot.divergence.highest.source },
          lowest: { price: snapshot.divergence.lowest.price, source: snapshot.divergence.lowest.source },
          note: "A spread between venues is an observation, not an arbitrage claim. Execution and depth are not modelled.",
        }
      : null,
    attribution: requiredAttribution(),
    updated_at: new Date().toISOString(),
    methodology: snapshot.methodology,
  });
}
