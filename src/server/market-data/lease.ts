import { db, isDatabaseConfigured } from "@/server/db/client";

/**
 * The lease that keeps several instances honest with one quota.
 *
 * The in-memory scheduler stops one server from refreshing an asset twice in a
 * minute. It cannot stop three servers — a preview, a production instance, and
 * a laptop running the live indexer — from each spending a call on the same
 * asset in the same second. They share a provider quota; they do not share
 * memory. Their only common ground is the database, so the coordination has to
 * live there.
 *
 * `provider_refresh_state` holds one row per (provider, scope) with the time the
 * next fetch becomes allowed. Acquiring the lease is ONE statement: an insert
 * that, on conflict, updates the row only where its deadline has already passed.
 * Postgres serialises the row, so exactly one caller sees a row come back and
 * every other caller sees none and stands down.
 *
 * Read-modify-write would not do: two instances could both read "allowed", both
 * write, and both fetch. The condition has to be inside the write itself, which
 * is what the WHERE on DO UPDATE is.
 *
 * If the database cannot answer at all, the lease is granted. Coordination is an
 * optimisation, and being unable to coordinate must not stop the product
 * ingesting data.
 */

export type LeaseResult = {
  acquired: boolean;
  /** Why not, when it was refused. */
  reason: "GRANTED" | "HELD_BY_ANOTHER" | "NO_STORAGE" | "STORAGE_ERROR";
  nextAllowedAt: string | null;
};

/** A timestamp as the ISO string callers and status surfaces expect. */
function isoOf(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "string" || !value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
}

/**
 * Take the lease for one provider and scope.
 *
 * `holdMs` should exceed the expected duration of the work: the lease is what
 * stops a second instance starting the same sweep while this one is still
 * running, so it is released by expiry rather than by a call.
 */
export async function acquireLease(
  provider: string,
  scope: string,
  holdMs: number,
  now = Date.now(),
): Promise<LeaseResult> {
  const sql = db();
  if (!isDatabaseConfigured() || !sql) {
    return { acquired: true, reason: "NO_STORAGE", nextAllowedAt: null };
  }

  const nowIso = new Date(now).toISOString();
  const nextIso = new Date(now + holdMs).toISOString();

  try {
    /**
     * The compare-and-set, as one atomic statement.
     *
     * The insert creates the row the first time this (provider, scope) is ever
     * leased. Every time after that the conflict fires, and the WHERE decides:
     * the row moves forward only if its deadline has already passed, so a second
     * caller arriving mid-hold updates nothing, returns nothing, and stands
     * down. The comparison is against the caller's clock — the same clock that
     * wrote the deadline in the first place.
     */
    const rows = await sql<{ next_allowed_at: Date | string }>`
      insert into provider_refresh_state (provider, scope, next_allowed_at, last_fetch_at, updated_at)
      values (${provider}, ${scope}, ${nextIso}, ${nowIso}, now())
      on conflict (provider, scope) do update
        set next_allowed_at = excluded.next_allowed_at,
            last_fetch_at = excluded.last_fetch_at,
            updated_at = now()
        where provider_refresh_state.next_allowed_at <= ${nowIso}
      returning next_allowed_at
    `;

    if (rows.length > 0) {
      return { acquired: true, reason: "GRANTED", nextAllowedAt: isoOf(rows[0].next_allowed_at) ?? nextIso };
    }

    /**
     * Refused. The deadline the holder wrote is read separately, because a
     * statement that updated no row can return nothing about the row it did not
     * touch. It is reported so a caller can say when the quota frees up rather
     * than only that it is busy.
     */
    const current = await sql<{ next_allowed_at: Date | string }>`
      select next_allowed_at from provider_refresh_state
       where provider = ${provider} and scope = ${scope}
       limit 1
    `;

    return {
      acquired: false,
      reason: "HELD_BY_ANOTHER",
      nextAllowedAt: current.length ? isoOf(current[0].next_allowed_at) : null,
    };
  } catch {
    /**
     * The database refused or was unreachable, so whether anyone holds the lease
     * is unknown. Granting risks two instances sweeping at once; refusing stops
     * ingestion outright while storage is degraded. The first is a wasted
     * provider call, the second is a product with no data, so the lease is
     * granted and the reason says exactly why it was not coordinated.
     */
    return { acquired: true, reason: "STORAGE_ERROR", nextAllowedAt: null };
  }
}

/**
 * Record how a sweep ended.
 *
 * A failure shortens nothing — the lease still expires on its own schedule —
 * but the error count is what a status endpoint reads to say a provider is
 * degraded across the whole deployment rather than only in one process.
 */
export async function releaseLease(
  provider: string,
  scope: string,
  status: "OK" | "ERROR",
  now = Date.now(),
): Promise<void> {
  const sql = db();
  if (!isDatabaseConfigured() || !sql) return;

  const nowIso = new Date(now).toISOString();

  try {
    // The counter increments from its own stored value inside the update, so two
    // instances reporting an error cannot both read 3 and both write 4.
    await sql`
      update provider_refresh_state
         set last_status = ${status},
             consecutive_errors = case
               when ${status}::text = 'ERROR' then provider_refresh_state.consecutive_errors + 1
               else 0
             end,
             updated_at = ${nowIso}
       where provider = ${provider} and scope = ${scope}
    `;
  } catch {
    // Bookkeeping. A sweep that ran is not undone by failing to record how it
    // ended, and the lease still expires on its own.
  }
}
