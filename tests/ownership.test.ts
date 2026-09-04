import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { observedOwnership, mayPublishHolderCount, ZERO_ADDRESS } from "@/server/ownership/balances";

/**
 * Ownership.
 *
 * The claim this suite refuses to let the product make is "this address holds
 * X". A figure derived from transfers is a balance only when every transfer
 * that ever touched the address is in hand. FOLDMARK follows the head of a
 * chain producing hundreds of thousands of blocks a day and reaches no asset's
 * first transfer, so what it has is a NET CHANGE over an observed window.
 *
 * An address holding a large position before the index began, and moving
 * nothing since, appears here as zero. Publishing that as a balance — or
 * counting such addresses as holders — would be confidently wrong about
 * someone's money.
 */

const ASSET = "11111111-1111-1111-1111-111111111111";
const A = "0xaaaa000000000000000000000000000000000001";
const B = "0xbbbb000000000000000000000000000000000002";

const originalFetch = globalThis.fetch;

/**
 * The data layer refuses to call out when it is not configured, which is
 * correct in production and means a test must configure it before the fetch
 * double is ever reached. The values are placeholders; no request leaves the
 * process.
 */
beforeEach(() => {
  process.env.SUPABASE_URL = "https://test.invalid";
  process.env.SUPABASE_SERVICE_ROLE_JWT = "test-key";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_JWT;
});

function mockTransfers(rows: { from: string; to: string; amount: string; at?: string }[]) {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify(
        rows.map((r) => ({
          from_address: r.from,
          to_address: r.to,
          amount: r.amount,
          timestamp: r.at ?? "2026-09-04T00:00:00Z",
        })),
      ),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof fetch;
}

describe("a net change is never presented as a balance", () => {
  it("reports coverage as PARTIAL, never COMPLETE", async () => {
    mockTransfers([{ from: A, to: B, amount: "100" }]);
    const snap = await observedOwnership(ASSET);
    // Head-following cannot reach an asset's first transfer, so COMPLETE is not
    // reachable and a holder count is therefore never publishable.
    expect(snap.coverage).toBe("PARTIAL");
    expect(mayPublishHolderCount(snap.coverage)).toBe(false);
  });

  it("only allows a holder count under complete coverage", () => {
    expect(mayPublishHolderCount("COMPLETE")).toBe(true);
    expect(mayPublishHolderCount("PARTIAL")).toBe(false);
    expect(mayPublishHolderCount("UNAVAILABLE")).toBe(false);
  });

  it("computes net change as received minus sent", async () => {
    mockTransfers([
      { from: A, to: B, amount: "300" },
      { from: B, to: A, amount: "100" },
    ]);
    const snap = await observedOwnership(ASSET);
    const a = snap.topDistributing.find((p) => p.address === A);
    const b = snap.topAccumulating.find((p) => p.address === B);
    expect(a?.netChange).toBe(-200n);
    expect(b?.netChange).toBe(200n);
  });

  it("counts addresses seen, and calls them that rather than holders", async () => {
    mockTransfers([
      { from: A, to: B, amount: "5" },
      { from: B, to: A, amount: "5" },
    ]);
    const snap = await observedOwnership(ASSET);
    expect(snap.observedAddresses).toBe(2);
    // The field is named for what it is. A holder count is a different claim.
    expect(Object.keys(snap)).not.toContain("holderCount");
  });
});

describe("the zero address is not a participant", () => {
  it("accounts a mint separately instead of as a sender", async () => {
    mockTransfers([{ from: ZERO_ADDRESS, to: A, amount: "1000" }]);
    const snap = await observedOwnership(ASSET);
    expect(snap.mintedInWindow).toBe(1000n);
    // The zero address must not appear as an address that "sent" anything.
    expect(snap.topDistributing.some((p) => p.address === ZERO_ADDRESS)).toBe(false);
    expect(snap.topAccumulating.some((p) => p.address === ZERO_ADDRESS)).toBe(false);
    expect(snap.observedAddresses).toBe(1);
  });

  it("accounts a burn separately instead of as a receiver", async () => {
    mockTransfers([{ from: A, to: ZERO_ADDRESS, amount: "250" }]);
    const snap = await observedOwnership(ASSET);
    expect(snap.burnedInWindow).toBe(250n);
    expect(snap.observedAddresses).toBe(1);
    expect(snap.topDistributing[0]?.netChange).toBe(-250n);
  });
});

describe("amounts are handled as base units, exactly", () => {
  it("does not lose precision on values beyond a double", async () => {
    // 2^53 + 1 is the first integer a double cannot represent. Token amounts
    // routinely exceed it, and rounding one silently corrupts a position.
    const huge = "9007199254740993";
    mockTransfers([{ from: A, to: B, amount: huge }]);
    const snap = await observedOwnership(ASSET);
    expect(snap.topAccumulating[0]?.netChange).toBe(BigInt(huge));
    expect(snap.topAccumulating[0]?.netChange.toString()).toBe(huge);
  });

  it("treats an unparseable amount as zero rather than NaN", async () => {
    mockTransfers([{ from: A, to: B, amount: "not-a-number" }]);
    const snap = await observedOwnership(ASSET);
    expect(snap.topAccumulating.length + snap.topDistributing.length).toBe(0);
  });
});

describe("absence is reported as absence", () => {
  it("returns UNAVAILABLE when the store cannot be read", async () => {
    globalThis.fetch = (async () => new Response("nope", { status: 500 })) as typeof fetch;
    const snap = await observedOwnership(ASSET);
    expect(snap.coverage).toBe("UNAVAILABLE");
  });

  it("returns UNAVAILABLE when nothing has been observed", async () => {
    mockTransfers([]);
    const snap = await observedOwnership(ASSET);
    expect(snap.coverage).toBe("UNAVAILABLE");
    expect(snap.observedAddresses).toBe(0);
  });
});

describe("the interface never claims a holder count or a share of supply", () => {
  const panel = readFileSync(
    join(process.cwd(), "src", "components", "market", "ObservedOwnership.tsx"),
    "utf8",
  );

  it("labels the figure a net change, not a balance", () => {
    expect(panel).toContain("NET CHANGE");
    expect(panel).not.toContain("BALANCE<");
  });

  it("renders no holder count and no percentage of supply", () => {
    expect(panel).not.toMatch(/HOLDERS\b/);
    expect(panel).not.toContain("% OF SUPPLY");
    expect(panel).not.toContain("concentration");
  });

  it("states the coverage limit next to the numbers", () => {
    expect(panel).toContain("coverageNote");
    expect(panel).toMatch(/no holder count/i);
  });

  it("does not call an observed address a person or a wallet", () => {
    expect(panel).toMatch(/nothing here claims a\s*\n?\s*\*?\s*participant is a person/i);
  });
});
