/**
 * Data repairs.
 *
 * SERVER ONLY. Both repairs here correct claims the database was making that
 * the evidence did not support. They are idempotent: running one twice changes
 * nothing the second time.
 */

import { blockTimestamps } from "@/server/ingest/transport";
import { selectRows, patchRows } from "@/server/db/supabase";
import { CHAIN } from "@/config/site";

export type TimestampRepairReport = {
  rowsAudited: number;
  rowsFixed: number;
  rowsAlreadyCorrect: number;
  blocksResolved: number;
  maxDriftSeconds: number;
  sample: { txHash: string; block: number; was: string; now: string } | null;
};

/**
 * Give every transfer its block's time.
 *
 * The rows written before this existed carry the moment ingestion ran, which is
 * a fact about FOLDMARK rather than about the chain. A sampled row was 57
 * minutes adrift. Every window, every activity histogram and any future price
 * alignment reads this column, so the error is not cosmetic: it silently moves
 * events into the wrong hour.
 *
 * The schema has one time column and no DDL path is available on this
 * deployment, so `timestamp` is repaired to mean, canonically, the block's
 * time. Ingestion time is not separately retained — recording it needs a column
 * that cannot be added without direct database access.
 */
export async function repairTimestamps(limit = 1000): Promise<TimestampRepairReport> {
  const report: TimestampRepairReport = {
    rowsAudited: 0,
    rowsFixed: 0,
    rowsAlreadyCorrect: 0,
    blocksResolved: 0,
    maxDriftSeconds: 0,
    sample: null,
  };

  const rows = await selectRows<Record<string, unknown>>(
    "transfers",
    `select=tx_hash,log_index,block_number,timestamp&order=block_number.asc&limit=${limit}`,
  );
  if (!rows?.length) return report;

  report.rowsAudited = rows.length;

  const blocks = [...new Set(rows.map((r) => Number(r.block_number)))].filter(Number.isFinite);
  const times = await blockTimestamps(blocks);
  report.blocksResolved = times.size;

  for (const row of rows) {
    const block = Number(row.block_number);
    const truth = times.get(block);
    if (!truth) continue;

    const stored = String(row.timestamp ?? "");
    const storedMs = Date.parse(stored);
    const truthMs = Date.parse(truth);
    if (!Number.isFinite(truthMs)) continue;

    // Same instant already: nothing to do. Compared as instants rather than as
    // strings, since the two sources format zones differently.
    if (Number.isFinite(storedMs) && Math.abs(storedMs - truthMs) < 1000) {
      report.rowsAlreadyCorrect += 1;
      continue;
    }

    const drift = Number.isFinite(storedMs) ? Math.abs(storedMs - truthMs) / 1000 : 0;
    if (drift > report.maxDriftSeconds) report.maxDriftSeconds = drift;

    const ok = await patchRows(
      "transfers",
      `tx_hash=eq.${encodeURIComponent(String(row.tx_hash))}&log_index=eq.${Number(row.log_index)}`,
      { timestamp: truth },
    );
    if (!ok) continue;

    report.rowsFixed += 1;
    if (!report.sample) {
      report.sample = { txHash: String(row.tx_hash), block, was: stored, now: truth };
    }
  }

  return report;
}

/**
 * What counts as authoritative evidence of identity.
 *
 * A market venue listing a contract says a market exists. It does not say the
 * contract is the instrument its name claims to be — which is precisely the
 * assertion VERIFIED makes. Recognition by an aggregator, a matching ticker and
 * a matching name are all evidence of the same weak kind, and none of them is
 * an issuer confirming an address.
 */
const NON_AUTHORITATIVE = [
  "dexscreener",
  "dex screener",
  "geckoterminal",
  "coingecko",
  "auto-discovered",
  "observed",
  "symbol match",
  "name match",
  "listing",
];

export function isAuthoritativeSource(source: string | null): boolean {
  if (!source) return false;
  const s = source.toLowerCase();
  if (NON_AUTHORITATIVE.some((n) => s.includes(n))) return false;
  // Only an issuer publishing the exact contract clears the bar. Nothing in the
  // current dataset does, and this defaults to false rather than to a guess.
  return /issuer|official registry|authoritative/.test(s);
}

export type VerificationRepairReport = {
  assetsAudited: number;
  incorrectlyVerified: number;
  corrected: number;
  remainingVerified: number;
  examples: { symbol: string; contract: string; source: string | null }[];
};

/**
 * Withdraw verification that was never earned.
 *
 * Rows carried `verified = true` because an aggregator recognised the contract.
 * That is a market listing, not an identity confirmation, and the badge it
 * produced told readers something the product could not support.
 *
 * The source string is preserved. It is real information about where the
 * contract was seen — it simply is not verification, so only the claim changes.
 */
export async function repairVerification(): Promise<VerificationRepairReport> {
  const report: VerificationRepairReport = {
    assetsAudited: 0,
    incorrectlyVerified: 0,
    corrected: 0,
    remainingVerified: 0,
    examples: [],
  };

  const rows = await selectRows<Record<string, unknown>>(
    "assets",
    `select=id,symbol,contract_address,verified,source&chain_id=eq.${CHAIN.id}`,
  );
  if (!rows) return report;

  report.assetsAudited = rows.length;

  for (const row of rows) {
    const verified = row.verified === true;
    if (!verified) continue;

    const source = (row.source as string | null) ?? null;
    if (isAuthoritativeSource(source)) {
      report.remainingVerified += 1;
      continue;
    }

    report.incorrectlyVerified += 1;
    if (report.examples.length < 5) {
      report.examples.push({
        symbol: String(row.symbol ?? ""),
        contract: String(row.contract_address ?? ""),
        source,
      });
    }

    const ok = await patchRows("assets", `id=eq.${encodeURIComponent(String(row.id))}`, {
      verified: false,
    });
    if (ok) report.corrected += 1;
  }

  return report;
}
