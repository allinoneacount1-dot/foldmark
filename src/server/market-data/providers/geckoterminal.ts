import { cached } from "@/server/market-data/cache";
import { recordFailure, recordRateLimited, recordSuccess, requestPermission } from "@/server/market-data/budget";
import { freshnessFor, type MarketPrice } from "@/server/market-data/types";
import { CHAIN } from "@/config/site";

/**
 * GeckoTerminal.
 *
 * Verified 2026-09-03: /networks lists {"id":"robinhood"}, and
 * /networks/robinhood/pools returns real pools — NVDA/USDG quoted at $229.26
 * against $7.4M of reserve. This is the strongest free DEX price source
 * available for this chain today.
 *
 * Assets are addressed by contract. Ticker matching is never used: a symbol is
 * attacker-controlled on a public chain and collides freely.
 *
 * Budgeted at 10 calls/minute against a documented ceiling several times
 * higher, and every call is batched and cached. It is meant for periodic
 * refresh and OHLCV backfill, never for per-request work.
 */

const BASE = "https://api.geckoterminal.com/api/v2";
const NETWORK = "robinhood";

/** Their multi-token endpoint accepts up to 30 addresses in one call. */
const MAX_ADDRESSES = 30;

const TTL_MS = 45_000;
const SWR_MS = 60_000;

type TokenAttributes = {
  address: string;
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  price_usd: string | null;
  total_reserve_in_usd: string | null;
  volume_usd?: { h24?: string };
};

async function call<T>(path: string): Promise<T | null> {
  const permit = requestPermission("geckoterminal");
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
      recordRateLimited("geckoterminal", Number.isFinite(retry) ? retry : 60_000);
      return null;
    }
    if (!res.ok) {
      recordFailure("geckoterminal", `HTTP ${res.status}`);
      return null;
    }

    recordSuccess("geckoterminal", Date.now() - started);
    return (await res.json()) as T;
  } catch (error) {
    recordFailure("geckoterminal", error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Prices for many contracts in as few calls as possible.
 *
 * Returns only what the provider actually answered — an address it does not
 * know is simply absent, never defaulted.
 */
export async function fetchTokenPrices(addresses: string[]): Promise<MarketPrice[]> {
  const unique = [...new Set(addresses.map((a) => a.toLowerCase()))].filter(Boolean);
  if (!unique.length) return [];

  const out: MarketPrice[] = [];

  for (let i = 0; i < unique.length; i += MAX_ADDRESSES) {
    const chunk = unique.slice(i, i + MAX_ADDRESSES);
    const key = `gt:tokens:${chunk.join(",")}`;

    const result = await cached(
      key,
      { ttlMs: TTL_MS, staleWhileRevalidateMs: SWR_MS, provider: "geckoterminal" },
      () => call<{ data: { attributes: TokenAttributes }[] }>(`/networks/${NETWORK}/tokens/multi/${chunk.join(",")}`),
    );

    const payload = result.value;
    if (!payload?.data) continue;

    // The time the network call completed — preserved across every subsequent
    // read of this cache entry. Reading a cache is not observing the market.
    const fetchedAt = result.fetchedAt;

    for (const row of payload.data) {
      const a = row.attributes;
      const price = a?.price_usd ? Number(a.price_usd) : NaN;
      if (!a?.address || !Number.isFinite(price) || price <= 0) continue;

      const liquidity = a.total_reserve_in_usd ? Number(a.total_reserve_in_usd) : null;
      out.push({
        assetId: null,
        contractAddress: a.address.toLowerCase(),
        chainId: CHAIN.id,
        price,
        currency: "USD",
        priceType: "DEX_SPOT",
        source: "geckoterminal",
        // No per-token timestamp is published, so the fetch time is the best
        // honest observation time available.
        observedAt: new Date(fetchedAt).toISOString(),
        fetchedAt: new Date(fetchedAt).toISOString(),
        providerTimestamp: null,
        cacheState: result.cacheState,
        blockNumber: null,
        pairAddress: null,
        dexId: null,
        liquidityUsd: Number.isFinite(liquidity) ? liquidity : null,
        // total_reserve_in_usd is the token's reserve across every pool this
        // provider knows about, not the reserve of one pair.
        liquidityBasis: "TOKEN_TOTAL_RESERVE",
        confidence: 0,
        freshness: freshnessFor("DEX_SPOT", fetchedAt, Date.now()),
      });
    }
  }

  return out;
}

export type OhlcvCandle = { time: number; open: number; high: number; low: number; close: number; volume: number };

/**
 * Historical OHLCV for one pool, used to backfill a series we could not have
 * observed ourselves because we were not running yet.
 *
 * Stored tagged with its source. It is never blended invisibly with candles
 * FOLDMARK aggregated from its own observations.
 */
export async function fetchPoolOhlcv(
  poolAddress: string,
  timeframe: "minute" | "hour" | "day",
  aggregate = 1,
  limit = 300,
): Promise<OhlcvCandle[]> {
  const key = `gt:ohlcv:${poolAddress}:${timeframe}:${aggregate}:${limit}`;
  const { value: payload } = await cached(
    key,
    { ttlMs: 120_000, staleWhileRevalidateMs: 300_000, provider: "geckoterminal" },
    () =>
      call<{ data: { attributes: { ohlcv_list: number[][] } } }>(
        `/networks/${NETWORK}/pools/${poolAddress}/ohlcv/${timeframe}?aggregate=${aggregate}&limit=${limit}`,
      ),
  );

  const list = payload?.data?.attributes?.ohlcv_list;
  if (!Array.isArray(list)) return [];

  return list
    .filter((row) => Array.isArray(row) && row.length >= 6 && row.every((v) => Number.isFinite(v)))
    .map(([time, open, high, low, close, volume]) => ({ time, open, high, low, close, volume }))
    .sort((a, b) => a.time - b.time);
}

export type PoolSummary = {
  address: string;
  name: string;
  dex: string | null;
  baseToken: string | null;
  quoteToken: string | null;
  priceUsd: number | null;
  reserveUsd: number | null;
  volume24hUsd: number | null;
};

/** The pools on this chain, strongest reserve first — the input to pool discovery. */
export async function fetchTopPools(page = 1): Promise<PoolSummary[]> {
  const { value: payload } = await cached(
    `gt:pools:${page}`,
    { ttlMs: 300_000, staleWhileRevalidateMs: 600_000, provider: "geckoterminal" },
    () =>
      call<{
        data: {
          id: string;
          attributes: {
            address: string;
            name: string;
            base_token_price_usd: string | null;
            reserve_in_usd: string | null;
            volume_usd?: { h24?: string };
          };
          relationships?: {
            dex?: { data?: { id?: string } };
            base_token?: { data?: { id?: string } };
            quote_token?: { data?: { id?: string } };
          };
        }[];
      }>(`/networks/${NETWORK}/pools?page=${page}`),
  );

  if (!payload?.data) return [];

  const stripNetwork = (id: string | undefined) => (id ? id.replace(`${NETWORK}_`, "").toLowerCase() : null);

  return payload.data.map((p) => ({
    address: p.attributes.address,
    name: p.attributes.name,
    dex: p.relationships?.dex?.data?.id ?? null,
    baseToken: stripNetwork(p.relationships?.base_token?.data?.id),
    quoteToken: stripNetwork(p.relationships?.quote_token?.data?.id),
    priceUsd: p.attributes.base_token_price_usd ? Number(p.attributes.base_token_price_usd) : null,
    reserveUsd: p.attributes.reserve_in_usd ? Number(p.attributes.reserve_in_usd) : null,
    volume24hUsd: p.attributes.volume_usd?.h24 ? Number(p.attributes.volume_usd.h24) : null,
  }));
}
