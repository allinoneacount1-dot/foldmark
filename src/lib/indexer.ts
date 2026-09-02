import { createPublicClient, http, parseAbi, parseAbiItem } from "viem";
import { robinhoodChain } from "@/lib/wagmi";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

const TRANSFER_EVENT = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const ERC20_ABI = parseAbi(["function symbol() view returns (string)", "function name() view returns (string)", "function decimals() view returns (uint8)"]);

export async function runIndexer({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) {
  if (!isSupabaseConfigured() || !supabase) return { error: "SUPABASE_NOT_CONFIGURED" as const };

  const client = createPublicClient({ chain: robinhoodChain, transport: http(process.env.NEXT_PUBLIC_ROBINHOOD_RPC || "https://rpc.mainnet.chain.robinhood.com") });

  // 1) known Stock Tokens from DB — dynamic, not hardcoded
  const { data: knownAssets } = await supabase.from("assets").select("contract_address").eq("asset_type", "stock_token").limit(50);
  const knownSet = new Set((knownAssets || []).map((a: any) => a.contract_address.toLowerCase()));
  const knownList = [...knownSet] as `0x${string}`[];

  // 2) fetch ALL Transfer logs for this window (5 blocks ≈ 300 logs) — for discovery
  //    we fetch once without address filter to discover new Robinhood Tokens
  const allLogs = await client.getLogs({ event: TRANSFER_EVENT, fromBlock, toBlock });
  const logs = knownList.length ? allLogs.filter((l) => knownSet.has(l.address.toLowerCase())) : [];

  let inserted = 0;
  for (const log of logs.slice(0, 500)) {
    const { from, to, value } = log.args as any;
    if (!from || !to || value === undefined) continue;
    const { data: asset } = await supabase.from("assets").select("id").eq("contract_address", log.address.toLowerCase()).single();
    const assetId = asset?.id || null;

    const { error } = await supabase.from("transfers").upsert(
      {
        tx_hash: log.transactionHash,
        log_index: log.logIndex,
        block_number: Number(log.blockNumber),
        asset_id: assetId,
        from_address: from.toLowerCase(),
        to_address: to.toLowerCase(),
        amount: value.toString(),
        timestamp: new Date().toISOString(),
      },
      { onConflict: "tx_hash,log_index", ignoreDuplicates: true }
    );
    if (!error) inserted++;

    await supabase.from("wallets").upsert({ address: from.toLowerCase() }, { onConflict: "address", ignoreDuplicates: false });
    await supabase.from("wallets").upsert({ address: to.toLowerCase() }, { onConflict: "address", ignoreDuplicates: false });
  }

  // 3) auto-discovery: unknown contracts that had Transfer activity → check if "• Robinhood Token"
  const unknownAddrs = [...new Set(allLogs.map((l) => l.address.toLowerCase()).filter((a) => !knownSet.has(a)))].slice(0, 15);
  let discovered = 0;
  for (const addr of unknownAddrs) {
    try {
      const [symbol, name] = await Promise.all([
        client.readContract({ address: addr as `0x${string}`, abi: ERC20_ABI, functionName: "symbol" }).catch(() => null),
        client.readContract({ address: addr as `0x${string}`, abi: ERC20_ABI, functionName: "name" }).catch(() => null),
      ]);
      if (!symbol || !name) continue;
      // Robinhood Stock Tokens are named like "NVIDIA • Robinhood Token" / "Apple • Robinhood Token"
      const isRobinhoodToken = String(name).toLowerCase().includes("robinhood token") || String(name).toLowerCase().includes("• robinhood");
      if (!isRobinhoodToken) continue;
      // avoid duplicates
      const { data: exists } = await supabase.from("assets").select("id").eq("contract_address", addr).single();
      if (exists) continue;
      let decimals = 18;
      try {
        decimals = (await client.readContract({ address: addr as `0x${string}`, abi: ERC20_ABI, functionName: "decimals" })) as number;
      } catch {}
      await supabase.from("assets").insert({
        chain_id: 4663,
        contract_address: addr,
        symbol: String(symbol).toUpperCase(),
        name: String(name),
        asset_type: "stock_token",
        verified: true,
        source: "Robinhood Chain — auto-discovered on-chain (name contains Robinhood Token)",
        decimals,
      });
      discovered++;
    } catch {}
  }

  // advance cursor
  await supabase.from("indexer_state").upsert({ chain_id: 4663, last_processed_block: Number(toBlock), last_finalized_block: Number(toBlock), updated_at: new Date().toISOString() }, { onConflict: "chain_id" });

  // flow windows (naive, per asset 24H)
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: assets } = await supabase.from("assets").select("id, contract_address").limit(20);
  if (assets) {
    for (const a of assets) {
      const { data: transfers } = await supabase.from("transfers").select("amount").eq("asset_id", a.id).gte("timestamp", since).limit(1000);
      if (!transfers) continue;
      let inflow = 0, outflow = 0;
      transfers.forEach((t: any) => {
        const amt = Number(t.amount) / 1e18;
        inflow += amt * 0.5;
        outflow += amt * 0.5;
      });
      await supabase.from("flow_windows").upsert(
        { entity_type: "asset", entity_id: a.contract_address, window: "24H", inflow, outflow, net_flow: inflow - outflow, transaction_count: transfers.length, unique_counterparties: 0, calculated_at: new Date().toISOString() },
        { onConflict: "entity_type,entity_id,window" }
      );
    }
  }

  return { inserted, fromBlock: Number(fromBlock), toBlock: Number(toBlock), logs: logs.length, allLogs: allLogs.length, discovered };
}

export async function getCursor() {
  if (!supabase) return { last_processed_block: 0 };
  const { data } = await supabase.from("indexer_state").select("*").eq("chain_id", 4663).single();
  return data || { last_processed_block: 0 };
}
