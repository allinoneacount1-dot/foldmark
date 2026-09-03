import { describe, it, expect, beforeEach, vi } from "vitest";
import { cached, peek, isFreshFetch, __clearCache, type CachedResult } from "@/server/market-data/cache";
import { persistable, observationKey } from "@/server/market-data/persist";
import { reconcile, scoreConfidence } from "@/server/market-data/reconcile";
import { observation, NVDA } from "./fixtures";

/**
 * Provenance.
 *
 * Every rule here answers the same question: is this value something FOLDMARK
 * actually observed, or something it merely holds?
 *
 * The distinction has teeth. Read a cached quote a hundred times and write a
 * row each time, and the price history now shows a hundred observations that
 * never happened — a chart drawn from it describes a market that does not
 * exist. That is fabricated data produced entirely by correct-looking code, so
 * the guard against it is tested directly rather than trusted.
 */

beforeEach(() => {
  __clearCache();
  vi.useRealTimers();
});

describe("cache — a hit is never reported as a fetch", () => {
  it("marks the first call MISS and reports the time the call completed", async () => {
    const result = await cached("k1", { ttlMs: 60_000 }, async () => 42);
    expect(result.cacheState).toBe("MISS");
    expect(isFreshFetch(result)).toBe(true);
    expect(typeof result.fetchedAt).toBe("number");
  });

  it("marks a second read FRESH and keeps the ORIGINAL fetch time", async () => {
    const first = await cached("k2", { ttlMs: 60_000 }, async () => 1);
    await new Promise((r) => setTimeout(r, 25));
    const second = await cached("k2", { ttlMs: 60_000 }, async () => 2);

    expect(second.cacheState).toBe("FRESH");
    expect(second.value).toBe(1);
    // The critical assertion: fetchedAt is when the network call happened, not
    // when this read happened. "Now" here would date a stale value to the
    // present and turn it into a fresh observation.
    expect(second.fetchedAt).toBe(first.fetchedAt);
    expect(isFreshFetch(second)).toBe(false);
  });

  it("makes one outbound call for many concurrent readers and marks the rest COALESCED", async () => {
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return "value";
    };

    const results = await Promise.all(
      Array.from({ length: 10 }, () => cached("k3", { ttlMs: 60_000 }, fetcher)),
    );

    expect(calls).toBe(1);
    const fresh = results.filter(isFreshFetch);
    // Exactly one of ten readers may claim to have observed anything.
    expect(fresh).toHaveLength(1);
    expect(results.filter((r) => r.cacheState === "COALESCED")).toHaveLength(9);
  });

  it("refetches after the ttl expires and marks that call REFRESHED", async () => {
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return calls;
    };

    await cached("k4", { ttlMs: 10 }, fetcher);
    await new Promise((r) => setTimeout(r, 30));
    const after = await cached("k4", { ttlMs: 10 }, fetcher);

    expect(calls).toBe(2);
    expect(after.cacheState).toBe("REFRESHED");
    expect(isFreshFetch(after)).toBe(true);
  });

  it("serves the last good value inside the revalidate window when a refetch throws", async () => {
    const opts = { ttlMs: 5, staleWhileRevalidateMs: 60_000 };
    await cached("k5", opts, async () => "good");
    await new Promise((r) => setTimeout(r, 20));

    const after = await cached("k5", opts, async () => {
      throw new Error("provider down");
    });

    // The reader gets a real past quote rather than an error, and it is marked
    // as not-a-fetch so it can never be recorded as a new observation.
    expect(after.value).toBe("good");
    expect(after.cacheState).toBe("STALE_WHILE_REVALIDATE");
    expect(isFreshFetch(after)).toBe(false);
  });

  it("propagates the failure past the revalidate window rather than serving something too old", async () => {
    const opts = { ttlMs: 5, staleWhileRevalidateMs: 10 };
    await cached("k6", opts, async () => "good");
    await new Promise((r) => setTimeout(r, 40));

    // Beyond ttl + swr the held value is no longer fit to serve silently.
    // Failing is the honest outcome; peek() exists for callers that would
    // rather show an old value with its age than show nothing.
    await expect(
      cached("k6", opts, async () => {
        throw new Error("provider down");
      }),
    ).rejects.toThrow("provider down");

    const held = peek<string>("k6");
    expect(held?.value).toBe("good");
    expect(isFreshFetch(held!)).toBe(false);
  });
});

describe("persistable — only real observations may become history", () => {
  it("accepts MISS and REFRESHED, which are the states that made a network call", () => {
    const { eligible, fromCache } = persistable([
      observation({ cacheState: "MISS" }),
      observation({ cacheState: "REFRESHED" }),
    ]);
    expect(eligible).toHaveLength(2);
    expect(fromCache).toHaveLength(0);
  });

  it("rejects FRESH, COALESCED and STALE_WHILE_REVALIDATE — none of them observed anything", () => {
    const { eligible, fromCache } = persistable([
      observation({ cacheState: "FRESH" }),
      observation({ cacheState: "COALESCED" }),
      observation({ cacheState: "STALE_WHILE_REVALIDATE" }),
    ]);
    expect(eligible).toHaveLength(0);
    expect(fromCache).toHaveLength(3);
  });

  it("keeps one hundred reads of one cached quote from becoming one hundred rows", () => {
    const first = observation({ cacheState: "MISS" });
    const reads = Array.from({ length: 99 }, () => observation({ cacheState: "FRESH" }));
    const { eligible } = persistable([first, ...reads]);
    expect(eligible).toHaveLength(1);
  });
});

describe("observationKey — identity is the source and the moment, never the price", () => {
  it("treats two genuine observations carrying the same price as distinct rows", () => {
    const a = observation({ price: 229.26, fetchedAt: "2026-09-04T12:00:00.000Z" });
    const b = observation({ price: 229.26, fetchedAt: "2026-09-04T12:01:00.000Z" });
    // Deduplicating on price would silently discard b, losing a real data point
    // and making the market look less active than it was.
    expect(observationKey(a, "asset-nvda")).not.toBe(observationKey(b, "asset-nvda"));
  });

  it("treats the same source, venue and fetch as one row even if the price differs", () => {
    const a = observation({ price: 229.26 });
    const b = observation({ price: 231.0 });
    expect(observationKey(a, "asset-nvda")).toBe(observationKey(b, "asset-nvda"));
  });

  it("separates two providers quoting the same asset at the same instant", () => {
    const gecko = observation({ source: "geckoterminal" });
    const dex = observation({ source: "dexscreener" });
    expect(observationKey(gecko, "asset-nvda")).not.toBe(observationKey(dex, "asset-nvda"));
  });
});

describe("reconcile — disagreement is kept, never averaged", () => {
  const now = Date.parse("2026-09-04T12:00:00.000Z");
  const at = (iso: string) => ({ observedAt: iso, fetchedAt: iso });

  it("chooses one real observation rather than computing a mean", () => {
    const snapshot = reconcile(
      NVDA,
      [
        observation({ price: 229.26, liquidityUsd: 7_400_000, ...at("2026-09-04T11:59:50.000Z") }),
        observation({ price: 231.0, source: "dexscreener", liquidityUsd: 12_000, ...at("2026-09-04T11:59:50.000Z") }),
      ],
      now,
    );
    // The canonical price must be a number a source actually printed. A mean of
    // 230.13 describes no venue and would be indistinguishable from a quote.
    expect([229.26, 231.0]).toContain(snapshot.canonical!.price);
    expect(snapshot.canonical!.price).toBe(229.26); // the deeper venue wins
  });

  it("keeps every observation attached, including the one not chosen", () => {
    const snapshot = reconcile(
      NVDA,
      [observation({ price: 229.26 }), observation({ price: 231.0, source: "dexscreener" })],
      now,
    );
    expect(snapshot.observations).toHaveLength(2);
  });

  it("surfaces a divergence when two deep venues disagree beyond tolerance", () => {
    const snapshot = reconcile(
      NVDA,
      [
        observation({ price: 200, liquidityUsd: 5_000_000, ...at("2026-09-04T11:59:55.000Z") }),
        observation({
          price: 230,
          source: "dexscreener",
          liquidityUsd: 4_000_000,
          ...at("2026-09-04T11:59:55.000Z"),
        }),
      ],
      now,
    );
    expect(snapshot.divergence).not.toBeNull();
    expect(snapshot.divergence!.spreadPct).toBeGreaterThan(10);
  });

  it("does not raise a divergence when the shallow side explains the spread", () => {
    const snapshot = reconcile(
      NVDA,
      [
        observation({ price: 229, liquidityUsd: 5_000_000, ...at("2026-09-04T11:59:55.000Z") }),
        observation({ price: 232, source: "dexscreener", liquidityUsd: 4_000, ...at("2026-09-04T11:59:55.000Z") }),
      ],
      now,
    );
    // ~1.3% across a $4k pool is ordinary and saying otherwise would be noise.
    expect(snapshot.divergence).toBeNull();
  });

  it("returns a null canonical rather than inventing one when nothing was observed", () => {
    const snapshot = reconcile(NVDA, [], now);
    expect(snapshot.canonical).toBeNull();
    expect(snapshot.observations).toHaveLength(0);
  });
});

describe("scoreConfidence — a description of evidence, not a prediction", () => {
  const now = Date.parse("2026-09-04T12:00:00.000Z");

  it("scores a deep recent quote above a thin one", () => {
    const deep = scoreConfidence(
      observation({ liquidityUsd: 10_000_000, observedAt: "2026-09-04T11:59:50.000Z" }),
      now,
    );
    const thin = scoreConfidence(observation({ liquidityUsd: 900, observedAt: "2026-09-04T11:59:50.000Z" }), now);
    expect(deep).toBeGreaterThan(thin);
  });

  it("penalises age, so an old quote cannot score like a live one", () => {
    const live = scoreConfidence(observation({ observedAt: "2026-09-04T11:59:50.000Z" }), now);
    const old = scoreConfidence(observation({ observedAt: "2026-09-04T11:30:00.000Z" }), now);
    expect(old).toBeLessThan(live);
  });

  it("stays inside 0..1 for absurd inputs rather than producing a meaningless score", () => {
    const score = scoreConfidence(observation({ liquidityUsd: 1e18 }), now);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

/** Type-level guard: a CachedResult must always carry its provenance fields. */
const _typecheck: CachedResult<number> = { value: 1, fetchedAt: 0, cacheState: "MISS" };
void _typecheck;
