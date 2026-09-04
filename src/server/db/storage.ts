/**
 * How much room is left.
 *
 * SERVER ONLY.
 *
 * FOLDMARK runs on a free tier with a fixed storage ceiling, and it ingests
 * continuously: measured growth is roughly six hundred thousand transfer rows a
 * day, which is a meaningful fraction of that ceiling every week. A pipeline
 * that silently fills its disk stops writing, and an index that stops writing
 * without saying so looks exactly like a quiet chain — the single failure this
 * product is least able to tolerate.
 *
 * So the size is measured rather than assumed, and it is reported beside the
 * ingestion health that depends on it.
 *
 * The runway is arithmetic, not a forecast. It divides two measured numbers and
 * shows both, in the same spirit as everything else here: no model of future
 * activity, no seasonality, no claim that the rate will hold. If the chain gets
 * busier the runway is shorter, and the operator can see why.
 */

import { db, isDatabaseConfigured } from "@/server/db/client";

/**
 * The Supabase free tier's database ceiling.
 *
 * Stated as a constant with its source named, because a limit hardcoded without
 * provenance is the kind of number that goes stale and then misleads.
 */
export const FREE_TIER_LIMIT_BYTES = 500 * 1024 * 1024;

export type StorageReport = {
  /** Total database size on disk, including indexes. Null when unreadable. */
  bytes: number | null;
  limitBytes: number;
  /** 0..1 of the ceiling. Null when the size could not be read. */
  usedFraction: number | null;
  /** Largest relations, so growth can be attributed rather than guessed at. */
  largest: { relation: string; bytes: number }[];
  note: string;
};

const NOTE =
  "Size is read from the database, including indexes. The limit is the free tier's ceiling. Nothing here projects future growth: a runway is this size divided by an observed rate, and the rate is whatever the chain does next.";

const UNREADABLE: StorageReport = {
  bytes: null,
  limitBytes: FREE_TIER_LIMIT_BYTES,
  usedFraction: null,
  largest: [],
  note: NOTE,
};

/**
 * Measured size, or an explicit unknown.
 *
 * Every failure returns null rather than zero. A storage panel reporting 0 of
 * 500 MB because a query timed out would read as an empty database, which is
 * the same class of lie as a fabricated measurement.
 */
export async function databaseSize(): Promise<StorageReport> {
  if (!isDatabaseConfigured()) return UNREADABLE;
  const sql = db();
  if (!sql) return UNREADABLE;

  try {
    const total = await sql<{ bytes: string }>`select pg_database_size(current_database())::text as bytes`;
    const bytes = Number(total?.[0]?.bytes);
    if (!Number.isFinite(bytes)) return UNREADABLE;

    /**
     * Per-relation sizes, public schema only. This is what turns "we are at
     * eighty percent" into "transfers is eighty percent", which is the
     * difference between knowing there is a problem and knowing what to do.
     */
    const rows = await sql<{ relation: string; bytes: string }>`
      select relname as relation, pg_total_relation_size(c.oid)::text as bytes
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
       order by pg_total_relation_size(c.oid) desc
       limit 6
    `;

    return {
      bytes,
      limitBytes: FREE_TIER_LIMIT_BYTES,
      usedFraction: bytes / FREE_TIER_LIMIT_BYTES,
      largest: (rows ?? [])
        .map((r) => ({ relation: String(r.relation), bytes: Number(r.bytes) }))
        .filter((r) => Number.isFinite(r.bytes)),
      note: NOTE,
    };
  } catch {
    // Unreadable is a state. It is never reported as an empty database.
    return UNREADABLE;
  }
}
