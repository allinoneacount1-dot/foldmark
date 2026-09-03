import { supabase, isSupabaseConfigured } from "@/lib/supabase";

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
 * `provider_refresh_state` holds one row per (provider, scope) with the time
 * the next fetch becomes allowed. Acquiring the lease is a single conditional
 * UPDATE — set next_allowed_at forward, but only where the current value has
 * already passed. Postgres serialises it, so exactly one caller sees a row come
 * back and every other caller sees none and stands down.
 *
 * Read-modify-write would not do: two instances could both read "allowed",
 * both write, and both fetch. The condition has to be in the write itself.
 *
 * If the table is missing — a deployment whose migration has not run — the
 * lease is granted. Coordination is an optimisation, and being unable to
 * coordinate must not stop the product ingesting data.
 */

export type LeaseResult = {
  acquired: boolean;
  /** Why not, when it was refused. */
  reason: "GRANTED" | "HELD_BY_ANOTHER" | "NO_STORAGE" | "TABLE_MISSING";
  nextAllowedAt: string | null;
};

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
  if (!isSupabaseConfigured() || !supabase) {
    return { acquired: true, reason: "NO_STORAGE", nextAllowedAt: null };
  }
  const sb = supabase;

  const nowIso = new Date(now).toISOString();
  const nextIso = new Date(now + holdMs).toISOString();

  // Make sure a row exists. ignoreDuplicates means a racing insert is harmless
  // and, importantly, does not reset a lease another instance already holds.
  const { error: seedError } = await sb
    .from("provider_refresh_state")
    .upsert(
      [{ provider, scope, next_allowed_at: nowIso, updated_at: nowIso }],
      { onConflict: "provider,scope", ignoreDuplicates: true },
    );

  if (seedError) {
    // Most likely the migration has not run here. Do not block ingestion on it.
    return { acquired: true, reason: "TABLE_MISSING", nextAllowedAt: null };
  }

  /**
   * The compare-and-set. `lte` is the whole mechanism: the row only moves
   * forward if its deadline has already passed, so a second caller arriving
   * mid-hold matches nothing and gets an empty result.
   */
  const { data, error } = await sb
    .from("provider_refresh_state")
    .update({ next_allowed_at: nextIso, last_fetch_at: nowIso, updated_at: nowIso })
    .eq("provider", provider)
    .eq("scope", scope)
    .lte("next_allowed_at", nowIso)
    .select("next_allowed_at");

  if (error) return { acquired: true, reason: "TABLE_MISSING", nextAllowedAt: null };
  if (data && data.length > 0) return { acquired: true, reason: "GRANTED", nextAllowedAt: nextIso };

  const { data: current } = await sb
    .from("provider_refresh_state")
    .select("next_allowed_at")
    .eq("provider", provider)
    .eq("scope", scope)
    .maybeSingle();

  return {
    acquired: false,
    reason: "HELD_BY_ANOTHER",
    nextAllowedAt: (current?.next_allowed_at as string | null) ?? null,
  };
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
  if (!isSupabaseConfigured() || !supabase) return;

  const nowIso = new Date(now).toISOString();
  const { data: current } = await supabase
    .from("provider_refresh_state")
    .select("consecutive_errors")
    .eq("provider", provider)
    .eq("scope", scope)
    .maybeSingle();

  const previous = Number(current?.consecutive_errors ?? 0);

  await supabase
    .from("provider_refresh_state")
    .update({
      last_status: status,
      consecutive_errors: status === "ERROR" ? previous + 1 : 0,
      updated_at: nowIso,
    })
    .eq("provider", provider)
    .eq("scope", scope);
}
