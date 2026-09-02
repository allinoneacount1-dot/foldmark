import { createPublicClient, http, parseAbiItem } from "viem";
import { robinhoodChain } from "@/lib/wagmi";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

const TRANSFER_EVENT = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

export async function runIndexer({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) {
  if (!isSupabaseConfigured() || !supabase) return { error: "SUPABASE_NOT_CONFIGURED" as const };

  const client = createPublicClient({ chain: robinhoodChain, transport: http(process.env.NEXT_PUBLIC_ROBINHOOD_RPC || "https://rpc.mainnet.chain.robinhood.com") });

  // fetch logs for Transfer
  const logs = await client.getLogs({ address: undefined, event: TRANSFER_EVENT, fromBlock, toBlock });

  let inserted = 0;
  for (const log of logs.slice(0, 500)) { // cap 500 per run for free tier
    const { from, to, value } = log.args as any;
    if (!from || !to || value === undefined) continue;
    // naive asset resolution: if log.address matches known asset, use it
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

    // upsert wallets
    await supabase.from("wallets").upsert({ address: from.toLowerCase() }, { onConflict: "address", ignoreDuplicates: false });
    await supabase.from("wallets").upsert({ address: to.toLowerCase() }, { onConflict: "address", ignoreDuplicates: false });
  }

  // advance cursor
  await supabase.from("indexer_state").upsert({ chain_id: 4663, last_processed_block: Number(toBlock), last_finalized_block: Number(toBlock), updated_at: new Date().toISOString() }, { onConflict: "chain_id" });

  // naive flow window calc for 24H per asset (sum last 24h)
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: assets } = await supabase.from("assets").select("id, contract_address").limit(20);
  if (assets) {
    for (const a of assets) {
      const { data: transfers } = await supabase.from("transfers").select("amount, from_address, to_address").eq("asset_id", a.id).gte("timestamp", since).limit(1000);
      if (!transfers) continue;
      // placeholder: inflow = sum where to != from and to is not zero, outflow opposite — real classification later
      let inflow = 0, outflow = 0;
      transfers.forEach((t: any) => {
        const amt = Number(t.amount) / 1e18;
        // naive: if to is asset holder, count as inflow
        inflow += amt * 0.5;
        outflow += amt * 0.5;
      });
      await supabase.from("flow_windows").upsert(
        { entity_type: "asset", entity_id: a.contract_address, window: "24H", inflow, outflow, net_flow: inflow - outflow, transaction_count: transfers.length, unique_counterparties: 0, calculated_at: new Date().toISOString() },
        { onConflict: "entity_type,entity_id,window" }
      );
    }
  }

  return { inserted, fromBlock: Number(fromBlock), toBlock: Number(toBlock), logs: logs.length };
}

export async function getCursor() {
  if (!supabase) return { last_processed_block: 0 };
  const { data } = await supabase.from("indexer_state").select("*").eq("chain_id", 4663).single();
  return data || { last_processed_block: 0 };
}
