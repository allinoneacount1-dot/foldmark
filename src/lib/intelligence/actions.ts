/**
 * Deterministic actions and slash commands.
 *
 * An action is navigation and nothing else. It moves the reader to a route that
 * already exists; it never mutates state, never writes, and never triggers a
 * request the reader did not ask for. That constraint is what makes it safe to
 * offer one beside an answer without confirmation.
 */

import type { Action } from "@/lib/intelligence/types";

/** Every route an action may point at. A link outside this list is a bug. */
export const KNOWN_ROUTES = [
  "/",
  "/dashboard",
  "/assets",
  "/fabric",
  "/flows",
  "/wallets",
  "/protocols",
  "/developers",
  "/methodology",
  "/search",
  "/docs",
  "/docs/agents",
  "/docs/api",
  "/docs/architecture",
  "/docs/changelog",
  "/docs/concepts",
  "/docs/data-sources",
  "/docs/flow-classification",
  "/docs/getting-started",
  "/docs/limitations",
  "/docs/methodology",
  "/docs/security",
  "/docs/status",
  "/docs/stock-tokens",
] as const;

/** True when an href is a route the product actually has, ignoring any query string. */
export function isKnownRoute(href: string): boolean {
  const path = href.split("?")[0];
  return (KNOWN_ROUTES as readonly string[]).includes(path);
}

/** Drops anything pointing somewhere that does not exist. */
export function sanitizeActions(actions: Action[] | undefined): Action[] {
  if (!actions?.length) return [];
  return actions.filter((a) => isKnownRoute(a.href)).slice(0, 3);
}

export const SURFACE_ACTIONS: Record<string, Action> = {
  fabric: { label: "OPEN FABRIC", href: "/fabric" },
  flows: { label: "OPEN FLOWS", href: "/flows" },
  assets: { label: "OPEN ASSETS", href: "/assets" },
  wallets: { label: "OPEN WALLETS", href: "/wallets" },
  protocols: { label: "OPEN PROTOCOLS", href: "/protocols" },
  dashboard: { label: "OPEN DASHBOARD", href: "/dashboard" },
  docs: { label: "OPEN DOCS", href: "/docs" },
  methodology: { label: "OPEN METHODOLOGY", href: "/methodology" },
  developers: { label: "OPEN DEVELOPERS", href: "/developers" },
};

export type Command = {
  name: string;
  summary: string;
  /** Static text answer, or undefined when the engine composes one. */
  answer?: string;
  actions?: Action[];
  /** Commands the UI handles itself rather than answering. */
  client?: "clear";
};

export const COMMANDS: Record<string, Command> = {
  help: {
    name: "/help",
    summary: "What this guide can explain",
    answer: [
      "FOLDMARK Intelligence explains the product: what each surface shows, what the vocabulary means, and what FOLDMARK will and will not claim about the chain.",
      "Ask about Fabric, Flows, assets, addresses, protocols, prices and reference markets, data states and provenance, or methodology. You can also ask what you are currently looking at and which filters are active.",
      "Commands: /fabric, /flows, /assets, /protocols, /methodology, /docs, /about, /status, /clear.",
    ].join("\n\n"),
  },
  fabric: { name: "/fabric", summary: "Open Fabric", actions: [SURFACE_ACTIONS.fabric] },
  flows: { name: "/flows", summary: "Open Flows", actions: [SURFACE_ACTIONS.flows] },
  assets: { name: "/assets", summary: "Open Assets", actions: [SURFACE_ACTIONS.assets] },
  protocols: { name: "/protocols", summary: "Open Protocols", actions: [SURFACE_ACTIONS.protocols] },
  methodology: { name: "/methodology", summary: "Open Methodology", actions: [SURFACE_ACTIONS.methodology] },
  docs: { name: "/docs", summary: "Open Docs", actions: [SURFACE_ACTIONS.docs] },
  about: {
    name: "/about",
    summary: "What this guide is",
    answer: [
      "FOLDMARK Intelligence is the product's own guide. It answers from a written knowledge base covering FOLDMARK's surfaces, vocabulary and methodology, combined with the route and filters you currently have open.",
      "It reports what FOLDMARK defines and what the page contains. It does not observe the chain, and it does not produce measurements of its own.",
    ].join("\n\n"),
  },
  status: {
    name: "/status",
    summary: "What the guide can see",
    // Composed by the engine so it can name the live route and filters.
  },
  clear: { name: "/clear", summary: "Clear the conversation", client: "clear" },
};

/** Parses a leading slash command. Returns null for ordinary questions. */
export function parseCommand(input: string): Command | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;
  const name = trimmed.slice(1).split(/\s+/)[0]?.toLowerCase() ?? "";
  return COMMANDS[name] ?? null;
}

export function commandNames(): string[] {
  return Object.values(COMMANDS).map((c) => c.name);
}
