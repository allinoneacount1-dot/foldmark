#!/usr/bin/env node
/**
 * Live chain follower.
 *
 * This exists because of one measured constraint: the free public RPC retains
 * roughly 48 blocks of logs — about five seconds at this chain's 0.103s block
 * time — and refuses anything older as an archive request. The chain produces
 * about 839,650 blocks a day, so a scheduled job can never catch up across a
 * gap. A log has to be taken while it is still inside that window.
 *
 * So the free-tier design is not "poll and catch up", it is "follow the head":
 * subscribe to newHeads over WebSocket and index each block as it arrives.
 *
 *   node scripts/live-indexer.mjs                    # follow the head
 *   node scripts/live-indexer.mjs --once             # one pass, then exit
 *   FOLDMARK_BASE_URL=https://… node scripts/live-indexer.mjs
 *
 * It drives the same /api/cron/index endpoint the scheduled job uses, so there
 * is one ingestion implementation rather than two that can drift apart.
 *
 * Serverless hosting cannot hold a WebSocket open, which is why this runs as a
 * process rather than a route. Anywhere that can keep a small Node process
 * alive will do.
 */

const WS_URL = process.env.FOLDMARK_WS_URL || "wss://robinhood-rpc.publicnode.com";
const BASE_URL = (process.env.FOLDMARK_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const SECRET = process.env.CRON_SECRET;

const args = process.argv.slice(2);
const once = args.includes("--once");

/** Blocks the endpoint will still serve logs for. Measured, not guessed. */
const LOG_WINDOW = 48;
/** Leave room for the round trip so a request never falls out of the window. */
const SAFETY_MARGIN = 12;

const stamp = () => new Date().toISOString().slice(11, 23);
const log = (...parts) => console.log(stamp(), ...parts);

let lastIndexed = 0;
let totalBlocks = 0;
let totalGaps = 0;
let reconnects = 0;
let busy = false;

async function ingest(reason) {
  if (busy) return;
  busy = true;
  const started = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/api/cron/index?blocks=${LOG_WINDOW - SAFETY_MARGIN}`, {
      headers: SECRET ? { authorization: `Bearer ${SECRET}` } : undefined,
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    const ms = Date.now() - started;

    const chain = body.chain ?? {};
    const prices = body.prices ?? {};

    if (chain.status === "FAILED") {
      log(`chain FAILED  ${String(chain.error).slice(0, 120)}`);
    } else if (chain.status === "INDEXED") {
      totalBlocks += (chain.toBlock ?? 0) - (chain.fromBlock ?? 0) + 1;
      if (chain.gapBlocks) {
        totalGaps += chain.gapBlocks;
        log(`GAP ${chain.gapBlocks.toLocaleString()} blocks unrecoverable — outside the free log window`);
      }
      lastIndexed = chain.toBlock ?? lastIndexed;
      log(
        `${reason}  blocks ${chain.fromBlock}→${chain.toBlock}  ` +
          `logs ${chain.logs ?? 0}  inserted ${chain.inserted ?? 0}  ` +
          `discovered ${chain.discovered ?? 0}  (${ms}ms)`,
      );
    } else if (chain.status === "UP_TO_DATE") {
      log(`${reason}  up to date at ${chain.latest}  (${ms}ms)`);
    }

    if (prices.written) {
      log(`  prices  ${prices.written} observation(s) from ${prices.refreshed} asset(s)`);
    }
  } catch (error) {
    log(`ingest error: ${error instanceof Error ? error.message : error}`);
  } finally {
    busy = false;
  }
}

function follow() {
  let ws;
  try {
    ws = new WebSocket(WS_URL);
  } catch (error) {
    log(`socket construct failed: ${error.message}`);
    return scheduleReconnect();
  }

  let heartbeat;

  ws.onopen = () => {
    log(`connected  ${WS_URL}`);
    reconnects = 0;
    ws.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_subscribe", params: ["newHeads"] }));
    // a socket that goes quiet is a socket that has died without telling us
    heartbeat = setInterval(() => {
      if (Date.now() - lastHeadAt > 30_000) {
        log("no head for 30s — reconnecting");
        try {
          ws.close();
        } catch {
          /* already gone */
        }
      }
    }, 10_000);
  };

  let lastHeadAt = Date.now();

  ws.onmessage = (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    if (msg.id === 1) {
      if (msg.result) log(`subscribed  ${msg.result}`);
      else log(`subscribe failed: ${JSON.stringify(msg.error)}`);
      return;
    }

    if (msg.method !== "eth_subscription") return;
    const head = msg.params?.result?.number;
    if (!head) return;

    lastHeadAt = Date.now();
    const block = Number(BigInt(head));

    // Index in batches rather than per block: at ten blocks a second a request
    // per block would be pure overhead, and the window is wide enough to hold
    // several seconds of them.
    if (block - lastIndexed >= LOG_WINDOW - SAFETY_MARGIN || lastIndexed === 0) {
      void ingest(`head ${block.toLocaleString()}`);
    }
  };

  ws.onerror = () => {
    /* onclose always follows; reconnect is handled there */
  };

  ws.onclose = () => {
    clearInterval(heartbeat);
    log("disconnected");
    scheduleReconnect();
  };
}

function scheduleReconnect() {
  reconnects += 1;
  // exponential, capped at 30s — a provider having a bad minute must not be hammered
  const delay = Math.min(30_000, 2 ** Math.min(reconnects, 5) * 500);
  log(`reconnecting in ${(delay / 1000).toFixed(1)}s (attempt ${reconnects})`);
  setTimeout(follow, delay);
}

console.log("FOLDMARK live indexer");
console.log(`  socket : ${WS_URL}`);
console.log(`  ingest : ${BASE_URL}/api/cron/index`);
console.log(`  window : ${LOG_WINDOW} blocks retained, indexing every ${LOG_WINDOW - SAFETY_MARGIN}`);
console.log("");

if (once) {
  await ingest("once");
  process.exit(0);
}

follow();

const summary = setInterval(() => {
  log(
    `— indexed ${totalBlocks.toLocaleString()} blocks, ` +
      `${totalGaps.toLocaleString()} lost to the archive limit, ${reconnects} reconnect(s)`,
  );
}, 300_000);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    clearInterval(summary);
    log(`stopped — ${totalBlocks.toLocaleString()} blocks indexed, ${totalGaps.toLocaleString()} lost`);
    process.exit(0);
  });
}
