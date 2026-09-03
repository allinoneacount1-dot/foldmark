/**
 * The agent context payload.
 *
 * One builder, used by both /api/v1/context/[asset] and the sample rendered on
 * the landing page — so the sample is literally the response, not a hand-written
 * approximation of one.
 */

import {
  getAssetBySymbolOrAddress,
  getIndexerStatus,
  getLatestPrices,
  getTransfersSince,
  foldByAsset,
  foldByAddress,
  flowForAsset,
  since,
} from "@/lib/queries";
import { CHAIN, type FlowWindow } from "@/config/site";
import { STATE_LABEL } from "@/lib/data-state";

export type AssetContext = Record<string, unknown>;

export async function buildAssetContext(key: string, window: FlowWindow = "24H"): Promise<AssetContext | null> {
  const asset = await getAssetBySymbolOrAddress(key);
  if (!asset) return null;

  const now = Date.now();
  const [indexer, transfers] = await Promise.all([
    getIndexerStatus(),
    getTransfersSince(since(window, now), { assetId: asset.id, limit: 2000 }),
  ]);

  const folded = foldByAsset(transfers.rows, [asset], window, now).get(asset.id);
  const prices = await getLatestPrices([asset.id]);
  const price = prices.get(asset.id);
  const peers = foldByAddress(transfers.rows, [asset], 5);

  return {
    asset: {
      symbol: asset.symbol,
      name: asset.name,
      contract: asset.contract_address,
      type: asset.asset_type,
      decimals: asset.decimals,
      verified: asset.verified,
      chain_id: CHAIN.id,
    },
    observation_window: window,
    activity: folded
      ? {
          state: transfers.capped ? "PARTIAL" : "OK",
          transfers: folded.transfers,
          gross_volume: Number(folded.volume.toFixed(6)),
          counterparties: folded.counterparties,
          last_block: folded.lastBlock,
          last_seen: folded.lastSeen,
        }
      : { state: STATE_LABEL[transfers.state === "UNAVAILABLE" ? "UNAVAILABLE" : "INDEXING"], transfers: 0 },
    price: price
      ? { state: "OK", value: price.price, currency: "USD", source: price.source, observed_at: price.observedAt }
      : { state: "DATA UNAVAILABLE", reason: `No price oracle is wired to chain ${CHAIN.id}` },
    liquidity: { state: "DATA UNAVAILABLE", reason: "No DEX pool identified on this chain" },
    net_flow: {
      state: "NOT APPLICABLE",
      reason: "Net flow is defined per address, not per token contract. See /api/v1/wallets/{address}.",
    },
    // Scoped to one asset, so these amounts share a unit and mean something.
    top_counterparties: peers.map((p) => {
      const flow = flowForAsset(p, asset.id);
      return {
        address: p.address,
        transfers: p.transfers,
        received: flow ? Number(flow.inbound.toFixed(6)) : 0,
        sent: flow ? Number(flow.outbound.toFixed(6)) : 0,
        unit: asset.symbol,
      };
    }),
    markets: [],
    protocols: [],
    indexer: {
      last_processed_block: indexer.lastProcessedBlock.value,
      chain_head: indexer.chainHead.value,
      lag_blocks: indexer.lagBlocks.value,
      updated_at: indexer.updatedAt,
    },
    sources: ["Robinhood Chain RPC (eth_getLogs, eth_getBlockByNumber)", "FOLDMARK indexer"],
    methodology:
      "Activity is folded from ERC-20 Transfer logs stamped with block time. Gross volume sums transfer amounts in this asset's own token units and is not a currency figure; amounts are never summed across assets, because token units are not comparable. Fields with a state instead of a value are not measured yet; FOLDMARK never substitutes an estimate.",
    generated_at: new Date().toISOString(),
  };
}
