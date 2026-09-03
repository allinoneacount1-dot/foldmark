-- FOLDMARK — enforce the null-safe observation identity
--
-- ORDERING MATTERS. Apply this ONLY after the application code that targets
-- pair_key is deployed.
--
-- Why: PostgREST turns `on_conflict=asset_id,source,price_type,fetched_at,pair_address`
-- into `ON CONFLICT (asset_id, source, price_type, fetched_at, pair_address) DO NOTHING`.
-- That clause handles a conflict on THAT constraint only. Once the index below
-- exists, a duplicate observation with a NULL pair_address conflicts on the NEW
-- index instead, which the clause does not cover, and Postgres raises 23505
-- rather than skipping the row. Older code would start failing to write prices.
--
-- So the safe order is:
--
--   1. deploy the code that sends pair_key           (safe without this file:
--      it falls back to the legacy identity when the column is absent)
--   2. apply 20260905_pair_key_and_provenance.sql    (safe with any code)
--   3. apply THIS file                               (requires step 1 live)
--
-- Applying this out of order does not corrupt anything — it makes price writes
-- fail loudly until the code catches up. Loud is the correct failure here; the
-- alternative was silent duplicate history, which is what this index exists to
-- prevent.
--
-- Additive and idempotent. Creates one index. Deletes nothing.

begin;

do $$
declare
  dupe_groups bigint;
begin
  if to_regclass('public.price_observations') is null then
    raise notice 'price_observations does not exist. Nothing to do.';
    return;
  end if;

  if to_regclass('public.price_observations_identity_key') is not null then
    raise notice 'price_observations_identity_key already exists. Nothing to do.';
    return;
  end if;

  -- A unique index cannot be created over existing duplicates. Rather than
  -- deleting observations to make room for it, refuse and say so.
  select count(*) into dupe_groups
  from (
    select 1
    from price_observations
    group by asset_id, source, price_type, fetched_at, pair_key
    having count(*) > 1
  ) d;

  if dupe_groups > 0 then
    raise notice 'Refusing to create the unique index: % duplicate identity group(s) exist. No row was deleted. Resolve them, then re-run this file.', dupe_groups;
    return;
  end if;

  create unique index price_observations_identity_key
    on price_observations (asset_id, source, price_type, fetched_at, pair_key);

  raise notice 'price_observations_identity_key created. Duplicate observations are now impossible at the database level, NULL pair or not.';
end $$;

commit;
