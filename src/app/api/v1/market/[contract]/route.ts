import { NextResponse } from "next/server";
import { getMarketSnapshot, requiredAttribution } from "@/server/market-data";
import { getAssetByAddress } from "@/lib/queries";
import { isAddress } from "@/lib/format";
import { CHAIN } from "@/config/site";

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
      price_type: c.priceType,
      source: c.source,
      observed_at: c.observedAt,
      provider_timestamp: c.providerTimestamp,
      freshness: c.freshness,
      freshness_ms: Date.now() - new Date(c.observedAt).getTime(),
      liquidity_usd: c.liquidityUsd,
      confidence: c.confidence,
      pair_address: c.pairAddress,
    },
    observations: snapshot.observations.map((o) => ({
      price: o.price,
      price_type: o.priceType,
      source: o.source,
      liquidity_usd: o.liquidityUsd,
      confidence: o.confidence,
      freshness: o.freshness,
      observed_at: o.observedAt,
    })),
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
