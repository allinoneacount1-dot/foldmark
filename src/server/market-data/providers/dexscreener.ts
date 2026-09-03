import { cached } from "@/server/market-data/cache";
import { recordFailure, recordRateLimited, recordSuccess, requestPermission } from "@/server/market-data/budget";
import { freshnessFor, type MarketPrice } from "@/server/market-data/types";
import { CHAIN } from "@/config/site";

/**
 * DEX Screener.
 *
 * Verified 2026-09-03: /latest/dex/search returns pairs carrying
 * chainId "robinhood" with priceUsd, liquidity and volume — 24 of them for USDG
 * alone. Support is real, not assumed.
 *
 * Two constraints shape how it is used.
 *
 * Technical: responses carry `cache-control: public, max-age=60`, so polling
 * faster than a minute buys nothing. The TTL here matches their own.
 *
 * Contractual: their terms restrict products that compete with their screener
 * and restrict redistributing their data. FOLDMARK is a market intelligence
 * product, so the overlap is not obviously nil. This provider is therefore a
 * cross-check that can be switched off without the product losing a capability
 * — never a single source of truth. The owner should confirm the intended use
 * before a commercial deployment; see registry.ts.
 */

const BASE = "https://api.dexscreener.com/latest/dex";
const CHAIN_SLUG = "robinhood";

/** Their token endpoint accepts a comma-separated list — one call, many assets. */
const MAX_ADDRESSES = 30;

/** Matches the provider's own max-age. Anything shorter is a wasted request. */
const TTL_MS = 60_000;
const SWR_MS = 60_000;

type Pair = {
  chainId: string;
  dexId?: string;
  pairAddress?: string;
  baseToken?: { address?: string; symbol?: string };
  quoteToken?: { address?: string; symbol?: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  pairCreatedAt?: number;
};

async function call<T>(path: string): Promise<T | null> {
  const permit = requestPermission("dexscreener");
  if (!permit.allowed) return null;

  const started = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });

    if (res.status === 429) {
      const retry = Number(res.headers.get("retry-after") ?? "60") * 1000;
      recordRateLimited("dexscreener", Number.isFinite(retry) ? retry : 60_000);
      return null;
    }
    if (!res.ok) {
      recordFailure("dexscreener", `HTTP ${res.status}`);
      return null;
    }

    recordSuccess("dexscreener", Date.now() - started);
    return (await res.json()) as T;
  } catch (error) {
    recordFailure("dexscreener", error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * The deepest Robinhood Chain pair per requested contract.
 *
 * An asset usually has several pairs; the one with the most liquidity is the
 * least manipulable quote, so that is the observation recorded. Pairs on other
 * chains that happen to share an address are discarded.
 */
export async function fetchTokenPrices(addresses: string[]): Promise<MarketPrice[]> {
  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))].filter(Boolean);
  if (!unique.length) return [];

  const best = new Map<string, { pair: Pair; liquidity: number }>();

  for (let i = 0; i < unique.length; i += MAX_ADDRESSES) {
    const chunk = unique.slice(i, i + MAX_ADDRESSES);
    const payload = await cached(
      `ds:tokens:${chunk.join(",")}`,
      { ttlMs: TTL_MS, staleWhileRevalidateMs: SWR_MS, provider: "dexscreener" },
      () => call<{ pairs: Pair[] | null }>(`/tokens/${chunk.join(",")}`),
    );

    for (const pair of payload?.pairs ?? []) {
      if (pair.chainId !== CHAIN_SLUG) continue;
      const base = pair.baseToken?.address?.toLowerCase();
      if (!base || !unique.includes(base)) continue;
      const price = pair.priceUsd ? Number(pair.priceUsd) : NaN;
      if (!Number.isFinite(price) || price <= 0) continue;

      const liquidity = pair.liquidity?.usd ?? 0;
      const current = best.get(base);
      if (!current || liquidity > current.liquidity) best.set(base, { pair, liquidity });
    }
  }

  const observedAt = Date.now();
  return [...best.entries()].map(([address, { pair }]) => ({
    assetId: null,
    contractAddress: address,
    chainId: CHAIN.id,
    price: Number(pair.priceUsd),
    currency: "USD",
    priceType: "DEX_SPOT" as const,
    source: "dexscreener" as const,
    observedAt: new Date(observedAt).toISOString(),
    // no per-pair quote time is published; their cache header implies up to 60s old
    providerTimestamp: null,
    blockNumber: null,
    pairAddress: pair.pairAddress ?? null,
    liquidityUsd: pair.liquidity?.usd ?? null,
    confidence: 0,
    freshness: freshnessFor("DEX_SPOT", observedAt, observedAt),
  }));
}

export type DiscoveredPair = {
  contractAddress: string;
  symbol: string | null;
  pairAddress: string | null;
  dexId: string | null;
  priceUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
};

/**
 * Pair discovery by search term.
 *
 * Used to find where an asset trades, not to identify it — the contract address
 * remains the only identity. Results on other chains are dropped.
 */
export async function searchPairs(query: string): Promise<DiscoveredPair[]> {
  const payload = await cached(
    `ds:search:${query.toLowerCase()}`,
    { ttlMs: 300_000, staleWhileRevalidateMs: 300_000, provider: "dexscreener" },
    () => call<{ pairs: Pair[] | null }>(`/search?q=${encodeURIComponent(query)}`),
  );

  return (payload?.pairs ?? [])
    .filter((p) => p.chainId === CHAIN_SLUG && p.baseToken?.address)
    .map((p) => ({
      contractAddress: p.baseToken!.address!.toLowerCase(),
      symbol: p.baseToken?.symbol ?? null,
      pairAddress: p.pairAddress ?? null,
      dexId: p.dexId ?? null,
      priceUsd: p.priceUsd ? Number(p.priceUsd) : null,
      liquidityUsd: p.liquidity?.usd ?? null,
      volume24hUsd: p.volume?.h24 ?? null,
    }))
    .sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0));
}
