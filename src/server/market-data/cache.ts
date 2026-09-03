import type { ProviderId } from "@/server/market-data/registry";
import { recordCacheHit } from "@/server/market-data/budget";

/**
 * Server-side cache with request coalescing.
 *
 * The rule this exists to enforce: a hundred readers must never become a
 * hundred provider calls. One fetch happens, everyone else waits on the same
 * promise, and the result is served from memory until it expires.
 *
 * Deliberately per-instance. It is a quota guard, not a distributed cache —
 * durable state belongs in Postgres, which is what the price history is for.
 */

type Entry<T> = {
  value: T;
  storedAt: number;
  ttlMs: number;
  /** Serve past the TTL while a refresh runs, rather than making a reader wait. */
  staleWhileRevalidateMs: number;
};

const store = new Map<string, Entry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

export type CacheOptions = {
  ttlMs: number;
  staleWhileRevalidateMs?: number;
  /** Attributed for the cache-hit rate on the provider status page. */
  provider?: ProviderId;
};

/**
 * Fetch through the cache.
 *
 * - inside the TTL: memory, no call
 * - past the TTL but inside the stale window: memory now, refresh in background
 * - beyond both: one call, shared by every concurrent caller
 */
export async function cached<T>(key: string, options: CacheOptions, fetcher: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const entry = store.get(key) as Entry<T> | undefined;
  const swr = options.staleWhileRevalidateMs ?? 0;

  if (entry) {
    const age = now - entry.storedAt;
    if (age <= entry.ttlMs) {
      if (options.provider) recordCacheHit(options.provider);
      return entry.value;
    }
    if (age <= entry.ttlMs + swr) {
      if (options.provider) recordCacheHit(options.provider);
      // refresh behind the reader; a failure just leaves the stale value in place
      if (!inFlight.has(key)) {
        const p = fetcher()
          .then((value) => {
            store.set(key, { value, storedAt: Date.now(), ttlMs: options.ttlMs, staleWhileRevalidateMs: swr });
            return value;
          })
          .catch(() => entry.value)
          .finally(() => inFlight.delete(key));
        inFlight.set(key, p);
      }
      return entry.value;
    }
  }

  // coalesce: whoever asks second joins the first caller's request
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) {
    if (options.provider) recordCacheHit(options.provider);
    return existing;
  }

  const promise = fetcher()
    .then((value) => {
      store.set(key, { value, storedAt: Date.now(), ttlMs: options.ttlMs, staleWhileRevalidateMs: swr });
      return value;
    })
    .finally(() => inFlight.delete(key));

  inFlight.set(key, promise);
  return promise;
}

/** Read without fetching. Used when a provider is refused and we need any value at all. */
export function peek<T>(key: string): { value: T; ageMs: number } | null {
  const entry = store.get(key) as Entry<T> | undefined;
  if (!entry) return null;
  return { value: entry.value, ageMs: Date.now() - entry.storedAt };
}

export function cacheStats(): { entries: number; inFlight: number } {
  return { entries: store.size, inFlight: inFlight.size };
}
