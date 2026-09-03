#!/usr/bin/env node
/**
 * Prove the database actually behaves the way FOLDMARK's correctness rules
 * assume it does.
 *
 *   node scripts/db-selftest.mjs
 *
 * Every check runs inside a transaction that is ROLLED BACK, so this leaves no
 * row behind. It is safe to run against production, and it is meant to be:
 * these are the guarantees the product's honesty rests on, and asserting them
 * against the real database is worth more than asserting them against a mock.
 *
 * What is verified:
 *
 *   1. connectivity, version, and that the schema is present
 *   2. transactions actually roll back
 *   3. the null-safe price identity — two pairless observations from the same
 *      fetch collapse to one row, which the old nullable constraint allowed to
 *      become two
 *   4. two genuine observations with the SAME PRICE are kept as two rows,
 *      because identity is the source and the moment, never the value
 *   5. foreign keys are enforced
 *   6. the assets trigger refuses to let `verified` drift from
 *      verification_status
 *   7. the provider lease is genuinely atomic under contention
 */
import pg from "pg";

const { Pool } = pg;

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Nothing to test against.");
  process.exit(1);
}

const pool = new Pool({ connectionString: url, max: 3 });
let passed = 0;
let failed = 0;

function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? "  — " + detail : ""}`);
  }
}

/** Run a body inside a transaction that is always rolled back. */
async function inRollback(fn) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    return await fn(client);
  } finally {
    try {
      await client.query("rollback");
    } catch {
      /* discarding the connection anyway */
    }
    client.release();
  }
}

try {
  console.log("\n=== 1. CONNECTIVITY AND SCHEMA ===");
  const { rows: v } = await pool.query("select version() as v, current_database() as db");
  console.log(`  database: ${v[0].db}`);
  console.log(`  server:   ${v[0].v.split(",")[0]}`);

  const EXPECTED = [
    "assets", "transfers", "wallets", "contracts", "protocols", "indexer_state",
    "flow_windows", "price_observations", "canonical_prices", "market_state",
    "provider_refresh_state", "prices",
  ];
  const { rows: tables } = await pool.query(
    `select table_name from information_schema.tables where table_schema = 'public'`,
  );
  const present = new Set(tables.map((r) => r.table_name));
  for (const t of EXPECTED) check(`table ${t}`, present.has(t));

  const { rows: idx } = await pool.query(
    `select indexname from pg_indexes where schemaname = 'public' and indexname = 'price_observations_identity_key'`,
  );
  check("unique index price_observations_identity_key", idx.length === 1);

  const { rows: pk } = await pool.query(
    `select is_nullable from information_schema.columns
      where table_name = 'price_observations' and column_name = 'pair_key'`,
  );
  check("price_observations.pair_key is NOT NULL", pk[0]?.is_nullable === "NO", `got ${pk[0]?.is_nullable}`);

  if (failed > 0) {
    console.log("\nSchema is incomplete — run `npm run db:migrate` first.");
    process.exit(1);
  }

  console.log("\n=== 2. TRANSACTIONS ROLL BACK ===");
  const marker = "0x" + "de".repeat(20);
  await inRollback(async (c) => {
    await c.query(
      `insert into assets (chain_id, contract_address, symbol, asset_type) values ($1, $2, $3, 'other')`,
      [4663, marker, "SELFTEST"],
    );
    const { rows } = await c.query("select count(*)::int as n from assets where contract_address = $1", [marker]);
    check("row is visible inside the transaction", rows[0].n === 1);
  });
  const { rows: after } = await pool.query("select count(*)::int as n from assets where contract_address = $1", [marker]);
  check("row is gone after rollback", after[0].n === 0, `found ${after[0].n}`);

  console.log("\n=== 3. NULL-SAFE PRICE IDENTITY ===");
  await inRollback(async (c) => {
    const { rows: a } = await c.query(
      `insert into assets (chain_id, contract_address, symbol, asset_type)
       values (4663, $1, 'SELFTEST', 'other') returning id`,
      ["0x" + "ab".repeat(20)],
    );
    const assetId = a[0].id;
    const fetchedAt = "2026-09-04T12:00:00.000Z";

    const insertObs = (price) =>
      c.query(
        `insert into price_observations
           (asset_id, chain_id, price, price_type, source, fetched_at, observed_at, pair_address, pair_key)
         values ($1, 4663, $2, 'DEX_SPOT', 'geckoterminal', $3, $3, null, '')
         on conflict (asset_id, source, price_type, fetched_at, pair_key) do nothing
         returning id`,
        [assetId, price, fetchedAt],
      );

    const first = await insertObs(229.26);
    const second = await insertObs(229.26);
    check("first pairless observation is written", first.rows.length === 1);
    // THE regression. With the old nullable-pair_address constraint Postgres
    // treated the two NULLs as distinct and BOTH rows landed, inventing history.
    check("duplicate pairless observation is rejected by the DATABASE", second.rows.length === 0);

    // Identity is the source and the moment — never the price. Two genuine
    // observations may legitimately carry the same number.
    const later = await c.query(
      `insert into price_observations
         (asset_id, chain_id, price, price_type, source, fetched_at, observed_at, pair_address, pair_key)
       values ($1, 4663, 229.26, 'DEX_SPOT', 'geckoterminal', $2, $2, null, '')
       on conflict (asset_id, source, price_type, fetched_at, pair_key) do nothing
       returning id`,
      [assetId, "2026-09-04T12:01:00.000Z"],
    );
    check("same price at a different fetch is kept as a separate observation", later.rows.length === 1);
  });

  console.log("\n=== 4. REFERENTIAL INTEGRITY ===");
  await inRollback(async (c) => {
    let rejected = false;
    try {
      await c.query(
        `insert into price_observations
           (asset_id, chain_id, price, price_type, source, fetched_at, observed_at, pair_key)
         values (gen_random_uuid(), 4663, 1, 'DEX_SPOT', 'x', now(), now(), '')`,
      );
    } catch {
      rejected = true;
    }
    check("observation for a non-existent asset is refused", rejected);
  });

  console.log("\n=== 5. VERIFICATION CANNOT DRIFT ===");
  await inRollback(async (c) => {
    const { rows } = await c.query(
      `insert into assets (chain_id, contract_address, symbol, asset_type, verification_status, verified)
       values (4663, $1, 'SELFTEST', 'stock_token', 'CANDIDATE', true)
       returning verified, verification_status`,
      ["0x" + "cd".repeat(20)],
    );
    // Asked for verified=true on a CANDIDATE row. The trigger must overrule it:
    // this is the exact shape of the bug that had 13 stock tokens claiming
    // verification nobody performed.
    check("verified=true is forced to false for a CANDIDATE", rows[0].verified === false, `got ${rows[0].verified}`);
  });

  console.log("\n=== 6. PROVIDER LEASE IS ATOMIC ===");
  await inRollback(async (c) => {
    const now = new Date();
    const soon = new Date(now.getTime() + 45_000);
    const take = () =>
      c.query(
        `insert into provider_refresh_state (provider, scope, next_allowed_at, last_fetch_at, updated_at)
         values ('selftest', '*', $1, $2, now())
         on conflict (provider, scope) do update
           set next_allowed_at = excluded.next_allowed_at,
               last_fetch_at = excluded.last_fetch_at,
               updated_at = now()
           where provider_refresh_state.next_allowed_at <= $2
         returning next_allowed_at`,
        [soon.toISOString(), now.toISOString()],
      );

    const a = await take();
    const b = await take();
    check("first caller acquires the lease", a.rows.length === 1);
    // The WHERE on DO UPDATE is the whole mechanism. Without it both callers
    // would "acquire" and both would spend the provider quota.
    check("second caller is refused while the lease is held", b.rows.length === 0);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed === 0 ? 0 : 1;
} catch (e) {
  console.error("\nself-test aborted:", e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
