import { db, isDatabaseConfigured, transaction, type Row, type TxQuery } from "@/server/db/client";
import { isFreshFetch } from "@/server/market-data/cache";
import type { MarketPrice, MarketSnapshot } from "@/server/market-data/types";

/**
 * Price history persistence.
 *
 * Two rules decide whether anything is written, and both exist to stop the
 * product inventing history it never observed.
 *
 * 1. A cache read is not an observation. Only a value that arrived from a
 *    network call this process actually made may become a row. Reading the same
 *    cached quote three times must produce one row, not three.
 *
 * 2. Uniqueness is not the price. Two genuine observations can carry the same
 *    number, and throwing the second away would discard a real data point. What
 *    makes an observation unique is which source produced it, for which asset,
 *    at which venue, from which network fetch.
 *
 * Raw observations and the canonical series are stored separately: the first is
 * what each source said, the second is the one coherent series a chart may read.
 */

/** Bumped when the selection rule changes, so past choices stay auditable. */
export const METHODOLOGY_VERSION = "2026-09-04.rank-by-type-then-depth-and-age";

export type PersistResult = {
  /** Observations that arrived from a real network call. */
  eligible: number;
  /** Rejected because they came from cache — the anti-fabrication guard. */
  fromCache: number;
  /** Rows written to price_observations. */
  observationsWritten: number;
  /** Rows the unique constraint already held. */
  duplicates: number;
  /** Rows written to canonical_prices. */
  canonicalWritten: number;
  /** Observations for a contract the index has never seen. */
  unknownAsset: number;
  /** Canonical rows that could be traced back to their raw observation row. */
  canonicalLinked: number;
};

const EMPTY: PersistResult = {
  eligible: 0,
  fromCache: 0,
  observationsWritten: 0,
  duplicates: 0,
  canonicalWritten: 0,
  unknownAsset: 0,
  canonicalLinked: 0,
};

/**
 * The columns written for one raw observation, in the order their values bind.
 *
 * The list is a literal this file owns. Only the values travel as parameters,
 * so nothing a provider returned can reach the statement text.
 */
const OBSERVATION_COLUMNS = [
  "asset_id",
  "chain_id",
  "price",
  "currency",
  "price_type",
  "source",
  "provider_timestamp",
  "fetched_at",
  "observed_at",
  "block_number",
  "pair_address",
  "pair_key",
  "dex_id",
  "liquidity_usd",
  "liquidity_basis",
] as const;

const CANONICAL_COLUMNS = [
  "asset_id",
  "price",
  "currency",
  "price_type",
  "source",
  "source_observation_id",
  "pair_address",
  "dex_id",
  "liquidity_usd",
  "observed_at",
  "methodology_version",
  "divergence_pct",
] as const;

/**
 * `($1, $2, ...), ($3, $4, ...)` for a multi-row VALUES.
 *
 * Built from two counts and nothing else. Every value is bound through the
 * params array, so no caller data is ever concatenated into SQL.
 */
function valuesClause(rowCount: number, columnCount: number): string {
  const tuples: string[] = [];
  for (let r = 0; r < rowCount; r += 1) {
    const base = r * columnCount;
    const placeholders: string[] = [];
    for (let c = 1; c <= columnCount; c += 1) placeholders.push(`$${base + c}`);
    tuples.push(`(${placeholders.join(", ")})`);
  }
  return tuples.join(", ");
}

/** Row values flattened in column order, ready to bind. */
function bindings(rows: Record<string, unknown>[], columns: readonly string[]): unknown[] {
  return rows.flatMap((row) => columns.map((column) => row[column] ?? null));
}

/**
 * The identity a row is deduplicated by.
 *
 * pair_key is pair_address with NULL collapsed to the empty string. The
 * database cannot deduplicate on a nullable column — Postgres treats two NULLs
 * as different values, so every pairless observation would be insertable
 * forever, and pairless is exactly what GeckoTerminal's multi-token endpoint
 * returns. Collapsing the NULL is what makes the unique index mean anything.
 *
 * ON CONFLICT DO NOTHING is what lets that index absorb a retry or an
 * overlapping sweep instead of double-counting it. RETURNING is what makes the
 * provenance link possible: only rows actually inserted come back, carrying the
 * database ids the canonical series has to point at.
 */
function insertObservationsSql(rowCount: number): string {
  return [
    `insert into price_observations (${OBSERVATION_COLUMNS.join(", ")})`,
    `values ${valuesClause(rowCount, OBSERVATION_COLUMNS.length)}`,
    "on conflict (asset_id, source, price_type, fetched_at, pair_key) do nothing",
    "returning id, asset_id, source, price_type, fetched_at, pair_key",
  ].join("\n");
}

function insertCanonicalSql(rowCount: number): string {
  return [
    `insert into canonical_prices (${CANONICAL_COLUMNS.join(", ")})`,
    `values ${valuesClause(rowCount, CANONICAL_COLUMNS.length)}`,
    "on conflict (asset_id, observed_at, source) do nothing",
    "returning id",
  ].join("\n");
}

/**
 * A timestamp in the ISO form the rest of the codebase compares against.
 *
 * Postgres hands timestamptz back as a Date. Every identity key here is built
 * from an ISO string, so a Date left unconverted would stringify differently
 * and match nothing — silently, with no error and no provenance link.
 */
function isoOf(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const text = String(value ?? "");
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? text : new Date(parsed).toISOString();
}

/**
 * Which observations may become history.
 *
 * Exported for tests: this predicate is the whole anti-fabrication guarantee,
 * so it is worth being able to assert on directly.
 */
export function persistable(observations: MarketPrice[]): {
  eligible: MarketPrice[];
  fromCache: MarketPrice[];
} {
  const eligible: MarketPrice[] = [];
  const fromCache: MarketPrice[] = [];
  for (const o of observations) {
    if (isFreshFetch(o)) eligible.push(o);
    else fromCache.push(o);
  }
  return { eligible, fromCache };
}

/** The row identity used for deduplication. Never includes the price. */
export function observationKey(o: MarketPrice, assetId: string): string {
  return [assetId, o.source, o.priceType, o.fetchedAt, o.pairAddress ?? ""].join("|");
}

export async function persistObservations(
  observations: MarketPrice[],
  snapshots?: Map<string, MarketSnapshot>,
): Promise<PersistResult> {
  const sql = db();
  if (!isDatabaseConfigured() || !sql || !observations.length) {
    return { ...EMPTY, fromCache: observations.length };
  }

  const { eligible, fromCache } = persistable(observations);
  if (!eligible.length) return { ...EMPTY, fromCache: fromCache.length };

  // Resolve contracts to asset ids. An observation for a contract the index has
  // never seen is dropped rather than orphaned.
  const addresses = [...new Set(eligible.map((o) => o.contractAddress))];
  let assets: { id: string; contract_address: string }[] = [];
  try {
    assets = await sql<{ id: string; contract_address: string }>`
      select id, contract_address from assets where contract_address = any(${addresses}::text[])
    `;
  } catch {
    // An unreachable database is a state, not a crash. The sweep reports
    // nothing written and the next one tries again.
    assets = [];
  }

  if (!assets.length) {
    return { ...EMPTY, eligible: eligible.length, fromCache: fromCache.length, unknownAsset: eligible.length };
  }

  const idByAddress = new Map(assets.map((a) => [String(a.contract_address).toLowerCase(), String(a.id)]));

  const seen = new Set<string>();
  let unknownAsset = 0;
  const rows: Record<string, unknown>[] = [];

  for (const o of eligible) {
    const assetId = idByAddress.get(o.contractAddress);
    if (!assetId) {
      unknownAsset += 1;
      continue;
    }
    // de-duplicate within the batch as well as against the table
    const key = observationKey(o, assetId);
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({
      asset_id: assetId,
      chain_id: o.chainId,
      price: o.price,
      currency: o.currency,
      price_type: o.priceType,
      source: o.source,
      provider_timestamp: o.providerTimestamp,
      fetched_at: o.fetchedAt,
      observed_at: o.observedAt,
      block_number: o.blockNumber,
      pair_address: o.pairAddress,
      // The same fact with no NULL in it, so the unique index can hold.
      pair_key: o.pairAddress ?? "",
      dex_id: o.dexId,
      liquidity_usd: o.liquidityUsd,
      liquidity_basis: o.liquidityBasis,
    });
  }

  if (!rows.length) {
    return { ...EMPTY, eligible: eligible.length, fromCache: fromCache.length, unknownAsset };
  }

  /**
   * The raw rows and the canonical rows selected from them commit together.
   *
   * A canonical row names the exact observation it chose. Were the two writes
   * able to commit separately, a failure between them would leave either a
   * canonical price whose evidence was rolled back — a selection presented as
   * auditable when the observation behind it was never stored — or raw rows the
   * series silently never adopted. They are one fact about one moment, so they
   * land as one commit or not at all.
   */
  let result: { written: number; canonical: { written: number; linked: number } } | null = null;
  try {
    result = await transaction(async (q) => {
      const inserted = await q(insertObservationsSql(rows.length), bindings(rows, OBSERVATION_COLUMNS));
      const canonical = snapshots
        ? await persistCanonical(q, snapshots, idByAddress, observationIds(returnedObservations(inserted)))
        : { written: 0, linked: 0 };
      return { written: inserted.length, canonical };
    });
  } catch {
    result = null;
  }

  if (!result) {
    /**
     * Nothing committed. Nothing was written, and nothing is known to be a
     * duplicate either — reporting these as duplicates would assert the history
     * already holds rows that nobody has ever stored.
     */
    return { ...EMPTY, eligible: eligible.length, fromCache: fromCache.length, unknownAsset };
  }

  return {
    eligible: eligible.length,
    fromCache: fromCache.length,
    observationsWritten: result.written,
    duplicates: rows.length - result.written,
    canonicalWritten: result.canonical.written,
    unknownAsset,
    canonicalLinked: result.canonical.linked,
  };
}

/**
 * The inserted rows, with the timestamp normalised to the form keys are in.
 *
 * The conversion is the whole point: fetched_at arrives as a Date and every
 * identity key in this codebase is an ISO string.
 */
function returnedObservations(inserted: Row[]): {
  id: string;
  asset_id: string;
  source: string;
  price_type: string;
  fetched_at: string;
  pair_key: string;
}[] {
  return inserted.map((row) => ({
    id: String(row.id),
    asset_id: String(row.asset_id),
    source: String(row.source),
    price_type: String(row.price_type),
    fetched_at: isoOf(row.fetched_at),
    pair_key: String(row.pair_key ?? ""),
  }));
}

/**
 * Database ids for the observations this write actually inserted.
 *
 * Keyed the same way `observationKey` keys them, so a canonical selection can
 * find the exact row it chose. An observation that was already stored — a retry,
 * an overlapping sweep — is skipped by ON CONFLICT DO NOTHING, never appears in
 * RETURNING, and is simply absent here. The canonical row is still written,
 * with a null link. A missing link is a smaller loss than a missing price.
 */
export function observationIds(
  data: { id: string; asset_id: string; source: string; price_type: string; fetched_at: string; pair_key?: string; pair_address?: string | null }[] | null,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const row of data ?? []) {
    const pair = row.pair_key ?? row.pair_address ?? "";
    out.set([row.asset_id, row.source, row.price_type, row.fetched_at, pair].join("|"), row.id);
  }
  return out;
}

/**
 * The canonical series.
 *
 * One row per asset per moment, naming the observation that was selected and
 * the rule that selected it. This is the only table an OHLC series may read,
 * which is what stops a chart printing a high from one provider and a low from
 * another as though a single venue had traded through both.
 *
 * Runs on the caller's transaction, so it commits with the raw rows it points at.
 */
async function persistCanonical(
  q: TxQuery,
  snapshots: Map<string, MarketSnapshot>,
  idByAddress: Map<string, string>,
  observationRowIds: Map<string, string>,
): Promise<{ written: number; linked: number }> {
  let linked = 0;

  const rows = [...snapshots.values()]
    .map((snapshot): Record<string, unknown> | null => {
      const c = snapshot.canonical;
      if (!c) return null;
      // never canonicalise something that was not itself a real fetch
      if (!isFreshFetch(c)) return null;
      const assetId = idByAddress.get(snapshot.contractAddress);
      if (!assetId) return null;

      /**
       * The provenance link.
       *
       * Points at the exact raw row this selection chose, so a past canonical
       * decision can be audited against the observation behind it rather than
       * merely described. Null when the raw row was already stored and did not
       * come back from the insert — the price is still written, because the
       * value was measured and only the pointer is unknown.
       */
      const sourceObservationId = observationRowIds.get(observationKey(c, assetId)) ?? null;
      if (sourceObservationId) linked += 1;

      return {
        asset_id: assetId,
        price: c.price,
        currency: c.currency,
        price_type: c.priceType,
        source: c.source,
        source_observation_id: sourceObservationId,
        pair_address: c.pairAddress,
        dex_id: c.dexId,
        liquidity_usd: c.liquidityUsd,
        observed_at: c.observedAt,
        methodology_version: METHODOLOGY_VERSION,
        divergence_pct: snapshot.divergence?.spreadPct ?? null,
      };
    })
    .filter((r): r is Record<string, unknown> => r !== null);

  if (!rows.length) return { written: 0, linked: 0 };

  const inserted = await q(insertCanonicalSql(rows.length), bindings(rows, CANONICAL_COLUMNS));
  return { written: inserted.length, linked };
}
