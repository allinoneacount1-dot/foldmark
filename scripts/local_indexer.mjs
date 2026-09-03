#!/usr/bin/env node
// FOLDMARK local indexer — 2 blocks/run, no Vercel 10s limit
// env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_ROBINHOOD_RPC
import { createPublicClient, http, parseAbi, parseAbiItem } from 'viem';
import { defineChain } from 'viem';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) { console.error('SUPABASE env missing'); process.exit(1); }
const supabase = createClient(url, key);
const chain = defineChain({
  id: 4663, name: 'Robinhood Chain', network: 'robinhood',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_ROBINHOOD_RPC || 'https://rpc.mainnet.chain.robinhood.com'] } },
});
const client = createPublicClient({ chain, transport: http(process.env.NEXT_PUBLIC_ROBINHOOD_RPC || 'https://rpc.mainnet.chain.robinhood.com') });
const TRANSFER = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
const ERC20_ABI = parseAbi(['function symbol() view returns (string)','function name() view returns (string)','function decimals() view returns (uint8)']);

async function runOnce() {
  const latest = await client.getBlockNumber();
  const { data: cursor } = await supabase.from('indexer_state').select('*').eq('chain_id',4663).single();
  const from = BigInt(cursor?.last_processed_block || 0);
  const start = from === 0n ? (latest > 2n ? latest - 2n : 0n) : from + 1n;
  const end = latest > start + 1n ? start + 1n : latest;
  if (start > end) { console.log(`UP_TO_DATE ${Number(latest)} cursor ${Number(from)}`); return; }
  console.log(`INDEX ${Number(start)}→${Number(end)} latest ${Number(latest)}`);

  const { data: knownAssets } = await supabase.from('assets').select('contract_address').eq('asset_type','stock_token').limit(50);
  const knownSet = new Set((knownAssets||[]).map(a=>a.contract_address.toLowerCase()));
  const knownList = [...knownSet];

  const logs = knownList.length ? await client.getLogs({ address: knownList, event: TRANSFER, fromBlock: start, toBlock: end }) : [];
  console.log(` logs known ${logs.length}`);

  let inserted=0;
  for (const log of logs.slice(0,500)) {
    const { from, to, value } = log.args;
    if (!from || !to || value===undefined) continue;
    const { data: asset } = await supabase.from('assets').select('id').eq('contract_address', log.address.toLowerCase()).single();
    const { error } = await supabase.from('transfers').upsert({
      tx_hash: log.transactionHash, log_index: log.logIndex, block_number: Number(log.blockNumber),
      asset_id: asset?.id || null, from_address: from.toLowerCase(), to_address: to.toLowerCase(),
      amount: value.toString(), timestamp: new Date().toISOString(),
    }, { onConflict: 'tx_hash,log_index', ignoreDuplicates: true });
    if (!error) inserted++;
    await supabase.from('wallets').upsert({ address: from.toLowerCase() }, { onConflict: 'address' });
    await supabase.from('wallets').upsert({ address: to.toLowerCase() }, { onConflict: 'address' });
  }

  // discovery 1 block sample
  let discovered=0;
  try {
    const sample = await client.getLogs({ event: TRANSFER, fromBlock: end, toBlock: end });
    const unknown = [...new Set(sample.map(l=>l.address.toLowerCase()).filter(a=>!knownSet.has(a)))].slice(0,3);
    for (const addr of unknown) {
      try {
        const [sym, name] = await Promise.all([
          client.readContract({ address: addr, abi: ERC20_ABI, functionName: 'symbol' }).catch(()=>null),
          client.readContract({ address: addr, abi: ERC20_ABI, functionName: 'name' }).catch(()=>null),
        ]);
        if (!sym || !name) continue;
        if (!String(name).toLowerCase().includes('robinhood token')) continue;
        const { data: exists } = await supabase.from('assets').select('id').eq('contract_address', addr).single();
        if (exists) continue;
        let dec=18; try{ dec=await client.readContract({ address: addr, abi: ERC20_ABI, functionName:'decimals' }); }catch{}
        await supabase.from('assets').insert({ chain_id:4663, contract_address: addr, symbol: String(sym).toUpperCase(), name: String(name), asset_type:'stock_token', verified:true, source:'Robinhood Chain — auto-discovered on-chain', decimals: dec });
        discovered++; console.log(` discovered ${sym} ${addr}`);
      } catch{}
    }
  } catch{}

  await supabase.from('indexer_state').upsert({ chain_id:4663, last_processed_block: Number(end), last_finalized_block: Number(end), updated_at: new Date().toISOString() }, { onConflict:'chain_id' });
  console.log(`DONE inserted ${inserted} discovered ${discovered} cursor → ${Number(end)}`);
}

runOnce().catch(e=>{ console.error(e); process.exit(1); });
