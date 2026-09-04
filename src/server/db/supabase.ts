/**
 * The Supabase REST data path.
 *
 * SERVER ONLY. This module reads the service-role credential and must never be
 * imported from a client component.
 *
 * WHY THIS EXISTS. FOLDMARK's query layer speaks SQL through `pg` and a
 * `DATABASE_URL`. The production database is a Supabase project whose direct
 * Postgres endpoint is not reachable with the credentials available, but whose
 * PostgREST interface is. Rather than leave a database full of real observations
 * unreadable, this provides the narrow set of reads and writes the product
 * actually needs, over the interface that does work.
 *
 * It is deliberately NOT a general SQL replacement. Every function here is a
 * specific question the product asks, which keeps the surface small enough to
 * reason about and means no caller can assemble a query this layer cannot
 * express.
 *
 * When a `DATABASE_URL` becomes available the SQL path takes precedence again;
 * this one is the fallback, not a competing source of truth.
 */

export type SupabaseConfig = { url: string; key: string };

/**
 * Configuration, or null.
 *
 * Absent configuration is a state rather than a crash, exactly as it is for the
 * SQL client: callers resolve to UNAVAILABLE and the interface says so.
 */
export function supabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_JWT?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    "";
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ""), key };
}

export function supabaseConfigured(): boolean {
  return supabaseConfig() !== null;
}

function headers(key: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

/** How long any single database call may take before it is treated as unavailable. */
const TIMEOUT_MS = 9_000;

async function request(path: string, init: RequestInit): Promise<Response | null> {
  const config = supabaseConfig();
  if (!config) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${config.url}/rest/v1/${path}`, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
      headers: { ...headers(config.key), ...(init.headers as Record<string, string> | undefined) },
    });
  } catch {
    // A network failure is UNAVAILABLE, never an empty result. The difference
    // between "we could not look" and "there was nothing" is the whole point of
    // the data-state model.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read rows.
 *
 * `query` is a PostgREST query string built by the caller from literal column
 * names and encoded values. Returns null for any failure so callers can
 * distinguish it from an empty table.
 */
export async function selectRows<T = Record<string, unknown>>(
  table: string,
  query: string,
): Promise<T[] | null> {
  const res = await request(`${table}?${query}`, { method: "GET" });
  if (!res || !res.ok) return null;
  try {
    return (await res.json()) as T[];
  } catch {
    return null;
  }
}

/** Exact row count for a table under a filter, or null. */
export async function countRows(table: string, query = "select=*"): Promise<number | null> {
  const res = await request(`${table}?${query}`, {
    method: "GET",
    headers: { Prefer: "count=exact", Range: "0-0" },
  });
  if (!res || !res.ok) return null;
  const range = res.headers.get("content-range");
  const total = range?.split("/")[1];
  const n = total ? Number(total) : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * Insert rows, ignoring ones that already exist.
 *
 * Idempotency is the requirement that matters here: ingestion retries, and a
 * retry must never double-count a transfer. `resolution=ignore-duplicates`
 * leans on the table's own unique constraint rather than on the caller
 * remembering what it already sent.
 */
export async function insertIgnoreDuplicates(
  table: string,
  rows: Record<string, unknown>[],
  onConflict?: string,
): Promise<{ ok: boolean; inserted: number }> {
  if (!rows.length) return { ok: true, inserted: 0 };
  const path = onConflict ? `${table}?on_conflict=${encodeURIComponent(onConflict)}` : table;
  const res = await request(path, {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify(rows),
  });
  if (!res || !res.ok) return { ok: false, inserted: 0 };
  try {
    const body = (await res.json()) as unknown[];
    return { ok: true, inserted: Array.isArray(body) ? body.length : 0 };
  } catch {
    return { ok: true, inserted: 0 };
  }
}

/** Insert or update on the given conflict target. */
export async function upsertRows(
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
): Promise<boolean> {
  if (!rows.length) return true;
  const res = await request(`${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  return Boolean(res && res.ok);
}

/** Update rows matching a filter. */
export async function patchRows(
  table: string,
  query: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const res = await request(`${table}?${query}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
  return Boolean(res && res.ok);
}
