export const ROBINHOOD_CHAIN = {
  id: 4663,
  name: "Robinhood Chain",
  rpc: process.env.NEXT_PUBLIC_ROBINHOOD_RPC || "https://rpc.mainnet.chain.robinhood.com",
  blockscout: "https://robinhoodchain.blockscout.com",
} as const;

export async function getPulse() {
  const rpc = ROBINHOOD_CHAIN.rpc;
  try {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
      cache: "no-store",
      next: { revalidate: 5 },
    });
    if (!res.ok) throw new Error("rpc_failed");
    const json = (await res.json()) as { result?: string };
    if (!json.result) throw new Error("no_result");
    const block = parseInt(json.result, 16);
    return { block, updatedAt: new Date().toISOString(), source: "Robinhood Chain RPC" };
  } catch {
    return { block: null, updatedAt: new Date().toISOString(), source: "Robinhood Chain RPC", error: "DATA UNAVAILABLE" as const };
  }
}

export type FlowWindow = "1H" | "6H" | "24H" | "7D" | "30D";

export function flowMethodology(window: FlowWindow = "24H") {
  return `Net flow = gross inbound minus gross outbound attributed to classified interactions during trailing ${window} window. Unclassified transfers excluded. Sources: RPC logs + Robinhood Stock Token API + Chainlink.`;
}
