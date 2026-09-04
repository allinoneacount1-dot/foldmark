import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isAuthoritativeSource } from "@/server/ingest/repair";
import {
  fetchTransfers,
  blockTimestamps,
  chainHead,
  safeHead,
  TRANSFER_TOPIC,
  MAX_LOG_SPAN,
  SAFETY_BLOCKS,
} from "@/server/ingest/transport";
import { DEFAULT_MODEL, reasoningConfig } from "@/lib/intelligence/providers/openrouter";
import { ingestionHealth } from "@/app/api/cron/ingest/route";

/**
 * Ingestion and the repairs.
 *
 * Two failures this suite exists to prevent, both of which already happened in
 * production once.
 *
 * The first is temporal: transfers were stored with the moment ingestion ran
 * instead of the time of their block, which quietly moves events into the wrong
 * hour and would corrupt every window and any price alignment reading them.
 *
 * The second is semantic: assets carried VERIFIED because an aggregator
 * recognised the contract. A market listing is not an issuer confirming an
 * address, and the badge asserted something the product could not support.
 *
 * Nothing here reaches the network. The transport is exercised against a fetch
 * double, so the suite tests this repository rather than whether a provider
 * happens to be up.
 */

const RPC_ENV = "ROBINHOOD_RPC_URL";
const originalFetch = globalThis.fetch;
const originalRpc = process.env[RPC_ENV];

/** Replies to JSON-RPC by method, so a test states only what it cares about. */
function mockRpc(handlers: Record<string, (params: unknown[]) => unknown>) {
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { method: string; params: unknown[] };
    const handler = handlers[body.method];
    if (!handler) return new Response(JSON.stringify({ error: { message: "unmocked" } }), { status: 200 });
    const result = handler(body.params);
    if (result instanceof Error) {
      return new Response(JSON.stringify({ error: { message: result.message } }), { status: 200 });
    }
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status: 200 });
  }) as typeof fetch;
}

beforeEach(() => {
  process.env[RPC_ENV] = "https://rpc.test.invalid";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalRpc === undefined) delete process.env[RPC_ENV];
  else process.env[RPC_ENV] = originalRpc;
  vi.restoreAllMocks();
});

/* ========================================================================== */
/*  VERIFICATION SEMANTICS                                                    */
/* ========================================================================== */

describe("a market listing is not verification", () => {
  it("refuses verification sourced from DEX Screener", () => {
    // The exact string that was granting VERIFIED in production.
    expect(isAuthoritativeSource("Robinhood Stock Token — Dexscreener verified")).toBe(false);
    expect(isAuthoritativeSource("dex screener listing")).toBe(false);
  });

  it("refuses every other aggregator and discovery source", () => {
    for (const source of [
      "GeckoTerminal pool",
      "CoinGecko listing",
      "Robinhood Chain — auto-discovered on-chain",
      "Robinhood Chain — observed in a Transfer log",
      "symbol match",
      "name match",
    ]) {
      expect(isAuthoritativeSource(source), source).toBe(false);
    }
  });

  it("refuses an absent source rather than defaulting to trust", () => {
    expect(isAuthoritativeSource(null)).toBe(false);
    expect(isAuthoritativeSource("")).toBe(false);
  });

  it("accepts only an issuer or an authoritative registry", () => {
    expect(isAuthoritativeSource("Issuer-published contract address for chain 4663")).toBe(true);
    expect(isAuthoritativeSource("Official registry entry, authoritative")).toBe(true);
  });

  it("does not let an aggregator name smuggle itself past the word issuer", () => {
    // "Dexscreener issuer page" is still an aggregator. Non-authoritative terms
    // are checked first precisely so a longer string cannot launder one.
    expect(isAuthoritativeSource("Dexscreener issuer page")).toBe(false);
  });
});

/* ========================================================================== */
/*  BLOCK TIME IS CHAIN TIME                                                  */
/* ========================================================================== */

describe("a transfer's time is its block's time", () => {
  it("resolves block timestamps from the chain, not the clock", () => {
    const chainSeconds = 1_788_500_889; // a fixed point in chain time
    mockRpc({
      eth_getBlockByNumber: () => ({ timestamp: `0x${chainSeconds.toString(16)}` }),
    });

    return blockTimestamps([53323347]).then((times) => {
      const value = times.get(53323347);
      expect(value).toBe(new Date(chainSeconds * 1000).toISOString());
      // Emphatically not "now": that is the defect this replaced.
      expect(Math.abs(Date.parse(value!) - Date.now())).toBeGreaterThan(60_000);
    });
  });

  it("asks the chain once per distinct block however many logs share it", async () => {
    let calls = 0;
    mockRpc({
      eth_getBlockByNumber: () => {
        calls += 1;
        return { timestamp: "0x6a9b1234" };
      },
    });
    await blockTimestamps([100, 100, 100, 101, 101]);
    expect(calls).toBe(2);
  });

  it("omits a block it could not resolve rather than substituting a time", async () => {
    mockRpc({ eth_getBlockByNumber: () => new Error("upstream down") });
    const times = await blockTimestamps([500]);
    // No entry at all. The caller drops the row; a guessed timestamp would be
    // worse than a missing one.
    expect(times.has(500)).toBe(false);
  });
});

/* ========================================================================== */
/*  TRANSPORT                                                                 */
/* ========================================================================== */

describe("the transport decodes only what it can justify", () => {
  const log = (over: Record<string, unknown> = {}) => ({
    blockNumber: "0x32da653",
    blockHash: "0xabc",
    transactionHash: "0xdead",
    logIndex: "0x2a",
    address: "0xAAbbCCddEEff00112233445566778899AaBbCcDd",
    topics: [
      TRANSFER_TOPIC,
      "0x000000000000000000000000" + "8366a39cc670b4001a1121b8f6a443a643e40951",
      "0x000000000000000000000000" + "e5e702641ea86f4ae6cc3cdaed2b886f976be044",
    ],
    data: "0x000000000000000000000000000000000000000000000000000547d21e45bb08",
    ...over,
  });

  it("decodes an ERC-20 transfer into canonical fields", async () => {
    mockRpc({ eth_getLogs: () => [log()] });
    const r = await fetchTransfers(1, 10);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const t = r.value[0];
    expect(t.blockNumber).toBe(53323347);
    expect(t.logIndex).toBe(42);
    expect(t.from).toBe("0x8366a39cc670b4001a1121b8f6a443a643e40951");
    expect(t.to).toBe("0xe5e702641ea86f4ae6cc3cdaed2b886f976be044");
    // Lowercased, because an address compared case-sensitively is a different
    // address as far as every join is concerned.
    expect(t.contract).toBe("0xaabbccddeeff00112233445566778899aabbccdd");
    // Base units as a string: a token amount can exceed exact double precision.
    expect(typeof t.rawValue).toBe("string");
    expect(t.rawValue).toBe("1486342660143880");
  });

  it("ignores ERC-721 transfers, which share the event signature", async () => {
    // A fourth topic means the value is a token id, not an amount. Reading it as
    // a quantity would invent one.
    mockRpc({ eth_getLogs: () => [log({ topics: [...log().topics, "0x01"], data: "0x" })] });
    const r = await fetchTransfers(1, 10);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toHaveLength(0);
  });

  it("reports a provider refusal as an error rather than as no logs", async () => {
    // The distinction the cursor depends on: "nothing happened" must never be
    // confused with "we could not look".
    mockRpc({ eth_getLogs: () => new Error("range too large") });
    const r = await fetchTransfers(1, 500);
    expect(r.ok).toBe(false);
  });

  it("keeps the head a safe distance behind the tip", async () => {
    mockRpc({ eth_blockNumber: () => "0x1000" });
    const head = await chainHead();
    const safe = await safeHead();
    expect(head).toBe(4096);
    expect(safe).toBe(4096 - SAFETY_BLOCKS);
    expect(SAFETY_BLOCKS).toBeGreaterThan(0);
  });

  it("holds the provider's measured log-window ceiling", () => {
    // Ten blocks is what the provider actually permits, benchmarked rather than
    // assumed. Raising it would make every range fail.
    expect(MAX_LOG_SPAN).toBe(10);
  });

  it("uses the canonical Transfer signature", () => {
    expect(TRANSFER_TOPIC).toBe("0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef");
  });

  it("reports no RPC configured rather than throwing", async () => {
    delete process.env[RPC_ENV];
    const previous = process.env.NEXT_PUBLIC_ROBINHOOD_RPC;
    delete process.env.NEXT_PUBLIC_ROBINHOOD_RPC;
    const r = await fetchTransfers(1, 10);
    expect(r.ok).toBe(false);
    if (previous !== undefined) process.env.NEXT_PUBLIC_ROBINHOOD_RPC = previous;
  });
});

/* ========================================================================== */
/*  REASONING MODEL CONFIG                                                    */
/* ========================================================================== */

describe("the reasoning model is configured in exactly one place", () => {
  it("defaults to the model that was measured to work", () => {
    expect(DEFAULT_MODEL).toBe("poolside/laguna-s-2.1:free");
  });

  it("keeps the default on a free variant", () => {
    // The reasoning layer must not start costing money because a default
    // changed. A paid model is reachable only by setting OPENROUTER_MODEL.
    expect(DEFAULT_MODEL.endsWith(":free")).toBe(true);
  });

  it("lets the environment override the model", () => {
    const previous = process.env.OPENROUTER_MODEL;
    process.env.OPENROUTER_MODEL = "some/other-model:free";
    expect(reasoningConfig().model).toBe("some/other-model:free");
    if (previous === undefined) delete process.env.OPENROUTER_MODEL;
    else process.env.OPENROUTER_MODEL = previous;
  });

  it("reports the key's presence and never its value", () => {
    const previous = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "sk-or-v1-not-a-real-key";
    const config = reasoningConfig();
    expect(config.enabled).toBe(true);
    expect(JSON.stringify(config)).not.toContain("sk-or-v1");
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
  });

  it("names no model anywhere else in the source", () => {
    const root = join(process.cwd(), "src");
    const files = [
      join(root, "lib", "intelligence", "providers", "openrouter.ts"),
      join(root, "app", "api", "intelligence", "route.ts"),
      join(root, "components", "intelligence-guide", "FoldmarkIntelligence.tsx"),
    ];
    let mentions = 0;
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (source.includes("poolside/laguna")) mentions += 1;
      // The model this replaced must be gone entirely.
      expect(source).not.toContain("z-ai/glm");
    }
    expect(mentions).toBe(1);
  });
});

/* ========================================================================== */
/*  RUNTIME INDEPENDENCE                                                      */
/* ========================================================================== */

describe("production ingestion does not depend on a developer machine", () => {
  const workflow = readFileSync(join(process.cwd(), ".github", "workflows", "ingest.yml"), "utf8");

  it("is scheduled by hosted infrastructure", () => {
    expect(workflow).toContain("schedule:");
    expect(workflow).toContain("runs-on: ubuntu-latest");
  });

  it("calls the hosted endpoint, not a local one", () => {
    expect(workflow).toContain("https://foldmark-iota.vercel.app/api/cron/ingest");
    expect(workflow).not.toMatch(/localhost|127\.0\.0\.1/);
  });

  it("carries its secret in a header rather than a URL", () => {
    expect(workflow).toContain("Authorization: Bearer");
    expect(workflow).not.toMatch(/[?&]key=\$\{\{/);
  });

  it("holds no credential in the repository", () => {
    expect(workflow).toContain("${{ secrets.INGEST_SECRET }}");
    expect(workflow).not.toMatch(/sk-or-v1-[a-z0-9]/i);
    expect(workflow).not.toMatch(/eyJhbGciOi/);
  });

  it("does not let a slow pass overlap the next tick", () => {
    // Two passes at once would spend the provider budget twice for one range.
    expect(workflow).toContain("concurrency:");
    // Never cancel mid-flight: a cancelled pass could leave a range partly
    // committed, and the cursor contract depends on whole-range commits.
    expect(workflow).toContain("cancel-in-progress: false");
  });

  it("fails loudly when a pass does not commit", () => {
    // A silent red run is how an index stops moving without anyone noticing.
    expect(workflow).toContain("exit 1");
  });
});

/* ========================================================================== */
/*  INGESTION HEALTH                                                          */
/* ========================================================================== */

describe("health describes the ingestion, not the web server", () => {
  const now = Date.now();
  const minutesAgo = (m: number) => new Date(now - m * 60_000).toISOString();

  it("is healthy after a recent pass with ordinary lag", () => {
    expect(ingestionHealth(minutesAgo(5), 3_000)).toBe("HEALTHY");
  });

  it("tolerates a delayed schedule rather than crying failure", () => {
    // The scheduler drifts. One missed cycle is not a broken pipeline.
    expect(ingestionHealth(minutesAgo(20), 12_000)).toBe("HEALTHY");
  });

  it("goes stale when no pass has committed for too long", () => {
    expect(ingestionHealth(minutesAgo(90), 1_000)).toBe("STALE");
  });

  it("reports stale over healthy even when lag looks small", () => {
    // A tiny lag figure computed from an old cursor is not evidence of health;
    // it just means nothing has moved. Staleness has to dominate.
    expect(ingestionHealth(minutesAgo(120), 10)).toBe("STALE");
  });

  it("degrades when the index falls far behind the head", () => {
    expect(ingestionHealth(minutesAgo(5), 500_000)).toBe("DEGRADED");
  });

  it("is stale when nothing has ever succeeded", () => {
    expect(ingestionHealth(null, null)).toBe("STALE");
  });

  it("treats an unparseable timestamp as stale rather than healthy", () => {
    expect(ingestionHealth("not-a-date", 100)).toBe("STALE");
  });
});
