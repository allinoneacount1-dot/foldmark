-- FOLDMARK — null-safe observation identity, and the provenance link
--
-- Additive and idempotent. Nothing is dropped, nothing is deleted, and no
-- existing observation is rewritten except to fill in the new pair_key column
-- with a value derived from data already in the row.
--
-- SAFE TO APPLY AT ANY TIME, with any version of the application code. It adds
-- a column with a default and backfills it. It does NOT add the unique index
-- that makes the column enforce anything — that lives in the companion file
-- 20260905_pair_key_unique.sql, which must not be applied until the code that
-- targets pair_key is deployed. See the README for why the split exists.
--
-- Apply with:  psql "$DATABASE_URL" -f supabase/migrations/20260905_pair_key_and_provenance.sql
--          or: paste into the Supabase SQL editor

begin;

-- ---------------------------------------------------------------------------
-- 1. pair_key — an identity column that NULL cannot defeat
--
-- price_observations_identity is
--   unique (asset_id, source, price_type, fetched_at, pair_address)
-- and pair_address is nullable. In Postgres a plain UNIQUE treats two NULLs as
-- distinct, so that constraint permits unlimited duplicates for any observation
-- with no pair — which is every observation GeckoTerminal's multi-token
-- endpoint produces, because it identifies no pair.
--
-- The result is that the deduplication the product relies on exists only in
-- application memory. A retry, a restart, or a second instance writes the same
-- observation again, and the price history gains density that never happened.
--
-- pair_key carries the same fact with no NULL in it: the pair address, or the
-- empty string when there is none. pair_address stays nullable so a reader can
-- still tell "no pair was identified" from "the pair is the empty string",
-- which is not a thing.
--
-- It is a PLAIN column, deliberately not GENERATED: a generated column is not
-- insertable, and PostgREST cannot name one in an ON CONFLICT target. The
-- application sets it, and the backfill below covers everything already stored.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.price_observations') is null then
    raise notice 'price_observations does not exist. Run 20260904_market_provenance.sql first; this file is a no-op until then.';
    return;
  end if;

  alter table price_observations add column if not exists pair_key text not null default '';

  -- Idempotent: the predicate stops matching once the backfill has run.
  update price_observations
  set pair_key = coalesce(pair_address, '')
  where pair_key is distinct from coalesce(pair_address, '');
end $$;

-- ---------------------------------------------------------------------------
-- 2. Report any duplicates the old constraint let through
--
-- Deliberately reports rather than deletes. These rows are recorded
-- observations; a migration that quietly removes them to make an index fit is
-- destroying evidence to satisfy a schema. The owner decides what happens to
-- them, and 20260905_pair_key_unique.sql refuses to run until they are gone.
-- ---------------------------------------------------------------------------
do $$
declare
  dupe_groups bigint;
  dupe_rows bigint;
begin
  if to_regclass('public.price_observations') is null then return; end if;

  select count(*), coalesce(sum(n), 0) into dupe_groups, dupe_rows
  from (
    select count(*) as n
    from price_observations
    group by asset_id, source, price_type, fetched_at, pair_key
    having count(*) > 1
  ) d;

  if dupe_groups > 0 then
    raise notice 'price_observations holds % duplicate identity group(s) covering % row(s). No row was deleted. The unique index in 20260905_pair_key_unique.sql will refuse to create until these are resolved.', dupe_groups, dupe_rows;
  else
    raise notice 'price_observations has no duplicate identities. 20260905_pair_key_unique.sql can be applied once the code targeting pair_key is deployed.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Provenance — index the link so it can be followed
--
-- canonical_prices.source_observation_id already exists from the 20260904
-- migration but was never written to. The application now populates it, so the
-- audit direction people actually ask for — "which raw observations were ever
-- selected as canonical?" — needs an index to be answerable.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.canonical_prices') is null then return; end if;
  create index if not exists idx_canonical_source_observation
    on canonical_prices (source_observation_id);
end $$;

commit;
