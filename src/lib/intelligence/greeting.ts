/**
 * The opening state.
 *
 * The panel never opens into an empty box. It names the surface the reader is
 * standing on and offers the questions that surface actually raises, so the
 * first interaction costs one click rather than the effort of inventing a
 * question about a product you have not learned yet.
 *
 * Suggestions are entry ids. Any that fail to resolve are dropped rather than
 * rendered as a chip that would do nothing.
 */

import { resolveFollowups } from "@/lib/intelligence/knowledge";
import { routeFacts } from "@/lib/intelligence/context";
import type { PageContext } from "@/lib/intelligence/types";

type Greeting = {
  /** One or two sentences. Names the surface, claims nothing about the data. */
  lead: string;
  /** Candidate entry ids, best first. Resolved and trimmed before display. */
  suggestions: string[];
};

const BY_ROUTE: Record<string, Greeting> = {
  "/fabric": {
    lead: "You are viewing Fabric — FOLDMARK's market topology surface.",
    suggestions: [
      "fabric.what_is",
      "fabric.nodes",
      "fabric.edges",
      "fabric.architecture_preview",
      "fabric.centrality",
      "fabric.filters",
    ],
  },
  "/flows": {
    lead: "You are viewing capital-flow structure.",
    suggestions: [
      "flows.what_is",
      "flows.dex_buy",
      "flows.unclassified",
      "flows.direction",
      "flows.reserved_classes",
      "protocols.classification_pipeline",
    ],
  },
  "/protocols": {
    lead: "You are viewing the protocol registry.",
    suggestions: [
      "protocols.classification_pipeline",
      "protocols.verified",
      "protocols.categories",
      "protocols.registry",
      "methodology.unknown_stays_unknown",
    ],
  },
  "/assets": {
    lead: "You are viewing the asset index.",
    suggestions: ["assets.what_is", "assets.identity", "assets.asset_types", "pricing.reference_market", "protocols.verified"],
  },
  "/wallets": {
    lead: "You are viewing observed addresses.",
    suggestions: ["wallets.address_vs_wallet", "wallets.unknown_address", "methodology.unknown_stays_unknown", "flows.what_is"],
  },
  "/dashboard": {
    lead: "You are viewing the market overview.",
    suggestions: ["core.what_is_foldmark", "data.states", "data.provenance", "fabric.what_is", "flows.what_is"],
  },
  "/developers": {
    lead: "You are viewing the developer surface.",
    suggestions: ["data.provenance", "data.states", "core.what_is_foldmark", "methodology.evidence_ladder"],
  },
  "/methodology": {
    lead: "You are viewing FOLDMARK's methodology.",
    suggestions: [
      "methodology.unknown_stays_unknown",
      "methodology.no_inference_from_behaviour",
      "methodology.evidence_ladder",
      "protocols.verified",
    ],
  },
  "/docs": {
    lead: "You are viewing the documentation.",
    suggestions: ["core.what_is_foldmark", "fabric.what_is", "flows.what_is", "data.provenance", "navigation.help"],
  },
};

const DEFAULT_GREETING: Greeting = {
  lead: "FOLDMARK is a market intelligence layer for Robinhood Chain.",
  suggestions: [
    "core.what_is_foldmark",
    "core.what_foldmark_is_not",
    "fabric.what_is",
    "flows.what_is",
    "data.provenance",
    "methodology.unknown_stays_unknown",
  ],
};

export type ResolvedGreeting = {
  lead: string;
  suggestions: { id: string; label: string }[];
};

export function greetingFor(page: PageContext): ResolvedGreeting {
  const facts = routeFacts(page);
  const base = BY_ROUTE[facts.route] ?? DEFAULT_GREETING;

  /**
   * A filtered view gets its filters named in the opening line, because the
   * first thing a reader wants confirmed is that the guide can see what they
   * can see.
   */
  const constraints: string[] = [];
  if (facts.flow) constraints.push(facts.flow);
  if (facts.category) constraints.push(`${facts.category} category`);
  if (facts.window) constraints.push(facts.window);

  const lead = constraints.length ? `${base.lead} Constrained to ${constraints.join(" · ")}.` : base.lead;

  // resolveFollowups caps at four; ask for more and take what resolves.
  const resolved = base.suggestions
    .map((id) => resolveFollowups([id])[0])
    .filter((s): s is { id: string; label: string } => Boolean(s))
    .slice(0, 4);

  return { lead, suggestions: resolved };
}
