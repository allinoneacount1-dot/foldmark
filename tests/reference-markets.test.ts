import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  referenceMarketFor,
  hasReferenceMarket,
  REFERENCE_MARKETS,
  BENCHMARK_MARKETS,
  DEFAULT_BENCHMARK,
} from "@/config/reference-markets";

/**
 * Reference market mapping.
 *
 * The chart beside an asset shows a real financial instrument, so the question
 * of WHICH instrument is a security question, not a formatting one.
 *
 * If a ticker could be derived from a token's own metadata, anyone able to
 * deploy an ERC-20 could choose it. Deploy "Apple • Robinhood Token" and
 * FOLDMARK renders Apple's price history beside your contract — the product
 * endorsing a stranger's claim about itself, in the most credible way available
 * to it.
 *
 * The defence is that mapping is keyed on (chain_id, contract_address) and
 * nothing else. These tests exist to keep that true: they check the signature
 * admits no name, and that the source file never reads a symbol or a name.
 */

describe("a token cannot choose which instrument is charted beside it", () => {
  const CHAIN = 4663;
  const attacker = "0xdead000000000000000000000000000000000001";

  it("returns nothing for an address that is not on the allowlist", () => {
    expect(referenceMarketFor(CHAIN, attacker)).toBeNull();
    expect(hasReferenceMarket(CHAIN, attacker)).toBe(false);
  });

  it("cannot be influenced by a token's name or symbol — there is no parameter for one", () => {
    // The signature is the safeguard. If a name could be passed, someone would
    // eventually pass one.
    expect(referenceMarketFor.length).toBe(2);
  });

  it("never selects a mapping from metadata, only from an address", () => {
    const src = readFileSync(join(process.cwd(), "src/config/reference-markets.ts"), "utf8");
    const body = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

    // No lookup keyed on anything a token controls.
    expect(body).not.toMatch(/\.symbol\b/);
    expect(body).not.toMatch(/\.name\b/);
    expect(body).not.toMatch(/displayName\s*===/);
  });

  it("distinguishes the same address on a different chain", () => {
    // Identity is the pair. An address on one chain says nothing about the same
    // bytes on another.
    for (const m of REFERENCE_MARKETS) {
      expect(referenceMarketFor(m.chainId + 1, m.contractAddress)).toBeNull();
    }
  });

  it("matches an allowlisted address regardless of case", () => {
    for (const m of REFERENCE_MARKETS) {
      expect(referenceMarketFor(m.chainId, m.contractAddress.toUpperCase())).not.toBeNull();
    }
  });

  it("handles a null or empty address without throwing", () => {
    expect(referenceMarketFor(CHAIN, null)).toBeNull();
    expect(referenceMarketFor(CHAIN, undefined)).toBeNull();
    expect(referenceMarketFor(CHAIN, "")).toBeNull();
  });
});

describe("every allowlist entry is complete enough to be auditable", () => {
  it("records evidence for each mapping", () => {
    // A mapping with no stated basis is a guess someone will later mistake for
    // a decision.
    for (const m of REFERENCE_MARKETS) {
      expect(m.evidence.length, m.contractAddress).toBeGreaterThan(10);
      expect(m.contractAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(m.tradingViewSymbol).toMatch(/^[A-Z]+:[A-Z0-9.]+$/);
    }
  });
});

describe("benchmarks are real instruments, clearly labelled", () => {
  it("offers at least one benchmark so a chart always has something to show", () => {
    expect(BENCHMARK_MARKETS.length).toBeGreaterThan(0);
    expect(DEFAULT_BENCHMARK).toBeTruthy();
  });

  it("qualifies every benchmark with its exchange", () => {
    for (const b of BENCHMARK_MARKETS) {
      expect(b.tradingViewSymbol, b.displayName).toMatch(/^[A-Z]+:[A-Z0-9.]+$/);
      expect(b.market.length).toBeGreaterThan(0);
    }
  });
});

describe("a reference mapping is not a verification", () => {
  it("carries no field that could promote an asset", () => {
    // Verification requires an authoritative issuer source confirming the exact
    // contract, and lives in assets.verification_status. A reference mapping is
    // presentation metadata; if it carried a `verified` flag someone would
    // eventually write it through.
    for (const m of REFERENCE_MARKETS) {
      expect(m).not.toHaveProperty("verified");
      expect(m).not.toHaveProperty("verificationStatus");
    }
  });

  it("is never imported by the code that decides verification or price", () => {
    const FORBIDDEN = [
      "src/lib/indexer.ts",
      "src/lib/queries.ts",
      "src/lib/notional.ts",
      "src/server/market-data/persist.ts",
      "src/server/market-data/reconcile.ts",
      "src/server/market-data/state.ts",
    ];
    for (const file of FORBIDDEN) {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      expect(src.includes("reference-markets"), `${file} imports the reference mapping`).toBe(false);
    }
  });
});
