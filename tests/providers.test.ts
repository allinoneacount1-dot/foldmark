import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { __clearCache, isFreshFetch } from "@/server/market-data/cache";
import { fetchTokenPrices as geckoPrices } from "@/server/market-data/providers/geckoterminal";
import { fetchTokenPrices as dexPrices } from "@/server/market-data/providers/dexscreener";
import { isProviderEnabled, providerDisabledReason } from "@/config/providers";
import { PROVIDERS } from "@/server/market-data/registry";
import { GECKOTERMINAL_TOKENS, DEXSCREENER_PAIRS, NVDA } from "./fixtures";

/**
 * Provider integration, against recorded responses.
 *
 * The fixtures are trimmed copies of real answers from the live services, so
 * these tests check that FOLDMARK reads what the providers actually send —
 * including the parts that are easy to misread. GeckoTerminal's multi-token
 * endpoint returns `total_reserve_in_usd`, which is the token's reserve across
 * every pool it knows, not the depth behind the quote. Labelling that as pool
 * liquidity would overstate tradeable depth by an order of magnitude, so the
 * basis is asserted here rather than assumed.
 *
 * Nothing here reaches the network. A suite that only passes while a third
 * party is up is not testing this repository.
 */

const originalFetch = globalThis.fetch;

function mockFetch(handler: (url: string) => unknown) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const body = handler(url);
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  __clearCache();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("GeckoTerminal — reads the real response shape", () => {
  it("parses a price and marks the observation as a genuine fetch", async () => {
    mockFetch(() => GECKOTERMINAL_TOKENS);
    const prices = await geckoPrices([NVDA]);

    expect(prices).toHaveLength(1);
    expect(prices[0].price).toBeCloseTo(229.26, 6);
    expect(prices[0].currency).toBe("USD");
    expect(prices[0].source).toBe("geckoterminal");
    expect(isFreshFetch(prices[0])).toBe(true);
  });

  it("labels total_reserve_in_usd as TOKEN_TOTAL_RESERVE, not pair depth", async () => {
    mockFetch(() => GECKOTERMINAL_TOKENS);
    const [price] = await geckoPrices([NVDA]);

    expect(price.liquidityBasis).toBe("TOKEN_TOTAL_RESERVE");
    expect(price.liquidityUsd).toBeCloseTo(7_412_880.55, 2);
    // This endpoint identifies no pair, so claiming one would be an invention.
    expect(price.pairAddress).toBeNull();
  });

  it("calls the provider once for two readers of the same contract", async () => {
    let calls = 0;
    mockFetch(() => {
      calls += 1;
      return GECKOTERMINAL_TOKENS;
    });

    const [first, second] = await Promise.all([geckoPrices([NVDA]), geckoPrices([NVDA])]);

    expect(calls).toBe(1);
    // Only one of them may be recorded as an observation.
    expect([isFreshFetch(first[0]), isFreshFetch(second[0])].filter(Boolean)).toHaveLength(1);
  });

  it("drops a row with an unusable price instead of storing zero", async () => {
    mockFetch(() => ({
      data: [
        { attributes: { address: NVDA, price_usd: "0", total_reserve_in_usd: "100" } },
        { attributes: { address: NVDA, price_usd: null, total_reserve_in_usd: "100" } },
      ],
    }));
    expect(await geckoPrices([NVDA])).toHaveLength(0);
  });

  it("returns nothing rather than throwing when the payload is not the expected shape", async () => {
    mockFetch(() => ({ unexpected: true }));
    expect(await geckoPrices([NVDA])).toHaveLength(0);
  });
});

describe("DEX Screener — reads the real response shape", () => {
  it("parses price, venue and pair from a recorded search response", async () => {
    mockFetch(() => DEXSCREENER_PAIRS);
    const prices = await dexPrices([NVDA]);

    expect(prices).toHaveLength(1);
    expect(prices[0].price).toBeCloseTo(229.41, 6);
    expect(prices[0].source).toBe("dexscreener");
    // This endpoint DOES identify the pair, so the liquidity is that pair's.
    expect(prices[0].liquidityBasis).toBe("PAIR_RESERVE");
    expect(prices[0].pairAddress).toBe("0xpair0000000000000000000000000000000000bb");
    expect(prices[0].dexId).toBe("uniswap");
  });

  it("ignores pairs from another chain", async () => {
    mockFetch(() => ({
      pairs: [
        {
          ...DEXSCREENER_PAIRS.pairs[0],
          chainId: "ethereum",
        },
      ],
    }));
    // A price from a different chain is a different asset. Accepting it would
    // put Ethereum's market on a Robinhood Chain contract's page.
    expect(await dexPrices([NVDA])).toHaveLength(0);
  });
});

describe("provider enablement — serving the chain and being permitted are separate", () => {
  it("keeps DEX Screener off by default, pending the owner's reading of its terms", () => {
    expect(PROVIDERS.dexscreener.chainSupport).toBe("SUPPORTED");
    // Supported and still not called: the restriction is contractual, not technical.
    expect(isProviderEnabled("dexscreener")).toBe(false);
    expect(providerDisabledReason("dexscreener")).toContain("DEXSCREENER_ENABLED");
  });

  it("never enables a provider that does not serve this chain, whatever the flag says", () => {
    expect(PROVIDERS.coingecko.chainSupport).not.toBe("SUPPORTED");
    expect(isProviderEnabled("coingecko")).toBe(false);
    expect(providerDisabledReason("coingecko")).toContain("chain support");
  });

  it("enables GeckoTerminal, which is probed as supported and permitted with attribution", () => {
    expect(isProviderEnabled("geckoterminal")).toBe(true);
    expect(providerDisabledReason("geckoterminal")).toBeNull();
    expect(PROVIDERS.geckoterminal.attribution).toBeTruthy();
  });
});

describe("registry — no provider claims support it has not evidenced", () => {
  it("carries written evidence for every provider marked SUPPORTED", () => {
    for (const facts of Object.values(PROVIDERS)) {
      if (facts.chainSupport !== "SUPPORTED") continue;
      expect(facts.evidence.length).toBeGreaterThan(20);
      expect(facts.lastReviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("records attribution wherever the terms require it", () => {
    // Attribution is a licence obligation, so a provider we call and are
    // required to credit must carry the string the UI renders.
    expect(PROVIDERS.geckoterminal.attribution).toBe("Data by GeckoTerminal");
  });
});
