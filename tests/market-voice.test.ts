import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withheldMetrics } from "@/lib/market-copy";
import { GET as marketApi } from "@/app/api/v1/market/[contract]/route";

/**
 * One market voice.
 *
 * The failure this suite prevents was live in production. Two market pipelines
 * ran side by side: an older one with no coverage on this chain, and the
 * enrichment path that actually holds observations. The asset passport rendered
 * both, so it announced that no venue had been observed quoting a contract
 * while listing twenty pools and a $325.92 DEX price further down the same
 * page. The public API said the same two things from two endpoints in the same
 * second.
 *
 * A product that contradicts itself is worse than one that says nothing,
 * because a reader cannot tell which half to believe — and the half that was
 * wrong was the half asserting ABSENCE. That is the claim FOLDMARK is least
 * entitled to make carelessly: its whole promise is that a missing figure means
 * nothing was observed, not that nobody looked.
 *
 * So: one pipeline, and every sentence about absence derived from what is
 * actually held.
 */

const ASSET_ID = "44444444-4444-4444-4444-444444444444";
const CONTRACT = "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9";
const originalFetch = globalThis.fetch;
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalPostgresUrl = process.env.POSTGRES_URL;

beforeEach(() => {
  process.env.SUPABASE_URL = "https://test.invalid";
  process.env.SUPABASE_SERVICE_ROLE_JWT = "test-key";
  /**
   * Pin the read path.
   *
   * `getAssetByAddress` prefers a direct SQL connection and falls back to REST.
   * A DATABASE_URL in the developer's own shell would send these through a
   * connection that cannot be reached from a test, and the route would report
   * an unknown asset for reasons that have nothing to do with the code. The
   * suite states which path it is exercising rather than inheriting one.
   */
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_JWT;
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalPostgresUrl === undefined) delete process.env.POSTGRES_URL;
  else process.env.POSTGRES_URL = originalPostgresUrl;
});

describe("a sentence claiming absence is derived, never asserted", () => {
  it("does not say a contract is unquoted when observations exist", () => {
    const [[, priceReason]] = withheldMetrics(12, 20);
    expect(priceReason).not.toMatch(/no venue has been observed quoting/i);
    // The real reason: alignment, not absence.
    expect(priceReason).toMatch(/at or before it/);
    expect(priceReason).toMatch(/unpriced/);
  });

  it("does not say no pool was identified when pools are listed", () => {
    const [, [, liquidityReason]] = withheldMetrics(12, 20);
    expect(liquidityReason).not.toMatch(/no DEX pool has been identified/i);
    // Depth is not carried backwards over a window it never described.
    expect(liquidityReason).toMatch(/depth today is not its depth during a past window/i);
  });

  it("still says nothing was observed when nothing was", () => {
    const [[, priceReason], [, liquidityReason]] = withheldMetrics(0, 0);
    expect(priceReason).toMatch(/no venue has been observed quoting/i);
    expect(priceReason).toMatch(/nothing is estimated in its place/i);
    expect(liquidityReason).toMatch(/no DEX pool has been identified/i);
  });

  it("keeps the two halves independent", () => {
    // Pools without persisted observations is a real state: enrichment recorded
    // the markets before any price row was written for the asset.
    const [[, priceReason], [, liquidityReason]] = withheldMetrics(0, 20);
    expect(priceReason).toMatch(/no venue has been observed quoting/i);
    expect(liquidityReason).toMatch(/depth today is not its depth/i);
  });
});

describe("the passport reads one market pipeline", () => {
  const page = readFileSync(join(process.cwd(), "src", "app", "assets", "[contract]", "page.tsx"), "utf8");

  it("no longer imports the second, uncovered pipeline", () => {
    // Removed, not hidden. A panel rendering `null` still runs the pipeline and
    // still drifts from the one that holds the data.
    expect(page).not.toMatch(/getMarketSnapshot/);
    expect(page).not.toMatch(/MarketPanel/);
    expect(page).not.toMatch(/market-data\/scheduler/);
  });

  it("renders the observed markets beside the chart", () => {
    expect(page).toMatch(/<DexMarkets market=\{dexMarket\}/);
    // Exactly once: two copies of the same panel is its own kind of confusion.
    expect(page.match(/<DexMarkets /g)).toHaveLength(1);
  });

  it("derives the withheld copy from what it holds", () => {
    expect(page).toMatch(/withheldMetrics\(history\?\.points\.length \?\? 0, dexMarket\?\.markets\.length \?\? 0\)/);
  });
});

/* ------------------------------------------------------------------- the API */

function mockStore(opts: {
  asset?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  prices?: unknown[];
}) {
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    let body: unknown = [];
    if (u.includes("/asset_metadata")) body = opts.metadata ? [opts.metadata] : [];
    else if (u.includes("/prices")) body = opts.prices ?? [];
    else if (u.includes("/assets")) body = opts.asset ? [opts.asset] : [];
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

const ASSET_ROW = {
  id: ASSET_ID,
  contract_address: CONTRACT,
  symbol: "AAPL",
  name: "Apple",
  asset_type: "stock_token",
  verified: false,
  decimals: 18,
  source: "chain",
};

const MATCHED = {
  metadata_json: {
    market: {
      mapping_status: "MATCHED",
      provider: "GeckoTerminal",
      network: "robinhood",
      primary: {
        pair_address: "0xpool",
        pair_name: "IDOG / AAPL",
        venue: "bankr-robinhood",
        price_usd: 325.922881,
        side: "quote",
        liquidity_usd: 3498151,
        volume_24h_usd: 567,
      },
      markets: [
        {
          pair_address: "0xpool",
          pair_name: "IDOG / AAPL",
          venue: "bankr-robinhood",
          price_usd: 325.922881,
          side: "quote",
          liquidity_usd: 3498151,
          volume_24h_usd: 567,
        },
        {
          pair_address: "0xpool2",
          pair_name: "AAPL / USDG",
          venue: "uniswap-v4-robinhood",
          price_usd: 320.240034,
          side: "base",
          liquidity_usd: 502482,
          volume_24h_usd: 2583439,
        },
      ],
    },
  },
  observed_at: "2026-09-04T21:17:00Z",
};

const ctx = { params: Promise.resolve({ contract: CONTRACT }) };

describe("the public market endpoint reports what the product holds", () => {
  it("reports the observed price rather than announcing no source", async () => {
    mockStore({ asset: ASSET_ROW, metadata: MATCHED, prices: [] });
    const body = await (await marketApi(new Request("https://t/"), ctx)).json();

    expect(body.market_status).toBe("MATCHED");
    expect(body.price.value).toBeCloseTo(325.922881, 6);
    expect(body.price.price_type).toBe("DEX_SPOT");
    // The trap: this contract is the QUOTE token in the featured pair, and the
    // side must travel with the price or a consumer reads the other token's.
    expect(body.price.side).toBe("quote");
    expect(body.markets).toHaveLength(2);
    // The old response for this exact contract, in production.
    expect(JSON.stringify(body)).not.toMatch(/No source returned a usable quote/);
  });

  it("never lets a listing be read as verification", async () => {
    mockStore({ asset: ASSET_ROW, metadata: MATCHED, prices: [] });
    const body = await (await marketApi(new Request("https://t/"), ctx)).json();
    expect(body.verified).toBe(false);
    expect(body.verification_note).toMatch(/It is not verification/);
  });

  it("says how the featured pool was chosen, so it is not read as a consensus", async () => {
    mockStore({ asset: ASSET_ROW, metadata: MATCHED, prices: [] });
    const body = await (await marketApi(new Request("https://t/"), ctx)).json();
    expect(body.price.selection).toMatch(/a selection, never an average/);
  });

  it("keeps NO_MARKET and UNCHECKED apart", async () => {
    mockStore({
      asset: ASSET_ROW,
      // NO_MATCH is what enrichment writes: the provider was asked about this
      // exact contract and answered with no pools.
      metadata: { metadata_json: { market: { mapping_status: "NO_MATCH", provider: "GeckoTerminal" } }, observed_at: null },
      prices: [],
    });
    const asked = await (await marketApi(new Request("https://t/"), ctx)).json();
    expect(asked.market_status).toBe("NO_MARKET");
    expect(asked.reason).toMatch(/asked for pools holding this exact contract and reported none/);

    mockStore({ asset: ASSET_ROW, metadata: null, prices: [] });
    const unasked = await (await marketApi(new Request("https://t/"), ctx)).json();
    expect(unasked.market_status).toBe("UNCHECKED");
    // The distinction the whole data-state model exists to protect.
    expect(unasked.reason).toMatch(/not a report that no market exists/i);
  });

  it("declines to claim anything about a contract it does not hold", async () => {
    mockStore({ asset: null });
    const body = await (await marketApi(new Request("https://t/"), ctx)).json();
    expect(body.market_status).toBe("UNCHECKED");
    expect(body.reason).toMatch(/not in FOLDMARK's asset registry/);
    expect(body.price).toBeNull();
  });

  it("refuses a ticker where a contract belongs", async () => {
    const res = await marketApi(new Request("https://t/"), { params: Promise.resolve({ contract: "AAPL" }) });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toMatch(/never by ticker/);
  });
});
