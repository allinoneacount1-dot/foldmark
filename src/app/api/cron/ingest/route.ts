import { NextResponse } from "next/server";
import { runIngestPass } from "@/server/ingest/run";
import { repairTimestamps, repairVerification } from "@/server/ingest/repair";
import { chainHead, safeHead } from "@/server/ingest/transport";
import { restCursor } from "@/server/db/rest-queries";
import { supabaseConfigured, countRows } from "@/server/db/supabase";
import { cronAuthorized } from "@/server/cron/auth";
import { databaseSize } from "@/server/db/storage";

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

/** One rule about who may spend a quota, shared with the enrichment endpoint. */
const authorized = cronAuthorized;

/**
 * Ingestion health.
 *
 * STALE dominates: if no pass has committed recently, the lag figure is not
 * evidence of anything and should not be allowed to report healthy. Thresholds
 * are generous relative to the quarter-hourly cadence, so an ordinary delayed
 * schedule does not read as a failure.
 */
export function ingestionHealth(lastSuccessAt: string | null, lagBlocks: number | null): "HEALTHY" | "DEGRADED" | "STALE" {
  if (!lastSuccessAt) return "STALE";
  const ageMs = Date.now() - Date.parse(lastSuccessAt);
  if (!Number.isFinite(ageMs)) return "STALE";
  // Two missed quarter-hourly cycles plus slack.
  if (ageMs > 45 * 60_000) return "STALE";
  // Head-following: a pass jumps to the safe head, so lag is a function of time
  // since the last pass rather than a backlog. This is roughly an hour of blocks.
  if (lagBlocks !== null && lagBlocks > 40_000) return "DEGRADED";
  return "HEALTHY";
}

/** Read-only. Safe to expose: no secrets, only what the indexer has done. */
async function status() {
  const [head, safe, cursor, transfers, assets, storage] = await Promise.all([
    chainHead(),
    safeHead(),
    restCursor(),
    countRows("transfers"),
    countRows("assets"),
    databaseSize(),
  ]);

  const lag = head !== null && cursor.lastProcessedBlock !== null ? head - cursor.lastProcessedBlock : null;

  return {
    database_mode: supabaseConfigured() ? "POSTGREST" : "NONE",
    chain_head: head,
    safe_head: safe,
    cursor: cursor.lastProcessedBlock,
    cursor_updated_at: cursor.updatedAt,
    last_success_at: cursor.updatedAt,
    lag_blocks: lag,
    transfers_stored: transfers,
    assets_known: assets,
    /**
     * Health is about the INGESTION, not about whether this page responded.
     *
     * A reachable frontend says nothing about whether the index is still
     * moving, and reporting green because a request succeeded is exactly how a
     * stalled pipeline goes unnoticed. This reads the age of the last committed
     * pass instead.
     */
    health: ingestionHealth(cursor.updatedAt, lag),
    /**
     * Stated rather than implied. This deployment follows the head within a
     * bounded budget; it does not claim the blocks behind the cursor are
     * covered, and the coverage state everywhere else says PARTIAL for the same
     * reason.
     */
    coverage_mode: "HEAD_FOLLOWING_PARTIAL",
    /**
     * Reported beside ingestion health because it is the thing most likely to
     * end it. This deployment ingests continuously against a fixed free-tier
     * ceiling, and a database that fills up stops accepting writes — after
     * which a stalled index is indistinguishable from a quiet chain unless
     * something says how full the disk is.
     */
    storage: {
      bytes: storage.bytes,
      limit_bytes: storage.limitBytes,
      used_fraction: storage.usedFraction === null ? null : Number(storage.usedFraction.toFixed(4)),
      largest_relations: storage.largest,
      note: storage.note,
    },
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
