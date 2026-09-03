import { describe, it, expect } from "vitest";
import { present, presentLabel, isAbsent, type Surface } from "@/lib/presentation-state";
import { STATE_LABEL, type DataState } from "@/lib/data-state";

/**
 * Presentation.
 *
 * Two things are being protected at once, and they pull in opposite directions.
 *
 * A person reading an asset page should not be told about our infrastructure.
 * "DATA UNAVAILABLE" is a statement about our storage; "AWAITING THE FIRST PRICE
 * OBSERVATION" is the same fact said in terms of the market they asked about.
 *
 * But the reason to say it more gently must never become a reason to say
 * something untrue. So the tests below check both halves: that the raw
 * implementation vocabulary is gone from human copy, AND that nothing in this
 * layer can put a value on screen. Presentation may change the words around a
 * missing number. It may not supply the number.
 */

const STATES: DataState[] = ["OK", "PARTIAL", "STALE", "EMPTY", "INDEXING", "UNAVAILABLE"];
const SURFACES: Surface[] = [
  "price",
  "liquidity",
  "market",
  "flow",
  "activity",
  "topology",
  "registry",
  "wallet",
  "protocol",
  "network",
  "chart",
  "generic",
];

describe("presentation never leaks implementation vocabulary", () => {
  it("never says UNAVAILABLE to a person, for any state on any surface", () => {
    for (const state of STATES) {
      for (const surface of SURFACES) {
        const p = present(state, surface);
        const copy = `${p.label} ${p.headline} ${p.detail}`.toUpperCase();
        expect(copy, `${state}/${surface}`).not.toContain("UNAVAILABLE");
      }
    }
  });

  it("never names the database, the driver or the vendor", () => {
    const forbidden = ["DATABASE", "DATABASE_URL", "SUPABASE", "POSTGRES", "SQL", "NEON", "CONNECTION STRING"];
    for (const state of STATES) {
      for (const surface of SURFACES) {
        const p = present(state, surface);
        const copy = `${p.label} ${p.headline} ${p.detail}`.toUpperCase();
        for (const word of forbidden) {
          expect(copy, `${state}/${surface} mentions ${word}`).not.toContain(word);
        }
      }
    }
  });

  it("never blames the reader or reads as an error", () => {
    const forbidden = ["ERROR", "FAILED", "FAILURE", "BROKEN", "CRASH", "EXCEPTION", "NOT CONFIGURED"];
    for (const state of STATES) {
      for (const surface of SURFACES) {
        const copy = `${present(state, surface).label} ${present(state, surface).detail}`.toUpperCase();
        for (const word of forbidden) expect(copy, `${state}/${surface}`).not.toContain(word);
      }
    }
  });
});

describe("presentation cannot become data", () => {
  /**
   * The structural guarantee.
   *
   * If no presentation string may contain a digit, then no code path through
   * this module can put a price, a count, a percentage or a date on screen —
   * whatever a future edit does to the copy. A test that reads every string is
   * cheaper than trusting every future author.
   */
  it("contains no digit anywhere in any label, headline or detail", () => {
    for (const state of STATES) {
      for (const surface of SURFACES) {
        const p = present(state, surface);
        for (const [field, text] of Object.entries({
          label: p.label,
          headline: p.headline,
          detail: p.detail,
        })) {
          expect(text, `${state}/${surface}.${field} contains a digit: "${text}"`).not.toMatch(/\d/);
        }
      }
    }
  });

  it("contains no currency symbol or percentage sign", () => {
    for (const state of STATES) {
      for (const surface of SURFACES) {
        const p = present(state, surface);
        const copy = `${p.label} ${p.headline} ${p.detail}`;
        expect(copy, `${state}/${surface}`).not.toMatch(/[$€£¥%]/);
      }
    }
  });

  it("exposes no value-shaped field at all", () => {
    // The type has label/headline/detail/tone and nothing else. A `value` field
    // here would be the seam through which a fabricated figure could arrive.
    const keys = Object.keys(present("UNAVAILABLE", "price")).sort();
    expect(keys).toEqual(["detail", "headline", "label", "tone"]);
  });
});

describe("the copy is specific to what is actually missing", () => {
  it("says something different for a price than for a graph", () => {
    expect(present("UNAVAILABLE", "price").label).not.toBe(present("UNAVAILABLE", "topology").label);
  });

  it("speaks about the market on a price surface", () => {
    const p = present("UNAVAILABLE", "price");
    expect(p.headline.toUpperCase()).toContain("PRICE");
  });

  it("speaks about structure on a topology surface", () => {
    expect(present("UNAVAILABLE", "topology").label.toUpperCase()).toContain("STRUCTURE");
  });

  it("speaks about transfers on a flow surface", () => {
    expect(present("UNAVAILABLE", "flow").headline.toUpperCase()).toContain("TRANSFER");
  });

  it("reads INDEXING and UNAVAILABLE identically to a person", () => {
    // The difference between "our storage is not connected" and "the pipeline
    // has not reached this" matters to an operator and not at all to a reader.
    // The API still distinguishes them; the screen does not.
    for (const surface of SURFACES) {
      expect(present("INDEXING", surface)).toEqual(present("UNAVAILABLE", surface));
    }
  });
});

describe("measured states keep their meaning", () => {
  it("marks EMPTY as a finding, not as something pending", () => {
    // "Nothing happened" is a result. Dressing it as "still loading" would be a
    // different and false claim.
    expect(present("EMPTY", "flow").tone).toBe("quiet");
    expect(present("UNAVAILABLE", "flow").tone).toBe("pending");
    expect(present("EMPTY", "flow").label).not.toBe(present("UNAVAILABLE", "flow").label);
  });

  it("keeps PARTIAL honest about being a lower bound", () => {
    expect(present("PARTIAL", "activity").detail.toLowerCase()).toContain("lower bound");
  });

  it("says STALE is a real measurement rather than a gap", () => {
    const p = present("STALE", "price");
    expect(p.tone).toBe("partial");
    expect(p.detail.toLowerCase()).toContain("real measurement");
  });

  it("treats OK as live", () => {
    expect(present("OK", "price").tone).toBe("live");
    expect(presentLabel("OK", "price")).toBe("LIVE");
  });
});

describe("isAbsent decides where a dash goes", () => {
  it("is true for every state with no value to show", () => {
    for (const s of ["PARTIAL", "EMPTY", "INDEXING", "UNAVAILABLE"] as DataState[]) {
      expect(isAbsent(s), s).toBe(true);
    }
  });

  it("is false where a real measurement exists", () => {
    // STALE has a value — an old one, labelled as old. Hiding it behind a dash
    // would discard a real observation.
    expect(isAbsent("OK")).toBe(false);
    expect(isAbsent("STALE")).toBe(false);
  });
});

describe("the machine vocabulary is untouched", () => {
  it("still exposes the raw DataState labels for API and docs surfaces", () => {
    // The presentation layer is additive. Corrupting DataState to make screens
    // look better would trade the machine-readable truth for appearance, which
    // is the one thing this product cannot spend.
    expect(STATE_LABEL.UNAVAILABLE).toBe("DATA UNAVAILABLE");
    expect(STATE_LABEL.OK).toBe("LIVE");
    expect(STATE_LABEL.PARTIAL).toBe("PARTIAL DATA");
  });
});
