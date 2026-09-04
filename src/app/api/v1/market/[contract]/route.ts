import { NextResponse } from "next/server";
import { getAssetByAddress } from "@/lib/queries";
import { restAssetMarket } from "@/server/db/rest-queries";
import { priceHistory } from "@/server/market/historical";
import { isAddress } from "@/lib/format";
import { CHAIN } from "@/config/site";

export const dynamic = "force-dynamic";

/**
 * Market state for one contract, from FOLDMARK's own observations.
 *
 * This route used to read a second, older market pipeline that has no coverage
 * on this chain. The result was an API that contradicted itself: /v1/assets
 * reported a DEX_SPOT price and a pool for a contract while /v1/market reported
 * that no source had returned a usable quote for the same contract in the same
 * second. Both cannot be true, and a consumer had no way to tell which to
 * believe. There is now one pipeline — the persisted enrichment observations —
 * and both endpoints read it.
 *
 * The three answers stay distinct, because collapsing them is how absence gets
 * manufactured:
 *
 *   UNCHECKED  nobody has asked the provider about this contract yet.
 *   NO_MARKET  the provider was asked about this EXACT contract and had none.
 *   MATCHED    pools holding this exact contract were returned.
 *
 * "We have not looked" is not "there is nothing there".
 */
export async function GET(_: Request, { params }: { params: Promise<{ contract: string }> }) {
  const { contract } = await params;

  if (!isAddress(contract)) {
    return NextResponse.json(
      { error: "INVALID_ADDRESS", contract, reason: "An asset is addressed by contract, never by ticker." },
      { status: 400 },
    );
  }

  const asset = await getAssetByAddress(contract);
  const assetBlock = asset ? { symbol: asset.symbol, name: asset.name, decimals: asset.decimals } : null;

  /**
   * An unindexed contract has no market state of ours to report, and saying
   * "no market" about it would be a claim we never tested.
   */
  if (!asset) {
    return NextResponse.json({
      contract: contract.toLowerCase(),
      chain_id: CHAIN.id,
      asset: null,
      market_status: "UNCHECKED",
      reason: "This contract is not in FOLDMARK's asset registry, so no market lookup has been performed for it.",
      price: null,
      markets: [],
      observations: 0,
      attribution: [],
      updated_at: new Date().toISOString(),
    });
  }

  const [market, history] = await Promise.all([restAssetMarket(asset.id), priceHistory(asset.id, 1)]);

  const base = {
    contract: asset.contract_address,
    chain_id: CHAIN.id,
    asset: assetBlock,
    /**
     * Stated on every response. A market listing is a venue quoting an address;
     * it is not an issuer confirming what that address is, and the two are
     * routinely confused into a verification badge.
     */
    verified: asset.verified,
    verification_note:
      "A listed market means a venue quotes this contract. It is not verification: that needs an authoritative issuer source confirming this exact contract on this exact chain.",
    attribution: market.provider ? [`Data by ${market.provider}`] : [],
    updated_at: new Date().toISOString(),
  };

  if (market.status !== "MATCHED" || !market.primary) {
    return NextResponse.json({
      ...base,
      market_status: market.status === "NO_MATCH" ? "NO_MARKET" : "UNCHECKED",
      reason:
        market.status === "NO_MATCH"
          ? `${market.provider ?? "The market provider"} was asked for pools holding this exact contract and reported none. That is an answer about this address, not about its ticker.`
          : "No market provider lookup has been recorded for this contract yet. This is not a report that no market exists.",
      price: null,
      markets: [],
      observations: history.points.length,
    });
  }

  const p = market.primary;

  return NextResponse.json({
    ...base,
    market_status: "MATCHED",
    price: {
      value: p.priceUsd,
      currency: "USD",
      /**
       * DEX_SPOT is the price printed at one pool. It is not a consolidated
       * market price, a settlement price, or a reference rate.
       */
      price_type: "DEX_SPOT",
      venue: p.venue,
      pair: p.pairName,
      pair_address: p.pairAddress,
      /** Which token of the pair this contract is. Reading the wrong side reports the other token's price. */
      side: p.side,
      liquidity_usd: p.liquidityUsd,
      volume_24h_usd: p.volume24hUsd,
      observed_at: market.observedAt,
      /** How the featured pool was chosen, so it is never read as a consensus. */
      selection: "deepest reserve among pools holding this exact contract — a selection, never an average across venues",
    },
    /** Every pool, listed rather than summed: depth in one market does not make another deep. */
    markets: market.markets.map((m) => ({
      venue: m.venue,
      pair: m.pairName,
      pair_address: m.pairAddress,
      price_usd: m.priceUsd,
      side: m.side,
      liquidity_usd: m.liquidityUsd,
      volume_24h_usd: m.volume24hUsd,
    })),
    observations: history.points.length,
    field_semantics: {
      price_type:
        "DEX_SPOT is the price printed at one pool at one moment. It is not a consolidated market price, a settlement price, or a reference rate, and it never comes from the reference chart.",
      side: "base or quote — which token of the pair this contract is. The price reported is this contract's side of it.",
      liquidity_usd:
        "The reserve of the pool that produced this quote, as the provider reported it. Pools are never summed: depth in one market does not make another market deep.",
      volume_24h_usd: "Trading activity at that pool. It is not capital inflow and is never folded into a flow figure.",
      observed_at: "When the market was true, as reported by the provider — not when this response was built.",
      observations: "How many DEX_SPOT observations FOLDMARK has persisted for this asset, which bounds any price history.",
    },
  });
}
