import { NextResponse } from "next/server";
import { health } from "@/server/market-data/budget";
import { cacheStats } from "@/server/market-data/cache";
import { PROVIDERS } from "@/server/market-data/registry";
import { activeEndpoint, lastRpcLatencyMs } from "@/server/market-data/providers/rpc";
import { CHAIN } from "@/config/site";

export const dynamic = "force-dynamic";

/**
 * Provider health, budget and terms in one place.
 *
 * Quota exhaustion should be something you read here, not something you
 * discover in production. Every provider reports what it is permitted to do,
 * what it has spent, and whether its terms have been reviewed.
 */
export async function GET() {
  const now = Date.now();
  const statuses = health(now);

  return NextResponse.json({
    chain_id: CHAIN.id,
    rpc: {
      active_endpoint: new URL(activeEndpoint()).host,
      last_latency_ms: lastRpcLatencyMs(),
    },
    cache: cacheStats(),
    providers: statuses.map((h) => {
      const facts = PROVIDERS[h.id];
      return {
        id: h.id,
        label: facts.label,
        status: h.status,
        chain_support: facts.chainSupport,
        role: facts.role,
        evidence: facts.evidence,
        budget: {
          per_minute: h.minuteBudget,
          per_month: h.monthBudget,
          used_this_minute: h.callsThisMinute,
          used_this_month: h.callsThisMonth,
          month_remaining: h.monthBudget === null ? null : Math.max(0, h.monthBudget - h.callsThisMonth),
        },
        latency_ms: h.latencyMs,
        cache_hit_rate: h.cacheHitRate,
        consecutive_errors: h.consecutiveErrors,
        last_success: h.lastSuccess,
        last_failure: h.lastFailure,
        last_error: h.lastError,
        terms: {
          url: facts.termsUrl,
          commercial_use: facts.commercialUse,
          attribution: facts.attribution,
          last_reviewed: facts.lastReviewed,
        },
        notes: facts.notes,
      };
    }),
    checked_at: new Date(now).toISOString(),
    methodology:
      "Budgets are enforced before every outbound call and counted per server instance. A provider that fails three times in a row has its circuit opened with exponential backoff; a 429 opens it immediately. Providers whose chain support is not SUPPORTED are never called.",
  });
}
