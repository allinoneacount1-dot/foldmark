/**
 * Capital flow intelligence.
 *
 * SERVER ONLY.
 *
 * THE ARITHMETIC RULE THIS MODULE IS BUILT AROUND. One NVDA plus one USDG is
 * not two of anything. Token units are not comparable across assets, so nothing
 * here ever sums raw amounts across different assets to rank them. Ranking uses
 * measures that ARE comparable — transfer count, distinct counterparty count —
 * or, where the same asset is being compared with itself, that asset's own
 * units. USD notional is comparable, but only over the transfers that alignment
 * could actually price, which is a small share today.
 *
 * The second rule is about change. A window is compared with the window
 * immediately before it, of the same length. "More than yesterday" is a
 * measurement; "unusually high" is a judgement, and this module does not make
 * judgements. Every change it reports carries the two numbers it came from.
 */

import { selectRows } from "@/server/db/supabase";
import { classifyEdge, buildContractIndex, type FlowClass, type ContractIndex } from "@/lib/flow-classification";
import { WINDOW_MS, type FlowWindow } from "@/config/site";

type TransferRow = {
  asset_id: string | null;
  from_address: string;
  to_address: string;
  timestamp: string;
};

/** What one window observed. Every field is a count, not a value. */
export type WindowFacts = {
  transfers: number;
  activeAddresses: number;
  activeAssets: number;
  distinctPairs: number;
  byClass: Record<string, number>;
};

export type Delta = {
  metric: string;
  current: number;
  previous: number;
  /** current - previous. Sign carries the direction; no adjective is attached. */
  change: number;
  /** Null when the previous window was zero: a ratio against nothing is not a fact. */
  changeRatio: number | null;
};

export type FlowIntelligence = {
  window: FlowWindow;
  current: WindowFacts;
  previous: WindowFacts;
  deltas: Delta[];
  /** Descriptive, threshold-free statements a reader can check against the numbers. */
  observations: string[];
  /** Assets ranked by comparable measures only. */
  topAssets: { assetId: string; symbol: string; transfers: number; counterparties: number }[];
  /** Registry-identified venues seen in the window. */
  topVenues: { address: string; transfers: number; protocolId: string | null }[];
  coverageNote: string;
  windowStart: string;
  windowEnd: string;
};

const EMPTY_FACTS: WindowFacts = {
  transfers: 0,
  activeAddresses: 0,
  activeAssets: 0,
  distinctPairs: 0,
  byClass: {},
};

function summarise(rows: TransferRow[], contracts: ContractIndex): WindowFacts {
  const addresses = new Set<string>();
  const assets = new Set<string>();
  const pairs = new Set<string>();
  const byClass: Record<string, number> = {};

  for (const r of rows) {
    addresses.add(r.from_address);
    addresses.add(r.to_address);
    if (r.asset_id) assets.add(r.asset_id);
    pairs.add(`${r.from_address}>${r.to_address}`);
    const c: FlowClass = classifyEdge({ from: r.from_address, to: r.to_address }, contracts);
    byClass[c] = (byClass[c] ?? 0) + 1;
  }

  return {
    transfers: rows.length,
    activeAddresses: addresses.size,
    activeAssets: assets.size,
    distinctPairs: pairs.size,
    byClass,
  };
}

function delta(metric: string, current: number, previous: number): Delta {
  return {
    metric,
    current,
    previous,
    change: current - previous,
    // Dividing by a zero previous window would manufacture an infinite increase
    // out of a window that simply had nothing in it.
    changeRatio: previous > 0 ? (current - previous) / previous : null,
  };
}

/**
 * Compare a window with the equivalent window immediately before it.
 *
 * Both windows are read with the same query shape and the same classifier, so a
 * difference between them is a difference in the chain rather than a difference
 * in how they were measured.
 */
export async function flowIntelligence(window: FlowWindow, now = Date.now()): Promise<FlowIntelligence> {
  const span = WINDOW_MS[window];
  const currentStart = new Date(now - span).toISOString();
  const previousStart = new Date(now - span * 2).toISOString();
  const nowIso = new Date(now).toISOString();

  const select = "select=asset_id,from_address,to_address,timestamp&order=timestamp.desc&limit=5000";

  const [currentRows, previousRows, contractRows, assetRows] = await Promise.all([
    selectRows<TransferRow>("transfers", `${select}&timestamp=gte.${encodeURIComponent(currentStart)}`),
    selectRows<TransferRow>(
      "transfers",
      `${select}&timestamp=gte.${encodeURIComponent(previousStart)}&timestamp=lt.${encodeURIComponent(currentStart)}`,
    ),
    selectRows<{ address: string; contract_type: string | null; protocol_id: string | null }>(
      "contracts",
      "select=address,contract_type,protocol_id",
    ),
    selectRows<{ id: string; symbol: string }>("assets", "select=id,symbol"),
  ]);

  const contracts = buildContractIndex(contractRows ?? []);
  const current = currentRows ? summarise(currentRows, contracts) : EMPTY_FACTS;
  const previous = previousRows ? summarise(previousRows, contracts) : EMPTY_FACTS;

  const deltas: Delta[] = [
    delta("TRANSFERS", current.transfers, previous.transfers),
    delta("ACTIVE ADDRESSES", current.activeAddresses, previous.activeAddresses),
    delta("ACTIVE ASSETS", current.activeAssets, previous.activeAssets),
    delta("DIRECTED PAIRS", current.distinctPairs, previous.distinctPairs),
  ];

  for (const cls of new Set([...Object.keys(current.byClass), ...Object.keys(previous.byClass)])) {
    deltas.push(delta(cls, current.byClass[cls] ?? 0, previous.byClass[cls] ?? 0));
  }

  /**
   * Statements, not verdicts.
   *
   * Each one restates two numbers the reader can see. Nothing here calls a
   * change large, unusual or significant: those are judgements that would need
   * a baseline this product has not established.
   */
  const observations: string[] = [];
  for (const d of deltas) {
    if (d.change === 0) continue;
    if (d.previous === 0 && d.current > 0) {
      observations.push(`${d.metric} appears in this window with ${d.current}, where the previous window had none.`);
    } else if (d.current === 0 && d.previous > 0) {
      observations.push(`${d.metric} is absent in this window, where the previous window had ${d.previous}.`);
    } else {
      const direction = d.change > 0 ? "up" : "down";
      observations.push(
        `${d.metric} ${direction} from ${d.previous} to ${d.current}${
          d.changeRatio === null ? "" : ` (${d.changeRatio > 0 ? "+" : ""}${Math.round(d.changeRatio * 100)}%)`
        }.`,
      );
    }
  }

  // ---- ranking, on comparable measures only -----------------------------
  const symbols = new Map((assetRows ?? []).map((a) => [a.id, a.symbol]));
  const perAsset = new Map<string, { transfers: number; counterparties: Set<string> }>();
  const perVenue = new Map<string, number>();

  for (const r of currentRows ?? []) {
    if (r.asset_id) {
      const e = perAsset.get(r.asset_id) ?? { transfers: 0, counterparties: new Set<string>() };
      e.transfers += 1;
      e.counterparties.add(r.from_address);
      e.counterparties.add(r.to_address);
      perAsset.set(r.asset_id, e);
    }
    for (const side of [r.from_address, r.to_address]) {
      if (contracts.get(side.toLowerCase())) perVenue.set(side, (perVenue.get(side) ?? 0) + 1);
    }
  }

  const protocolOf = new Map((contractRows ?? []).map((c) => [c.address.toLowerCase(), c.protocol_id]));

  return {
    window,
    current,
    previous,
    deltas,
    observations,
    topAssets: [...perAsset.entries()]
      // Transfer count is comparable across assets; token amounts are not.
      .sort((a, b) => b[1].transfers - a[1].transfers)
      .slice(0, 8)
      .map(([assetId, e]) => ({
        assetId,
        symbol: symbols.get(assetId) ?? "—",
        transfers: e.transfers,
        counterparties: e.counterparties.size,
      })),
    topVenues: [...perVenue.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([address, transfers]) => ({
        address,
        transfers,
        protocolId: protocolOf.get(address.toLowerCase()) ?? null,
      })),
    coverageNote:
      "Windows are compared with the equivalent window immediately before them, measured the same way. Ranking uses transfer and counterparty counts, which are comparable across assets; token amounts are not, and are never summed across different assets.",
    windowStart: currentStart,
    windowEnd: nowIso,
  };
}
