/**
 * The chain transport.
 *
 * SERVER ONLY. One place that talks to an RPC endpoint, so provider quirks stay
 * here and the normalizer downstream sees one canonical shape whichever
 * endpoint answered.
 *
 * MEASURED PROVIDER BEHAVIOUR (benchmarked 2026-09-04, chain 4663):
 *
 *   Alchemy eth_getLogs      100 requests / 1000 blocks,   5.5s / 1000 blocks
 *   publicnode getBlockReceipts 1000 requests / 1000 blocks, 143s / 1000 blocks
 *
 * Alchemy is the historical transport for that reason. Its free tier caps a log
 * query at ten blocks whether or not an address filter is supplied, so the
 * window size below is a provider constraint rather than a preference.
 */

export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/** The provider's hard ceiling on a log query. Measured, not assumed. */
export const MAX_LOG_SPAN = 10;

/**
 * How far behind the head ingestion stops.
 *
 * A block at the tip can still be replaced. Staying back a margin means an
 * observation is not written until the chain has moved on from it, which is
 * cheaper than detecting and unwinding a reorg after the fact.
 */
export const SAFETY_BLOCKS = 12;

export type RawTransfer = {
  blockNumber: number;
  blockHash: string;
  txHash: string;
  logIndex: number;
  contract: string;
  from: string;
  to: string;
  /** Base units, as a decimal string. Never divided here — decimals may be unknown. */
  rawValue: string;
};

function rpcUrl(): string | null {
  const url = process.env.ROBINHOOD_RPC_URL?.trim() || process.env.NEXT_PUBLIC_ROBINHOOD_RPC?.trim() || "";
  return url || null;
}

type RpcResult<T> = { ok: true; value: T } | { ok: false; error: string };

async function rpc<T>(method: string, params: unknown[], timeoutMs = 12_000): Promise<RpcResult<T>> {
  const url = rpcUrl();
  if (!url) return { ok: false, error: "no_rpc_configured" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, error: `http_${res.status}` };
    const body = (await res.json()) as { result?: T; error?: { message?: string } };
    if (body.error) return { ok: false, error: body.error.message ?? "rpc_error" };
    if (body.result === undefined) return { ok: false, error: "empty_result" };
    return { ok: true, value: body.result };
  } catch {
    return { ok: false, error: "network" };
  } finally {
    clearTimeout(timer);
  }
}

export async function chainHead(): Promise<number | null> {
  const r = await rpc<string>("eth_blockNumber", []);
  return r.ok ? parseInt(r.value, 16) : null;
}

/** The newest block considered settled enough to record. */
export async function safeHead(): Promise<number | null> {
  const head = await chainHead();
  return head === null ? null : head - SAFETY_BLOCKS;
}

const hexToDec = (hex: string): string => BigInt(hex === "0x" ? "0x0" : hex).toString();

/** Topics carry addresses left-padded to 32 bytes. */
const topicAddress = (topic: string): string => `0x${topic.slice(26)}`.toLowerCase();

/**
 * Transfer logs in a block range.
 *
 * ERC-721 also emits `Transfer`, with the token id as a fourth topic and empty
 * data. Requiring exactly three topics keeps this to ERC-20, where the value is
 * in the data field — an NFT id read as an amount would be a fabricated
 * quantity.
 */
export async function fetchTransfers(
  fromBlock: number,
  toBlock: number,
  addresses?: string[],
): Promise<RpcResult<RawTransfer[]>> {
  const filter: Record<string, unknown> = {
    fromBlock: `0x${fromBlock.toString(16)}`,
    toBlock: `0x${toBlock.toString(16)}`,
    topics: [TRANSFER_TOPIC],
  };
  if (addresses?.length) filter.address = addresses;

  const r = await rpc<
    { blockNumber: string; blockHash: string; transactionHash: string; logIndex: string; address: string; topics: string[]; data: string }[]
  >("eth_getLogs", [filter]);
  if (!r.ok) return r;

  const out: RawTransfer[] = [];
  for (const log of r.value) {
    if (!log.topics || log.topics.length !== 3) continue;
    out.push({
      blockNumber: parseInt(log.blockNumber, 16),
      blockHash: log.blockHash,
      txHash: log.transactionHash,
      logIndex: parseInt(log.logIndex, 16),
      contract: log.address.toLowerCase(),
      from: topicAddress(log.topics[1]),
      to: topicAddress(log.topics[2]),
      rawValue: hexToDec(log.data || "0x0"),
    });
  }
  return { ok: true, value: out };
}

/**
 * Block timestamps, fetched once per distinct block and cached for the pass.
 *
 * This is the field the product got wrong: a transfer's time is the time of its
 * BLOCK, never the moment ingestion happened to run. Resolving it here means no
 * caller can accidentally reach for `now()`.
 */
export async function blockTimestamps(blocks: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const distinct = [...new Set(blocks)];

  // Bounded concurrency: enough to be quick, small enough to stay well inside a
  // free-tier rate limit.
  const CONCURRENCY = 6;
  for (let i = 0; i < distinct.length; i += CONCURRENCY) {
    const slice = distinct.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      slice.map(async (b) => {
        const r = await rpc<{ timestamp: string }>("eth_getBlockByNumber", [`0x${b.toString(16)}`, false]);
        if (!r.ok || !r.value?.timestamp) return null;
        return [b, new Date(parseInt(r.value.timestamp, 16) * 1000).toISOString()] as const;
      }),
    );
    for (const entry of results) {
      if (entry) out.set(entry[0], entry[1]);
    }
  }
  return out;
}

/** ERC-20 metadata read from the contract itself. Failure is a state, not a crash. */
export async function readErc20Metadata(
  contract: string,
): Promise<{ symbol: string | null; name: string | null; decimals: number | null }> {
  // symbol(), name(), decimals()
  const SELECTORS = { symbol: "0x95d89b41", name: "0x06fdde03", decimals: "0x313ce567" } as const;

  const call = async (data: string) => {
    const r = await rpc<string>("eth_call", [{ to: contract, data }, "latest"]);
    return r.ok ? r.value : null;
  };

  const [symbolHex, nameHex, decimalsHex] = await Promise.all([
    call(SELECTORS.symbol),
    call(SELECTORS.name),
    call(SELECTORS.decimals),
  ]);

  return {
    symbol: decodeString(symbolHex),
    name: decodeString(nameHex),
    decimals: decodeUint(decimalsHex),
  };
}

/** ABI-encoded string, or a bytes32 some older tokens return instead. */
function decodeString(hex: string | null): string | null {
  if (!hex || hex === "0x") return null;
  const body = hex.slice(2);
  try {
    if (body.length >= 128) {
      const length = parseInt(body.slice(64, 128), 16);
      if (Number.isFinite(length) && length > 0 && length <= 256) {
        const bytes = body.slice(128, 128 + length * 2);
        const text = Buffer.from(bytes, "hex").toString("utf8").replace(/\0+$/, "").trim();
        return text || null;
      }
    }
    const text = Buffer.from(body, "hex").toString("utf8").replace(/\0+/g, "").trim();
    // Reject control characters: a failed decode must not become a token name.
    return text && /^[\x20-\x7E]+$/.test(text) ? text : null;
  } catch {
    return null;
  }
}

function decodeUint(hex: string | null): number | null {
  if (!hex || hex === "0x") return null;
  try {
    const n = Number(BigInt(hex));
    return Number.isFinite(n) && n >= 0 && n <= 255 ? n : null;
  } catch {
    return null;
  }
}
