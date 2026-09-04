import { NextResponse } from "next/server";
import { runIngestPass } from "@/server/ingest/run";
import { repairTimestamps, repairVerification } from "@/server/ingest/repair";
import { chainHead, safeHead } from "@/server/ingest/transport";
import { restCursor } from "@/server/db/rest-queries";
import { supabaseConfigured, countRows } from "@/server/db/supabase";

/**
 * The hosted ingestion endpoint.
 *
 * This is the production heartbeat. It runs inside the hosted runtime and is
 * driven by a hosted scheduler; no machine belonging to anyone needs to be
 * switched on for the index to advance.
 *
 * Writes require a shared secret. Without one this route would let anyone drive
 * the indexer and the provider budget behind it, so an unauthenticated caller
 * gets the read-only status and nothing else.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const expected = process.env.INGEST_SECRET?.trim();
  if (!expected) return false;
  const header = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const param = new URL(req.url).searchParams.get("key")?.trim();
  // Vercel signs its own scheduler calls; accept those too.
  const vercelCron = req.headers.get("x-vercel-cron") !== null;
  return vercelCron || header === expected || param === expected;
}

/** Read-only. Safe to expose: no secrets, only what the indexer has done. */
async function status() {
  const [head, safe, cursor, transfers, assets] = await Promise.all([
    chainHead(),
    safeHead(),
    restCursor(),
    countRows("transfers"),
    countRows("assets"),
  ]);

  const lag = head !== null && cursor.lastProcessedBlock !== null ? head - cursor.lastProcessedBlock : null;

  return {
    database_mode: supabaseConfigured() ? "POSTGREST" : "NONE",
    chain_head: head,
    safe_head: safe,
    cursor: cursor.lastProcessedBlock,
    cursor_updated_at: cursor.updatedAt,
    lag_blocks: lag,
    transfers_stored: transfers,
    assets_known: assets,
    /**
     * Stated rather than implied. This deployment follows the head within a
     * bounded budget; it does not claim the blocks behind the cursor are
     * covered, and the coverage state everywhere else says PARTIAL for the same
     * reason.
     */
    coverage_mode: "HEAD_FOLLOWING_PARTIAL",
  };
}

export async function GET(req: Request) {
  const action = new URL(req.url).searchParams.get("action") ?? "status";

  if (action === "status") {
    return NextResponse.json(await status(), { headers: { "cache-control": "no-store" } });
  }

  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  if (action === "repair-timestamps") {
    const limit = Number(new URL(req.url).searchParams.get("limit") ?? 400);
    const report = await repairTimestamps(Number.isFinite(limit) ? limit : 400);
    return NextResponse.json(report, { headers: { "cache-control": "no-store" } });
  }

  if (action === "repair-verification") {
    return NextResponse.json(await repairVerification(), { headers: { "cache-control": "no-store" } });
  }

  // Default action: one ingestion pass.
  const budget = Number(new URL(req.url).searchParams.get("blocks") ?? 400);
  const report = await runIngestPass({
    blockBudget: Number.isFinite(budget) ? Math.min(Math.max(budget, 10), 2000) : 400,
    deadlineMs: 45_000,
  });
  return NextResponse.json(report, {
    status: report.ok ? 200 : 500,
    headers: { "cache-control": "no-store" },
  });
}

/** POST behaves identically, for schedulers that prefer it. */
export async function POST(req: Request) {
  return GET(req);
}
