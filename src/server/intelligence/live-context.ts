/**
 * Real product state for the reasoning layer.
 *
 * SERVER ONLY.
 *
 * The assistant can only reason about what it is given, and giving it the
 * database would be both expensive and dangerous — a model handed thousands of
 * rows will summarise them, and a summary of rows it half-read is indistinguishable
 * from an invention. So this resolves a BOUNDED, structured snapshot of the
 * page the reader is actually on: the asset in the path, its markets, its
 * coverage, the ingestion health. Nothing more.
 *
 * Every field is either a real observation or explicitly absent. An absent
 * field is stated as absent rather than omitted, because a model that cannot
 * see a field will otherwise fill the silence.
 */

import { selectRows, countRows, supabaseConfigured } from "@/server/db/supabase";
import { restAssetByAddress, restCursor } from "@/server/db/rest-queries";
import { priceHistory } from "@/server/market/historical";
import { CHAIN } from "@/config/site";

export type LiveContext = Record<string, string | number | null>;

/** An address sitting in the path, if the route carries one. */
function addressIn(pathname: string): string | null {
  const seg = pathname.split("/").filter(Boolean).pop() ?? "";
  return /^0x[a-fA-F0-9]{40}$/.test(seg) ? seg.toLowerCase() : null;
}

/**
 * What the reader can currently see, as facts.
 *
 * Bounded on purpose: a handful of scalars, never a row dump. The cost of one
 * of these is a few indexed reads, and the model receives something it can
 * state without interpreting.
 */
export async function liveContext(pathname: string, params: Record<string, string>): Promise<LiveContext> {
  const ctx: LiveContext = {
    chain: `${CHAIN.name} (${CHAIN.id})`,
    pathname,
    window: params.w ?? null,
    category_filter: params.category ?? null,
    flow_filter: params.flow ?? null,
    asset_type_filter: params.type ?? null,
  };

  /**
   * No store, no numbers.
   *
   * An unconfigured or unreachable index must read as UNAVAILABLE, never as
   * zero. "We could not look" and "there was nothing" are different facts, and
   * a model handed a bare 0 will report an empty chain.
   */
  if (!supabaseConfigured()) {
    ctx.index_status = "UNAVAILABLE — no index is connected to this deployment, so no counts can be stated";
    ctx.asset_in_view = null;
    return ctx;
  }

  // ---- ingestion, always relevant ---------------------------------------
  const [cursor, transferCount, assetCount] = await Promise.all([
    restCursor(),
    countRows("transfers"),
    countRows("assets", `select=*&chain_id=eq.${CHAIN.id}`),
  ]);

  ctx.index_status =
    transferCount === null ? "UNAVAILABLE — the index could not be read on this request" : "READABLE";
  ctx.indexed_transfers = transferCount;
  ctx.known_assets = assetCount;
  ctx.cursor_block = cursor.lastProcessedBlock;
  ctx.last_ingestion_at = cursor.updatedAt;
  ctx.chain_coverage =
    "HEAD_FOLLOWING_PARTIAL — the index follows the head of the chain and does not reach the first block; historical completeness is not claimed";

  // ---- the asset in view, if any ----------------------------------------
  const address = addressIn(pathname);
  if (!address || !pathname.includes("/asset")) {
    ctx.asset_in_view = null;
    return ctx;
  }

  const asset = await restAssetByAddress(address);
  if (!asset) {
    ctx.asset_in_view = address;
    ctx.asset_known = "no — this contract is not in FOLDMARK's asset registry";
    return ctx;
  }

  ctx.asset_in_view = `${asset.symbol} (${asset.contract_address})`;
  ctx.asset_name = asset.name;
  ctx.asset_type = asset.asset_type;
  ctx.asset_decimals = asset.decimals;
  ctx.asset_verified = asset.verified
    ? "true"
    : "false — no authoritative issuer source confirms this contract, so it is not verified";
  ctx.asset_source = asset.source;

  // ---- markets for that asset -------------------------------------------
  const meta = await selectRows<Record<string, unknown>>(
    "asset_metadata",
    `select=metadata_json,observed_at&asset_id=eq.${encodeURIComponent(asset.id)}&limit=1`,
  );
  const market = (meta?.[0]?.metadata_json as { market?: Record<string, unknown> } | undefined)?.market;

  /**
   * Three answers, kept apart.
   *
   * "Nobody asked" and "the provider was asked and had none" are different
   * facts, and collapsing them into one absence is how a product manufactures a
   * finding out of its own idleness.
   */
  if (!market) {
    ctx.market_status = "unchecked — no market provider lookup has been recorded for this contract";
  } else if (market.mapping_status === "NO_MATCH") {
    ctx.market_status = "no market — the provider was asked about this exact contract and reported no pools";
  } else if (market.mapping_status !== "MATCHED") {
    ctx.market_status = "unchecked — the recorded lookup did not complete, so no market state is claimed";
  } else {
    const primary = market.primary as Record<string, unknown> | null;
    const list = Array.isArray(market.markets) ? market.markets : [];
    ctx.market_status = "matched";
    ctx.market_provider = String(market.provider ?? "");
    ctx.market_pool_count = list.length;
    ctx.price_type = "DEX_SPOT";
    if (primary) {
      ctx.featured_price_usd = Number(primary.price_usd);
      ctx.featured_pair = String(primary.pair_name ?? "");
      ctx.featured_pair_address = String(primary.pair_address ?? "");
      ctx.featured_venue = String(primary.venue ?? "");
      ctx.featured_liquidity_usd = primary.liquidity_usd === null ? null : Number(primary.liquidity_usd);
      ctx.featured_volume_24h_usd = primary.volume_24h_usd === null ? null : Number(primary.volume_24h_usd);
      ctx.featured_side = String(primary.side ?? "");
      ctx.featured_market_method = "deepest reserve among pools holding this exact contract — a selection, not an average";
    }
    ctx.market_observed_at = (meta?.[0]?.observed_at as string | null) ?? null;
  }

  // ---- price history depth ----------------------------------------------
  const history = await priceHistory(asset.id, 200);
  ctx.price_observations = history.points.length;
  ctx.price_history_from = history.firstObservedAt;
  ctx.price_history_to = history.lastObservedAt;
  ctx.pricing_note =
    "A transfer is valued only by an observation at or before its block time, within 15 minutes. Transfers older than the first observation are unpriced; a later quote is never used.";

  return ctx;
}
