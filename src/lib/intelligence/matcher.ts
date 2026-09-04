/**
 * The intent matcher.
 *
 * A question is scored against every knowledge entry through one pipeline:
 *
 *   normalize -> exact phrase -> phrase containment -> weighted term overlap
 *   -> typo resolution -> entity agreement -> page-context boost -> threshold
 *
 * The scoring is deliberately conservative at the top end. A confident wrong
 * answer is worse than an honest "I do not cover that", because a reader has no
 * way to tell the two apart. Anything that does not clear the high threshold is
 * offered as a list of candidate topics instead of being asserted.
 */

import { INDEX, DOC_FREQ, termWeight, type IndexedEntry } from "@/lib/intelligence/knowledge";
import { normalize, contentTokens, singular, isTypoOf } from "@/lib/intelligence/normalize";
import { expandSynonyms } from "@/lib/intelligence/synonyms";
import { detectEntities, isFlowClassEntity, type Detection } from "@/lib/intelligence/entities";
import type { PageContext, SessionContext, ConfidenceLevel } from "@/lib/intelligence/types";

/** Above this the engine states the answer. */
export const HIGH_THRESHOLD = 0.58;
/** Above this the engine offers candidates without asserting one. */
export const MEDIUM_THRESHOLD = 0.3;

export type Match = {
  entry: IndexedEntry["entry"];
  score: number;
};

export type MatchResult = {
  best: Match | null;
  candidates: Match[];
  level: ConfidenceLevel;
  detection: Detection;
  /** Normalised question, exposed for the command layer and for tests. */
  normalized: string;
};

/**
 * Query terms mapped to the vocabulary terms they could be.
 *
 * Resolved once per question rather than once per entry: with a couple of
 * thousand vocabulary terms and a handful of query terms this is a few thousand
 * bounded comparisons, where doing it inside the entry loop would be hundreds of
 * thousands. A term already in the vocabulary is never fuzzed — an exact word
 * must not acquire the meaning of a similar one.
 */
function resolveTerms(queryTerms: string[]): Map<string, Set<string>> {
  const resolved = new Map<string, Set<string>>();
  for (const term of queryTerms) {
    const set = new Set<string>([term]);
    if (!DOC_FREQ.has(term) && term.length >= 5) {
      for (const vocab of DOC_FREQ.keys()) {
        if (isTypoOf(term, vocab)) set.add(vocab);
      }
    }
    resolved.set(term, set);
  }
  return resolved;
}

/** 1 for an exact hit, a discount for a typo hit, 0 for nothing. */
function termHit(term: string, resolved: Map<string, Set<string>>, target: Set<string>): number {
  if (target.has(term)) return 1;
  const alternatives = resolved.get(term);
  if (!alternatives) return 0;
  for (const alt of alternatives) {
    if (alt !== term && target.has(alt)) return 0.78;
  }
  return 0;
}

/**
 * How much of the question this term set accounts for, and how much of the term
 * set the question accounts for.
 *
 * Coverage alone would let a huge entry match everything; precision alone would
 * favour one-word entries. Both are needed, weighted toward coverage because a
 * reader cares that their question was understood more than that the entry was
 * fully consumed.
 */
function overlap(
  queryTerms: string[],
  resolved: Map<string, Set<string>>,
  target: Set<string>,
): { coverage: number; precision: number } {
  if (!queryTerms.length || !target.size) return { coverage: 0, precision: 0 };
  let hit = 0;
  let total = 0;
  let count = 0;
  for (const term of queryTerms) {
    const w = Math.max(0.35, termWeight(term));
    total += w;
    const h = termHit(term, resolved, target);
    if (h > 0) {
      hit += w * h;
      count += 1;
    }
  }
  return {
    coverage: total > 0 ? hit / total : 0,
    precision: count / target.size,
  };
}

function scoreEntry(
  indexed: IndexedEntry,
  normalized: string,
  queryTerms: string[],
  resolved: Map<string, Set<string>>,
  detection: Detection,
  page: PageContext,
  session: SessionContext,
): number {
  let score = 0;

  // 1. An exact phrasing is not improved on by anything downstream.
  for (const p of indexed.patterns) {
    if (p.text && p.text === normalized) return 1;
  }

  // 2. Phrase containment. "what is dex buy exactly" contains "what is dex buy".
  for (const p of indexed.patterns) {
    if (!p.text || p.text.length < 4) continue;
    if (normalized.includes(p.text)) {
      score = Math.max(score, 0.8 + 0.18 * (p.text.length / Math.max(1, normalized.length)));
    } else if (p.text.includes(normalized) && normalized.length >= 6) {
      score = Math.max(score, 0.6 + 0.28 * (normalized.length / p.text.length));
    }
  }

  // 3. Best single pattern by weighted term overlap.
  for (const p of indexed.patterns) {
    const { coverage, precision } = overlap(queryTerms, resolved, p.terms);
    if (coverage === 0) continue;
    score = Math.max(score, 0.7 * coverage + 0.2 * precision);
  }

  // 4. Keywords and the entry's whole vocabulary, worth less than a phrasing.
  const kw = overlap(queryTerms, resolved, indexed.keywords);
  score = Math.max(score, 0.52 * kw.coverage + 0.1 * kw.precision);
  const all = overlap(queryTerms, resolved, indexed.terms);
  score = Math.max(score, 0.44 * all.coverage);

  // 5. Entity agreement.
  if (detection.ids.length && indexed.entities.size) {
    const shared = detection.ids.filter((id) => indexed.entities.has(id));
    if (shared.length) {
      score += Math.min(0.3, 0.16 * shared.length);
    } else {
      /**
       * The question names entities and this entry is about different ones.
       *
       * This is what keeps DEX_BUY and DEX_SELL apart. They share almost every
       * word, so term overlap alone ranks them nearly equally; only the entity
       * disagreement separates them, and it has to bite hard enough to matter.
       */
      const queryFlows = detection.ids.filter(isFlowClassEntity);
      const entryFlows = [...indexed.entities].filter(isFlowClassEntity);
      if (queryFlows.length && entryFlows.length) score *= 0.35;
      else score *= 0.82;
    }
  }

  // 6. Where the reader is standing.
  if (indexed.routes.length) {
    const onRoute = indexed.routes.some((r) => page.pathname === r || page.pathname.startsWith(`${r}/`));
    if (onRoute) score += 0.08;
  }

  // 7. What they were just asking about, so "what do the green lines mean"
  //    stays inside Fabric rather than drifting to another surface.
  if (session.lastDomain && indexed.entry.domain === session.lastDomain) score += 0.05;

  /**
   * 8. Signposts lose to explanations.
   *
   * Navigation entries are deliberately short and name their surface, which
   * makes them score well on any question that mentions that surface. But
   * "what is the market map" is a request to understand Fabric, not a request
   * to open it. Unless the reader actually asked to be taken somewhere, a
   * signpost ranks below the entry that explains the thing.
   */
  if (indexed.entry.domain === "navigation" && !isNavigational(normalized)) score *= 0.66;

  return Math.min(1, score);
}

/** Phrasings that ask to be taken somewhere rather than to be told something. */
const NAV_CUES = ["open ", "go to", "take me", "navigate", "show me the page", "where is the", "link to"];

function isNavigational(normalized: string): boolean {
  return NAV_CUES.some((cue) => normalized.includes(cue));
}

/**
 * Does this question use the product's language at all?
 *
 * Term overlap alone will always find a nearest entry, and for "who won the
 * football game" that nearest entry is meaningless — but it can still score
 * above the confident threshold on one incidental word. This gate is what keeps
 * an out-of-domain question out of a confident answer: unless the reader named
 * an entity or used vocabulary the knowledge base actually contains, no match is
 * allowed to present itself as certain.
 */
function isInDomain(queryTerms: string[], detection: Detection): boolean {
  if (detection.ids.length > 0) return true;
  const known = queryTerms.filter((t) => DOC_FREQ.has(t)).length;
  if (known >= 2) return true;
  return known === 1 && known / Math.max(1, queryTerms.length) >= 0.5;
}

export function match(
  question: string,
  page: PageContext = { pathname: "/", params: {} },
  session: SessionContext = {},
): MatchResult {
  const normalized = normalize(question);
  const detection = detectEntities(question);
  const queryTerms = [...new Set(expandSynonyms(contentTokens(question).map(singular)))];
  const resolved = resolveTerms(queryTerms);

  const scored: Match[] = [];
  for (const indexed of INDEX) {
    const score = scoreEntry(indexed, normalized, queryTerms, resolved, detection, page, session);
    if (score > 0.05) scored.push({ entry: indexed.entry, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0] ?? null;
  const inDomain = isInDomain(queryTerms, detection);

  let level: ConfidenceLevel = "LOW";
  if (best && inDomain) {
    if (best.score >= HIGH_THRESHOLD) level = "HIGH";
    else if (best.score >= MEDIUM_THRESHOLD) level = "MEDIUM";
  }

  // Out of domain: report nothing rather than the nearest thing.
  if (!inDomain) {
    return { best: null, candidates: [], level: "LOW", detection, normalized };
  }

  return {
    best: best && best.score >= MEDIUM_THRESHOLD ? best : null,
    candidates: scored.slice(0, 5),
    level,
    detection,
    normalized,
  };
}
