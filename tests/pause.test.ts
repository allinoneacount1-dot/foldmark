import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ingestionPaused, PAUSE_REASON } from "@/server/ingest/pause";
import { ingestionHealth } from "@/app/api/cron/ingest/route";

/**
 * A decision is not a fault.
 *
 * FOLDMARK ingests against a fixed free-tier ceiling — measured at roughly
 * 509,000 transfer rows a day, 508 bytes a row, about 246 MB a day against a
 * 500 MB limit. The owner chose to stop ingesting and keep what was already
 * observed rather than delete real history or pay for storage.
 *
 * From the outside a paused index and a broken one look identical: both stop
 * advancing. They are completely different facts, and getting it wrong is
 * expensive in both directions. Reporting a fault where someone made a decision
 * sends people hunting a bug that is not there. Reporting health where the
 * index has silently stopped is how a stalled pipeline gets mistaken for a
 * quiet chain — the failure this product exists to prevent.
 *
 * So PAUSED is a state of its own, it outranks the age-based verdicts that
 * would otherwise fire, and it is stated wherever freshness is implied.
 */

const saved = process.env.INGEST_PAUSED;

beforeEach(() => {
  delete process.env.INGEST_PAUSED;
});

afterEach(() => {
  if (saved === undefined) delete process.env.INGEST_PAUSED;
  else process.env.INGEST_PAUSED = saved;
});

const HOUR_AGO = new Date(Date.now() - 3_600_000).toISOString();
const JUST_NOW = new Date(Date.now() - 30_000).toISOString();

describe("paused outranks the verdicts that would otherwise fire", () => {
  it("reports PAUSED rather than STALE for an index that stopped hours ago", () => {
    // Without this, a deliberate pause ages into STALE within the hour and
    // reads as an outage.
    expect(ingestionHealth(HOUR_AGO, 5_000, true)).toBe("PAUSED");
  });

  it("reports PAUSED rather than DEGRADED however far the lag grows", () => {
    expect(ingestionHealth(JUST_NOW, 5_000_000, true)).toBe("PAUSED");
  });

  it("reports PAUSED even with no successful pass on record", () => {
    expect(ingestionHealth(null, null, true)).toBe("PAUSED");
  });

  it("still reports a real fault when nothing is paused", () => {
    // The guard must not become a way to silence genuine staleness.
    expect(ingestionHealth(HOUR_AGO, 5_000, false)).toBe("STALE");
    expect(ingestionHealth(JUST_NOW, 5_000_000, false)).toBe("DEGRADED");
    expect(ingestionHealth(JUST_NOW, 100, false)).toBe("HEALTHY");
  });

  it("defaults to not paused, so the flag must be set deliberately", () => {
    expect(ingestionHealth(JUST_NOW, 100)).toBe("HEALTHY");
  });
});

describe("the switch is explicit and does not depend on the database", () => {
  it("is off unless the environment says otherwise", () => {
    expect(ingestionPaused()).toBe(false);
    process.env.INGEST_PAUSED = "";
    expect(ingestionPaused()).toBe(false);
    process.env.INGEST_PAUSED = "0";
    expect(ingestionPaused()).toBe(false);
    process.env.INGEST_PAUSED = "false";
    expect(ingestionPaused()).toBe(false);
  });

  it("accepts the forms someone actually types", () => {
    for (const v of ["1", "true", "TRUE", "yes", " true "]) {
      process.env.INGEST_PAUSED = v;
      expect(ingestionPaused(), v).toBe(true);
    }
  });

  it("reads the environment, not a row", () => {
    // The usual reason to pause is that the database is the problem, and a
    // switch that needs the database to work fails exactly when it is needed.
    const source = readFileSync(join(process.cwd(), "src", "server", "ingest", "pause.ts"), "utf8");
    expect(source).not.toMatch(/selectRows|from "@\/server\/db/);
    expect(source).toMatch(/process\.env\.INGEST_PAUSED/);
  });
});

describe("the reason travels with the state", () => {
  it("says it is a decision and not a failure", () => {
    expect(PAUSE_REASON).toMatch(/by decision, not by failure/i);
  });

  it("says nothing was deleted and nothing is estimated", () => {
    expect(PAUSE_REASON).toMatch(/nothing has been deleted/i);
    expect(PAUSE_REASON).toMatch(/no figure here is estimated/i);
  });

  it("keeps the live chain head separate from the stopped index", () => {
    // The head is read over RPC and is unaffected; conflating the two would
    // make a paused index look like a halted chain.
    expect(PAUSE_REASON).toMatch(/chain head .* is read live over RPC and is unaffected/i);
  });
});

describe("both writers stop, and the product says so", () => {
  it("refuses a pass on both cron endpoints", () => {
    for (const rel of [
      join("src", "app", "api", "cron", "ingest", "route.ts"),
      join("src", "app", "api", "cron", "enrich", "route.ts"),
    ]) {
      const source = readFileSync(join(process.cwd(), rel), "utf8");
      // Enrichment writes far less than the indexer, but a deployment that
      // stopped growing on purpose must not keep growing through a side door.
      expect(source, `${rel} does not check the pause`).toMatch(/if \(ingestionPaused\(\)\)/);
    }
  });

  it("states it above the content on every page, not only on a status page", () => {
    const layout = readFileSync(join(process.cwd(), "src", "app", "layout.tsx"), "utf8");
    expect(layout).toMatch(/<IngestionNotice \/>/);
    const notice = readFileSync(
      join(process.cwd(), "src", "components", "shell", "IngestionNotice.tsx"),
      "utf8",
    );
    // Renders nothing at all while ingestion runs, so the ordinary case carries
    // no chrome.
    expect(notice).toMatch(/if \(!ingestionPaused\(\)\) return null;/);
    expect(notice).toMatch(/INDEX PAUSED/);
  });
});
