/**
 * Ownership, reconstructed from observed transfers.
 *
 * SERVER ONLY.
 *
 * THE HONEST LIMIT, STATED FIRST. A balance derived from transfers is correct
 * only if every transfer that ever touched the address is in hand. FOLDMARK
 * follows the head of a chain producing roughly 837,000 blocks a day and does
 * not hold full history for any asset, so what this module computes is not a
 * balance. It is a NET OBSERVED CHANGE over the window that was indexed.
 *
 * The distinction is the whole point. An address that held a million tokens
 * before the index began and moved nothing since shows a net change of zero
 * here, which is not the same as holding nothing. So nothing in this file
 * produces a holder count, a rank, or a percentage of supply — those are claims
 * only complete history can support, and the coverage state says so out loud.
 *
 * When historical coverage exists for an asset, the same arithmetic becomes a
 * real balance. Until then it reports what it actually knows.
 */

import { selectRows } from "@/server/db/supabase";

/** Mints come from here and burns go here. Never an ordinary participant. */
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export type OwnershipCoverage = "COMPLETE" | "PARTIAL" | "UNAVAILABLE";

export type ObservedPosition = {
  address: string;
  /** Base units received within the observed window. */
  received: bigint;
  /** Base units sent within the observed window. */
  sent: bigint;
  /** received - sent. A net change, not a balance, unless coverage is COMPLETE. */
  netChange: bigint;
  transfers: number;
  firstSeen: string;
  lastSeen: string;
};

export type OwnershipSnapshot = {
  coverage: OwnershipCoverage;
  /** Why coverage is what it is, in one sentence a reader can act on. */
  coverageNote: string;
  /** Addresses seen moving this asset. NOT a holder count. */
  observedAddresses: number;
  transfersConsidered: bigint extends never ? never : number;
  /** Base units minted from and burned to the zero address, within the window. */
  mintedInWindow: bigint;
  burnedInWindow: bigint;
  /** Largest net accumulators in the window, biggest first. */
  topAccumulating: ObservedPosition[];
  /** Largest net distributors in the window. */
  topDistributing: ObservedPosition[];
  earliestObservation: string | null;
  latestObservation: string | null;
};

const EMPTY: OwnershipSnapshot = {
  coverage: "UNAVAILABLE",
  coverageNote: "No transfers have been observed for this asset, so no position can be derived.",
  observedAddresses: 0,
  transfersConsidered: 0,
  mintedInWindow: 0n,
  burnedInWindow: 0n,
  topAccumulating: [],
  topDistributing: [],
  earliestObservation: null,
  latestObservation: null,
};

type TransferRow = {
  from_address: string;
  to_address: string;
  amount: string | number;
  timestamp: string;
};

function toBigInt(raw: string | number): bigint {
  try {
    // Amounts are base units and can exceed exact double precision, so they are
    // parsed as integers from their string form rather than through Number.
    const text = typeof raw === "number" ? raw.toFixed(0) : String(raw).trim();
    return BigInt(text.split(".")[0] || "0");
  } catch {
    return 0n;
  }
}

/**
 * Net observed positions for one asset.
 *
 * Zero-address movement is accounted separately: a mint is not someone sending
 * and a burn is not someone receiving, and folding them into participant
 * positions would invent a counterparty that does not exist.
 */
export async function observedOwnership(assetId: string, limit = 5000): Promise<OwnershipSnapshot> {
  const rows = await selectRows<TransferRow>(
    "transfers",
    `select=from_address,to_address,amount,timestamp&asset_id=eq.${encodeURIComponent(assetId)}&order=block_number.desc&limit=${limit}`,
  );
  if (!rows) {
    return { ...EMPTY, coverageNote: "The observation store could not be read, so ownership is unavailable." };
  }
  if (!rows.length) return EMPTY;

  const positions = new Map<string, ObservedPosition>();
  let minted = 0n;
  let burned = 0n;
  let earliest: string | null = null;
  let latest: string | null = null;

  const touch = (address: string, at: string): ObservedPosition => {
    let p = positions.get(address);
    if (!p) {
      p = { address, received: 0n, sent: 0n, netChange: 0n, transfers: 0, firstSeen: at, lastSeen: at };
      positions.set(address, p);
    }
    if (at < p.firstSeen) p.firstSeen = at;
    if (at > p.lastSeen) p.lastSeen = at;
    p.transfers += 1;
    return p;
  };

  for (const row of rows) {
    const value = toBigInt(row.amount);
    const at = String(row.timestamp ?? "");
    const from = String(row.from_address ?? "").toLowerCase();
    const to = String(row.to_address ?? "").toLowerCase();

    if (at) {
      if (!earliest || at < earliest) earliest = at;
      if (!latest || at > latest) latest = at;
    }

    if (from === ZERO_ADDRESS) minted += value;
    else {
      const p = touch(from, at);
      p.sent += value;
    }

    if (to === ZERO_ADDRESS) burned += value;
    else {
      const p = touch(to, at);
      p.received += value;
    }
  }

  for (const p of positions.values()) p.netChange = p.received - p.sent;

  const all = [...positions.values()];
  const sorted = [...all].sort((a, b) => (b.netChange > a.netChange ? 1 : b.netChange < a.netChange ? -1 : 0));

  /**
   * Coverage is PARTIAL by construction on this deployment.
   *
   * It would be COMPLETE only if the index reached back to the asset's first
   * transfer, which head-following does not do. Reporting it as anything else
   * would turn a net change into a balance and a participant count into a
   * holder count.
   */
  const capped = rows.length >= limit;
  const coverageNote = capped
    ? "Derived from the most recent observed transfers only, and the window was capped. These are net changes over that window, not balances."
    : "Derived from the transfers FOLDMARK has observed. The index follows the head of the chain and does not reach an asset's first transfer, so these are net changes over the observed window, not balances.";

  return {
    coverage: "PARTIAL",
    coverageNote,
    observedAddresses: all.length,
    transfersConsidered: rows.length,
    mintedInWindow: minted,
    burnedInWindow: burned,
    topAccumulating: sorted.filter((p) => p.netChange > 0n).slice(0, 10),
    topDistributing: sorted
      .filter((p) => p.netChange < 0n)
      .reverse()
      .slice(0, 10),
    earliestObservation: earliest,
    latestObservation: latest,
  };
}

/**
 * Whether a definitive holder count may be published.
 *
 * One condition, and it is not met by anything this deployment currently holds:
 * the index must reach the asset's first transfer. Until then the answer is no,
 * and the interface says so rather than showing a number that would be read as
 * a holder count.
 */
export function mayPublishHolderCount(coverage: OwnershipCoverage): boolean {
  return coverage === "COMPLETE";
}
