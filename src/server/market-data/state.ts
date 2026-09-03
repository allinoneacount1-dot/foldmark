import { db, isDatabaseConfigured, query } from "@/server/db/client";
import { METHODOLOGY_VERSION } from "@/server/market-data/persist";
import { scoreConfidence } from "@/server/market-data/reconcile";
import { freshnessFor } from "@/server/market-data/types";
import type { MarketPrice, MarketSnapshot, PriceType, LiquidityBasis } from "@/server/market-data/types";
import type { ProviderId } from "@/server/market-data/registry";
import { CHAIN } from "@/config/site";

/**
 * The read/write split.
 *
 * A page render must never be a provider call. If it is, the product's cost
 * scales with its audience: ten readers on one asset is ten outbound requests,
 * a free quota lasts minutes, and popularity becomes an outage. That is the
 * failure mode this module exists to make impossible.
 *
 *   writeMarketState()  called only by the scheduler, after a real fetch
 *   readMarketState()   called by every page and API route, touches no network
 *
 * There is deliberately no function here that can fetch. A reader cannot spend
 * quota because a reader has nothing to spend it with.
 *
 * A stale row is still returned. A real quote from four minutes ago, labelled
 * as four minutes old, is worth more to someone than an empty panel — and the
 * freshness field means they can tell the difference.
 */

/**
 * One stored row, in the types the driver actually hands back.
 *
 * Postgres numerics arrive as strings and timestamps as Date objects. Naming
 * that here rather than pretending the row is already the shape the interface
 * wants is what keeps every conversion below deliberate.
 */
type MarketStateRow = {
  asset_id: string;
  chain_id: number | string;
  contract_address: string;
  price: string | number;
  currency: string;
  price_type: string;
  source: string;
  dex_id: string | null;
  pair_address: string | null;
  liquidity_usd: string | number | null;
  liquidity_basis: string | null;
  observed_at: Date | string;
  fetched_at: Date | string;
  persisted_at: Date | string;
  divergence_pct: string | number | null;
  observation_quality: string | number | null;
  methodology_version: string;
};

/**
 * The columns of one market_state row, in the order their values bind.
 *
 * A literal this file owns; only the values travel as parameters.
 */
const STATE_COLUMNS = [
  "asset_id",
  "chain_id",
  "contract_address",
  "price",
  "currency",
  "price_type",
  "source",
  "dex_id",
  "pair_address",
  "liquidity_usd",
  "liquidity_basis",
  "observed_at",
  "fetched_at",
  "persisted_at",
  "divergence_pct",
  "observation_quality",
  "methodology_version",
  "updated_at",
] as const;

/**
 * The upsert.
 *
 * ON CONFLICT (asset_id) DO UPDATE, not DO NOTHING: this table is the current
 * state of an asset, so a newer sweep must replace the row rather than be
 * discarded by it. History is never overwritten, but history does not live here.
 */
function upsertStateSql(rowCount: number): string {
  const columnCount = STATE_COLUMNS.length;
  const tuples: string[] = [];
  for (let r = 0; r < rowCount; r += 1) {
    const base = r * columnCount;
    const placeholders: string[] = [];
    for (let c = 1; c <= columnCount; c += 1) placeholders.push(`$${base + c}`);
    tuples.push(`(${placeholders.join(", ")})`);
  }
  const updates = STATE_COLUMNS.filter((c) => c !== "asset_id")
    .map((c) => `${c} = excluded.${c}`)
    .join(", ");

  return [
    `insert into market_state (${STATE_COLUMNS.join(", ")})`,
    `values ${tuples.join(", ")}`,
    `on conflict (asset_id) do update set ${updates}`,
    "returning asset_id",
  ].join("\n");
}

/** A timestamp as the ISO string every reader downstream parses. */
function isoOf(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
}

/** A Postgres numeric, which arrives as a string, as the number it denotes. */
function numberOf(value: string | number | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Persist the current market state for each asset.
 *
 * Called from the ingestion pass, where a fetch actually happened. One row per
 * asset, replaced in place: this is state, not history — history lives in
 * price_observations and canonical_prices and is never overwritten.
 */
export async function writeMarketState(
  snapshots: Map<string, MarketSnapshot>,
  idByAddress: Map<string, string>,
): Promise<number> {
  if (!isDatabaseConfigured() || !snapshots.size) return 0;

  const rows = [...snapshots.values()]
    .map((snapshot): Record<string, unknown> | null => {
      const c = snapshot.canonical;
      if (!c) return null;
      const assetId = idByAddress.get(snapshot.contractAddress);
      if (!assetId) return null;

      return {
        asset_id: assetId,
        chain_id: snapshot.chainId,
        contract_address: snapshot.contractAddress,
        price: c.price,
        currency: c.currency,
        price_type: c.priceType,
        source: c.source,
        dex_id: c.dexId,
        pair_address: c.pairAddress,
        liquidity_usd: c.liquidityUsd,
        liquidity_basis: c.liquidityBasis,
        observed_at: c.observedAt,
        fetched_at: c.fetchedAt,
        persisted_at: new Date().toISOString(),
        divergence_pct: snapshot.divergence?.spreadPct ?? null,
        observation_quality: c.confidence,
        methodology_version: METHODOLOGY_VERSION,
        updated_at: new Date().toISOString(),
      };
    })
    .filter((r): r is Record<string, unknown> => r !== null);

  if (!rows.length) return 0;

  const params = rows.flatMap((row) => STATE_COLUMNS.map((column) => row[column] ?? null));

  try {
    const written = await query(upsertStateSql(rows.length), params);
    // `query` answers null when there is no database at all; the publish simply
    // did not happen, and the caller reports zero rather than throwing.
    return written?.length ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Read the stored market state for a set of contracts.
 *
 * Touches only the database. Freshness is recomputed against `now` rather than
 * stored, because how old a row is depends on when you ask.
 */
export async function readMarketState(
  addresses: string[],
  now = Date.now(),
): Promise<Map<string, MarketSnapshot>> {
  const out = new Map<string, MarketSnapshot>();
  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))].filter(Boolean);
  const sql = db();
  if (!isDatabaseConfigured() || !sql || !unique.length) return out;

  let data: MarketStateRow[] = [];
  try {
    data = await sql<MarketStateRow>`
      select asset_id, chain_id, contract_address, price, currency, price_type, source, dex_id,
             pair_address, liquidity_usd, liquidity_basis, observed_at, fetched_at, persisted_at,
             divergence_pct, observation_quality, methodology_version
        from market_state
       where contract_address = any(${unique}::text[])
    `;
  } catch {
    // No row is better than a wrong row: an unreachable database renders as
    // UNAVAILABLE upstream rather than as an invented price.
    return out;
  }

  for (const row of data) {
    const contractAddress = String(row.contract_address).toLowerCase();

    const priceType = row.price_type as PriceType;
    const observedAt = isoOf(row.observed_at);
    const quality = numberOf(row.observation_quality);
    const price: MarketPrice = {
      assetId: row.asset_id,
      contractAddress,
      chainId: Number(row.chain_id) || CHAIN.id,
      price: Number(row.price),
      currency: row.currency,
      priceType,
      source: row.source as ProviderId,
      observedAt,
      fetchedAt: isoOf(row.fetched_at),
      providerTimestamp: null,
      // A row read back is not a fetch. Nothing downstream may record it as an
      // observation, and this field is what stops that happening.
      cacheState: "FRESH",
      blockNumber: null,
      pairAddress: row.pair_address,
      dexId: row.dex_id,
      liquidityUsd: numberOf(row.liquidity_usd),
      liquidityBasis: (row.liquidity_basis as LiquidityBasis | null) ?? null,
      // Stored at write time, so the row keeps the quality it was judged to
      // have. Freshness is the exception: how old a row is depends on when the
      // question is asked, so it is recomputed against the caller's clock.
      confidence: quality === null ? 0 : quality,
      freshness: freshnessFor(priceType, Date.parse(observedAt), now),
    };

    if (quality === null) price.confidence = scoreConfidence(price, now);

    out.set(contractAddress, {
      contractAddress,
      chainId: price.chainId,
      canonical: price,
      // The stored state is one value. The observations behind it are history,
      // and asking for them is a different question with a different endpoint.
      observations: [price],
      divergence: null,
      methodology: `Stored market state, written by the ingestion pass under methodology ${row.methodology_version}. Selected from that sweep's observations by the stated rule; served from storage, so reading this page made no provider call. Persisted ${isoOf(row.persisted_at)}.`,
    });
  }

  return out;
}
