import { NextResponse } from "next/server";
import {
  getAssets,
  getWindowActivity,
  getFlowWindows,
  foldEdges,
  foldByAddress,
  getPriceSeries,
  movementsFrom,
  describeFlowRow,
  since,
  coverageBlock,
} from "@/lib/queries";
import { WINDOWS, CHAIN, type FlowWindow } from "@/config/site";
import { toNotional, notionalNote, prepareSeries, DEFAULT_ALIGNMENT } from "@/lib/notional";

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

  /**
   * Notional, priced at each transfer's own moment.
   *
   * The input is the raw transfers, not the folded edges: folding sums amounts
   * and discards the per-transfer timestamps that make point-in-time pricing
   * possible. A transfer from 23 hours ago is valued at a price observed at or
   * before it, never at the current quote.
   */
  const priceRows = await getPriceSeries(
    assets.rows.map((a) => a.id),
    since(window, now),
    DEFAULT_ALIGNMENT.maxAlignmentDeltaMs,
  );
  const notional = toNotional(movementsFrom(activity.rows, assets.rows), prepareSeries(priceRows));

  return NextResponse.json({
    window,
    state: activity.state,
    partial: activity.capped,
    index_coverage: coverageBlock(window, activity.coverage, now),
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

      /** Per-transfer, because that is the unit that gets priced. */
      transfer_count_total: notional.transfersTotal,
      transfer_count_priced: notional.transfersPriced,
      transfer_count_excluded: notional.transfersExcluded,
      notional_coverage: Number(notional.coverage.toFixed(4)),

      /**
       * The alignment policy, stated rather than implied.
       *
       * no_look_ahead means only an observation at or before a transfer may
       * price it — a later quote would be information that did not exist when
       * the transfer happened.
       */
      alignment: {
        no_look_ahead: notional.noLookAhead,
        max_alignment_delta_ms: notional.maxAlignmentDeltaMs,
        oldest_alignment_delta_ms: notional.oldestAlignmentDeltaMs,
      },

      excluded_by_reason: notional.excludedByReason,
      excluded_assets: notional.excludedAssets.map((e) => ({
        asset: symbols.get(e.assetId) ?? null,
        asset_id: e.assetId,
        reason: e.reason,
        movements: e.movements,
      })),
      priced_assets: notional.pricedAssets.map((id) => symbols.get(id) ?? id),
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
    /**
     * Precomputed per-address, per-asset flow.
     *
     * Every amount below is accompanied by the asset it counts. A net_flow of
     * -420 means nothing on its own: it is -420 USDG or -420 NVDA, and those
     * are different facts about different markets. The row is keyed by an
     * address AND an asset for exactly that reason, so the response names both.
     *
     * `address` is the address alone. The underlying storage key is the
     * composite `<address>:<asset_id>`, which is an implementation detail and
     * is not a resolvable address — returning it in a field called "address"
     * would hand consumers a string that looks like one and is not.
     */
    precomputed_net_flow: {
      state: precomputed.state,
      unit_basis: "Each row's amounts are in its own asset's units. Rows are never summed together.",
      rows: precomputed.rows.map((r) => describeFlowRow(r, symbols)),
    },
    chain_id: CHAIN.id,
    updated_at: new Date().toISOString(),
    methodology:
      "An edge is a directed address pair that exchanged one asset inside the window; value is summed in token units at that asset's own decimals. Amounts are never summed across assets, because token units are not comparable — cross-asset ranking uses transfer counts instead, and every amount is returned beside the asset it counts. Net flow is defined per address AND asset, never per address alone and never per token contract. Classification stays UNCLASSIFIED until the counterparty contract is identified.",
  });
}
