import type { ProviderId } from "@/server/market-data/registry";
import { PROVIDERS } from "@/server/market-data/registry";
import type { ProviderHealth, ProviderStatus } from "@/server/market-data/types";

/**
 * Rate budget, health and circuit breaking, in one place.
 *
 * A free quota is only free until it runs out mid-month. Every outbound call
 * asks here first, and a provider that starts failing is stood down rather than
 * hammered.
 *
 * State is per server instance and deliberately in memory: it protects a
 * running process from its own enthusiasm. The monthly ceiling that actually
 * matters — CoinGecko's — is additionally persisted, because a redeploy must
 * not hand us a fresh 10,000 calls.
 */

type Counter = {
  minuteWindowStart: number;
  minuteCalls: number;
  monthKey: string;
  monthCalls: number;
  cacheHits: number;
  asks: number;
  lastSuccess: number | null;
  lastFailure: number | null;
  lastError: string | null;
  latencyMs: number | null;
  consecutiveErrors: number;
  /** Set while the breaker is open; no call is attempted before this time. */
  openUntil: number;
};

const counters = new Map<ProviderId, Counter>();

function monthKey(now: number): string {
  const d = new Date(now);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function counter(id: ProviderId, now: number): Counter {
  let c = counters.get(id);
  if (!c) {
    c = {
      minuteWindowStart: now,
      minuteCalls: 0,
      monthKey: monthKey(now),
      monthCalls: 0,
      cacheHits: 0,
      asks: 0,
      lastSuccess: null,
      lastFailure: null,
      lastError: null,
      latencyMs: null,
      consecutiveErrors: 0,
      openUntil: 0,
    };
    counters.set(id, c);
  }
  if (now - c.minuteWindowStart >= 60_000) {
    c.minuteWindowStart = now;
    c.minuteCalls = 0;
  }
  const mk = monthKey(now);
  if (mk !== c.monthKey) {
    c.monthKey = mk;
    c.monthCalls = 0;
  }
  return c;
}

export type Permission = { allowed: true } | { allowed: false; reason: string; retryAfterMs: number };

/** Ask before every outbound call. Never call a provider without one. */
export function requestPermission(id: ProviderId, now = Date.now()): Permission {
  const facts = PROVIDERS[id];
  const c = counter(id, now);
  c.asks += 1;

  if (facts.chainSupport !== "SUPPORTED") {
    return { allowed: false, reason: `${facts.label} is not wired for this chain`, retryAfterMs: Infinity };
  }
  if (now < c.openUntil) {
    return { allowed: false, reason: `${facts.label} circuit open after ${c.consecutiveErrors} failures`, retryAfterMs: c.openUntil - now };
  }
  if (facts.perMinute !== null && c.minuteCalls >= facts.perMinute) {
    const wait = 60_000 - (now - c.minuteWindowStart);
    return { allowed: false, reason: `${facts.label} minute budget spent`, retryAfterMs: Math.max(0, wait) };
  }
  if (facts.perMonth !== null && c.monthCalls >= facts.perMonth) {
    return { allowed: false, reason: `${facts.label} monthly quota exhausted`, retryAfterMs: Infinity };
  }
  return { allowed: true };
}

export function recordSuccess(id: ProviderId, latencyMs: number, now = Date.now()): void {
  const c = counter(id, now);
  c.minuteCalls += 1;
  c.monthCalls += 1;
  c.lastSuccess = now;
  c.latencyMs = latencyMs;
  c.consecutiveErrors = 0;
  c.openUntil = 0;
}

/** Backoff doubles per consecutive failure and caps at five minutes. */
export function recordFailure(id: ProviderId, error: string, now = Date.now()): void {
  const c = counter(id, now);
  c.minuteCalls += 1;
  c.monthCalls += 1;
  c.lastFailure = now;
  c.lastError = error.slice(0, 200);
  c.consecutiveErrors += 1;
  if (c.consecutiveErrors >= 3) {
    const backoff = Math.min(300_000, 2 ** (c.consecutiveErrors - 3) * 15_000);
    c.openUntil = now + backoff;
  }
}

/** A 429 opens the breaker immediately — the provider has already told us to stop. */
export function recordRateLimited(id: ProviderId, retryAfterMs = 60_000, now = Date.now()): void {
  const c = counter(id, now);
  c.minuteCalls += 1;
  c.monthCalls += 1;
  c.lastFailure = now;
  c.lastError = "rate limited";
  c.consecutiveErrors += 1;
  c.openUntil = now + retryAfterMs;
}

export function recordCacheHit(id: ProviderId, now = Date.now()): void {
  const c = counter(id, now);
  c.cacheHits += 1;
  c.asks += 1;
}

function statusOf(id: ProviderId, c: Counter, now: number): ProviderStatus {
  const facts = PROVIDERS[id];
  if (facts.chainSupport !== "SUPPORTED") return "DISABLED";
  if (now < c.openUntil) return c.lastError === "rate limited" ? "RATE_LIMITED" : "DOWN";
  if (facts.perMonth !== null && c.monthCalls >= facts.perMonth) return "RATE_LIMITED";
  if (c.consecutiveErrors > 0) return "DEGRADED";
  if (!c.lastSuccess) return "DISABLED";
  if (now - c.lastSuccess > 15 * 60_000) return "STALE";
  return "UP";
}

export function health(now = Date.now()): ProviderHealth[] {
  return (Object.keys(PROVIDERS) as ProviderId[]).map((id) => {
    const facts = PROVIDERS[id];
    const c = counter(id, now);
    return {
      id,
      status: statusOf(id, c, now),
      lastSuccess: c.lastSuccess ? new Date(c.lastSuccess).toISOString() : null,
      lastFailure: c.lastFailure ? new Date(c.lastFailure).toISOString() : null,
      lastError: c.lastError,
      latencyMs: c.latencyMs,
      consecutiveErrors: c.consecutiveErrors,
      callsThisMinute: c.minuteCalls,
      callsThisMonth: c.monthCalls,
      minuteBudget: facts.perMinute,
      monthBudget: facts.perMonth,
      cacheHitRate: c.asks ? Number((c.cacheHits / c.asks).toFixed(3)) : null,
    };
  });
}
