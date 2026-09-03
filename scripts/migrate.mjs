#!/usr/bin/env node
/**
 * Apply FOLDMARK's SQL migrations to the database in DATABASE_URL.
 *
 * Plain files applied in filename order, recorded in a ledger so a re-run is a
 * no-op. No migration framework: the schema is small enough that a framework
 * would add more moving parts than it removes, and every file is written to be
 * safe to run twice anyway.
 *
 *   node scripts/migrate.mjs            apply anything not yet recorded
 *   node scripts/migrate.mjs --status   show what is applied, change nothing
 *   node scripts/migrate.mjs --force    re-run every file regardless
 *
 * Each file runs inside its own transaction, so a failure leaves the database
 * exactly as it was rather than half-migrated.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, "..", "db", "migrations");

const args = process.argv.slice(2);
const statusOnly = args.includes("--status");
const force = args.includes("--force");

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  console.error("");
  console.error("  Neon: create a project at https://neon.tech, copy the pooled");
  console.error("  connection string, then either export it or put it in .env.local:");
  console.error("    DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require");
  process.exit(1);
}

const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

if (!files.length) {
  console.log("No migration files in db/migrations.");
  process.exit(0);
}

const pool = new Pool({ connectionString: url, max: 2 });

const sha = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);

try {
  await pool.query(`
    create table if not exists schema_migrations (
      filename text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `);

  const { rows: applied } = await pool.query("select filename, checksum, applied_at from schema_migrations");
  const byName = new Map(applied.map((r) => [r.filename, r]));

  if (statusOnly) {
    console.log("migration status\n");
    for (const f of files) {
      const rec = byName.get(f);
      const local = sha(readFileSync(join(DIR, f), "utf8"));
      if (!rec) console.log(`  PENDING   ${f}`);
      else if (rec.checksum !== local) console.log(`  CHANGED   ${f}  (applied ${rec.applied_at.toISOString()}, file has since been edited)`);
      else console.log(`  APPLIED   ${f}  ${rec.applied_at.toISOString()}`);
    }
    process.exit(0);
  }

  let ran = 0;
  for (const f of files) {
    const text = readFileSync(join(DIR, f), "utf8");
    const checksum = sha(text);
    const rec = byName.get(f);

    if (rec && !force) {
      if (rec.checksum !== checksum) {
        console.log(`  CHANGED   ${f} — already applied, file edited since. Add a new migration instead of editing this one.`);
      } else {
        console.log(`  skip      ${f}`);
      }
      continue;
    }

    process.stdout.write(`  apply     ${f} ... `);
    const client = await pool.connect();
    try {
      // The file supplies its own begin/commit; wrapping it again would nest.
      await client.query(text);
      await client.query(
        `insert into schema_migrations (filename, checksum) values ($1, $2)
         on conflict (filename) do update set checksum = excluded.checksum, applied_at = now()`,
        [f, checksum],
      );
      console.log("ok");
      ran += 1;
    } catch (e) {
      console.log("FAILED");
      console.error("");
      console.error(`  ${e.message}`);
      console.error("");
      console.error("  Nothing was committed for this file.");
      process.exitCode = 1;
      break;
    } finally {
      client.release();
    }
  }

  if (ran > 0) console.log(`\n${ran} migration(s) applied.`);
  else if (!process.exitCode) console.log("\nNothing to do — schema is current.");
} finally {
  await pool.end();
}
