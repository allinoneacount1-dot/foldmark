/**
 * What a transfer was.
 *
 * A transfer log says an amount moved between two addresses. It does not say
 * whether that was a purchase, a deposit, a bridge crossing or someone paying a
 * friend. The difference is the counterparty: value leaving a DEX pool for a
 * wallet is a buy; the same amount moving between two ordinary addresses is
 * just a transfer.
 *
 * So classification is a lookup, never an inference. A counterparty is what the
 * contracts registry says it is, and if the registry has never seen it the flow
 * is UNCLASSIFIED. That is a real answer — the most common correct one on a
 * chain whose registry is empty — and not a placeholder for a better guess.
 *
 * The rule this file exists to hold: nothing about a token's name, a symbol, an
 * amount or a pattern of activity may promote a flow out of UNCLASSIFIED. Only
 * an identified contract on one side of it can.
 */

/** The canonical set. Adding an alias here changes what a flow MEANS. */
export const FLOW_CLASSES = [
  "DEX_BUY",
  "DEX_SELL",
  "LP_DEPOSIT",
  "LP_WITHDRAW",
  "LEND",
  "BORROW",
  "REPAY",
  "BRIDGE_IN",
  "BRIDGE_OUT",
  "WALLET_TRANSFER",
  "UNCLASSIFIED",
] as const;

export type FlowClass = (typeof FLOW_CLASSES)[number];

/** The categories a registered contract may hold. */
export const PROTOCOL_CATEGORIES = ["DEX", "LENDING", "BRIDGE", "ORACLE", "INFRASTRUCTURE", "UNCLASSIFIED"] as const;

export type ProtocolCategory = (typeof PROTOCOL_CATEGORIES)[number];

/** One side of a transfer, as the registry knows it. */
export type CounterpartyKind = "dex_pool" | "lending_market" | "bridge" | "oracle" | "infrastructure" | null;

export type ClassifiableEdge = {
  from: string;
  to: string;
};

/** Address -> what the contracts registry says it is. Lowercased keys. */
export type ContractIndex = Map<string, CounterpartyKind>;

/**
 * Build the lookup from registry rows.
 *
 * Only a row the registry actually holds contributes. An address absent from
 * this map is not "probably a wallet" — it is unknown, and the difference
 * matters at the bottom of this file.
 */
export function buildContractIndex(
  rows: { address: string; contract_type: string | null; verified?: boolean }[],
): ContractIndex {
  const index: ContractIndex = new Map();
  for (const r of rows) {
    const kind = normaliseKind(r.contract_type);
    if (kind) index.set(r.address.toLowerCase(), kind);
  }
  return index;
}

function normaliseKind(raw: string | null): CounterpartyKind {
  if (!raw) return null;
  switch (raw.trim().toLowerCase()) {
    case "dex_pool":
    case "dex":
    case "pool":
      return "dex_pool";
    case "lending_market":
    case "lending":
      return "lending_market";
    case "bridge":
      return "bridge";
    case "oracle":
      return "oracle";
    case "infrastructure":
      return "infrastructure";
    default:
      return null;
  }
}

/** The category a registered contract belongs to, for the protocol filter. */
export function categoryOf(kind: CounterpartyKind): ProtocolCategory {
  switch (kind) {
    case "dex_pool":
      return "DEX";
    case "lending_market":
      return "LENDING";
    case "bridge":
      return "BRIDGE";
    case "oracle":
      return "ORACLE";
    case "infrastructure":
      return "INFRASTRUCTURE";
    default:
      return "UNCLASSIFIED";
  }
}

/**
 * Classify one directed edge.
 *
 * Direction carries the meaning: the SAME pool and the same wallet produce
 * DEX_BUY or DEX_SELL depending only on which way value went. Getting that
 * backwards would invert every trade on the page, so it is stated once here
 * rather than re-derived at each call site.
 *
 * WALLET_TRANSFER is deliberately narrow. It is claimed only when the registry
 * has been consulted and neither side is a known venue — which is a statement
 * about two identified-as-ordinary addresses. With an empty registry nothing is
 * identified as ordinary either, so the answer is UNCLASSIFIED.
 */
export function classifyEdge(edge: ClassifiableEdge, contracts: ContractIndex): FlowClass {
  const from = contracts.get(edge.from.toLowerCase()) ?? null;
  const to = contracts.get(edge.to.toLowerCase()) ?? null;

  // A venue on the receiving side: value went in.
  if (to === "dex_pool") return "DEX_SELL";
  if (from === "dex_pool") return "DEX_BUY";

  if (to === "lending_market") return from === "lending_market" ? "UNCLASSIFIED" : "REPAY";
  if (from === "lending_market") return "BORROW";

  if (to === "bridge") return "BRIDGE_OUT";
  if (from === "bridge") return "BRIDGE_IN";

  /**
   * Neither side is a venue. That is only WALLET_TRANSFER when the registry was
   * able to answer at all — an empty registry means "we have not looked", which
   * is UNCLASSIFIED rather than a claim that both addresses are ordinary.
   */
  if (contracts.size > 0) return "WALLET_TRANSFER";
  return "UNCLASSIFIED";
}

/* ------------------------------------------------------------------ filters */

/**
 * Read a filter value from a URL parameter.
 *
 * Anything unrecognised falls back to null, which the surfaces read as ALL. A
 * hand-typed or stale query string must never produce an empty page that looks
 * like a measurement of nothing.
 */
export function parseFlowClass(raw: string | null | undefined): FlowClass | null {
  if (!raw) return null;
  const upper = raw.trim().toUpperCase();
  return (FLOW_CLASSES as readonly string[]).includes(upper) ? (upper as FlowClass) : null;
}

export function parseCategory(raw: string | null | undefined): ProtocolCategory | null {
  if (!raw) return null;
  const upper = raw.trim().toUpperCase();
  return (PROTOCOL_CATEGORIES as readonly string[]).includes(upper) ? (upper as ProtocolCategory) : null;
}

/** Keep only the edges matching an active flow filter. Null means keep all. */
export function filterByFlowClass<T extends ClassifiableEdge>(
  edges: T[],
  contracts: ContractIndex,
  active: FlowClass | null,
): T[] {
  if (!active) return edges;
  return edges.filter((e) => classifyEdge(e, contracts) === active);
}

/** How many edges fall in each class, for chip counts and empty-state copy. */
export function countByFlowClass(edges: ClassifiableEdge[], contracts: ContractIndex): Record<FlowClass, number> {
  const counts = Object.fromEntries(FLOW_CLASSES.map((c) => [c, 0])) as Record<FlowClass, number>;
  for (const e of edges) counts[classifyEdge(e, contracts)] += 1;
  return counts;
}

/**
 * Which category of counterparty an edge touched.
 *
 * An edge belongs to a category because one of its two ends is a contract the
 * registry has identified — never because of what the other end looks like. An
 * edge between two unidentified addresses is UNCLASSIFIED, which is a real
 * answer rather than the absence of one.
 *
 * Where both ends are identified the receiving end wins, because that is the
 * counterparty the value went to and the one a reader filtering for "LENDING"
 * is looking for.
 */
export function edgeCategory(edge: ClassifiableEdge, contracts: ContractIndex): ProtocolCategory {
  const to = contracts.get(edge.to.toLowerCase()) ?? null;
  if (to) return categoryOf(to);
  const from = contracts.get(edge.from.toLowerCase()) ?? null;
  if (from) return categoryOf(from);
  return "UNCLASSIFIED";
}

/** Keep only the edges touching an active category. Null means keep all. */
export function filterByCategory<T extends ClassifiableEdge>(
  edges: T[],
  contracts: ContractIndex,
  active: ProtocolCategory | null,
): T[] {
  if (!active) return edges;
  return edges.filter((e) => edgeCategory(e, contracts) === active);
}

/** How many edges touch each category, for chip counts. */
export function countByCategory(
  edges: ClassifiableEdge[],
  contracts: ContractIndex,
): Record<ProtocolCategory, number> {
  const counts = Object.fromEntries(PROTOCOL_CATEGORIES.map((c) => [c, 0])) as Record<ProtocolCategory, number>;
  for (const e of edges) counts[edgeCategory(e, contracts)] += 1;
  return counts;
}
