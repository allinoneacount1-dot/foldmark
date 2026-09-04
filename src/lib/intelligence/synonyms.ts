/**
 * Domain synonyms.
 *
 * Readers describe FOLDMARK's surfaces in their own words: the topology is "the
 * graph" or "the map", an address is "an account", a counterparty is "the other
 * side". This table maps those onto the product's own vocabulary so the matcher
 * scores them as if the reader had used the canonical term.
 *
 * Expansion is ADDITIVE. The reader's own words are kept and the canonical term
 * is added beside them, so a synonym can only ever help a question match; it can
 * never stop one from matching.
 *
 * Alias phrases may contain spaces. Longer phrases are tried first, so "market
 * map" resolves as one alias rather than as "market" plus "map".
 */

import { normalize } from "@/lib/intelligence/normalize";

type SynonymGroup = {
  /** The product's term. */
  canonical: string;
  /** What readers say instead. */
  aliases: string[];
};

const GROUPS: SynonymGroup[] = [
  {
    canonical: "fabric",
    aliases: ["topology", "market map", "network map", "structure map", "the map", "graph view", "topology map", "market topology", "network graph"],
  },
  {
    canonical: "flows",
    aliases: ["capital flow", "money flow", "capital movement", "movement", "transfer flow", "flow surface", "value movement", "where money moves"],
  },
  {
    canonical: "address",
    aliases: ["account", "holder address", "0x address", "eoa", "externally owned account"],
  },
  {
    canonical: "wallet",
    aliases: ["holder", "wallet address"],
  },
  {
    canonical: "counterparty",
    aliases: ["peer", "other side", "receiver", "recipient", "destination", "sender", "source address", "who they traded with"],
  },
  {
    canonical: "verified",
    aliases: ["confirmed", "validated", "authoritative", "authenticated", "trusted", "official"],
  },
  {
    canonical: "unclassified",
    aliases: ["unknown", "uncategorized", "uncategorised", "not identified", "unidentified", "no category", "unlabeled", "unlabelled"],
  },
  {
    canonical: "reference market",
    aliases: ["tradingview", "trading view", "reference price", "external market", "reference chart", "benchmark", "external chart"],
  },
  {
    canonical: "node",
    aliases: ["dot", "circle", "hexagon", "hexagons", "shape", "square", "triangle", "diamond", "point", "blob"],
  },
  {
    canonical: "edge",
    aliases: ["line", "lines", "link", "connection", "arrow", "arrows", "curve", "green line", "green lines", "lime line", "connector", "relationship line"],
  },
  {
    canonical: "venue",
    aliases: ["dex pool", "pool", "exchange venue", "trading venue", "market venue", "amm"],
  },
  {
    canonical: "protocol",
    aliases: ["dapp", "contract counterparty", "defi protocol", "application"],
  },
  {
    canonical: "provenance",
    aliases: ["where does this come from", "data source", "sourcing", "attribution", "origin of data", "citation"],
  },
  {
    canonical: "freshness",
    aliases: ["how old", "recency", "up to date", "last updated", "age of data"],
  },
  {
    canonical: "coverage",
    aliases: ["completeness", "how much is indexed", "how complete"],
  },
  {
    canonical: "architecture preview",
    aliases: ["preview mode", "placeholder graph", "demo graph", "sample graph", "not real data", "fake data", "is this real"],
  },
  {
    canonical: "measured graph",
    aliases: ["real graph", "observed graph", "actual data", "live graph", "indexed graph"],
  },
  {
    canonical: "robinhood chain",
    aliases: ["rhc", "chain 4663", "4663", "the chain", "robinhood network"],
  },
  {
    canonical: "asset",
    aliases: ["token", "instrument", "coin", "ticker"],
  },
  {
    canonical: "stock token",
    aliases: ["equity token", "tokenized stock", "tokenised stock", "share token", "stock"],
  },
  {
    canonical: "classification",
    aliases: ["how it decides", "categorization", "categorisation", "labelling", "labeling", "how is it classified"],
  },
  {
    canonical: "provenance",
    aliases: ["evidence", "proof"],
  },
  {
    canonical: "filter",
    aliases: ["chip", "chips", "narrow down", "constrain", "filtering"],
  },
  {
    canonical: "window",
    aliases: ["time range", "timeframe", "time frame", "period", "lookback"],
  },
  {
    canonical: "indexing",
    aliases: ["still loading", "being processed", "not indexed yet", "pipeline"],
  },
  {
    canonical: "empty",
    aliases: ["nothing here", "no activity", "no results", "blank"],
  },
  {
    canonical: "foldmark",
    aliases: ["this product", "this site", "this app", "this tool", "the product"],
  },
  {
    canonical: "onchain",
    aliases: ["on chain", "on-chain", "chain data", "blockchain data"],
  },
  {
    canonical: "notional",
    aliases: ["usd value", "dollar value", "value moved", "how much moved"],
  },
  {
    canonical: "centrality",
    aliases: ["most important", "most connected", "hub", "center", "centre", "dominant"],
  },
  {
    canonical: "inspector",
    aliases: ["side panel", "detail panel", "readout", "right panel"],
  },
];

/** alias phrase (normalised) to canonical phrase (normalised). Built once. */
const ALIAS_TO_CANONICAL: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const group of GROUPS) {
    const canonical = normalize(group.canonical);
    for (const alias of group.aliases) {
      const key = normalize(alias);
      // First writer wins, so an alias listed under two groups keeps the
      // earlier, more specific meaning rather than silently flipping.
      if (key && !map.has(key)) map.set(key, canonical);
    }
  }
  return map;
})();

/** Longest alias in words, so the scanner knows how wide a window to try. */
const MAX_ALIAS_WORDS = (() => {
  let max = 1;
  for (const key of ALIAS_TO_CANONICAL.keys()) {
    const n = key.split(" ").length;
    if (n > max) max = n;
  }
  return max;
})();

/**
 * The reader's tokens plus the canonical terms their phrasing implies.
 *
 * Scans longest-phrase-first at each position so "market map" is one alias
 * rather than two unrelated words, then keeps scanning past it.
 */
export function expandSynonyms(tokens: string[]): string[] {
  const out = [...tokens];
  const seen = new Set(tokens);

  for (let i = 0; i < tokens.length; i += 1) {
    const widest = Math.min(MAX_ALIAS_WORDS, tokens.length - i);
    for (let width = widest; width >= 1; width -= 1) {
      const phrase = tokens.slice(i, i + width).join(" ");
      const canonical = ALIAS_TO_CANONICAL.get(phrase);
      if (!canonical) continue;
      for (const token of canonical.split(" ")) {
        if (!seen.has(token)) {
          seen.add(token);
          out.push(token);
        }
      }
      // Longest match at this position wins; shorter ones inside it are noise.
      break;
    }
  }
  return out;
}

/** Exposed for tests and for the fallback, which lists what the guide understands. */
export function canonicalTerms(): string[] {
  return [...new Set(GROUPS.map((g) => normalize(g.canonical)))];
}

export function aliasCount(): number {
  return ALIAS_TO_CANONICAL.size;
}
