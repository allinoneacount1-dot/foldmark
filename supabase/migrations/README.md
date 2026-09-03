# Migrations

Plain SQL, applied in filename order. No migration framework: this schema is
small enough that a framework would add more moving parts than it removes, and
every file here is written to be safe to run twice.

## Rules every file in this directory follows

- **Additive.** `create table if not exists`, `alter table … add column if not
  exists`. Nothing is dropped, nothing is rewritten in place.
- **Idempotent.** Re-running a file is a no-op, including its data statements.
  Where a file corrects existing rows, the `where` clause stops matching once
  the correction has been made.
- **Non-destructive to observations.** Recorded market data is evidence. A
  migration may add to it or reinterpret it, but never deletes it — including
  the pre-existing `prices` table, which is left exactly as it is.

## Applying

Either:

```bash
psql "$DATABASE_URL" -f supabase/migrations/20260904_market_provenance.sql
```

or paste the file into the Supabase SQL editor and run it. Both are equivalent;
the file wraps itself in `begin` / `commit`, so a failure part-way leaves the
database untouched.

## Verifying it applied

```sql
select table_name
from information_schema.tables
where table_name in ('price_observations', 'canonical_prices', 'provider_refresh_state', 'market_state');

select column_name
from information_schema.columns
where table_name = 'indexer_state'
  and column_name in ('earliest_indexed_block', 'continuous_since', 'gap_blocks');
```

Four tables and three columns means the migration is in place.

## Before it is applied

The application does not fail. Every code path that touches a new table checks
for it and degrades:

| Surface | Without the migration |
| --- | --- |
| Price charts | Fall back to the `prices` table, then to observed transfer activity, labelled as activity rather than price |
| Index coverage | Reports `INDEXING` rather than claiming a window it cannot prove |
| Provider lease | Granted unconditionally — coordination is an optimisation, and losing it must not stop ingestion |
| `market_state` reads | Empty map, and the interface renders a data state |

This is deliberate. A deployment mid-migration should show less, not something
untrue.

## 20260904_market_provenance.sql

Adds:

1. **`price_observations`** — one row per thing a named source actually said,
   with four timestamps kept apart (`provider_timestamp`, `fetched_at`,
   `observed_at`, `persisted_at`). Uniqueness is the source, asset, venue and
   fetch — deliberately not the price, because two genuine observations may
   carry the same number and discarding the second would lose a real data point.

2. **`canonical_prices`** — one coherent series per asset, naming the
   observation reconciliation selected and the methodology version that selected
   it. Charts read only from here, so a candle can never combine a high from one
   provider with a low from another.

3. **`provider_refresh_state`** — the durable lease that stops several
   instances from each spending the same free quota on the same asset.

4. **`assets.verification_status`** — replaces a boolean that was set true
   because a contract's own `name()` contained "robinhood token". Anyone can
   deploy an ERC-20 with that name. Existing stock-token rows are downgraded to
   `CANDIDATE`; no asset and no activity is deleted, only the claim is corrected.

5. **`indexer_state` coverage columns** — how far back the index reaches and
   whether that reach is unbroken, so a 7D window can say PARTIAL instead of
   presenting forty minutes of data under a seven-day label.

6. **`market_state`** — the row a reader reads. Without it, rendering a page is
   a provider call and the product's cost scales with its audience. One
   scheduled process writes here; every page and API route selects from it and
   reaches no network at all.
