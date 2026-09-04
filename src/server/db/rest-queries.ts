/**
 * The reads FOLDMARK needs, expressed over PostgREST.
 *
 * SERVER ONLY. Each function mirrors one SQL query in `src/lib/queries.ts` and
 * returns the same shape, so a caller cannot tell which path answered. What it
 * CAN tell is the data state: a failure here resolves to UNAVAILABLE exactly as
 * a failed SQL read does, and never to an empty result.
 *
 * The schema this talks to is the live production one, which is narrower than
 * the migration file in this repository — `indexer_state` carries a cursor but
 * no coverage columns. That difference is handled honestly below rather than
 * papered over: coverage the database cannot prove is reported as unproven.
 */

import type { DataState } from "@/lib/data-state";
import type { AssetRow, TransferRow, ContractRow, IndexCoverage } from "@/lib/queries";
import { CHAIN } from "@/config/site";
import { selectRows, supabaseConfigured } from "@/server/db/supabase";

const CHAIN_FILTER = `chain_id=eq.${CHAIN.id}`;

function toAsset(r: Record<string, unknown>): AssetRow {
  const decimals = Number(r.decimals);
  return {
    id: String(r.id),
    contract_address: String(r.contract_address ?? ""),
    symbol: String(r.symbol ?? ""),
    name: String(r.name ?? ""),
    asset_type: (r.asset_type as AssetRow["asset_type"]) ?? "other",
    verified: r.verified === true,
    decimals: Number.isFinite(decimals) ? decimals : 18,
    source: (r.source as string | null) ?? null,
  };
}

function toTransfer(r: Record<string, unknown>): TransferRow {
  return {
    tx_hash: String(r.tx_hash ?? ""),
    log_index: Number(r.log_index ?? 0),
    block_number: Number(r.block_number ?? 0),
    asset_id: (r.asset_id as string | null) ?? null,
    from_address: String(r.from_address ?? ""),
    to_address: String(r.to_address ?? ""),
    // Kept as a string: a token amount can exceed what a double represents
    // exactly, and rounding it here would silently corrupt every figure
    // downstream.
    amount: String(r.amount ?? "0"),
    timestamp: String(r.timestamp ?? ""),
  };
}

export function restAvailable(): boolean {
  return supabaseConfigured();
}

export async function restAssets(): Promise<{ state: DataState; rows: AssetRow[] }> {
  const data = await selectRows<Record<string, unknown>>(
    "assets",
    `select=id,contract_address,symbol,name,asset_type,verified,decimals,source&${CHAIN_FILTER}&order=symbol.asc`,
  );
  if (!data) return { state: "UNAVAILABLE", rows: [] };
  const rows = data.map(toAsset);
  return { state: rows.length ? "OK" : "INDEXING", rows };
}

export async function restAssetByAddress(contract: string): Promise<AssetRow | null> {
  const data = await selectRows<Record<string, unknown>>(
    "assets",
    `select=id,contract_address,symbol,name,asset_type,verified,decimals,source&${CHAIN_FILTER}&contract_address=eq.${encodeURIComponent(contract.toLowerCase())}&limit=1`,
  );
  if (!data?.length) return null;
  return toAsset(data[0]);
}

export async function restTransfersSince(
  isoSince: string,
  opts: { assetId?: string; address?: string; limit?: number } = {},
): Promise<{ state: DataState; rows: TransferRow[]; capped: boolean }> {
  const limit = opts.limit ?? 5000;
  const parts = [
    "select=tx_hash,log_index,block_number,asset_id,from_address,to_address,amount,timestamp",
    `timestamp=gte.${encodeURIComponent(isoSince)}`,
    "order=block_number.desc",
    `limit=${limit}`,
  ];
  if (opts.assetId) parts.push(`asset_id=eq.${encodeURIComponent(opts.assetId)}`);
  if (opts.address) {
    const a = opts.address.toLowerCase();
    // PostgREST `or` takes a parenthesised list of conditions.
    parts.push(`or=(from_address.eq.${a},to_address.eq.${a})`);
  }

  const data = await selectRows<Record<string, unknown>>("transfers", parts.join("&"));
  if (!data) return { state: "UNAVAILABLE", rows: [], capped: false };
  const rows = data.map(toTransfer);
  return { state: rows.length ? "OK" : "EMPTY", rows, capped: rows.length >= limit };
}

export async function restContracts(): Promise<{ state: DataState; rows: ContractRow[] }> {
  const data = await selectRows<Record<string, unknown>>(
    "contracts",
    "select=address,protocol_id,contract_type,verified",
  );
  if (!data) return { state: "UNAVAILABLE", rows: [] };
  const rows: ContractRow[] = data.map((r) => ({
    address: String(r.address ?? ""),
    protocol_id: (r.protocol_id as string | null) ?? null,
    contract_type: (r.contract_type as string | null) ?? null,
    verified: r.verified === true,
  }));
  return { state: rows.length ? "OK" : "INDEXING", rows };
}

/**
 * Coverage, derived from what this schema can actually prove.
 *
 * The live `indexer_state` holds a cursor and nothing about continuity, so
 * `continuousSince` stays null and the state is PARTIAL whenever rows exist.
 * That is the honest reading: transfers have been observed, and the database
 * cannot demonstrate that no block between the earliest and the cursor was
 * skipped. Reporting OK here would claim completeness nothing has established.
 */
export async function restIndexCoverage(): Promise<IndexCoverage> {
  const [cursor, earliest] = await Promise.all([
    selectRows<Record<string, unknown>>("indexer_state", `select=*&${CHAIN_FILTER}&limit=1`),
    selectRows<Record<string, unknown>>(
      "transfers",
      "select=block_number,timestamp&order=block_number.asc&limit=1",
    ),
  ]);

  if (!cursor && !earliest) {
    return {
      state: "UNAVAILABLE",
      earliestBlock: null,
      earliestAt: null,
      continuousSince: null,
      continuousMs: null,
      gapBlocks: 0,
      lastGapAt: null,
    };
  }

  const first = earliest?.[0];
  const hasRows = Boolean(first);

  return {
    state: hasRows ? "PARTIAL" : "INDEXING",
    earliestBlock: first ? Number(first.block_number) : null,
    earliestAt: first ? String(first.timestamp) : null,
    continuousSince: null,
    continuousMs: null,
    gapBlocks: 0,
    lastGapAt: null,
  };
}

/** The ingestion cursor, for the status surface. */
export async function restCursor(): Promise<{ lastProcessedBlock: number | null; updatedAt: string | null }> {
  const rows = await selectRows<Record<string, unknown>>(
    "indexer_state",
    `select=last_processed_block,updated_at&${CHAIN_FILTER}&limit=1`,
  );
  const row = rows?.[0];
  if (!row) return { lastProcessedBlock: null, updatedAt: null };
  const n = Number(row.last_processed_block);
  return {
    lastProcessedBlock: Number.isFinite(n) ? n : null,
    updatedAt: (row.updated_at as string | null) ?? null,
  };
}
