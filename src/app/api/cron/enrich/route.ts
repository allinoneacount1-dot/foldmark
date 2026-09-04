import { NextResponse } from "next/server";
import { runEnrichPass } from "@/server/market/enrich";
import { selectRows, countRows, supabaseConfigured } from "@/server/db/supabase";
import { NETWORK_ID, PRIMARY_MARKET_METHOD } from "@/server/market/geckoterminal";
import { CHAIN } from "@/config/site";
import { cronAuthorized } from "@/server/cron/auth";

/**
 * The hosted market-enrichment endpoint.
 *
 * Separate from chain ingestion on purpose. Market data comes from a third
 * party on its own cadence and its own failure modes; letting one pipeline stall
 * the other is how a provider outage silently stops the chain index.
 *
 * The browser never calls a market provider. It reads FOLDMARK's own API, which
 * reads observations this endpoint persisted — so a hundred readers cost one
 * provider request, not a hundred.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** One rule about who may spend a quota, shared with the ingestion endpoint. */
const authorized = cronAuthorized;

/** Read-only. Provider coverage as it actually stands, with nothing implied. */
async function status() {
  const [assets, priceCount, meta] = await Promise.all([
    countRows("assets", `select=*&chain_id=eq.${CHAIN.id}`),
    countRows("prices"),
    selectRows<Record<string, unknown>>("asset_metadata", "select=asset_id,metadata_json,observed_at"),
  ]);

  let withMarkets = 0;
  let withoutMarkets = 0;
  let latestObservedAt: string | null = null;

  for (const row of meta ?? []) {
    const market = (row.metadata_json as { market?: { mapping_status?: string } } | null)?.market;
    if (!market) continue;
    if (market.mapping_status === "MATCHED") withMarkets += 1;
    else if (market.mapping_status === "NO_MATCH") withoutMarkets += 1;
    const at = row.observed_at as string | null;
    if (at && (!latestObservedAt || at > latestObservedAt)) latestObservedAt = at;
  }

  return {
    provider: "GeckoTerminal",
    provider_network: NETWORK_ID,
    database_mode: supabaseConfigured() ? "POSTGREST" : "NONE",
    assets_known: assets,
    assets_with_markets: withMarkets,
    assets_without_markets: withoutMarkets,
    assets_unchecked: assets === null ? null : Math.max(0, assets - withMarkets - withoutMarkets),
    price_observations: priceCount,
    last_observed_at: latestObservedAt,
    primary_market_method: PRIMARY_MARKET_METHOD,
    /** Market coverage is a separate claim from chain coverage. Never merged. */
    coverage_note:
      "Market data is provider-reported DEX activity. It is not a FOLDMARK verification of any contract, and it is unrelated to the chain index's HEAD_FOLLOWING_PARTIAL coverage.",
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "status";

  if (action === "status") {
    return NextResponse.json(await status(), { headers: { "cache-control": "no-store" } });
  }

  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  const budget = Number(url.searchParams.get("assets") ?? 6);
  const report = await runEnrichPass({
    assetBudget: Number.isFinite(budget) ? Math.min(Math.max(budget, 1), 20) : 6,
    deadlineMs: 45_000,
  });

  return NextResponse.json(report, {
    status: report.ok ? 200 : 500,
    headers: { "cache-control": "no-store" },
  });
}

export async function POST(req: Request) {
  return GET(req);
}
