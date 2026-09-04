import { describe, it, expect, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { poolsForContract, primaryMarket, NETWORK_ID, type MarketObservation } from "@/server/market/geckoterminal";
import { classifyEdge, buildContractIndex } from "@/lib/flow-classification";

/**
 * Market enrichment.
 *
 * The failure this suite exists to prevent is publishing one token's price
 * under another token's name.
 *
 * A pool has a base side and a quote side, and `base_token_price_usd` is the
 * price of whichever token is base. FOLDMARK's asset is not always the base:
 * SPY's deepest pool is `SPY / WETH`, but AAPL's is `ICOIN / AAPL`, where AAPL
 * is the QUOTE. Reading the base price there would put ICOIN's value on Apple's
 * passport — a fabricated financial figure, delivered confidently, which is
 * precisely the class of error this product exists not to make.
 *
 * The second line held here is that a market listing is not verification, and
 * a reference chart is not an on-chain price.
 */

const SPY = "0x117cc2133c37b721f49de2a7a74833232b3b4c0c";
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** A provider payload shaped exactly like the live one. */
function poolPayload(over: {
  base: string;
  quote: string;
  basePrice?: string | null;
  quotePrice?: string | null;
  address?: string;
  name?: string;
  reserve?: string | null;
  volume?: string | null;
  dex?: string;
}) {
  return {
    attributes: {
      address: over.address ?? "0xpool0000000000000000000000000000000000aa",
      name: over.name ?? "PAIR",
      base_token_price_usd: over.basePrice === undefined ? "100" : over.basePrice,
      quote_token_price_usd: over.quotePrice === undefined ? "200" : over.quotePrice,
      reserve_in_usd: over.reserve === undefined ? "1000" : over.reserve,
      volume_usd: { h24: over.volume === undefined ? "5000" : over.volume },
    },
    relationships: {
      base_token: { data: { id: `robinhood_${over.base}` } },
      quote_token: { data: { id: `robinhood_${over.quote}` } },
      dex: { data: { id: over.dex ?? "uniswap-v3-robinhood" } },
    },
  };
}

function mockProvider(status: number, body: unknown, headers: Record<string, string> = {}) {
  globalThis.fetch = (async () =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    })) as typeof fetch;
}

/* ========================================================================== */
/*  THE BASE / QUOTE TRAP                                                     */
/* ========================================================================== */

describe("a price is taken from the requested contract's own side", () => {
  it("uses the base price when our asset is the base token", async () => {
    mockProvider(200, { data: [poolPayload({ base: SPY, quote: "0xbbb0000000000000000000000000000000000bbb", basePrice: "774.45", quotePrice: "2512.91" })] });
    const r = await poolsForContract(SPY);
    expect(r.status).toBe("MATCHED");
    if (r.status !== "MATCHED") return;
    expect(r.markets[0].priceUsd).toBe(774.45);
    expect(r.markets[0].side).toBe("base");
  });

  it("uses the quote price when our asset is the quote token", async () => {
    // The AAPL / ICOIN case, live. Taking the base price here would publish a
    // completely different token's value under this asset.
    mockProvider(200, { data: [poolPayload({ base: "0xccc0000000000000000000000000000000000ccc", quote: SPY, basePrice: "0.0044", quotePrice: "327.40" })] });
    const r = await poolsForContract(SPY);
    expect(r.status).toBe("MATCHED");
    if (r.status !== "MATCHED") return;
    expect(r.markets[0].priceUsd).toBe(327.4);
    expect(r.markets[0].side).toBe("quote");
    expect(r.markets[0].priceUsd).not.toBe(0.0044);
  });

  it("discards a pool that does not contain the requested contract at all", async () => {
    // The provider can return related pools. One that names neither side is not
    // a market for this asset, and its price is not this asset's price.
    mockProvider(200, {
      data: [poolPayload({ base: "0xddd0000000000000000000000000000000000ddd", quote: "0xeee0000000000000000000000000000000000eee" })],
    });
    expect((await poolsForContract(SPY)).status).toBe("NO_MATCH");
  });

  it("matches on address regardless of the case the provider returns", async () => {
    mockProvider(200, { data: [poolPayload({ base: SPY.toUpperCase(), quote: "0xfff0000000000000000000000000000000000fff" })] });
    expect((await poolsForContract(SPY)).status).toBe("MATCHED");
  });

  it("never matches on symbol or pair name", async () => {
    // The pool is called "SPY / WETH" but holds different contracts entirely.
    // A ticker collision must not attach this market to our asset.
    mockProvider(200, {
      data: [poolPayload({ base: "0x1110000000000000000000000000000000000111", quote: "0x2220000000000000000000000000000000000222", name: "SPY / WETH 0.05%" })],
    });
    expect((await poolsForContract(SPY)).status).toBe("NO_MATCH");
  });

  it("skips a pool with no usable price for our side rather than reporting zero", async () => {
    mockProvider(200, { data: [poolPayload({ base: SPY, quote: "0xbbb0000000000000000000000000000000000bbb", basePrice: null })] });
    expect((await poolsForContract(SPY)).status).toBe("NO_MATCH");
  });

  it("rejects a malformed contract argument outright", async () => {
    const r = await poolsForContract("SPY");
    expect(r.status).toBe("ERROR");
  });
});

/* ========================================================================== */
/*  PROVIDER FAILURE                                                          */
/* ========================================================================== */

describe("provider failure is a state, never a fabricated value", () => {
  it("reports 404 as no market, which is an answer", async () => {
    mockProvider(404, {});
    expect((await poolsForContract(SPY)).status).toBe("NO_MATCH");
  });

  it("reports 429 as rate limited and honours Retry-After", async () => {
    mockProvider(429, {}, { "retry-after": "12" });
    const r = await poolsForContract(SPY);
    expect(r.status).toBe("RATE_LIMITED");
    if (r.status === "RATE_LIMITED") expect(r.retryAfterMs).toBe(12_000);
  });

  it("reports a 5xx as an error rather than as an empty market set", async () => {
    // "The provider broke" must never render as "this asset has no market".
    mockProvider(503, {});
    expect((await poolsForContract(SPY)).status).toBe("ERROR");
  });

  it("reports malformed JSON as an error", async () => {
    mockProvider(200, "not json at all");
    expect((await poolsForContract(SPY)).status).toBe("ERROR");
  });

  it("reports a network failure as an error", async () => {
    globalThis.fetch = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    expect((await poolsForContract(SPY)).status).toBe("ERROR");
  });
});

/* ========================================================================== */
/*  PRIMARY MARKET                                                            */
/* ========================================================================== */

describe("the featured market is selected, never averaged", () => {
  const market = (pair: string, price: number, reserve: number | null): MarketObservation => ({
    pairAddress: pair,
    pairName: "A / B",
    venue: "v",
    priceUsd: price,
    side: "base",
    counterContract: "0x0",
    reserveUsd: reserve,
    volume24hUsd: null,
    observedAt: "2026-09-04T00:00:00.000Z",
  });

  it("features the deepest pool", () => {
    const chosen = primaryMarket([market("0xa", 10, 100), market("0xb", 20, 900), market("0xc", 30, 500)]);
    expect(chosen?.pairAddress).toBe("0xb");
    expect(chosen?.priceUsd).toBe(20);
  });

  it("returns a real observed price, not a blend of them", () => {
    // The mean of 10, 20 and 30 is 20 as well, so assert identity rather than
    // value: the featured price must BE one of the observations.
    const markets = [market("0xa", 10, 100), market("0xb", 20, 900), market("0xc", 30, 500)];
    const chosen = primaryMarket(markets);
    expect(markets.some((m) => m.pairAddress === chosen?.pairAddress)).toBe(true);
  });

  it("is deterministic when depth ties", () => {
    const a = primaryMarket([market("0xb", 1, 50), market("0xa", 2, 50)]);
    const b = primaryMarket([market("0xa", 2, 50), market("0xb", 1, 50)]);
    expect(a?.pairAddress).toBe(b?.pairAddress);
  });

  it("returns nothing when there are no markets", () => {
    expect(primaryMarket([])).toBeNull();
  });
});

/* ========================================================================== */
/*  SEMANTIC FIREWALLS                                                        */
/* ========================================================================== */

describe("market data does not become verification or reference price", () => {
  const enrich = readFileSync(join(process.cwd(), "src", "server", "market", "enrich.ts"), "utf8");

  it("never writes verified true from provider data", () => {
    // A venue quoting a contract is not an issuer confirming it. This is the
    // exact defect that put a false VERIFIED badge on fourteen assets.
    expect(enrich).toContain("verified: false");
    expect(enrich).not.toMatch(/verified:\s*true/);
  });

  it("labels persisted prices as DEX_SPOT with their pool", () => {
    expect(enrich).toContain("DEX_SPOT");
    expect(enrich).toContain("pool ${featured.pairAddress}");
  });

  it("keeps reference-market code out of the enrichment path", () => {
    // TradingView is external context. It must never reach a DEX_SPOT figure.
    expect(enrich).not.toContain("tradingview");
    expect(enrich).not.toContain("reference-markets");
    expect(enrich).not.toContain("REFERENCE");
  });

  it("only registers real EVM addresses as venue contracts", () => {
    // Some venues identify a pool with a 32-byte id. Those can never equal an
    // address in a Transfer log, so they must not enter the identity registry.
    expect(enrich).toContain("/^0x[0-9a-f]{40}$/");
  });
});

describe("the browser never calls a market provider", () => {
  it("keeps the provider host out of every client component", () => {
    const roots = [join(process.cwd(), "src", "components")];
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name)) files.push(full);
      }
    };
    for (const r of roots) walk(r);

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (!source.startsWith('"use client"')) continue;
      expect(source, file).not.toContain("api.geckoterminal.com");
    }
  });
});

/* ========================================================================== */
/*  REGISTERED POOLS DRIVE CLASSIFICATION                                     */
/* ========================================================================== */

describe("a discovered pool earns its classification", () => {
  const POOL = "0x19d55aba3e5d2c389b7011c634725136dfdcae33";
  const WALLET = "0xaaaa000000000000000000000000000000000001";
  const registry = buildContractIndex([{ address: POOL, contract_type: "dex_pool" }]);

  it("classifies value leaving a discovered pool as a buy", () => {
    expect(classifyEdge({ from: POOL, to: WALLET }, registry)).toBe("DEX_BUY");
  });

  it("classifies value entering it as a sell", () => {
    expect(classifyEdge({ from: WALLET, to: POOL }, registry)).toBe("DEX_SELL");
  });

  it("leaves unrelated addresses unpromoted", () => {
    // Discovering one venue must not make every other address a venue.
    expect(classifyEdge({ from: WALLET, to: "0xbbbb000000000000000000000000000000000002" }, registry)).toBe(
      "WALLET_TRANSFER",
    );
  });

  it("claims nothing at all when no pool has been discovered", () => {
    const empty = buildContractIndex([]);
    expect(classifyEdge({ from: WALLET, to: POOL }, empty)).toBe("UNCLASSIFIED");
  });
});

describe("provider identity", () => {
  it("targets the verified Robinhood Chain network id", () => {
    expect(NETWORK_ID).toBe("robinhood");
  });
});
