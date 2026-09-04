/**
 * Page context.
 *
 * The guide can say what the reader is currently looking at. Everything here is
 * derived from the router — the pathname and the query string — and nothing
 * fetches. This is deliberately not a second data path: the guide reports the
 * state the application already holds, and never opens its own connection to
 * anything.
 *
 * The rule that governs every sentence produced here: state only what the URL
 * actually contains. A filter that is absent is not "showing everything
 * measured", it is simply not set, and the difference matters on a product
 * where nothing has been measured yet.
 */

import { CHAIN, WINDOWS, ASSET_TYPES, ASSET_TYPE_LABEL, type FlowWindow, type AssetType } from "@/config/site";
import { parseFlowClass, parseCategory } from "@/lib/flow-classification";
import type { PageContext } from "@/lib/intelligence/types";

export type RouteFacts = {
  /** Human name of the surface, e.g. "Fabric". */
  surface: string;
  /** One sentence describing what the surface is for. */
  purpose: string;
  /** The route as matched, e.g. "/fabric". */
  route: string;
  window: FlowWindow | null;
  flow: string | null;
  category: string | null;
  assetType: AssetType | null;
  /** A contract or address in the path, verbatim. Never resolved to an identity. */
  subject: string | null;
  /** Domain the matcher should lean toward on this route. */
  domain: string | null;
};

const SURFACES: { prefix: string; surface: string; purpose: string; domain: string }[] = [
  { prefix: "/fabric", surface: "Fabric", purpose: "the market topology map, where structure is read spatially", domain: "fabric" },
  { prefix: "/flows", surface: "Flows", purpose: "capital flow structure, where movement is read directionally", domain: "flows" },
  { prefix: "/assets", surface: "Assets", purpose: "the asset index and asset passports", domain: "assets" },
  { prefix: "/asset", surface: "Asset", purpose: "an asset passport", domain: "assets" },
  { prefix: "/wallets", surface: "Wallets", purpose: "observed addresses and their relationships", domain: "wallets" },
  { prefix: "/wallet", surface: "Address", purpose: "one address and its observed relationships", domain: "wallets" },
  { prefix: "/protocols", surface: "Protocols", purpose: "the contracts registry and protocol categories", domain: "protocols" },
  { prefix: "/protocol", surface: "Protocol", purpose: "one protocol and its contracts", domain: "protocols" },
  { prefix: "/dashboard", surface: "Dashboard", purpose: "the market overview", domain: "core" },
  { prefix: "/developers", surface: "Developers", purpose: "the API surface and integration notes", domain: "navigation" },
  { prefix: "/methodology", surface: "Methodology", purpose: "how FOLDMARK decides what it will and will not claim", domain: "methodology" },
  { prefix: "/docs", surface: "Docs", purpose: "the written documentation", domain: "navigation" },
  { prefix: "/search", surface: "Search", purpose: "lookup across indexed entities", domain: "navigation" },
];

export function routeFacts(page: PageContext): RouteFacts {
  const path = page.pathname || "/";
  const hit =
    SURFACES.find((s) => path === s.prefix || path.startsWith(`${s.prefix}/`)) ?? null;

  const rawWindow = page.params.w ?? "";
  const window = (WINDOWS as readonly string[]).includes(rawWindow) ? (rawWindow as FlowWindow) : null;
  const rawType = page.params.type ?? "";
  const assetType = (ASSET_TYPES as readonly string[]).includes(rawType) ? (rawType as AssetType) : null;

  // A path segment that looks like an address is reported verbatim and is never
  // described as a wallet, a token or a protocol.
  const segments = path.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "";
  const subject = /^0x[a-fA-F0-9]{40}$/.test(last) ? last.toLowerCase() : null;

  return {
    surface: hit?.surface ?? "Overview",
    purpose: hit?.purpose ?? "the FOLDMARK overview",
    route: hit?.prefix ?? "/",
    window,
    flow: parseFlowClass(page.params.flow),
    category: parseCategory(page.params.category),
    assetType,
    subject,
    domain: hit?.domain ?? "core",
  };
}

/**
 * One or two sentences naming the reader's current view.
 *
 * Used as the answer to "what am I looking at" and prepended as a context line
 * to answers where the reader's state changes what the answer means.
 */
export function describeContext(page: PageContext): string {
  const f = routeFacts(page);
  const parts: string[] = [];

  const constraints: string[] = [];
  if (f.window) constraints.push(`a ${f.window} window`);
  if (f.category) constraints.push(`the ${f.category} category`);
  if (f.flow) constraints.push(`${f.flow} flows`);
  if (f.assetType) constraints.push(`${ASSET_TYPE_LABEL[f.assetType]} assets`);

  if (f.route === "/") {
    parts.push(`You are on the FOLDMARK overview for ${CHAIN.name}, chain ${CHAIN.id}.`);
  } else {
    parts.push(`You are viewing ${f.surface} — ${f.purpose}.`);
  }

  if (constraints.length === 1) {
    parts.push(`It is constrained to ${constraints[0]}.`);
  } else if (constraints.length > 1) {
    const last = constraints.pop();
    parts.push(`It is constrained to ${constraints.join(", ")} and ${last}.`);
  }

  if (f.subject) {
    parts.push(
      `The page names the address ${f.subject}. FOLDMARK reports it as an address and does not claim what kind of participant it is.`,
    );
  }

  return parts.join(" ");
}

/**
 * The filter half on its own, for "which filters are active".
 *
 * Says "no filters are set" rather than "showing everything", because on a
 * surface with nothing measured those are very different claims.
 */
export function describeFilters(page: PageContext): string {
  const f = routeFacts(page);
  const set: string[] = [];
  if (f.window) set.push(`WINDOW ${f.window}`);
  if (f.assetType) set.push(`ASSET TYPE ${ASSET_TYPE_LABEL[f.assetType]}`);
  if (f.category) set.push(`CATEGORY ${f.category}`);
  if (f.flow) set.push(`FLOW ${f.flow}`);

  if (!set.length) {
    return `No filters are set in the URL on ${f.surface}. Filter state lives in the query string, so a filtered view can be shared and survives a reload.`;
  }

  return `${set.join(" · ")}. Filter state lives in the query string, so this exact view can be shared and survives a reload. An unrecognised value reads as ALL rather than producing an empty page.`;
}

/** Serialisable snapshot handed to a reasoning provider. Contains no secrets and no user data. */
export function contextSnapshot(page: PageContext): Record<string, string | null> {
  const f = routeFacts(page);
  return {
    pathname: page.pathname,
    surface: f.surface,
    window: f.window,
    category: f.category,
    flow: f.flow,
    assetType: f.assetType,
    addressInPath: f.subject,
    chain: `${CHAIN.name} (${CHAIN.id})`,
  };
}
