import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildQuery, isDatabaseConfigured, db, databaseHealth } from "@/server/db/client";

/**
 * The database layer.
 *
 * Two properties are tested here, and both are the kind that fail silently.
 *
 * The first is injection safety. FOLDMARK's only sanctioned way to query is a
 * tagged template, and the reason is that a tagged template makes it
 * structurally impossible to splice a caller's value into the statement text.
 * That claim is worth an assertion rather than a comment: the test feeds it
 * hostile strings and checks they are absent from the SQL.
 *
 * The second is degradation. With no DATABASE_URL, every path must return the
 * same empty shape it used to and never throw — that is what lets a fresh
 * clone build in CI with no secrets, and what makes an unconfigured deployment
 * render a data state instead of a stack trace.
 */

const ORIGINAL = process.env.DATABASE_URL;

beforeEach(() => {
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL;
});

/** Build a TemplateStringsArray the way a tagged template call would. */
function tpl(...parts: string[]): TemplateStringsArray {
  const arr = [...parts] as string[] & { raw: string[] };
  arr.raw = [...parts];
  return arr as unknown as TemplateStringsArray;
}

describe("buildQuery — a value can never reach the statement text", () => {
  it("replaces each interpolated value with a numbered placeholder", () => {
    const { text, params } = buildQuery(tpl("select * from assets where id = ", " and chain_id = ", ""), [
      "abc",
      4663,
    ]);
    expect(text).toBe("select * from assets where id = $1 and chain_id = $2");
    expect(params).toEqual(["abc", 4663]);
  });

  it("keeps a SQL-injection attempt entirely out of the statement", () => {
    const hostile = "'; drop table assets; --";
    const { text, params } = buildQuery(tpl("select * from assets where contract_address = ", ""), [hostile]);

    // The payload is a parameter, not syntax. Postgres will compare a column to
    // this string; it will never parse it.
    expect(text).toBe("select * from assets where contract_address = $1");
    expect(text).not.toContain("drop table");
    expect(text).not.toContain(hostile);
    expect(params[0]).toBe(hostile);
  });

  it("does not treat a value containing $1 as a placeholder", () => {
    // A caller value that looks like a placeholder must stay a value. If it
    // were concatenated it would renumber the whole statement.
    const { text, params } = buildQuery(tpl("select ", ""), ["$1 or true"]);
    expect(text).toBe("select $1");
    expect(params).toEqual(["$1 or true"]);
  });

  it("emits no placeholders for a template with no values", () => {
    const { text, params } = buildQuery(tpl("select 1"), []);
    expect(text).toBe("select 1");
    expect(params).toEqual([]);
  });

  it("numbers placeholders from 1 in order, including repeats and nulls", () => {
    const { text, params } = buildQuery(tpl("", ",", ",", ",", ""), [null, "x", null, "x"]);
    expect(text).toBe("$1,$2,$3,$4");
    // A null must stay a bound null, not become the text "null".
    expect(params).toEqual([null, "x", null, "x"]);
  });

  it("binds an array as one parameter, for use with = ANY($1)", () => {
    const ids = ["a", "b", "c"];
    const { text, params } = buildQuery(tpl("select * from assets where id = ANY(", ")"), [ids]);
    expect(text).toBe("select * from assets where id = ANY($1)");
    expect(params).toEqual([ids]);
  });
});

describe("degradation — no DATABASE_URL is a state, not a crash", () => {
  it("reports the database as unconfigured", () => {
    expect(isDatabaseConfigured()).toBe(false);
  });

  it("returns null from db() rather than throwing", () => {
    expect(db()).toBeNull();
  });

  it("treats an empty or whitespace-only DATABASE_URL as unset", () => {
    // A deployment that defines the variable but leaves it blank is not
    // configured. Treating "" as a connection string produces a confusing
    // driver error instead of an honest state.
    process.env.DATABASE_URL = "   ";
    expect(isDatabaseConfigured()).toBe(false);
    expect(db()).toBeNull();
  });

  it("reports NOT_CONFIGURED, distinct from UNREACHABLE", async () => {
    // These are different problems. A status page that collapses them tells a
    // reader nothing about which one they have.
    const health = await databaseHealth();
    expect(health.state).toBe("NOT_CONFIGURED");
    expect(health.detail).toContain("DATABASE_URL");
    expect(health.latencyMs).toBeNull();
  });

  it("recognises a configured database once the variable is set", () => {
    process.env.DATABASE_URL = "postgresql://user:pw@host:5432/db?sslmode=require";
    expect(isDatabaseConfigured()).toBe(true);
    expect(db()).not.toBeNull();
  });
});
