import type { ProviderId } from "@/server/market-data/registry";
import { recordCacheHit } from "@/server/market-data/budget";

/**
 * Server-side cache with request coalescing.
 *
 * Two jobs, and the second is the one that matters for correctness.
 *
 * 1. A hundred readers must never become a hundred provider calls. One fetch
 *    happens, everyone else waits on the same promise.
 *
 * 2. A cached value must carry the time it was actually fetched. Reading a
 *    cache entry is not an observation of the market — it is a memory of one.
 *    If the reader stamped `Date.now()` on a cache hit, FOLDMARK would
 *    manufacture historical density: one real quote at 12:00:00 becoming three
 *    "observations" at 12:00:00, 12:00:20 and 12:00:40, all with the same
 *    price. Every returned value therefore reports `fetchedAt` from the network
 *    call that produced it, however many times it is subsequently read.
 */

export type CacheState =
  /** Nothing was cached; this call performed the network fetch. */
  | "MISS"
  /** Served from cache, inside the TTL. No network call happened. */
  | "FRESH"
  /** Served from cache past the TTL while a refresh runs behind it. */
  | "STALE_WHILE_REVALIDATE"
  /** Joined a fetch another caller had already started. */
  | "COALESCED"
  /** A background revalidation completed and replaced the entry. */
  | "REFRESHED";

export type CachedResult<T> = {
  value: T;
  /** When the network call that produced this value completed. Never "now". */
  fetchedAt: number;
  cacheState: CacheState;
};

/** True only when this result came from a network call this caller caused. */
export function isFreshFetch(result: { cacheState: CacheState }): boolean {
  return result.cacheState === "MISS" || result.cacheState === "REFRESHED";
}

type Entry<T> = {
  value: T;
  fetchedAt: number;
  ttlMs: number;
  staleWhileRevalidateMs: number;
};

const store = new Map<string, Entry<unknown>>();
const inFlight = new Map<string, Promise<{ value: unknown; fetchedAt: number }>>();

export type CacheOptions = {
  ttlMs: number;
  staleWhileRevalidateMs?: number;
  /** Attributed for the cache-hit rate on the provider status page. */
  provider?: ProviderId;
};

export async function cached<T>(
  key: string,
  options: CacheOptions,
  fetcher: () => Promise<T>,
): Promise<CachedResult<T>> {
  const now = Date.now();
  const entry = store.get(key) as Entry<T> | undefined;
  const swr = options.staleWhileRevalidateMs ?? 0;

  /**
   * Whether this key already held something.
   *
   * It decides between MISS and REFRESHED below. Both mean a network call
   * happened — the difference is whether it replaced a value or established
   * one, which is what a status page reports and what makes the declared
   * REFRESHED state reachable at all.
   */
  const hadEntry = entry !== undefined;

  if (entry) {
    const age = now - entry.fetchedAt;

    if (age <= entry.ttlMs) {
      if (options.provider) recordCacheHit(options.provider);
      return { value: entry.value, fetchedAt: entry.fetchedAt, cacheState: "FRESH" };
    }

    if (age <= entry.ttlMs + swr) {
      if (options.provider) recordCacheHit(options.provider);
      // refresh behind the reader; a failure just leaves the stale value in place
      if (!inFlight.has(key)) {
        const p = fetcher()
          .then((value) => {
            const fetchedAt = Date.now();
            store.set(key, { value, fetchedAt, ttlMs: options.ttlMs, staleWhileRevalidateMs: swr });
            return { value: value as unknown, fetchedAt };
          })
          .catch(() => ({ value: entry.value as unknown, fetchedAt: entry.fetchedAt }))
          .finally(() => inFlight.delete(key));
        inFlight.set(key, p);
      }
      // the caller gets the old value AND the old fetch time — not this moment
      return { value: entry.value, fetchedAt: entry.fetchedAt, cacheState: "STALE_WHILE_REVALIDATE" };
    }
  }

  const existing = inFlight.get(key) as Promise<{ value: T; fetchedAt: number }> | undefined;
  if (existing) {
    if (options.provider) recordCacheHit(options.provider);
    const settled = await existing;
    return { value: settled.value, fetchedAt: settled.fetchedAt, cacheState: "COALESCED" };
  }

  const promise = fetcher()
    .then((value) => {
      const fetchedAt = Date.now();
      store.set(key, { value, fetchedAt, ttlMs: options.ttlMs, staleWhileRevalidateMs: swr });
      return { value: value as unknown, fetchedAt };
    })
    .finally(() => inFlight.delete(key));

  inFlight.set(key, promise);
  const settled = (await promise) as { value: T; fetchedAt: number };
  return {
    value: settled.value,
    fetchedAt: settled.fetchedAt,
    cacheState: hadEntry ? "REFRESHED" : "MISS",
  };
}

/** Read without fetching. Used when a provider is refused and any value beats none. */
export function peek<T>(key: string): CachedResult<T> | null {
  const entry = store.get(key) as Entry<T> | undefined;
  if (!entry) return null;
  return { value: entry.value, fetchedAt: entry.fetchedAt, cacheState: "FRESH" };
}

export function cacheStats(): { entries: number; inFlight: number } {
  return { entries: store.size, inFlight: inFlight.size };
}

/** Test seam. Never called by the application. */
export function __clearCache(): void {
  store.clear();
  inFlight.clear();
}
