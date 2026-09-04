/**
 * The knowledge index.
 *
 * Every content file is joined here and every searchable field is normalised
 * ONCE, at module load. The matcher then works over precomputed token sets, so
 * asking a question costs a scan over prepared data rather than re-tokenising
 * the whole knowledge base.
 *
 * Nothing in this module fetches. The knowledge base is static text compiled
 * into the bundle; a question is answered without a network request.
 */

import type { Entry, Domain } from "@/lib/intelligence/types";
import { normalize, contentTokens, singular } from "@/lib/intelligence/normalize";
import { expandSynonyms } from "@/lib/intelligence/synonyms";
import { ENTITIES } from "@/lib/intelligence/entities";

import { CORE_ENTRIES } from "@/content/intelligence/core";
import { FABRIC_ENTRIES } from "@/content/intelligence/fabric";
import { FLOWS_ENTRIES } from "@/content/intelligence/flows";
import { ASSETS_ENTRIES } from "@/content/intelligence/assets";
import { WALLETS_ENTRIES } from "@/content/intelligence/wallets";
import { PROTOCOLS_ENTRIES } from "@/content/intelligence/protocols";
import { PRICING_ENTRIES } from "@/content/intelligence/pricing";
import { DATA_ENTRIES } from "@/content/intelligence/data";
import { METHODOLOGY_ENTRIES } from "@/content/intelligence/methodology";
import { NAVIGATION_ENTRIES } from "@/content/intelligence/navigation";

/**
 * Order matters only for stable tie-breaking: when two entries score exactly the
 * same, the earlier one wins, and that must not depend on module load order.
 */
export const ALL_ENTRIES: Entry[] = [
  ...CORE_ENTRIES,
  ...FABRIC_ENTRIES,
  ...FLOWS_ENTRIES,
  ...ASSETS_ENTRIES,
  ...WALLETS_ENTRIES,
  ...PROTOCOLS_ENTRIES,
  ...PRICING_ENTRIES,
  ...DATA_ENTRIES,
  ...METHODOLOGY_ENTRIES,
  ...NAVIGATION_ENTRIES,
];

/** Entity ids the detector can actually emit. See indexEntry for why this matters. */
const KNOWN_ENTITY_IDS = new Set(ENTITIES.map((e) => e.id));

/** A pattern with its tokens already computed. */
export type IndexedPattern = {
  text: string;
  tokens: string[];
  /** Content tokens, singularised, synonym-expanded. */
  terms: Set<string>;
};

export type IndexedEntry = {
  entry: Entry;
  patterns: IndexedPattern[];
  /** Union of every pattern term plus keywords plus the title. */
  terms: Set<string>;
  keywords: Set<string>;
  entities: Set<string>;
  routes: string[];
};

function prepare(text: string): Set<string> {
  return new Set(expandSynonyms(contentTokens(text).map(singular)));
}

function indexEntry(entry: Entry): IndexedEntry {
  const patterns: IndexedPattern[] = entry.patterns.map((p) => {
    const text = normalize(p);
    return { text, tokens: text ? text.split(" ") : [], terms: prepare(p) };
  });

  const terms = new Set<string>();
  for (const p of patterns) for (const t of p.terms) terms.add(t);
  for (const t of prepare(entry.title)) terms.add(t);

  const keywords = new Set<string>();
  for (const k of entry.keywords) for (const t of prepare(k)) keywords.add(t);
  for (const k of keywords) terms.add(k);

  /**
   * Only entities the detector can actually produce are kept.
   *
   * An entry declaring an id that is not in the registry could never gain the
   * agreement bonus, and worse, the matcher penalises an entry whose declared
   * entities are disjoint from the ones detected in the question. An unmatchable
   * id would therefore make an entry score WORSE on exactly the questions it was
   * written for. Filtering here means a stale or invented id is inert rather
   * than harmful.
   */
  const entities = new Set((entry.entities ?? []).filter((id) => KNOWN_ENTITY_IDS.has(id)));

  return {
    entry,
    patterns,
    terms,
    keywords,
    entities,
    routes: entry.routes ?? [],
  };
}

export const INDEX: IndexedEntry[] = ALL_ENTRIES.map(indexEntry);

export const BY_ID: Map<string, IndexedEntry> = new Map(INDEX.map((e) => [e.entry.id, e]));

/**
 * Document frequency per term.
 *
 * A term appearing in almost every entry ("foldmark", "data") should not decide
 * a match; a term appearing in one ("bridge_out") should. This is the weight
 * that makes keyword scoring discriminate instead of counting.
 */
export const DOC_FREQ: Map<string, number> = (() => {
  const freq = new Map<string, number>();
  for (const e of INDEX) {
    for (const term of e.terms) freq.set(term, (freq.get(term) ?? 0) + 1);
  }
  return freq;
})();

/** Rarer terms weigh more. Bounded so a hapax cannot single-handedly win. */
export function termWeight(term: string): number {
  const df = DOC_FREQ.get(term) ?? 0;
  if (df === 0) return 0;
  const total = INDEX.length || 1;
  return Math.min(3, Math.log(1 + total / df));
}

export function entryById(id: string): Entry | null {
  return BY_ID.get(id)?.entry ?? null;
}

export function entriesInDomain(domain: Domain): Entry[] {
  return ALL_ENTRIES.filter((e) => e.domain === domain);
}

/* --------------------------------------------------------------- integrity */

/** Ids declared more than once. Any result here is a content bug. */
export function duplicateIds(): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const e of ALL_ENTRIES) {
    if (seen.has(e.id)) dupes.add(e.id);
    seen.add(e.id);
  }
  return [...dupes];
}

/** Followups pointing at entries that do not exist. Any result here is a content bug. */
export function danglingFollowups(): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  for (const e of ALL_ENTRIES) {
    for (const f of e.followups ?? []) {
      if (!BY_ID.has(f)) out.push({ from: e.id, to: f });
    }
  }
  return out;
}

/**
 * Resolve followup ids to labels, dropping any that do not resolve.
 *
 * Defensive on purpose: a dangling id is a content bug that a test reports, but
 * it must never reach a reader as a button that does nothing when clicked.
 */
export function resolveFollowups(ids: string[] | undefined): { id: string; label: string }[] {
  if (!ids?.length) return [];
  const out: { id: string; label: string }[] = [];
  for (const id of ids) {
    const entry = entryById(id);
    if (entry) out.push({ id, label: entry.title.toUpperCase() });
  }
  return out.slice(0, 4);
}

export const KNOWLEDGE_STATS = {
  get entries() {
    return ALL_ENTRIES.length;
  },
  get patterns() {
    return ALL_ENTRIES.reduce((n, e) => n + e.patterns.length, 0);
  },
  get domains() {
    return new Set(ALL_ENTRIES.map((e) => e.domain)).size;
  },
};
