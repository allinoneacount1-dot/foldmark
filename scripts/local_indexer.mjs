#!/usr/bin/env node
/**
 * Local indexer driver.
 *
 * There is exactly one indexer implementation — src/lib/indexer.ts, invoked
 * through /api/cron/index. This script only schedules calls to it, so local and
 * deployed ingestion can never drift apart.
 *
 *   node scripts/local_indexer.mjs                    # every 2 minutes against localhost:3000
 *   node scripts/local_indexer.mjs --once             # single pass
 *   FOLDMARK_BASE_URL=https://… node scripts/local_indexer.mjs --interval 300
 *
 * CRON_SECRET is sent as a bearer token when it is present in the environment.
 */

const args = process.argv.slice(2);
const once = args.includes("--once");
const intervalArg = args.indexOf("--interval");
const intervalSeconds = intervalArg >= 0 ? Number(args[intervalArg + 1]) : 120;

const base = (process.env.FOLDMARK_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const endpoint = `${base}/api/cron/index`;
const secret = process.env.CRON_SECRET;

if (!Number.isFinite(intervalSeconds) || intervalSeconds < 10) {
  console.error("--interval must be at least 10 seconds");
  process.exit(1);
}

function stamp() {
  return new Date().toISOString().slice(11, 19);
}

async function runOnce() {
  const started = Date.now();
  try {
    const res = await fetch(endpoint, {
      headers: secret ? { authorization: `Bearer ${secret}` } : undefined,
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    const ms = Date.now() - started;

    if (!res.ok) {
      console.error(`${stamp()}  ${res.status}  ${body.error ?? "request failed"}  ${body.detail ?? ""}`);
      return;
    }

    if (body.status === "UP_TO_DATE") {
      console.log(`${stamp()}  up to date at ${body.latest}  (${ms}ms)`);
      return;
    }

    const flows = body.flows?.addresses ?? 0;
    console.log(
      `${stamp()}  blocks ${body.fromBlock}→${body.toBlock}  ` +
        `logs ${body.logs ?? 0}  inserted ${body.inserted ?? 0}  ` +
        `discovered ${body.discovered ?? 0}  flows ${flows}  (${ms}ms)`,
    );
  } catch (error) {
    console.error(`${stamp()}  unreachable: ${endpoint} — ${error instanceof Error ? error.message : error}`);
  }
}

console.log(`FOLDMARK indexer driver → ${endpoint}`);
console.log(once ? "single pass" : `every ${intervalSeconds}s — Ctrl+C to stop`);

await runOnce();

if (!once) {
  const timer = setInterval(runOnce, intervalSeconds * 1000);
  const stop = () => {
    clearInterval(timer);
    console.log("\nstopped");
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
