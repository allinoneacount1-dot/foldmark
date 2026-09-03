-- FOLDMARK — market provenance, canonical series, verification status
--
-- Additive and idempotent. Nothing is dropped and nothing is rewritten: the
-- existing `prices` table and every row in it are left exactly as they are.
-- Re-running this file is safe.
--
-- Apply with:  psql "$DATABASE_URL" -f supabase/migrations/20260904_market_provenance.sql
--          or: paste into the Supabase SQL editor

begin;

-- ---------------------------------------------------------------------------
-- 1. price_observations — raw, per-source, with full provenance
--
-- One row is one thing a named source actually told us at a knowable time.
-- Four timestamps are kept apart on purpose:
--
--   provider_timestamp  when the source says the value was true
--   fetched_at          when the network call carrying it completed
--   observed_at         the semantic observation time we adopt
--   persisted_at        when this row was written
--
-- Collapsing any pair of them lets a cache read masquerade as a new
-- observation, which manufactures historical density that never happened.
-- ---------------------------------------------------------------------------
create table if not exists price_observations (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  chain_id integer not null,
  price numeric not null,
  currency text not null default 'USD',
  price_type text not null check (price_type in ('REFERENCE','ORACLE','DEX_SPOT','AGGREGATED')),
  source text not null,
  provider_timestamp timestamptz,
  fetched_at timestamptz not null,
  observed_at timestamptz not null,
  persisted_at timestamptz not null default now(),
  block_number bigint,
  pair_address text,
  dex_id text,
  liquidity_usd numeric,
  -- what liquidity_usd actually counts, so a UI cannot mislabel it
  liquidity_basis text check (liquidity_basis in ('PAIR_RESERVE','TOKEN_TOTAL_RESERVE')),
  metadata_json jsonb,

  -- Deduplication identity.
  --
  -- Deliberately NOT the price: two genuine observations may legitimately carry
  -- the same number, and discarding the second would lose a real data point.
  -- What makes an observation unique is which source produced it, for which
  -- asset, at which venue, from which network fetch.
  constraint price_observations_identity
    unique (asset_id, source, price_type, fetched_at, pair_address)
);

create index if not exists idx_price_obs_asset_time on price_observations (asset_id, observed_at desc);
create index if not exists idx_price_obs_source on price_observations (source, observed_at desc);
create index if not exists idx_price_obs_pair on price_observations (pair_address, observed_at desc);

-- ---------------------------------------------------------------------------
-- 2. canonical_prices — one coherent series per asset
--
-- Two providers are not one market. Aggregating GeckoTerminal's $230.12 and
-- DEX Screener's $229.79 into a single candle would invent a high and a low
-- that no venue ever printed.
--
-- So reconciliation picks one observation per moment by a stated rule, and the
-- chart reads only from here. The row keeps the observation it selected and the
-- methodology version that selected it, so a past decision stays auditable.
-- ---------------------------------------------------------------------------
create table if not exists canonical_prices (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  price numeric not null,
  currency text not null default 'USD',
  price_type text not null,
  source text not null,
  source_observation_id uuid references price_observations(id) on delete set null,
  pair_address text,
  dex_id text,
  liquidity_usd numeric,
  observed_at timestamptz not null,
  selected_at timestamptz not null default now(),
  methodology_version text not null,
  -- spread across sources of the same type at selection time, when there was one
  divergence_pct numeric,

  constraint canonical_prices_identity unique (asset_id, observed_at, source)
);

create index if not exists idx_canonical_asset_time on canonical_prices (asset_id, observed_at desc);

-- ---------------------------------------------------------------------------
-- 3. provider_refresh_state — durable coordination across instances
--
-- The in-memory cache protects one server instance from its own enthusiasm. It
-- cannot stop three instances from each spending a provider call for the same
-- asset in the same second. This table is the shared lease they all consult.
-- ---------------------------------------------------------------------------
create table if not exists provider_refresh_state (
  provider text not null,
  scope text not null,                     -- contract address, or '*' for a whole sweep
  last_fetch_at timestamptz,
  next_allowed_at timestamptz not null default now(),
  last_status text,
  consecutive_errors integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (provider, scope)
);

-- ---------------------------------------------------------------------------
-- 4. assets — verification becomes a state, not a boolean
--
-- `verified boolean` was being set true because a contract's own name() string
-- contained "robinhood token". Anyone can deploy an ERC-20 with that name, so
-- the flag asserted something the evidence did not support.
--
-- Three states, and the promotion between them requires different evidence:
--
--   OBSERVED   the contract emitted a Transfer and answered ERC-20 metadata
--   CANDIDATE  its on-chain metadata looks like a Robinhood Stock Token
--   VERIFIED   an authoritative source confirms this exact contract address
--
-- The boolean column is kept so nothing that reads it breaks, but it is only
-- ever true for VERIFIED from here on.
-- ---------------------------------------------------------------------------
alter table assets add column if not exists verification_status text
  not null default 'OBSERVED'
  check (verification_status in ('OBSERVED','CANDIDATE','VERIFIED'));

alter table assets add column if not exists verification_evidence text;
alter table assets add column if not exists verification_source text;
alter table assets add column if not exists verified_at timestamptz;

create index if not exists idx_assets_verification on assets (verification_status);

-- Downgrade every asset whose only evidence was a name match. This does not
-- delete an asset or any of its observed activity — it corrects a claim.
update assets
set verification_status = 'CANDIDATE',
    verification_evidence = coalesce(
      verification_evidence,
      'On-chain name() matched the Robinhood Token marker. String similarity is not proof of issuer, so this is a candidate until an authoritative contract list confirms the address.'
    ),
    verification_source = coalesce(verification_source, 'on-chain metadata heuristic'),
    verified = false
where verification_status = 'OBSERVED'
  and asset_type = 'stock_token';

-- ---------------------------------------------------------------------------
-- 5. index coverage — what the dataset actually spans
--
-- A 24H window is not complete because the query ran. If the indexer has only
-- been following the chain for ten minutes, "0 transfers in 24H" is a lie by
-- omission; the honest answer is PARTIAL.
-- ---------------------------------------------------------------------------
alter table indexer_state add column if not exists earliest_indexed_block bigint;
alter table indexer_state add column if not exists earliest_indexed_at timestamptz;
alter table indexer_state add column if not exists continuous_since timestamptz;
alter table indexer_state add column if not exists gap_blocks bigint not null default 0;
alter table indexer_state add column if not exists last_gap_at timestamptz;

-- ---------------------------------------------------------------------------
-- 6. market_state — the price a reader reads
--
-- Without this table a page render is a provider call. Ten readers on one asset
-- is ten calls, a free quota lasts minutes, and the product's cost scales with
-- its audience — which is the opposite of what a data product should do.
--
-- So the write path and the read path are separated. One scheduled process
-- fetches, reconciles, and writes exactly one row per asset here. Every reader
-- selects from this table and reaches no network at all. A hundred readers cost
-- what one reader costs, which is nothing.
--
-- The row carries its own timestamps so a reader can judge it: observed_at is
-- when the market was true, fetched_at is when the call that saw it completed,
-- persisted_at is when this row was written. A stale row is still served, and
-- still says it is stale, because a real quote from four minutes ago is worth
-- more than a blank space.
-- ---------------------------------------------------------------------------
create table if not exists market_state (
  asset_id uuid primary key references assets(id) on delete cascade,
  chain_id integer not null,
  contract_address text not null,
  price numeric not null,
  currency text not null default 'USD',
  price_type text not null,
  source text not null,
  dex_id text,
  pair_address text,
  liquidity_usd numeric,
  liquidity_basis text,
  observed_at timestamptz not null,
  fetched_at timestamptz not null,
  persisted_at timestamptz not null default now(),
  divergence_pct numeric,
  observation_quality numeric,
  methodology_version text not null,
  updated_at timestamptz not null default now()
);

create index if not exists market_state_contract_idx on market_state (contract_address);
create index if not exists market_state_observed_idx on market_state (observed_at desc);

commit;
