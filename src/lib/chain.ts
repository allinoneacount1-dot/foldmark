import { getChainHead, lastRpcLatencyMs, activeEndpoint, RpcUnavailable } from "@/server/market-data/providers/rpc";
import { CHAIN } from "@/config/site";

/**
 * Chain identity and liveness.
 *
 * Reads go through the failover client in server/market-data/providers/rpc.ts.
 * The single hardcoded endpoint this module used to hold was refusing every
 * connection, which is what put DATA UNAVAILABLE across the whole product.
 */

export const ROBINHOOD_CHAIN = {
  id: CHAIN.id,
  name: CHAIN.name,
  /** Kept for wagmi and viem, which each want one URL. The reader fails over across a list. */
  rpc: process.env.NEXT_PUBLIC_ROBINHOOD_RPC || "https://robinhood-rpc.publicnode.com",
  blockscout: CHAIN.explorer,
} as const;

export type Pulse = {
  block: number | null;
  updatedAt: string;
  source: string;
  endpoint: string;
  latencyMs: number | null;
  error?: "DATA UNAVAILABLE";
  detail?: string;
};

export async function getPulse(): Promise<Pulse> {
  try {
    const { block, latencyMs } = await getChainHead();
    return {
      block,
      updatedAt: new Date().toISOString(),
      source: "Robinhood Chain RPC",
      endpoint: new URL(activeEndpoint()).host,
      latencyMs,
    };
  } catch (error) {
    return {
      block: null,
      updatedAt: new Date().toISOString(),
      source: "Robinhood Chain RPC",
      endpoint: new URL(activeEndpoint()).host,
      latencyMs: lastRpcLatencyMs(),
      error: "DATA UNAVAILABLE",
      detail:
        error instanceof RpcUnavailable
          ? `no endpoint answered (${error.attempts.length} tried)`
          : error instanceof Error
            ? error.message.slice(0, 120)
            : "unknown error",
    };
  }
}

export type FlowWindow = "1H" | "6H" | "24H" | "7D" | "30D";

export function flowMethodology(window: FlowWindow = "24H"): string {
  return (
    `Directed value edges observed inside the trailing ${window} window, folded from ERC-20 Transfer logs ` +
    `stamped with their block header time. Amounts are token units at each asset's own decimals and are never ` +
    `summed across assets. A flow is labelled only when its counterparty contract is verified; everything else ` +
    `stays UNCLASSIFIED.`
  );
}
