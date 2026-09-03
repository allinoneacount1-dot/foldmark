import { NextResponse } from "next/server";
import { getAssets, getWindowActivity, getFlowWindows, foldEdges, foldByAddress, getLatestPrices, coverageBlock } from "@/lib/queries";
import { WINDOWS, CHAIN, type FlowWindow } from "@/config/site";
import { toNotional, notionalNote } from "@/lib/notional";

export const dynamic = "force-dynamic";

/** Directed value edges, plus precomputed per-address net flow. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const requested = searchParams.get("window") as FlowWindow | null;
  const window: FlowWindow = requested && WINDOWS.includes(requested) ? requested : "24H";
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 20) || 20));

  const now = Date.now();
  const [assets, activity, precomputed] = await Promise.all([
    getAssets(),
    getWindowActivity(window, now),
    getFlowWindows(window),
  ]);

  const symbols = new Map(assets.rows.map((a) => [a.id, a.symbol]));
  const edges = foldEdges(activity.rows, assets.rows, limit);
  const addresses = foldByAddress(activity.rows, assets.rows, limit);

  const prices = await getLatestPrices(assets.rows.map((a) => a.id));
  const notional = toNotional(
    edges.filter((e) => e.assetId).map((e) => ({ assetId: e.assetId!, amount: e.amount })),
    prices,
    now,
  );

  return NextResponse.json({
    window,
    state: activity.state,
    partial: activity.capped,
    index_coverage: coverageBlock(window, activity.coverage),
    edges: edges.map((e) => ({
      from: e.from,
      to: e.to,
      asset: e.assetId ? { id: e.assetId, symbol: symbols.get(e.assetId) ?? null } : null,
      value_moved: Number(e.amount.toFixed(6)),
      transfers: e.transfers,
      last_block: e.lastBlock,
      classification: "UNCLASSIFIED",
    })),
    /**
     * Ranked by transfer count, not by summed token amounts.
     *
     * Adding one NVDA to one AAPL does not make two units of anything, so a
     * cross-asset total would be an arithmetic error presented as intelligence.
     * Flow is therefore reported per asset, and only counts are aggregated.
     */
    /**
     * The only cross-asset total in this response, and it is conditional.
     *
     * Assets without a price observed inside max_acceptable_price_age_ms are
     * excluded by name and the state drops to PARTIAL. FOLDMARK does not carry
     * a stale quote forward to complete a sum.
     */
    notional: {
      state: notional.state,
      usd: notional.usd === null ? null : Number(notional.usd.toFixed(2)),
      currency: "USD",
      assets_priced: notional.covered.length,
      assets_excluded: notional.excluded.map((e) => ({
        asset: symbols.get(e.assetId) ?? null,
        asset_id: e.assetId,
        reason: e.reason,
        price_age_ms: e.ageMs,
      })),
      coverage_pct: Number((notional.coverage * 100).toFixed(1)),
      oldest_price_age_ms: notional.oldestPriceAgeMs,
      max_acceptable_price_age_ms: notional.maxAcceptablePriceAgeMs,
      sources: notional.sources,
      note: notionalNote(notional),
    },
    top_addresses: addresses.map((a) => ({
      address: a.address,
      transfers: a.transfers,
      counterparties: a.counterparties,
      assets_touched: a.assets,
      flow_by_asset: a.byAsset.map((f) => ({
        asset: symbols.get(f.assetId) ?? null,
        asset_id: f.assetId,
        received: Number(f.inbound.toFixed(6)),
        sent: Number(f.outbound.toFixed(6)),
        net: Number(f.net.toFixed(6)),
        transfers: f.transfers,
      })),
    })),
    precomputed_net_flow: {
      state: precomputed.state,
      rows: precomputed.rows.map((r) => ({
        address: r.entity_id,
        inflow: r.inflow,
        outflow: r.outflow,
        net_flow: r.net_flow,
        transfers: r.transaction_count,
        counterparties: r.unique_counterparties,
        calculated_at: r.calculated_at,
      })),
    },
    chain_id: CHAIN.id,
    updated_at: new Date().toISOString(),
    methodology:
      "An edge is a directed address pair that exchanged one asset inside the window; value is summed in token units at that asset's own decimals. Amounts are never summed across assets, because token units are not comparable — cross-asset ranking uses transfer counts instead, and flow is reported per asset. Net flow is defined per address and asset, not per token contract. Classification stays UNCLASSIFIED until the counterparty contract is identified.",
  });
}
