import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { flowIntelligence } from "@/server/flows/intelligence";

/**
 * Capital flow intelligence.
 *
 * Two failures this suite prevents.
 *
 * The first is arithmetic. One NVDA plus one USDG is not two of anything, so
 * nothing may rank assets by summing raw token amounts across them. Ranking uses
 * transfer and counterparty counts, which are comparable.
 *
 * The second is editorial. A change from one transfer to three is a 200%
 * increase and means almost nothing. FOLDMARK reports both numbers and declines
 * to call any of it significant, unusual or notable — that judgement needs a
 * baseline the product has not established, and inventing one dressed as a
 * score is how observation turns into fortune telling.
 */

const originalFetch = globalThis.fetch;
const NOW = Date.parse("2026-09-04T06:00:00Z");

beforeEach(() => {
  process.env.SUPABASE_URL = "https://test.invalid";
  process.env.SUPABASE_SERVICE_ROLE_JWT = "test-key";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_JWT;
});

const A = "0xaaaa000000000000000000000000000000000001";
const B = "0xbbbb000000000000000000000000000000000002";
const POOL = "0x19d55aba3e5d2c389b7011c634725136dfdcae33";

type Row = { asset_id: string | null; from_address: string; to_address: string; timestamp: string };

/**
 * Routes the four reads the module performs. The transfers endpoint is asked
 * twice — current window, then previous — and is distinguished by the presence
 * of a `lt.` bound on the previous one.
 */
function mockStore(opts: {
  current?: Row[];
  previous?: Row[];
  contracts?: { address: string; contract_type: string | null; protocol_id: string | null }[];
  assets?: { id: string; symbol: string }[];
}) {
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    let body: unknown = [];
    if (u.includes("/contracts")) body = opts.contracts ?? [];
    else if (u.includes("/assets")) body = opts.assets ?? [];
    else if (u.includes("/transfers")) body = u.includes("timestamp=lt.") ? (opts.previous ?? []) : (opts.current ?? []);
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();

describe("windows are compared with the equivalent window before them", () => {
  it("reports both numbers behind every change", async () => {
    mockStore({
      current: [
        { asset_id: "a1", from_address: A, to_address: B, timestamp: at(10) },
        { asset_id: "a1", from_address: A, to_address: B, timestamp: at(20) },
      ],
      previous: [{ asset_id: "a1", from_address: A, to_address: B, timestamp: at(100) }],
    });
    const intel = await flowIntelligence("1H", NOW);
    const t = intel.deltas.find((d) => d.metric === "TRANSFERS");
    expect(t?.previous).toBe(1);
    expect(t?.current).toBe(2);
    expect(t?.change).toBe(1);
  });

  it("declines a ratio when the previous window was empty", async () => {
    // Dividing by nothing would manufacture an infinite increase out of a
    // window that simply had no activity.
    mockStore({ current: [{ asset_id: "a1", from_address: A, to_address: B, timestamp: at(5) }], previous: [] });
    const intel = await flowIntelligence("1H", NOW);
    const t = intel.deltas.find((d) => d.metric === "TRANSFERS");
    expect(t?.changeRatio).toBeNull();
    expect(intel.observations.join(" ")).toMatch(/previous window had none/);
  });

  it("says nothing changed when nothing changed", async () => {
    const rows = [{ asset_id: "a1", from_address: A, to_address: B, timestamp: at(5) }];
    mockStore({ current: rows, previous: [{ ...rows[0], timestamp: at(70) }] });
    const intel = await flowIntelligence("1H", NOW);
    expect(intel.deltas.filter((d) => d.change !== 0)).toHaveLength(0);
  });
});

describe("ranking uses comparable measures only", () => {
  it("ranks assets by transfer count, not by token amount", async () => {
    mockStore({
      current: [
        { asset_id: "a1", from_address: A, to_address: B, timestamp: at(1) },
        { asset_id: "a1", from_address: B, to_address: A, timestamp: at(2) },
        { asset_id: "a2", from_address: A, to_address: B, timestamp: at(3) },
      ],
      assets: [
        { id: "a1", symbol: "SPY" },
        { id: "a2", symbol: "USDG" },
      ],
    });
    const intel = await flowIntelligence("1H", NOW);
    expect(intel.topAssets[0].symbol).toBe("SPY");
    expect(intel.topAssets[0].transfers).toBe(2);
    // Counterparty breadth is comparable too, and is reported alongside.
    expect(intel.topAssets[0].counterparties).toBe(2);
  });

  it("never sums token amounts across assets", () => {
    const source = readFileSync(join(process.cwd(), "src", "server", "flows", "intelligence.ts"), "utf8");
    // The module must not READ an amount column at all — the word appears in
    // its prose explaining why, so the check is on what it selects and on the
    // absence of any arithmetic over amounts.
    expect(source).not.toMatch(/select=[^"`]*amount/);
    expect(source).not.toMatch(/.amount/);
    expect(source).not.toMatch(/amounts*[+*]/);
    expect(source).toMatch(/not comparable across assets/i);
  });

  it("surfaces only registry-identified venues", async () => {
    mockStore({
      current: [
        { asset_id: "a1", from_address: POOL, to_address: A, timestamp: at(1) },
        { asset_id: "a1", from_address: A, to_address: B, timestamp: at(2) },
      ],
      contracts: [{ address: POOL, contract_type: "dex_pool", protocol_id: "uniswap-v3-robinhood" }],
    });
    const intel = await flowIntelligence("1H", NOW);
    expect(intel.topVenues).toHaveLength(1);
    expect(intel.topVenues[0].address).toBe(POOL);
    expect(intel.topVenues[0].protocolId).toBe("uniswap-v3-robinhood");
  });

  it("classifies each window with the same registry", async () => {
    mockStore({
      current: [{ asset_id: "a1", from_address: POOL, to_address: A, timestamp: at(1) }],
      previous: [{ asset_id: "a1", from_address: A, to_address: POOL, timestamp: at(70) }],
      contracts: [{ address: POOL, contract_type: "dex_pool", protocol_id: null }],
    });
    const intel = await flowIntelligence("1H", NOW);
    expect(intel.current.byClass.DEX_BUY).toBe(1);
    expect(intel.previous.byClass.DEX_SELL).toBe(1);
  });

  it("leaves everything unclassified when no registry exists", async () => {
    mockStore({
      current: [{ asset_id: "a1", from_address: A, to_address: B, timestamp: at(1) }],
      contracts: [],
    });
    const intel = await flowIntelligence("1H", NOW);
    expect(intel.current.byClass.UNCLASSIFIED).toBe(1);
  });
});

describe("observations describe, they do not judge", () => {
  it("attaches no verdict words to a change", async () => {
    mockStore({
      current: Array.from({ length: 40 }, (_, i) => ({
        asset_id: "a1",
        from_address: A,
        to_address: B,
        timestamp: at(i % 50),
      })),
      previous: [{ asset_id: "a1", from_address: A, to_address: B, timestamp: at(70) }],
    });
    const intel = await flowIntelligence("1H", NOW);
    const text = intel.observations.join(" ").toLowerCase();
    // A fortyfold rise is still just a number. No adjective may be attached.
    for (const verdict of ["unusual", "significant", "spike", "surge", "anomal", "alarming", "notable", "suspicious"]) {
      expect(text, verdict).not.toContain(verdict);
    }
  });

  it("introduces no opaque score", () => {
    const source = readFileSync(join(process.cwd(), "src", "server", "flows", "intelligence.ts"), "utf8");
    for (const banned of ["riskScore", "alphaScore", "smartMoney", "sentiment", "prediction", "forecast"]) {
      expect(source).not.toContain(banned);
    }
  });

  it("shows both numbers in the panel rather than a percentage alone", () => {
    const panel = readFileSync(join(process.cwd(), "src", "components", "intelligence", "StructureChange.tsx"), "utf8");
    expect(panel).toContain("PREVIOUS");
    expect(panel).toContain("CURRENT");
    expect(panel).toMatch(/scored or flagged as unusual/i);
  });
});
