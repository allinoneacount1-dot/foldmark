import { PROVIDERS, type ProviderId } from "@/server/market-data/registry";

/**
 * Which providers this deployment is allowed to call.
 *
 * The registry records what is *true* — whether a service serves Robinhood
 * Chain, probed against the live API. This module records what is *permitted*,
 * which is a different question and one only the owner can answer.
 *
 * DEX Screener is the reason this file exists. Its terms restrict redistribution
 * and restrict products that compete with their screener, so whether FOLDMARK
 * may call it is a decision about the business, not about the chain. It is
 * therefore off unless the deployment explicitly turns it on, and turning it on
 * is an environment variable rather than a code change — an owner reviewing
 * terms should not have to open a pull request to act on the answer.
 *
 * Reading env at module scope is deliberate: these are server-only values, and
 * a per-call read would let a provider be enabled halfway through a sweep.
 */

/** Server-only. Never prefixed NEXT_PUBLIC — enablement is not the browser's business. */
function envFlag(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return raw === "1" || raw.toLowerCase() === "true";
}

export const PROVIDER_ENABLED: Record<ProviderId, boolean> = {
  // The chain itself. Nothing works without it and no terms restrict it.
  rpc: true,
  // Not wired yet: needs a verified pool address per asset.
  onchain_pool: false,
  // Attribution is required and rendered; the free tier permits this use.
  geckoterminal: envFlag("GECKOTERMINAL_ENABLED", true),
  // Off by default, pending the owner's reading of DEX Screener's terms.
  dexscreener: envFlag("DEXSCREENER_ENABLED", false),
  coingecko: false,
  robinhood: false,
  chainlink: false,
};

/**
 * Whether a provider may be called right now.
 *
 * Both conditions must hold: the provider must actually serve this chain, and
 * the deployment must permit it. A provider that is enabled but UNSUPPORTED is
 * still not called — enabling something cannot make it work.
 */
export function isProviderEnabled(id: ProviderId): boolean {
  return PROVIDER_ENABLED[id] === true && PROVIDERS[id].chainSupport === "SUPPORTED";
}

/** Why a provider is not being called, for the status endpoint to report. */
export function providerDisabledReason(id: ProviderId): string | null {
  if (isProviderEnabled(id)) return null;
  if (PROVIDERS[id].chainSupport !== "SUPPORTED") {
    return `Not called: chain support is ${PROVIDERS[id].chainSupport} for chain 4663.`;
  }
  if (id === "dexscreener") {
    return "Not called: DEXSCREENER_ENABLED is off. Their terms restrict redistribution and competing products, so this source is opt-in per deployment.";
  }
  return "Not called: disabled for this deployment.";
}

export const ENABLED_PROVIDERS = (Object.keys(PROVIDER_ENABLED) as ProviderId[]).filter(isProviderEnabled);
