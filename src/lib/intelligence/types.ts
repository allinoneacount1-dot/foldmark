/**
 * FOLDMARK Intelligence — the response contract.
 *
 * This file is deliberately the only thing the UI knows about the engine. The
 * panel renders an `IntelligenceResponse` and nothing else, so the engine
 * behind it can be replaced without the interface being redesigned: today a
 * deterministic static matcher, later a hybrid that falls back to a model for
 * questions the knowledge base does not cover.
 *
 * The honesty rule that outranks every other consideration here: this system
 * does not generate language. Every answer it returns was written by a person
 * and stored in the knowledge base. It must never describe itself as an AI, a
 * model, or a thing that "analysed", "scanned" or "discovered" anything. It
 * reports what FOLDMARK defines and what the current page contains.
 */

/** Knowledge domains. Each owns one content file. */
export const DOMAINS = [
  "core",
  "fabric",
  "flows",
  "assets",
  "wallets",
  "protocols",
  "pricing",
  "data",
  "methodology",
  "navigation",
] as const;

export type Domain = (typeof DOMAINS)[number];

/**
 * A deterministic application action.
 *
 * Only navigation. An action moves the reader to a route that already exists
 * and never mutates anything, so offering one can never be a side effect the
 * reader did not ask for.
 */
export type Action = {
  label: string;
  href: string;
};

export type Followup = {
  /** Entry id to resolve when chosen. */
  id: string;
  label: string;
};

/**
 * One knowledge entry.
 *
 * `patterns` are whole phrasings a reader might type. `keywords` are the terms
 * that should pull toward this entry when the phrasing is novel. Both are
 * normalised once at module load, never per keystroke.
 */
export type Entry = {
  id: string;
  domain: Domain;
  title: string;
  /** Natural-language phrasings, lowercase, no punctuation needed. */
  patterns: string[];
  /** Weighted terms. A term matching here scores lower than a pattern hit. */
  keywords: string[];
  /** The answer. Paragraphs separated by a blank line. */
  answer: string;
  /** One or two sentences, for "short" requests and for medium-confidence lists. */
  shortAnswer?: string;
  /** Longer technical expansion, for "in detail" / "technical" / "how exactly". */
  detail?: string;
  /** Entry ids offered after this answer. */
  followups?: string[];
  actions?: Action[];
  /** Entity ids that should boost this entry when detected in the question. */
  entities?: string[];
  /** Route prefixes that should boost this entry when the reader is on them. */
  routes?: string[];
};

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

/**
 * What the engine returns for one question. The UI renders exactly this.
 */
export type IntelligenceResponse = {
  answer: string;
  intentId?: string;
  /** 0..1. The level below is derived from it, and both are reported. */
  confidence: number;
  level: ConfidenceLevel;
  followups: Followup[];
  actions: Action[];
  /**
   * A line the UI shows above the answer when the engine is describing the
   * reader's own page state rather than the knowledge base.
   */
  contextLine?: string;
};

/**
 * What the engine knows about where the reader is.
 *
 * Read from the router. Nothing here triggers a fetch: the guide reports state
 * the application already has on the client, and never opens a second data path
 * of its own.
 */
export type PageContext = {
  pathname: string;
  params: Record<string, string>;
};

/** Session-only. Cleared by CLEAR and gone when the tab closes. */
export type SessionContext = {
  lastIntentId?: string;
  lastDomain?: Domain;
  lastEntities?: string[];
};

/**
 * The seam a future model implementation slots into. The static provider is
 * authoritative for canonical product semantics and stays that way even if a
 * generative fallback is added behind it.
 */
export type IntelligenceProvider = {
  readonly id: string;
  ask(question: string, page: PageContext, session: SessionContext): IntelligenceResponse;
};
