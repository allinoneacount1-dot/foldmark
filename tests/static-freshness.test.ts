import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_ENTRIES } from "@/lib/intelligence/knowledge";

/**
 * Fixed text may not assert a moving fact.
 *
 * The static knowledge base is the AUTHORITATIVE layer: when it and the model
 * disagree, it wins. That authority is only earned while it is right, and it
 * stopped being right in the quietest possible way — it froze a moment.
 * Sentences like "the contracts registry is empty in production today, because
 * no database is connected" were true when written. Then a database was
 * connected and enrichment registered sixteen contracts across six DEX
 * protocols, and the authoritative layer began confidently describing a product
 * that no longer existed, in the voice reserved for things FOLDMARK is certain
 * of.
 *
 * That is worse than a stale number on a page. A reader can see a page is
 * stale; they cannot see that a definition is.
 *
 * The rule this suite enforces: a fixed answer states a RULE — what follows
 * from a registry entry, or from its absence — and never a READING. Readings
 * are resolved per request by `@/server/intelligence/live-context` and rendered
 * by the interface, both of which go stale in the only acceptable way, which is
 * to say they cannot.
 */

const CONTENT_DIR = join(process.cwd(), "src", "content");

/** Every .ts file under src/content, including the nested intelligence domain. */
function contentFiles(dir = CONTENT_DIR): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return contentFiles(path);
    return e.name.endsWith(".ts") ? [path] : [];
  });
}

/**
 * Phrases that pin fixed text to a deployment's current state.
 *
 * Deliberately narrow. A genuine conditional — "where the registry has no entry
 * for either side, the flow is UNCLASSIFIED" — is a rule and must stay
 * writable; only the present-tense claim about THIS deployment is banned.
 */
const FROZEN_MOMENT: { pattern: RegExp; why: string }[] = [
  { pattern: /\b(?:is|are)\s+(?:currently\s+)?empty\s+(?:in\s+production|in\s+this\s+deployment|today)/i, why: "asserts the registry's current size; the registry now holds entries" },
  { pattern: /\bno database is connected\b/i, why: "asserts a deployment fact; a database is connected in production" },
  { pattern: /\bin production today\b/i, why: "pins the sentence to the day it was written" },
  { pattern: /\bregistry is empty, so every\b/i, why: "asserts a present state rather than stating the rule" },
  { pattern: /\bno oracle is wired[^.]*so (?:the|this)/i, why: "uses a true fact as the reason a different figure is absent" },
  { pattern: /\bnothing has been measured yet\b/i, why: "asserts an empty index; the index holds transfers" },
  { pattern: /\bno venue has been observed quoting\b/i, why: "asserts no market exists; pools are observed for many contracts" },
];

/**
 * A conditional is not an assertion.
 *
 * "When no venue has been observed quoting a contract, the price slot holds an
 * em dash" is a rule and must stay writable. The same clause with the "when"
 * removed is a claim about today. The guard therefore looks at what stands in
 * front of the match, not only at the match.
 */
const CONDITIONAL = /\b(?:when|where|while|if|unless|until|whenever|absent|with no|without)\b[^.]{0,90}$/i;

function isConditional(line: string, index: number): boolean {
  return CONDITIONAL.test(line.slice(Math.max(0, index - 90), index));
}

describe("the authoritative layer states rules, not readings", () => {
  const files = contentFiles();

  it("reads a content tree at all", () => {
    // A guard that silently scans nothing passes forever.
    expect(files.length).toBeGreaterThan(5);
  });

  /**
   * The guard is tested before the content is.
   *
   * Every exemption added to keep a legitimate conditional writable is a chance
   * to neuter the check, and a neutered check is worse than none: it reports
   * green while the thing it was built to catch walks past. These are the exact
   * sentences that shipped, and they must still be caught.
   */
  it("catches the sentences that actually shipped", () => {
    const shipped = [
      "The contracts registry is empty in production today, because no database is connected.",
      "The registry is empty in this deployment, so no address is held as a dex_pool.",
      "that registry is empty today, so neither is being assigned.",
      "No database is connected, so the registry holds nothing.",
      "The contracts registry is empty, so every address stays unidentified.",
      "No venue has been observed quoting this contract on chain 4663 yet.",
    ];
    for (const line of shipped) {
      const caught = FROZEN_MOMENT.some(({ pattern }) => {
        const hit = line.match(pattern);
        return Boolean(hit) && hit!.index !== undefined && !isConditional(line, hit!.index);
      });
      expect(caught, `not caught: ${line}`).toBe(true);
    }
  });

  it("lets a genuine conditional through", () => {
    const rules = [
      "When no venue has been observed quoting a contract on this chain, the price slot holds an em dash.",
      "Where the registry has no entry for either side, the flow classifies as UNCLASSIFIED.",
      "With no database connected, dependent figures resolve to UNAVAILABLE.",
    ];
    for (const line of rules) {
      const caught = FROZEN_MOMENT.some(({ pattern }) => {
        const hit = line.match(pattern);
        return Boolean(hit) && hit!.index !== undefined && !isConditional(line, hit!.index);
      });
      expect(caught, `wrongly caught: ${line}`).toBe(false);
    }
  });

  for (const { pattern, why } of FROZEN_MOMENT) {
    it(`never says ${pattern.source.slice(0, 46)} — ${why}`, () => {
      const offenders: string[] = [];
      for (const file of files) {
        const text = readFileSync(file, "utf8");
        for (const [i, line] of text.split("\n").entries()) {
          const hit = line.match(pattern);
          if (!hit || hit.index === undefined) continue;
          if (isConditional(line, hit.index)) continue;
          offenders.push(`${file.replace(process.cwd(), "")}:${i + 1} — ${hit[0]}`);
        }
      }
      expect(offenders, offenders.join("\n")).toEqual([]);
    });
  }
});

describe("fixed answers do not quote measurements", () => {
  /**
   * A number written into an answer is a number that will be wrong later.
   *
   * Two kinds are allowed through. Definitional figures — the chain id, a
   * decimal count, the alignment window — do not move. And an explicitly
   * hedged order of magnitude ("roughly 860,000 blocks a day") is a statement
   * about the shape of the problem, not a reading off a dashboard; it is
   * already written so that being approximately right is the claim.
   *
   * What is banned is the shape a MEASUREMENT takes: a dollar amount, or a bare
   * thousands-separated count presented as exact.
   */
  const HEDGED = /(?:roughly|about|approximately|around|~|up to|under|over|fewer than|more than)\s+$/i;

  it("carries no dollar figure and no unhedged counted figure", () => {
    const offenders: string[] = [];
    for (const entry of ALL_ENTRIES) {
      const body = [entry.answer, entry.shortAnswer ?? "", entry.detail ?? ""].join(" ");
      if (/\$\s?\d/.test(body)) offenders.push(`${entry.id}: dollar figure`);
      for (const m of body.matchAll(/\b\d{1,3}(?:,\d{3})+\b/g)) {
        if (m.index !== undefined && HEDGED.test(body.slice(Math.max(0, m.index - 24), m.index))) continue;
        offenders.push(`${entry.id}: counted figure ${m[0]}`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
