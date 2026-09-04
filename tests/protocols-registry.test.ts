import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyEdge, buildContractIndex, categoryOf, PROTOCOL_CATEGORIES } from "@/lib/flow-classification";
import { classifyNode } from "@/lib/graph-semantics";
import type { GraphNode } from "@/lib/graph";

/**
 * Protocol and counterparty identity.
 *
 * A registry entry is a claim about what an address IS, and every surface in
 * the product reads it: the classifier turns transfers into DEX_BUY, the
 * topology turns a node into a venue, the protocols page names an operator.
 * One wrong row therefore propagates everywhere at once.
 *
 * So the line held here is the evidence ladder. A market provider reporting a
 * venue is enough to CATEGORIZE a pool as a DEX. It is not enough to VERIFY
 * anything, because verification is an authoritative source confirming an exact
 * address — a different kind of claim, from a different kind of party.
 */

const enrich = readFileSync(join(process.cwd(), "src", "server", "market", "enrich.ts"), "utf8");

const POOL = "0x19d55aba3e5d2c389b7011c634725136dfdcae33";
const ADDRESS = "0xaaaa000000000000000000000000000000000001";

function node(id: string, over: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    kind: "source",
    label: id,
    role: "NET SENDER",
    weight: 1,
    transfers: 1,
    degree: 1,
    x: 0,
    y: 0,
    scale: 0.5,
    fresh: false,
    href: `/wallet/${id}`,
    ...over,
  };
}

describe("a discovered venue is categorized, never verified", () => {
  it("writes protocols with verified false", () => {
    expect(enrich).toMatch(/category:\s*"DEX"/);
    expect(enrich).toMatch(/id:\s*venue/);
    // The whole file must contain no path that sets verification true.
    expect(enrich).not.toMatch(/verified:\s*true/);
  });

  it("keeps the provider's own identifier as the protocol name", () => {
    // Inventing a friendly name would be FOLDMARK asserting an identity the
    // provider did not. The slug stays traceable to whoever reported it.
    expect(enrich).toMatch(/name:\s*venue/);
  });

  it("writes protocols before the contracts that reference them", () => {
    // contracts.protocol_id is a foreign key; the wrong order silently drops
    // every link and the protocols page renders empty for no visible reason.
    const protocolsAt = enrich.indexOf('upsertRows("protocols"');
    const contractsAt = enrich.indexOf('upsertRows("contracts"');
    expect(protocolsAt).toBeGreaterThan(-1);
    expect(contractsAt).toBeGreaterThan(-1);
    expect(protocolsAt).toBeLessThan(contractsAt);
  });

  it("links each pool to the venue that operates it", () => {
    expect(enrich).toMatch(/protocol_id:\s*m\.venue/);
  });
});

describe("registry entries drive every dependent surface consistently", () => {
  const registry = buildContractIndex([{ address: POOL, contract_type: "dex_pool" }]);

  it("turns the pool into a venue node in the topology", () => {
    expect(classifyNode(node(POOL), registry)).toBe("venue");
  });

  it("turns its transfers into directional DEX flows", () => {
    expect(classifyEdge({ from: POOL, to: ADDRESS }, registry)).toBe("DEX_BUY");
    expect(classifyEdge({ from: ADDRESS, to: POOL }, registry)).toBe("DEX_SELL");
  });

  it("places it in the DEX category", () => {
    expect(categoryOf("dex_pool")).toBe("DEX");
    expect(PROTOCOL_CATEGORIES).toContain("DEX");
  });

  it("leaves every other address exactly where it was", () => {
    // Identifying one venue must not promote its counterparties. This is what
    // keeps a registry from cascading into invented identity.
    expect(classifyNode(node(ADDRESS), registry)).toBe("address");
  });

  it("claims nothing about anything before a registry exists", () => {
    const empty = buildContractIndex([]);
    expect(classifyNode(node(POOL), empty)).toBe("address");
    expect(classifyEdge({ from: POOL, to: ADDRESS }, empty)).toBe("UNCLASSIFIED");
  });
});

describe("category assignment stays evidence-driven", () => {
  it("assigns a category only from a recognised contract kind", () => {
    expect(categoryOf("dex_pool")).toBe("DEX");
    expect(categoryOf("lending_market")).toBe("LENDING");
    expect(categoryOf("bridge")).toBe("BRIDGE");
    expect(categoryOf(null)).toBe("UNCLASSIFIED");
  });

  it("does not invent a category for an unrecognised kind", () => {
    const odd = buildContractIndex([{ address: POOL, contract_type: "looks_like_a_dex" }]);
    expect(odd.size).toBe(0);
    expect(classifyEdge({ from: POOL, to: ADDRESS }, odd)).toBe("UNCLASSIFIED");
  });
});
