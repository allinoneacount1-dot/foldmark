/**
 * GeckoTerminal — DEX market observations.
 *
 * SERVER ONLY. No credential is required by this provider, but it is still
 * called from the server so that a hundred readers produce one request rather
 * than a hundred, and so observations are persisted once and reused.
 *
 * VERIFIED LIVE against chain 4663 on 2026-09-04: network id `robinhood`,
 * exact-contract pool lookup answering with real pools, prices, reserves and
 * 24h volume.
 *
 * THE CORRECTNESS TRAP THIS FILE EXISTS TO AVOID. A pool has a base token and a
 * quote token, and `base_token_price_usd` is the price of whichever token is
 * base. FOLDMARK's asset is not always the base: SPY's top pool is
 * `SPY / WETH`, but AAPL's is `ICOIN / AAPL`, where AAPL is the QUOTE. Reading
 * `base_token_price_usd` for AAPL there would publish ICOIN's price under
 * Apple's name. So every price here is selected by matching the pool's declared
 * token ids against the exact contract asked for, and a pool that does not
 * contain that contract is discarded rather than guessed at.
 */

/** GeckoTerminal's id for Robinhood Chain. Verified by live request, not assumed. */
export const NETWORK_ID = "robinhood";

const BASE_URL = "https://api.geckoterminal.com/api/v2";

/** Provider-reported market for one pool, already resolved to OUR asset's side. */
export type MarketObservation = {
  /** Pool contract address, lowercase. The canonical identity of a market. */
  pairAddress: string;
  /** Human pair label as the provider reports it, e.g. "SPY / WETH 0.05%". */
  pairName: string;
  /** Provider's DEX id, e.g. "uniswap-v3-robinhood". Provider-reported, not verified. */
  venue: string;
  /** USD price OF THE REQUESTED CONTRACT in this pool. Never the other side. */
  priceUsd: number;
  /** Which side of the pair our contract is. Recorded so the choice is auditable. */
  side: "base" | "quote";
  /** The other token's contract in this pool, lowercase. */
  counterContract: string;
  /** Total pool reserve in USD as the provider reports it. Liquidity, not volume. */
  reserveUsd: number | null;
  /** 24h traded volume in USD. Trading volume is NOT capital inflow. */
  volume24hUsd: number | null;
  /** When the provider's figures were read. */
  observedAt: string;
};

export type ProviderResult =
  | { status: "MATCHED"; markets: MarketObservation[] }
  | { status: "NO_MATCH" }
  | { status: "RATE_LIMITED"; retryAfterMs: number }
  | { status: "ERROR"; reason: string };

/**
 * A single shared pace-keeper.
 *
 * The free tier answers roughly thirty calls a minute and returns 429 well
 * before that when calls arrive in a burst. Every request in the process passes
 * through this queue, so concurrency cannot outrun the budget no matter how many
 * assets a pass walks.
 */
const MIN_INTERVAL_MS = 2_600;
let nextSlot = 0;

async function pace(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + MIN_INTERVAL_MS;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

/** Circuit state: after repeated refusals the provider is left alone for a while. */
let consecutiveFailures = 0;
let openUntil = 0;

export function providerAvailable(): boolean {
  return Date.now() >= openUntil;
}

function recordFailure(): void {
  consecutiveFailures += 1;
  if (consecutiveFailures >= 4) {
    // Back off for a minute rather than hammering a provider that is refusing.
    openUntil = Date.now() + 60_000;
    consecutiveFailures = 0;
  }
}

function recordSuccess(): void {
  consecutiveFailures = 0;
}

type PoolPayload = {
  attributes: {
    address: string;
    name: string;
    base_token_price_usd: string | null;
    quote_token_price_usd: string | null;
    reserve_in_usd: string | null;
    volume_usd?: { h24?: string | null };
  };
  relationships: {
    base_token?: { data?: { id?: string } };
    quote_token?: { data?: { id?: string } };
    dex?: { data?: { id?: string } };
  };
};

/** Provider token ids look like "robinhood_0xabc…". Only the address matters. */
function contractOf(tokenId: string | undefined): string | null {
  if (!tokenId) return null;
  const at = tokenId.lastIndexOf("_");
  const address = at >= 0 ? tokenId.slice(at + 1) : tokenId;
  // Case-insensitive on the 0x prefix too: a provider is free to return
  // 0X-prefixed or checksummed addresses, and rejecting those would silently
  // drop real markets.
  return /^0x[a-fA-F0-9]{40}$/i.test(address) ? address.toLowerCase() : null;
}

function numberOrNull(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Every pool holding this exact contract, with the price of THIS contract.
 *
 * Matching is on the contract address the pool itself declares. A symbol is
 * never consulted: a ticker collision must not be able to attach one chain's
 * market to another asset's page.
 */
export async function poolsForContract(contract: string): Promise<ProviderResult> {
  const address = contract.toLowerCase();
  if (!/^0x[a-fA-F0-9]{40}$/i.test(address)) return { status: "ERROR", reason: "bad_address" };
  if (!providerAvailable()) return { status: "RATE_LIMITED", retryAfterMs: openUntil - Date.now() };

  await pace();

  let res: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      res = await fetch(`${BASE_URL}/networks/${NETWORK_ID}/tokens/${address}/pools`, {
        headers: { accept: "application/json" },
        signal: controller.signal,
        cache: "no-store",
      });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    recordFailure();
    return { status: "ERROR", reason: "network" };
  }

  if (res.status === 429) {
    recordFailure();
    const retry = Number(res.headers.get("retry-after"));
    return { status: "RATE_LIMITED", retryAfterMs: Number.isFinite(retry) ? retry * 1000 : 30_000 };
  }
  // A contract the provider has never seen is an answer, not a failure.
  if (res.status === 404) {
    recordSuccess();
    return { status: "NO_MATCH" };
  }
  if (!res.ok) {
    recordFailure();
    return { status: "ERROR", reason: `http_${res.status}` };
  }

  let body: { data?: PoolPayload[] };
  try {
    body = (await res.json()) as { data?: PoolPayload[] };
  } catch {
    recordFailure();
    return { status: "ERROR", reason: "malformed" };
  }

  recordSuccess();
  const observedAt = new Date().toISOString();
  const markets: MarketObservation[] = [];

  for (const pool of body.data ?? []) {
    const base = contractOf(pool.relationships?.base_token?.data?.id);
    const quote = contractOf(pool.relationships?.quote_token?.data?.id);

    /**
     * Which side is ours, decided by address.
     *
     * A pool that names neither our contract is dropped. It is reachable — the
     * provider can return related pools — and taking a price from one would
     * publish a different token's value under this asset.
     */
    const side: "base" | "quote" | null = base === address ? "base" : quote === address ? "quote" : null;
    if (!side) continue;

    const priceUsd = numberOrNull(
      side === "base" ? pool.attributes.base_token_price_usd : pool.attributes.quote_token_price_usd,
    );
    // No price for our side is not a zero. The market is skipped.
    if (priceUsd === null || priceUsd <= 0) continue;

    const counter = side === "base" ? quote : base;
    const pairAddress = pool.attributes.address?.toLowerCase();
    if (!pairAddress) continue;

    markets.push({
      pairAddress,
      pairName: pool.attributes.name ?? "",
      venue: pool.relationships?.dex?.data?.id ?? "unknown",
      priceUsd,
      side,
      counterContract: counter ?? "",
      reserveUsd: numberOrNull(pool.attributes.reserve_in_usd),
      volume24hUsd: numberOrNull(pool.attributes.volume_usd?.h24),
      observedAt,
    });
  }

  if (!markets.length) return { status: "NO_MATCH" };
  return { status: "MATCHED", markets };
}

/**
 * The market FOLDMARK features when it shows a single price.
 *
 * Deepest reserve wins. Liquidity is the honest tiebreak: a price from a pool
 * with more depth is harder to move and is the one a reader is best served by.
 * This is a SELECTION, never an average — averaging prices across venues would
 * produce a number no market ever traded at.
 */
export function primaryMarket(markets: MarketObservation[]): MarketObservation | null {
  if (!markets.length) return null;
  return [...markets].sort((a, b) => {
    const ar = a.reserveUsd ?? -1;
    const br = b.reserveUsd ?? -1;
    if (br !== ar) return br - ar;
    // Deterministic tiebreak so the same input always features the same market.
    return a.pairAddress < b.pairAddress ? -1 : 1;
  })[0];
}

export const PRIMARY_MARKET_METHOD =
  "Deepest reserve among pools containing this exact contract. A selection, never an average.";
