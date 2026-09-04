/**
 * Entity detection.
 *
 * Before the matcher scores anything it looks for the product's own nouns in the
 * question. A detected entity is worth more than a loose keyword: someone who
 * types "DEX_BUY" is asking about that exact class, not about DEX venues in
 * general, and the two must not be conflated.
 *
 * The vocabularies are IMPORTED from the modules that define them rather than
 * retyped here. If a flow class is renamed the guide follows automatically
 * instead of quietly answering about a class that no longer exists.
 */

import { FLOW_CLASSES, PROTOCOL_CATEGORIES } from "@/lib/flow-classification";
import { ASSET_TYPES } from "@/config/site";
import { normalize, isTypoOf } from "@/lib/intelligence/normalize";

export type EntityKind =
  | "surface"
  | "flow_class"
  | "category"
  | "price_type"
  | "data_state"
  | "asset_type"
  | "chain"
  | "vendor"
  | "address";

export type Entity = {
  /** Uppercase token an Entry refers to in its `entities` array. */
  id: string;
  kind: EntityKind;
  /** Normalised phrases that select this entity. */
  aliases: string[];
};

/** The four price kinds. Retyped from the schema check constraint, which is not importable. */
export const PRICE_TYPES = ["REFERENCE", "ORACLE", "DEX_SPOT", "AGGREGATED"] as const;

/** The six data states, plus ERROR which readers say even though the model has no such value. */
export const DATA_STATES = ["OK", "PARTIAL", "STALE", "EMPTY", "INDEXING", "UNAVAILABLE"] as const;

const SURFACES: Entity[] = [
  { id: "FABRIC", kind: "surface", aliases: ["fabric", "topology", "market topology"] },
  { id: "FLOWS", kind: "surface", aliases: ["flows", "flow", "capital flow"] },
  { id: "ASSETS", kind: "surface", aliases: ["assets", "asset", "asset passport"] },
  { id: "WALLETS", kind: "surface", aliases: ["wallets", "wallet"] },
  { id: "PROTOCOLS", kind: "surface", aliases: ["protocols", "protocol", "registry"] },
  { id: "DASHBOARD", kind: "surface", aliases: ["dashboard"] },
  { id: "DEVELOPERS", kind: "surface", aliases: ["developers", "developer", "api"] },
  { id: "DOCS", kind: "surface", aliases: ["docs", "documentation"] },
  { id: "METHODOLOGY", kind: "surface", aliases: ["methodology"] },
  { id: "INSPECTOR", kind: "surface", aliases: ["inspector"] },
  { id: "ARCHITECTURE_PREVIEW", kind: "surface", aliases: ["architecture preview", "preview mode", "preview"] },
  { id: "MEASURED_GRAPH", kind: "surface", aliases: ["measured graph", "observed graph"] },
];

const VENDORS: Entity[] = [
  { id: "TRADINGVIEW", kind: "vendor", aliases: ["tradingview", "trading view"] },
];

const CHAINS: Entity[] = [
  { id: "ROBINHOOD_CHAIN", kind: "chain", aliases: ["robinhood chain", "chain 4663", "4663", "rhc", "robinhood"] },
];

const PRICE_ENTITIES: Entity[] = [
  { id: "REFERENCE", kind: "price_type", aliases: ["reference", "reference market", "reference price"] },
  { id: "ORACLE", kind: "price_type", aliases: ["oracle", "oracle price"] },
  { id: "DEX_SPOT", kind: "price_type", aliases: ["dex spot", "spot price", "venue price"] },
  { id: "AGGREGATED", kind: "price_type", aliases: ["aggregated", "aggregate price", "composite price"] },
  { id: "ONCHAIN", kind: "price_type", aliases: ["onchain", "on chain", "onchain price"] },
];

/**
 * Flow classes and categories share names (DEX_BUY is a flow, DEX is a
 * category) so their aliases are kept deliberately distinct. "dex buy" only
 * ever selects the flow class; bare "dex" only ever selects the category.
 */
const FLOW_ENTITIES: Entity[] = FLOW_CLASSES.map((c) => ({
  id: c,
  kind: "flow_class" as const,
  aliases: [normalize(c)],
}));

const CATEGORY_ENTITIES: Entity[] = PROTOCOL_CATEGORIES.map((c) => ({
  id: `CATEGORY_${c}`,
  kind: "category" as const,
  aliases: [normalize(c)],
}));

const STATE_ENTITIES: Entity[] = DATA_STATES.map((s) => ({
  id: s,
  kind: "data_state" as const,
  aliases: [normalize(s)],
}));

const ASSET_TYPE_ENTITIES: Entity[] = ASSET_TYPES.map((t) => ({
  id: `ASSET_TYPE_${t.toUpperCase()}`,
  kind: "asset_type" as const,
  aliases: [normalize(t)],
}));

export const ENTITIES: Entity[] = [
  ...SURFACES,
  ...VENDORS,
  ...CHAINS,
  ...PRICE_ENTITIES,
  ...FLOW_ENTITIES,
  ...CATEGORY_ENTITIES,
  ...STATE_ENTITIES,
  ...ASSET_TYPE_ENTITIES,
];

/** alias phrase to entity ids. One phrase can legitimately select several. */
const ALIAS_INDEX: Map<string, string[]> = (() => {
  const map = new Map<string, string[]>();
  for (const e of ENTITIES) {
    for (const alias of e.aliases) {
      const key = normalize(alias);
      if (!key) continue;
      const list = map.get(key);
      if (list) {
        if (!list.includes(e.id)) list.push(e.id);
      } else {
        map.set(key, [e.id]);
      }
    }
  }
  return map;
})();

const MAX_ALIAS_WORDS = (() => {
  let max = 1;
  for (const key of ALIAS_INDEX.keys()) {
    const n = key.split(" ").length;
    if (n > max) max = n;
  }
  return max;
})();

/** Every alias as a word list, for typo-tolerant single-token matching. */
const SINGLE_WORD_ALIASES: string[] = [...ALIAS_INDEX.keys()].filter((k) => !k.includes(" "));

/** An EVM address. Detected as a shape, never resolved to an identity. */
const ADDRESS_RE = /\b0x[a-fA-F0-9]{40}\b/g;

export type Detection = {
  /** Entity ids found, most specific first. */
  ids: string[];
  /** Addresses found verbatim, lowercased. Never claimed to be anything. */
  addresses: string[];
};

/**
 * Find product entities in a question.
 *
 * Multi-word aliases are matched first at each position so "dex spot" is one
 * entity rather than a DEX category plus a stray word. Single tokens then get a
 * typo pass, which is how "unclasified" still reaches UNCLASSIFIED.
 */
export function detectEntities(raw: string): Detection {
  const addresses = (raw.match(ADDRESS_RE) ?? []).map((a) => a.toLowerCase());

  // Addresses are removed before tokenising so their hex never scores as words.
  const text = normalize(raw.replace(ADDRESS_RE, " "));
  const tokens = text ? text.split(" ") : [];
  const found: string[] = [];
  const add = (ids: string[]) => {
    for (const id of ids) if (!found.includes(id)) found.push(id);
  };

  const consumed = new Set<number>();
  for (let i = 0; i < tokens.length; i += 1) {
    const widest = Math.min(MAX_ALIAS_WORDS, tokens.length - i);
    for (let width = widest; width >= 1; width -= 1) {
      const phrase = tokens.slice(i, i + width).join(" ");
      const ids = ALIAS_INDEX.get(phrase);
      if (!ids) continue;
      add(ids);
      for (let k = i; k < i + width; k += 1) consumed.add(k);
      break;
    }
  }

  // Typo pass over tokens no exact alias claimed.
  for (let i = 0; i < tokens.length; i += 1) {
    if (consumed.has(i)) continue;
    const token = tokens[i];
    if (token.length < 5) continue;
    for (const alias of SINGLE_WORD_ALIASES) {
      if (isTypoOf(token, alias)) {
        add(ALIAS_INDEX.get(alias) ?? []);
        break;
      }
    }
  }

  return { ids: found, addresses };
}

export function entityById(id: string): Entity | null {
  return ENTITIES.find((e) => e.id === id) ?? null;
}

/** True when the id names one of the eleven flow classes. */
export function isFlowClassEntity(id: string): boolean {
  return (FLOW_CLASSES as readonly string[]).includes(id);
}
