import { createPublicClient, http, parseAbi, parseAbiItem, type Log } from "viem";
import { robinhoodChain } from "@/lib/wagmi";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import {
  activeEndpoint as activeRpcEndpoint,
  clampToServableRange,
  isArchiveRefusal,
  ArchiveRangeRefused,
} from "@/server/market-data/providers/rpc";
import { WINDOW_MS, WINDOWS, type FlowWindow } from "@/config/site";
import { fromBaseUnits } from "@/lib/format";

const TRANSFER_EVENT = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const ERC20_ABI = parseAbi([
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
]);

/** A Robinhood Stock Token is identified by its canonical on-chain name, never by symbol. */
const STOCK_TOKEN_NAME_MARKER = "robinhood token";

const MAX_LOGS_PER_RUN = 500;
const MAX_DISCOVERY_PER_RUN = 3;
/** Addresses per window written to flow_windows. Ranked by observed value moved. */
const FLOW_TOP_N = 200;

type TransferLog = Log<bigint, number, false, typeof TRANSFER_EVENT>;



export async function runIndexer({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) {
  if (!isSupabaseConfigured() || !supabase) return { error: "SUPABASE_NOT_CONFIGURED" as const };
  const sb = supabase;
  const client = createPublicClient({ chain: robinhoodChain, transport: http(activeRpcEndpoint()) });

  // 1. every asset we already track, not just stock tokens
  const { data: knownAssets } = await sb.from("assets").select("id, contract_address, decimals").limit(200);
  const known = new Map((knownAssets ?? []).map((a) => [a.contract_address.toLowerCase(), a]));
  const knownList = [...known.keys()] as `0x${string}`[];

  /**
   * 2. Transfers across the range — clamped to what a free endpoint will serve.
   *
   * The public node retains roughly 48 blocks of logs. A cursor further behind
   * than that cannot be caught up: those logs are only available from an
   * archive node, which is a paid service. Rather than fail the whole run or,
   * worse, advance the cursor as though the range had been read, the range is
   * clamped and the abandoned blocks are reported as an explicit gap.
   *
   * Closing that gap for good is what scripts/live-indexer.mjs is for: it
   * follows the head continuously, so logs are taken while still inside the
   * window.
   */
  const head = Number(await client.getBlockNumber());
  const servable = clampToServableRange(Number(fromBlock), Number(toBlock), head);
  const gapBlocks = servable.skipped;
  const from = BigInt(servable.from);
  const to = BigInt(servable.to);

  let logs: TransferLog[] = [];
  let logQueryError: string | null = null;
  if (knownList.length) {
    try {
      logs = (await client.getLogs({ address: knownList, event: TRANSFER_EVENT, fromBlock: from, toBlock: to })) as TransferLog[];
    } catch (error) {
      if (isArchiveRefusal(error)) {
        logQueryError = `log range refused: ${new ArchiveRangeRefused(servable.from, head).message}`;
      } else {
        throw error;
      }
    }
  }

  // 3. real block timestamps — one lookup per distinct block, not per log.
  //    Without this every window measures indexer throughput instead of market activity.
  const blockNumbers = [...new Set(logs.map((l) => l.blockNumber).filter((b): b is bigint => b !== null))];
  const blockTimes = new Map<string, string>();
  await Promise.all(
    blockNumbers.slice(0, 40).map(async (bn) => {
      try {
        const block = await client.getBlock({ blockNumber: bn });
        blockTimes.set(bn.toString(), new Date(Number(block.timestamp) * 1000).toISOString());
      } catch {
        /* leave unset — the row is skipped rather than stamped with a wrong time */
      }
    }),
  );

  // 4. persist transfers
  const rows: {
    tx_hash: string;
    log_index: number;
    block_number: number;
    asset_id: string | null;
    from_address: string;
    to_address: string;
    amount: string;
    timestamp: string;
  }[] = [];
  const walletSeen = new Map<string, string>();

  for (const log of logs.slice(0, MAX_LOGS_PER_RUN)) {
    const args = log.args as { from?: string; to?: string; value?: bigint };
    if (!args.from || !args.to || args.value === undefined) continue;
    if (log.blockNumber === null || log.transactionHash === null || log.logIndex === null) continue;
    const ts = blockTimes.get(log.blockNumber.toString());
    if (!ts) continue; // no verified block time -> not indexed, rather than mis-stamped

    const from = args.from.toLowerCase();
    const to = args.to.toLowerCase();
    rows.push({
      tx_hash: log.transactionHash,
      log_index: log.logIndex,
      block_number: Number(log.blockNumber),
      asset_id: known.get(log.address.toLowerCase())?.id ?? null,
      from_address: from,
      to_address: to,
      amount: args.value.toString(),
      timestamp: ts,
    });
    for (const addr of [from, to]) {
      const prev = walletSeen.get(addr);
      if (!prev || ts > prev) walletSeen.set(addr, ts);
    }
  }

  let inserted = 0;
  if (rows.length) {
    const { error, count } = await sb
      .from("transfers")
      .upsert(rows, { onConflict: "tx_hash,log_index", ignoreDuplicates: true, count: "exact" });
    if (!error) inserted = count ?? rows.length;
  }

  if (walletSeen.size) {
    await sb.from("wallets").upsert(
      [...walletSeen].map(([address, last_seen]) => ({ address, last_seen })),
      { onConflict: "address" },
    );
  }

  // 5. discovery — sample the newest block for contracts we do not track yet
  let discovered = 0;
  let sampled = 0;
  try {
    const sample = (await client.getLogs({ event: TRANSFER_EVENT, fromBlock: to, toBlock: to })) as TransferLog[];
    sampled = sample.length;
    const unknown = [
      ...new Set(sample.map((l) => l.address.toLowerCase()).filter((a) => !known.has(a))),
    ].slice(0, MAX_DISCOVERY_PER_RUN);

    for (const addr of unknown) {
      try {
        const [symbol, name] = await Promise.all([
          client.readContract({ address: addr as `0x${string}`, abi: ERC20_ABI, functionName: "symbol" }).catch(() => null),
          client.readContract({ address: addr as `0x${string}`, abi: ERC20_ABI, functionName: "name" }).catch(() => null),
        ]);
        if (!symbol || !name) continue;
        if (!String(name).toLowerCase().includes(STOCK_TOKEN_NAME_MARKER)) continue;

        const decimals = await client
          .readContract({ address: addr as `0x${string}`, abi: ERC20_ABI, functionName: "decimals" })
          .catch(() => 18);

        const { error } = await sb.from("assets").insert({
          chain_id: robinhoodChain.id,
          contract_address: addr,
          symbol: String(symbol).toUpperCase(),
          name: String(name),
          asset_type: "stock_token",
          verified: true,
          source: "On-chain contract metadata — name() contains the canonical Robinhood Token marker",
          decimals: Number(decimals) || 18,
        });
        if (!error) discovered++;
      } catch {
        /* a contract that does not answer ERC-20 calls is simply not an asset */
      }
    }
  } catch {
    /* discovery is best-effort; a failed sample must not fail the run */
  }

  // 6. advance the cursor
  await sb.from("indexer_state").upsert(
    {
      chain_id: robinhoodChain.id,
      last_processed_block: Number(to),
      last_finalized_block: Number(to),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "chain_id" },
  );

  const flows = inserted > 0 ? await recomputeAddressFlows() : { windows: 0, addresses: 0, skipped: true };

  return {
    inserted,
    requestedFrom: Number(fromBlock),
    fromBlock: Number(from),
    toBlock: Number(to),
    head,
    /** Blocks abandoned because a free endpoint will not serve their logs. */
    gapBlocks,
    logQueryError,
    logs: logs.length,
    sampled,
    discovered,
    flows,
  };
}

/**
 * Directional flow is only meaningful for an address: what it received minus
 * what it sent. It is NOT meaningful for a token contract — a transfer moves
 * balance between holders without changing supply — so no asset-level net flow
 * is written or displayed. Asset activity is reported as observed volume,
 * transfer count and counterparties instead.
 */
export async function recomputeAddressFlows() {
  if (!isSupabaseConfigured() || !supabase) return { windows: 0, addresses: 0, skipped: true };
  const sb = supabase;

  const { data: assetRows } = await sb.from("assets").select("id, decimals").limit(200);
  const decimals = new Map((assetRows ?? []).map((a) => [a.id as string, (a.decimals as number) ?? 18]));

  const now = Date.now();
  let written = 0;
  let windowsDone = 0;

  for (const window of WINDOWS) {
    const since = new Date(now - WINDOW_MS[window]).toISOString();
    const { data: transfers } = await sb
      .from("transfers")
      .select("asset_id, from_address, to_address, amount")
      .gte("timestamp", since)
      .limit(5000);
    if (!transfers) continue;

    type Acc = { inflow: number; outflow: number; tx: number; cp: Set<string> };
    const acc = new Map<string, Acc>();
    const touch = (addr: string) => {
      let e = acc.get(addr);
      if (!e) {
        e = { inflow: 0, outflow: 0, tx: 0, cp: new Set() };
        acc.set(addr, e);
      }
      return e;
    };

    for (const t of transfers as { asset_id: string | null; from_address: string; to_address: string; amount: string }[]) {
      const amt = fromBaseUnits(t.amount, decimals.get(t.asset_id ?? "") ?? 18);
      const f = touch(t.from_address);
      const to = touch(t.to_address);
      f.outflow += amt;
      f.tx += 1;
      f.cp.add(t.to_address);
      to.inflow += amt;
      to.tx += 1;
      to.cp.add(t.from_address);
    }

    const ranked = [...acc.entries()]
      .sort((a, b) => b[1].inflow + b[1].outflow - (a[1].inflow + a[1].outflow))
      .slice(0, FLOW_TOP_N);

    if (!ranked.length) continue;

    const calculatedAt = new Date().toISOString();
    const payload = ranked.map(([address, e]) => ({
      entity_type: "address",
      entity_id: address,
      window,
      inflow: e.inflow,
      outflow: e.outflow,
      net_flow: e.inflow - e.outflow,
      transaction_count: e.tx,
      unique_counterparties: e.cp.size,
      calculated_at: calculatedAt,
    }));

    const { error } = await sb.from("flow_windows").upsert(payload, { onConflict: "entity_type,entity_id,window" });
    if (!error) {
      written += payload.length;
      windowsDone += 1;
    }
  }

  // Retire the previous asset-level rows: they stored gross volume in net_flow.
  await sb.from("flow_windows").delete().eq("entity_type", "asset");

  return { windows: windowsDone, addresses: written, skipped: false };
}

export async function getCursor(): Promise<{ last_processed_block: number }> {
  if (!isSupabaseConfigured() || !supabase) return { last_processed_block: 0 };
  const { data } = await supabase
    .from("indexer_state")
    .select("last_processed_block")
    .eq("chain_id", robinhoodChain.id)
    .maybeSingle();
  return { last_processed_block: Number(data?.last_processed_block ?? 0) };
}

export type { FlowWindow };
