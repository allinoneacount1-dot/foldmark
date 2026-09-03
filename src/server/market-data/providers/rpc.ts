import { recordFailure, recordSuccess } from "@/server/market-data/budget";

/**
 * Chain access with failover.
 *
 * The endpoint this repository shipped with — rpc.mainnet.chain.robinhood.com —
 * refused every connection during probing, which is why the whole product was
 * reporting DATA UNAVAILABLE for chain head. A single hardcoded URL is a single
 * point of failure for the one source FOLDMARK cannot do without, so the client
 * holds an ordered list, remembers which member answered last, and moves on when
 * one stops responding.
 *
 * Endpoints are public and keyless. Any override goes in front of the list.
 */

const DEFAULT_ENDPOINTS = [
  // verified 2026-09-03: eth_chainId -> 0x1237, ~170ms round trip
  "https://robinhood-rpc.publicnode.com",
  // listed for chain 4663 in the public registry; kept as fallbacks
  "https://rpc.mainnet.chain.robinhood.com",
  "https://rpc.arrowrpc.com",
];

export const WS_ENDPOINTS = ["wss://robinhood-rpc.publicnode.com"];

function endpoints(): string[] {
  const override = process.env.FOLDMARK_RPC_URLS ?? process.env.NEXT_PUBLIC_ROBINHOOD_RPC;
  const extra = override
    ? override
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  return [...new Set([...extra, ...DEFAULT_ENDPOINTS])];
}

/** Index of the endpoint that answered last, so a healthy node keeps being used. */
let preferred = 0;
let lastLatencyMs: number | null = null;

export type RpcError = { endpoint: string; message: string };

export class RpcUnavailable extends Error {
  readonly attempts: RpcError[];
  constructor(attempts: RpcError[]) {
    super(`No Robinhood Chain endpoint answered (${attempts.length} tried)`);
    this.name = "RpcUnavailable";
    this.attempts = attempts;
  }
}

/**
 * One JSON-RPC call, tried against each endpoint in turn.
 *
 * A JSON-RPC error payload is a real answer from a healthy node, so it is
 * thrown to the caller rather than triggering failover — only a transport or
 * protocol failure moves to the next endpoint.
 */
export async function rpcCall<T>(method: string, params: unknown[] = [], timeoutMs = 8000): Promise<T> {
  const list = endpoints();
  const attempts: RpcError[] = [];

  for (let i = 0; i < list.length; i++) {
    const endpoint = list[(preferred + i) % list.length];
    const started = Date.now();
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = (await res.json()) as { result?: T; error?: { message?: string; code?: number } };
      const latency = Date.now() - started;

      if (json.error) {
        // the node answered; the request was wrong, not the endpoint
        recordSuccess("rpc", latency);
        preferred = (preferred + i) % list.length;
        lastLatencyMs = latency;
        throw new Error(`${method}: ${json.error.message ?? "rpc error"}`);
      }

      recordSuccess("rpc", latency);
      preferred = (preferred + i) % list.length;
      lastLatencyMs = latency;
      return json.result as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith(`${method}:`)) throw error; // node-level error, already recorded
      attempts.push({ endpoint, message });
    }
  }

  recordFailure("rpc", attempts.map((a) => `${new URL(a.endpoint).host}: ${a.message}`).join("; "));
  throw new RpcUnavailable(attempts);
}

/** Several calls in one round trip where the node supports batching. */
export async function rpcBatch<T>(calls: { method: string; params?: unknown[] }[], timeoutMs = 12000): Promise<T[]> {
  if (!calls.length) return [];
  const list = endpoints();
  const attempts: RpcError[] = [];

  for (let i = 0; i < list.length; i++) {
    const endpoint = list[(preferred + i) % list.length];
    const started = Date.now();
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(calls.map((c, id) => ({ jsonrpc: "2.0", id, method: c.method, params: c.params ?? [] }))),
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { id: number; result?: T; error?: unknown }[];
      if (!Array.isArray(json)) throw new Error("batch not supported");

      recordSuccess("rpc", Date.now() - started);
      preferred = (preferred + i) % list.length;
      lastLatencyMs = Date.now() - started;

      const ordered = new Array<T>(calls.length);
      for (const row of json) ordered[row.id] = row.result as T;
      return ordered;
    } catch (error) {
      attempts.push({ endpoint, message: error instanceof Error ? error.message : String(error) });
    }
  }

  recordFailure("rpc", "batch failed on every endpoint");
  throw new RpcUnavailable(attempts);
}

/* ------------------------------------------------------------- convenience */

export async function getChainHead(): Promise<{ block: number; latencyMs: number | null }> {
  const hex = await rpcCall<string>("eth_blockNumber");
  return { block: Number(BigInt(hex)), latencyMs: lastLatencyMs };
}

export type BlockHeader = { number: number; timestamp: number; txCount: number };

export async function getBlockHeader(block: number | "latest"): Promise<BlockHeader | null> {
  const tag = block === "latest" ? "latest" : "0x" + block.toString(16);
  const b = await rpcCall<{ number: string; timestamp: string; transactions: string[] } | null>("eth_getBlockByNumber", [
    tag,
    false,
  ]);
  if (!b) return null;
  return {
    number: Number(BigInt(b.number)),
    timestamp: Number(BigInt(b.timestamp)) * 1000,
    txCount: b.transactions?.length ?? 0,
  };
}

/** Block header times for many blocks in one round trip. */
export async function getBlockTimes(blocks: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (!blocks.length) return out;
  const unique = [...new Set(blocks)];

  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50);
    try {
      const results = await rpcBatch<{ number: string; timestamp: string } | null>(
        chunk.map((n) => ({ method: "eth_getBlockByNumber", params: ["0x" + n.toString(16), false] })),
      );
      results.forEach((b, idx) => {
        if (b?.timestamp) out.set(chunk[idx], Number(BigInt(b.timestamp)) * 1000);
      });
    } catch {
      // batching unsupported or the endpoint stumbled — fall back one at a time
      for (const n of chunk) {
        try {
          const header = await getBlockHeader(n);
          if (header) out.set(n, header.timestamp);
        } catch {
          /* a block we cannot time is a block we do not index */
        }
      }
    }
  }
  return out;
}

export function lastRpcLatencyMs(): number | null {
  return lastLatencyMs;
}

export function activeEndpoint(): string {
  return endpoints()[preferred] ?? DEFAULT_ENDPOINTS[0];
}

/* -------------------------------------------------------------- log range */

/**
 * How far back the free endpoint will serve logs.
 *
 * Measured 2026-09-03 against robinhood-rpc.publicnode.com by binary search:
 * roughly 52 blocks, about five seconds at the chain's 0.103s block time.
 * Anything older is refused with "Archive requests require a personal token".
 *
 * This one number decides the entire ingestion strategy. The chain produces
 * about 839,650 blocks a day, so a scheduled job can never catch up across a
 * gap — a log has to be taken while it is still inside this window. That means
 * following the head continuously, not polling on a cron.
 *
 * Budgeted slightly under the measured figure so a slow round trip does not
 * push a request over the edge.
 */
export const FREE_TIER_LOG_WINDOW_BLOCKS = 48;

export class ArchiveRangeRefused extends Error {
  readonly requestedFrom: number;
  readonly head: number;
  constructor(requestedFrom: number, head: number) {
    super(
      `Block ${requestedFrom} is outside the free endpoint's log window ` +
        `(head ${head}, about ${FREE_TIER_LOG_WINDOW_BLOCKS} blocks retained). Serving it needs an archive node.`,
    );
    this.name = "ArchiveRangeRefused";
    this.requestedFrom = requestedFrom;
    this.head = head;
  }
}

export function isArchiveRefusal(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /archive request/i.test(message);
}

/**
 * Clamp a range to what the endpoint can actually answer.
 *
 * Returns the servable range together with how many blocks had to be given up,
 * so the caller can record the gap rather than let the history quietly appear
 * continuous when it is not.
 */
export function clampToServableRange(
  from: number,
  to: number,
  head: number,
): { from: number; to: number; skipped: number } {
  const oldestServable = Math.max(0, head - FREE_TIER_LOG_WINDOW_BLOCKS);

  // entirely inside the window — nothing to give up
  if (from >= oldestServable) return { from, to, skipped: 0 };

  // Entirely behind the window. Those logs are gone on this tier and asking
  // again next run would only lose more, so the cursor jumps to the live window
  // and the abandoned span is reported as the gap it is.
  if (to < oldestServable) {
    return { from: oldestServable, to: head, skipped: oldestServable - from };
  }

  // straddles the boundary — take the servable tail
  return { from: oldestServable, to, skipped: oldestServable - from };
}

/* --------------------------------------------------------- contract reads */

const SELECTOR = { name: "0x06fdde03", symbol: "0x95d89b41", decimals: "0x313ce567" } as const;

function decodeAbiString(hex: string | null): string | null {
  if (!hex || hex === "0x") return null;
  const buf = Buffer.from(hex.slice(2), "hex");
  if (buf.length < 64) {
    const raw = buf.toString("utf8").replace(/\0+$/, "").trim();
    return raw || null;
  }
  const length = Number(BigInt("0x" + buf.subarray(32, 64).toString("hex")));
  if (!Number.isFinite(length) || length > buf.length) return null;
  return buf.subarray(64, 64 + length).toString("utf8") || null;
}

export type TokenMetadata = { address: string; name: string | null; symbol: string | null; decimals: number };

/**
 * ERC-20 identity read straight from the contract.
 *
 * Decimals matter more than they look: USDG on this chain reports 6, not 18, so
 * assuming 18 would misstate every amount by a factor of a trillion.
 */
export async function readTokenMetadata(address: string): Promise<TokenMetadata | null> {
  const code = await rpcCall<string>("eth_getCode", [address, "latest"]);
  if (!code || code === "0x") return null;

  const [name, symbol, decimals] = await Promise.all([
    rpcCall<string>("eth_call", [{ to: address, data: SELECTOR.name }, "latest"]).catch(() => null),
    rpcCall<string>("eth_call", [{ to: address, data: SELECTOR.symbol }, "latest"]).catch(() => null),
    rpcCall<string>("eth_call", [{ to: address, data: SELECTOR.decimals }, "latest"]).catch(() => null),
  ]);

  return {
    address: address.toLowerCase(),
    name: decodeAbiString(name),
    symbol: decodeAbiString(symbol),
    decimals: decimals && decimals !== "0x" ? Number(BigInt(decimals)) : 18,
  };
}
