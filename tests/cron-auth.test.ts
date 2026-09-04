import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cronAuthorized } from "@/server/cron/auth";

/**
 * Who may spend the quota.
 *
 * THE HOLE THIS SUITE EXISTS TO KEEP SHUT. Both cron endpoints accepted any
 * request carrying an `x-vercel-cron` header, on the assumption that only
 * Vercel's scheduler could set it. Anyone can set a header. One unauthenticated
 * curl carrying that name drove a real ingestion pass against production and
 * came back with a report:
 *
 *   {"ok":true,"blocksScanned":10,"logsSeen":519,"transfersInserted":120,...}
 *
 * That is free-tier RPC quota, database writes and function time, spendable by
 * a stranger in a loop. The presence of a header is not authentication, and the
 * check that treated it as such was copied to a second endpoint before anyone
 * noticed — which is why the rule now lives in one module.
 */

const ENV = ["INGEST_SECRET", "CRON_SECRET"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const req = (init: { headers?: Record<string, string>; query?: string } = {}) =>
  new Request(`https://foldmark.test/api/cron/ingest?action=run${init.query ?? ""}`, {
    headers: init.headers,
  });

describe("a header is not a credential", () => {
  it("refuses a request whose only claim is x-vercel-cron", () => {
    process.env.INGEST_SECRET = "the-real-secret";
    expect(cronAuthorized(req({ headers: { "x-vercel-cron": "1" } }))).toBe(false);
  });

  it("refuses it even alongside a wrong bearer token", () => {
    process.env.INGEST_SECRET = "the-real-secret";
    expect(
      cronAuthorized(req({ headers: { "x-vercel-cron": "1", authorization: "Bearer nope" } })),
    ).toBe(false);
  });

  it("names no header anywhere in the guard", () => {
    const source = readFileSync(join(process.cwd(), "src", "server", "cron", "auth.ts"), "utf8");
    // The word survives only where the module explains why it is not trusted.
    expect(source).not.toMatch(/headers\.get\("x-vercel-cron"\)/);
  });
});

describe("a configured secret, presented as a value", () => {
  it("accepts the ingestion secret as a bearer token", () => {
    process.env.INGEST_SECRET = "the-real-secret";
    expect(cronAuthorized(req({ headers: { authorization: "Bearer the-real-secret" } }))).toBe(true);
  });

  it("accepts it as a query parameter, which the running scheduler uses", () => {
    process.env.INGEST_SECRET = "the-real-secret";
    expect(cronAuthorized(req({ query: "&key=the-real-secret" }))).toBe(true);
  });

  it("accepts Vercel's own CRON_SECRET bearer token", () => {
    process.env.CRON_SECRET = "vercel-issued";
    expect(cronAuthorized(req({ headers: { authorization: "Bearer vercel-issued" } }))).toBe(true);
  });

  it("keeps the two secrets independent", () => {
    process.env.INGEST_SECRET = "one";
    process.env.CRON_SECRET = "two";
    expect(cronAuthorized(req({ headers: { authorization: "Bearer one" } }))).toBe(true);
    expect(cronAuthorized(req({ headers: { authorization: "Bearer two" } }))).toBe(true);
    expect(cronAuthorized(req({ headers: { authorization: "Bearer three" } }))).toBe(false);
  });

  it("rejects a prefix of the secret", () => {
    // The constant-time compare returns on length first; this asserts the
    // behaviour rather than the timing.
    process.env.INGEST_SECRET = "the-real-secret";
    expect(cronAuthorized(req({ headers: { authorization: "Bearer the-real-secre" } }))).toBe(false);
    expect(cronAuthorized(req({ headers: { authorization: "Bearer the-real-secretX" } }))).toBe(false);
  });

  it("authorizes nothing when no secret is configured", () => {
    // A deployment holding no secrets must not be drivable at all — the correct
    // default for an endpoint that spends a quota.
    expect(cronAuthorized(req({ headers: { authorization: "Bearer anything" } }))).toBe(false);
    expect(cronAuthorized(req({ query: "&key=anything" }))).toBe(false);
  });

  it("treats an empty configured secret as no secret", () => {
    process.env.INGEST_SECRET = "   ";
    expect(cronAuthorized(req({ headers: { authorization: "Bearer " } }))).toBe(false);
    expect(cronAuthorized(req({ query: "&key=" }))).toBe(false);
  });
});

describe("both endpoints read the same rule", () => {
  const routes = [
    join("src", "app", "api", "cron", "ingest", "route.ts"),
    join("src", "app", "api", "cron", "enrich", "route.ts"),
  ];

  it("neither keeps a private copy of the check", () => {
    // The first copy had the hole; the second inherited it. A rule about who
    // may spend money belongs in exactly one place.
    for (const rel of routes) {
      const source = readFileSync(join(process.cwd(), rel), "utf8");
      expect(source, `${rel} still trusts a header`).not.toMatch(/x-vercel-cron/);
      expect(source, `${rel} does not use the shared guard`).toMatch(/cronAuthorized/);
      expect(source, `${rel} defines its own check`).not.toMatch(/function authorized\(/);
    }
  });
});
