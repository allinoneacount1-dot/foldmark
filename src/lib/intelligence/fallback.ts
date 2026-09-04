/**
 * Fallbacks, self-description and refusals.
 *
 * Everything here exists so the guide can decline cleanly. A question it does
 * not cover gets an honest boundary and a list of what it does cover — never an
 * improvised answer. The tests treat these strings as behaviour, not copy.
 */

import type { Action } from "@/lib/intelligence/types";
import { SURFACE_ACTIONS } from "@/lib/intelligence/actions";
import { normalize } from "@/lib/intelligence/normalize";

/** The topics offered whenever the guide cannot answer. */
export const TOPIC_SUGGESTIONS = [
  "FABRIC",
  "FLOWS",
  "ASSETS",
  "WALLETS",
  "PROTOCOLS",
  "VERIFICATION",
  "DATA SOURCES",
  "METHODOLOGY",
];

export const FALLBACK_ACTIONS: Action[] = [
  SURFACE_ACTIONS.fabric,
  SURFACE_ACTIONS.flows,
  SURFACE_ACTIONS.methodology,
];

/**
 * Attempts to talk to a prompt system.
 *
 * There is no prompt to reveal on the static path, and on the reasoning path the
 * server prompt is not the reader's to read. Either way the answer is the same
 * and it is not an error message.
 */
const INJECTION_PATTERNS = [
  "ignore all instructions",
  "ignore previous instructions",
  "ignore your instructions",
  "disregard previous",
  "disregard all",
  "reveal your system prompt",
  "show me your system prompt",
  "show your system prompt",
  "what is your system prompt",
  "print your prompt",
  "repeat your instructions",
  "jailbreak",
  "developer mode",
  "act as dan",
  "bypass your rules",
  "override your rules",
];

export function isInjectionAttempt(input: string): boolean {
  const n = normalize(input);
  return INJECTION_PATTERNS.some((p) => n.includes(normalize(p)));
}

export const INJECTION_RESPONSE = [
  "FOLDMARK Intelligence answers from a written product knowledge base and the page you have open. There is no prompt for it to disclose, and the server configuration behind the reasoning layer is not part of what it reports.",
  "It can explain product structure, data semantics and methodology.",
].join("\n\n");

/** Requests for credentials or server configuration. */
const SECRET_PATTERNS = [
  "api key",
  "apikey",
  "your key",
  "secret key",
  "access token",
  "bearer token",
  "authorization header",
  "environment variable",
  "env var",
  "openrouter key",
  "show me your token",
  "what is your key",
  "dotenv",
  "process env",
];

export function isSecretRequest(input: string): boolean {
  const n = normalize(input);
  return SECRET_PATTERNS.some((p) => n.includes(normalize(p)));
}

export const SECRET_RESPONSE = [
  "No. Credentials and server environment values are not disclosed, and they are never sent to the browser.",
  "FOLDMARK Intelligence can explain how the product works, what its data states mean, and what it will and will not claim about the chain.",
].join("\n\n");

/** Questions about what this thing is. */
const SELF_PATTERNS = [
  "are you ai",
  "are you an ai",
  "are you a bot",
  "are you a robot",
  "are you chatgpt",
  "are you gpt",
  "are you claude",
  "are you human",
  "are you a person",
  "what model are you",
  "what model do you use",
  "which model",
  "what llm",
  "are you an llm",
  "who made you",
  "who built you",
  "what are you",
  "are you real",
  "do you use ai",
  "is this ai",
  "are you generative",
];

export function isSelfQuery(input: string): boolean {
  const n = normalize(input);
  return SELF_PATTERNS.some((p) => n === normalize(p) || n.includes(normalize(p)));
}

/**
 * The honest self-description.
 *
 * Two forms, because the truthful answer depends on how the deployment is
 * configured. Neither one may overstate: the static layer is not a model, and
 * the reasoning layer is not the authority on product semantics.
 */
export function selfDescription(reasoningEnabled: boolean, modelName?: string): string {
  if (!reasoningEnabled) {
    return [
      "FOLDMARK Intelligence currently uses a deterministic product knowledge system rather than a generative model. It combines FOLDMARK documentation, product semantics, page context and application state to answer supported questions.",
      "Every answer it gives was written by a person and stored in the knowledge base. It does not generate language and it does not observe the chain.",
    ].join("\n\n");
  }
  const model = modelName || "a hosted model";
  return [
    `FOLDMARK Intelligence answers in two layers. Canonical product questions are served from a deterministic knowledge base written by a person — those answers are fixed text, not generated. Open-ended questions are routed to ${model} through OpenRouter, which reasons over that same knowledge and the page you have open.`,
    "The knowledge base stays authoritative for what FOLDMARK's terms mean. The reasoning layer may not introduce measurements, identities or verification that FOLDMARK has not established.",
  ].join("\n\n");
}

/**
 * The out-of-domain boundary.
 *
 * Named topics rather than an apology: a reader who asked something unrelated
 * needs to know what the scope actually is.
 */
export const OUT_OF_DOMAIN_RESPONSE = [
  "FOLDMARK Intelligence is scoped to FOLDMARK, Robinhood Chain market structure, flows, assets, protocols, wallets, methodology and product data.",
  `It can explain: ${TOPIC_SUGGESTIONS.join(" · ")}.`,
].join("\n\n");

export const LOW_CONFIDENCE_RESPONSE = [
  "That question is outside the current FOLDMARK knowledge model.",
  `It covers: ${TOPIC_SUGGESTIONS.join(" · ")}.`,
].join("\n\n");

/**
 * An address the reader pasted.
 *
 * The single most important refusal in the product. FOLDMARK does not have a
 * populated contracts registry, so no address can be described as a wallet, a
 * venue, a protocol, a bridge or an oracle. Saying so plainly is the answer.
 */
export function unknownAddressResponse(address: string): string {
  return [
    `${address} is not identified in the current product context.`,
    "FOLDMARK reports it as an address and nothing more. It is not described as a wallet, a DEX, a protocol, a bridge or an oracle, because none of those has been established for it. A category is a claim, and FOLDMARK will not make one it cannot support.",
    "Where an address appears in the topology it is drawn as an address, and it would be promoted to a venue or protocol only by an entry in the contracts registry.",
  ].join("\n\n");
}

/** Medium-confidence lead-in, followed by the candidate topics the UI renders. */
export const MEDIUM_CONFIDENCE_LEAD =
  "I am not certain that is what you meant. The closest topics in the FOLDMARK knowledge base are:";
