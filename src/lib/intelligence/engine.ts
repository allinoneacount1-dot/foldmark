/**
 * The static intelligence engine.
 *
 * One entry point, `ask`, which resolves a question to an `IntelligenceResponse`
 * through a fixed order of precedence:
 *
 *   command -> injection -> credentials -> self-description -> pasted address
 *   -> live page state -> knowledge match -> honest fallback
 *
 * The safety branches come first on purpose. A question about credentials must
 * not be able to score its way into a knowledge answer, and a pasted address
 * must not be able to match an entry that would describe it as something.
 *
 * Nothing here fetches and nothing here generates language. Every string it
 * returns was written by a person, in this repository.
 */

import type {
  IntelligenceProvider,
  IntelligenceResponse,
  PageContext,
  SessionContext,
  Entry,
} from "@/lib/intelligence/types";
import { match, HIGH_THRESHOLD } from "@/lib/intelligence/matcher";
import { resolveFollowups, entryById } from "@/lib/intelligence/knowledge";
import { sanitizeActions, parseCommand, SURFACE_ACTIONS } from "@/lib/intelligence/actions";
import { describeContext, describeFilters, routeFacts } from "@/lib/intelligence/context";
import { normalize } from "@/lib/intelligence/normalize";
import {
  isInjectionAttempt,
  isSecretRequest,
  isSelfQuery,
  selfDescription,
  INJECTION_RESPONSE,
  SECRET_RESPONSE,
  LOW_CONFIDENCE_RESPONSE,
  MEDIUM_CONFIDENCE_LEAD,
  FALLBACK_ACTIONS,
  unknownAddressResponse,
} from "@/lib/intelligence/fallback";

/** How much of an entry to return. */
export type Verbosity = "short" | "default" | "detail";

const DETAIL_CUES = ["in detail", "in depth", "more detail", "tell me more", "how exactly", "technically", "technical", "elaborate", "full explanation", "deep dive", "explain fully"];
const SHORT_CUES = ["in short", "briefly", "short answer", "tldr", "tl dr", "one line", "summarise", "summarize", "quick version"];

/**
 * Read and REMOVE a length modifier.
 *
 * The modifier must not reach the matcher: "explain fabric in detail" should
 * score exactly as "explain fabric" does, or the extra words dilute the term
 * overlap and push the right entry below the threshold.
 */
export function readVerbosity(input: string): { verbosity: Verbosity; question: string } {
  const n = normalize(input);
  for (const cue of DETAIL_CUES) {
    if (n.includes(cue)) return { verbosity: "detail", question: n.replace(cue, " ").trim() };
  }
  for (const cue of SHORT_CUES) {
    if (n.includes(cue)) return { verbosity: "short", question: n.replace(cue, " ").trim() };
  }
  return { verbosity: "default", question: input };
}

function bodyFor(entry: Entry, verbosity: Verbosity): string {
  if (verbosity === "short") return entry.shortAnswer || entry.answer;
  if (verbosity === "detail") {
    return entry.detail ? `${entry.answer}\n\n${entry.detail}` : entry.answer;
  }
  return entry.answer;
}

function respond(partial: Partial<IntelligenceResponse> & { answer: string }): IntelligenceResponse {
  return {
    confidence: 1,
    level: "HIGH",
    followups: [],
    actions: [],
    ...partial,
  };
}

/** Questions the knowledge base cannot answer alone because the answer is the reader's own state. */
const CONTEXT_INTENTS = new Set(["navigation.what_am_i_looking_at", "navigation.filters", "navigation.active_filters", "navigation.window"]);

export function ask(
  question: string,
  page: PageContext = { pathname: "/", params: {} },
  session: SessionContext = {},
  opts: { reasoningEnabled?: boolean; modelName?: string } = {},
): IntelligenceResponse {
  const raw = question.trim();
  if (!raw) {
    return respond({
      answer: "Ask about a FOLDMARK surface, a term in the interface, or what the page you have open is showing.",
      actions: [SURFACE_ACTIONS.fabric, SURFACE_ACTIONS.flows],
    });
  }

  // ---- commands ----------------------------------------------------------
  const command = parseCommand(raw);
  if (command) {
    if (command.name === "/status") {
      return respond({
        intentId: "command.status",
        answer: [
          describeContext(page),
          describeFilters(page),
          "The guide reads the route and query string only. It does not query the chain and it holds no record of you between sessions.",
        ].join("\n\n"),
      });
    }
    return respond({
      intentId: `command.${command.name.slice(1)}`,
      answer: command.answer ?? `${command.summary}.`,
      actions: sanitizeActions(command.actions),
    });
  }

  // ---- safety, before anything can score --------------------------------
  if (isInjectionAttempt(raw)) {
    return respond({ intentId: "safety.injection", answer: INJECTION_RESPONSE, actions: FALLBACK_ACTIONS.slice(0, 2) });
  }
  if (isSecretRequest(raw)) {
    return respond({ intentId: "safety.secret", answer: SECRET_RESPONSE });
  }
  if (isSelfQuery(raw)) {
    return respond({
      intentId: "core.are_you_ai",
      answer: selfDescription(opts.reasoningEnabled ?? false, opts.modelName),
      followups: resolveFollowups(["core.what_is_foldmark", "methodology.unknown_stays_unknown"]),
    });
  }

  const { verbosity, question: stripped } = readVerbosity(raw);
  const result = match(stripped, page, session);

  // ---- a pasted address is never given an identity ----------------------
  if (result.detection.addresses.length) {
    const address = result.detection.addresses[0];
    return respond({
      intentId: "wallets.unknown_address",
      answer: unknownAddressResponse(address),
      followups: resolveFollowups(["wallets.address_vs_wallet", "methodology.unknown_stays_unknown", "protocols.registry"]),
      actions: [SURFACE_ACTIONS.wallets],
    });
  }

  // ---- questions whose answer is the reader's own page -------------------
  if (result.best && CONTEXT_INTENTS.has(result.best.entry.id) && result.best.score >= HIGH_THRESHOLD) {
    const entry = result.best.entry;
    const isFilters = entry.id !== "navigation.what_am_i_looking_at";
    const live = isFilters ? describeFilters(page) : describeContext(page);
    return respond({
      intentId: entry.id,
      confidence: result.best.score,
      answer: `${live}\n\n${bodyFor(entry, verbosity)}`,
      followups: resolveFollowups(entry.followups),
      actions: sanitizeActions(entry.actions),
    });
  }

  // ---- knowledge -------------------------------------------------------
  if (result.best && result.level === "HIGH") {
    const entry = result.best.entry;
    const facts = routeFacts(page);
    /**
     * A context line only where the reader's state changes what the answer
     * means — asking about a flow class while a different one is filtered, for
     * instance. Otherwise it is noise above every answer.
     */
    const relevant =
      (entry.domain === "flows" && facts.flow) || (entry.domain === "fabric" && (facts.category || facts.flow));
    return respond({
      intentId: entry.id,
      confidence: result.best.score,
      answer: bodyFor(entry, verbosity),
      contextLine: relevant ? describeContext(page) : undefined,
      followups: resolveFollowups(entry.followups),
      actions: sanitizeActions(entry.actions),
    });
  }

  // ---- close, but not close enough to assert ---------------------------
  if (result.best && result.level === "MEDIUM") {
    const candidates = result.candidates.slice(0, 4);
    return respond({
      level: "MEDIUM",
      confidence: result.best.score,
      answer: MEDIUM_CONFIDENCE_LEAD,
      followups: candidates.map((c) => ({ id: c.entry.id, label: c.entry.title.toUpperCase() })),
    });
  }

  // ---- outside the model ------------------------------------------------
  return respond({
    level: "LOW",
    confidence: result.best?.score ?? 0,
    answer: LOW_CONFIDENCE_RESPONSE,
    actions: FALLBACK_ACTIONS,
  });
}

/** Resolve a followup chip straight to its entry, bypassing the matcher. */
export function answerById(id: string, verbosity: Verbosity = "default"): IntelligenceResponse | null {
  const entry = entryById(id);
  if (!entry) return null;
  return respond({
    intentId: entry.id,
    answer: bodyFor(entry, verbosity),
    followups: resolveFollowups(entry.followups),
    actions: sanitizeActions(entry.actions),
  });
}

export const StaticIntelligenceProvider: IntelligenceProvider = {
  id: "static",
  ask: (question, page, session) => ask(question, page, session),
};
