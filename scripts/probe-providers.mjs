#!/usr/bin/env node
/**
 * Provider probe.
 *
 * Verifies, rather than assumes, what each candidate data source actually
 * supports for Robinhood Chain. The answers it prints are what
 * src/server/market-data/registry.ts records — re-run it and update the
 * registry whenever a provider changes.
 *
 *   npm run probe:providers
 *
 * It calls nothing that costs money and nothing that needs a key.
 */

const RPC_CANDIDATES = [
  "https://robinhood-rpc.publicnode.com",
  "https://rpc.mainnet.chain.robinhood.com",
  "https://rpc.arrowrpc.com",
];
const WS_URL = "wss://robinhood-rpc.publicnode.com";
const CHAIN_ID = 4663;
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const pad = (s, n) => String(s).padEnd(n);
const section = (t) => console.log(`\n=== ${t} ===`);

async function rpc(url, method, params = []) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

/* --------------------------------------------------------------- chain */

section("RPC ENDPOINTS");
let live = null;
for (const url of RPC_CANDIDATES) {
  const started = Date.now();
  try {
    const chainId = Number(BigInt(await rpc(url, "eth_chainId")));
    const head = Number(BigInt(await rpc(url, "eth_blockNumber")));
    const ok = chainId === CHAIN_ID;
    console.log(`  ${pad(new URL(url).host, 36)} ${ok ? "OK  " : "WRONG CHAIN"} chain ${chainId}  head ${head.toLocaleString()}  ${Date.now() - started}ms`);
    if (ok && !live) live = { url, head };
  } catch (error) {
    console.log(`  ${pad(new URL(url).host, 36)} FAIL  ${String(error.message).slice(0, 60)}`);
  }
}

if (!live) {
  console.log("\nNo endpoint answered for chain 4663. Everything below depends on the chain, so stopping here.");
  process.exit(1);
}

section("BLOCK CADENCE");
{
  const head = await rpc(live.url, "eth_getBlockByNumber", ["0x" + live.head.toString(16), false]);
  const back = await rpc(live.url, "eth_getBlockByNumber", ["0x" + (live.head - 10000).toString(16), false]);
  const seconds = Number(BigInt(head.timestamp)) - Number(BigInt(back.timestamp));
  const perBlock = seconds / 10000;
  console.log(`  block time      ${perBlock.toFixed(3)}s`);
  console.log(`  blocks per day  ~${Math.round(86400 / perBlock).toLocaleString()}`);
  console.log(`  txs in head     ${head.transactions.length}`);
}

section("LOG RETENTION (how far back logs are served)");
{
  const servesAt = async (block) => {
    try {
      await rpc(live.url, "eth_getLogs", [
        { topics: [TRANSFER_TOPIC], fromBlock: "0x" + block.toString(16), toBlock: "0x" + block.toString(16) },
      ]);
      return true;
    } catch {
      return false;
    }
  };
  let lo = 0;
  let hi = live.head;
  for (let i = 0; i < 20 && hi - lo > 64; i++) {
    const mid = Math.floor((lo + hi) / 2);
    if (await servesAt(mid)) hi = mid;
    else lo = mid;
  }
  const depth = live.head - hi;
  console.log(`  retained depth  ~${depth.toLocaleString()} blocks`);
  console.log(`  meaning         a cursor further behind than this cannot be caught up without an archive node`);
}

section("WEBSOCKET");
await new Promise((resolve) => {
  const started = Date.now();
  let heads = 0;
  let ws;
  try {
    ws = new WebSocket(WS_URL);
  } catch (error) {
    console.log(`  construct failed: ${error.message}`);
    return resolve();
  }
  const timer = setTimeout(() => {
    console.log(`  ${heads ? `${heads} head(s) received` : "no heads received in 15s"}`);
    try { ws.close(); } catch {}
    resolve();
  }, 15000);

  ws.onopen = () => {
    console.log(`  connected in ${Date.now() - started}ms`);
    ws.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_subscribe", params: ["newHeads"] }));
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id === 1) return console.log(`  subscribe ${msg.result ? "OK" : "FAILED"}`);
    if (msg.method === "eth_subscription") {
      heads += 1;
      if (heads === 4) {
        console.log(`  ${heads} consecutive heads received — live subscription works`);
        clearTimeout(timer);
        try { ws.close(); } catch {}
        resolve();
      }
    }
  };
  ws.onerror = () => {};
  ws.onclose = () => { clearTimeout(timer); resolve(); };
});

/* ----------------------------------------------------------- providers */

section("GECKOTERMINAL — is this chain supported?");
{
  let found = null;
  for (let page = 1; page <= 5 && !found; page++) {
    const res = await fetch(`https://api.geckoterminal.com/api/v2/networks?page=${page}`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) break;
    const json = await res.json();
    found = (json.data ?? []).find((n) => n.id === "robinhood") ?? null;
    await new Promise((r) => setTimeout(r, 700));
  }
  console.log(found ? `  SUPPORTED  network id "${found.id}"` : "  NOT FOUND in the network list");

  if (found) {
    const res = await fetch("https://api.geckoterminal.com/api/v2/networks/robinhood/pools?page=1", {
      headers: { accept: "application/json" },
    });
    const json = await res.json();
    console.log(`  pools returned: ${(json.data ?? []).length}`);
    for (const p of (json.data ?? []).slice(0, 4)) {
      const a = p.attributes;
      console.log(`    ${pad(a.name, 34)} $${a.base_token_price_usd ?? "-"}  reserve $${Math.round(a.reserve_in_usd ?? 0).toLocaleString()}`);
    }
  }
}

section("DEX SCREENER — is this chain supported?");
{
  const res = await fetch("https://api.dexscreener.com/latest/dex/search?q=USDG", { headers: { accept: "application/json" } });
  const json = await res.json();
  const pairs = (json.pairs ?? []).filter((p) => p.chainId === "robinhood");
  console.log(`  ${pairs.length ? "SUPPORTED" : "NOT FOUND"}  ${pairs.length} pair(s) with chainId "robinhood"`);
  console.log(`  cache-control: ${res.headers.get("cache-control") ?? "none"}`);
  for (const p of pairs.slice(0, 3)) {
    console.log(`    ${pad(`${p.baseToken.symbol}/${p.quoteToken.symbol}`, 16)} $${p.priceUsd}  liq $${Math.round(p.liquidity?.usd ?? 0).toLocaleString()}`);
  }
}

section("COINGECKO");
{
  const res = await fetch("https://api.coingecko.com/api/v3/ping", { headers: { accept: "application/json" } });
  console.log(`  /ping -> ${res.status}`);
  console.log("  note: reachable, but no Robinhood Chain asset platform confirmed. Reference use only.");
}

section("ROBINHOOD STOCK TOKEN API");
for (const url of ["https://api.robinhood.com/rhj/assets", "https://chain.robinhood.com/rhj/assets"]) {
  try {
    const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10000) });
    console.log(`  ${res.status}  ${url}`);
  } catch (error) {
    console.log(`  FAIL  ${url}  ${String(error.message).slice(0, 50)}`);
  }
}

console.log("\nUpdate src/server/market-data/registry.ts if any answer above has changed.");
