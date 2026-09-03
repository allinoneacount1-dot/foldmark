-- FOLDMARK — canonical schema, Postgres.
--
-- This is the whole database in one file, written correct from the start
-- rather than as a replay of how it was arrived at. The Supabase-era migrations
-- reached this shape through a sequence of corrections; a fresh database has no
-- reason to repeat the mistakes in order, so it does not.
--
-- One correction is worth naming, because it is the reason a column exists that
-- looks redundant. `price_observations` previously keyed its identity on a
-- NULLABLE pair_address. Postgres treats two NULLs as distinct, so that
-- constraint permitted unlimited duplicates for any observation with no pair —
-- which is every observation from GeckoTerminal's multi-token endpoint.
-- Deduplication existed only in application memory, and memory does not survive
-- a retry, a restart, or a second process. `pair_key` is the same fact with no
-- NULL in it, NOT NULL from the start, and the unique index is built on it.
--
-- Idempotent: every object is `if not exists`. Additive: nothing is dropped.
--
-- Apply with:  psql "$DATABASE_URL" -f db/migrations/0001_foldmark_schema.sql
--          or: npm run db:migrate

begin;

-- ---------------------------------------------------------------------------
-- assets — one row per token contract observed on the chain
--
-- Identity is (chain_id, contract_address). Never a ticker, never a name:
-- anyone can deploy an ERC-20 called "NVIDIA • Robinhood Token", and several
-- have. `verification_status` exists because a boolean could not express the
-- difference between "we saw it emit a Transfer" and "an authoritative source
-- confirmed this exact address".
--
--   OBSERVED   the contract emitted a Transfer and answered ERC-20 metadata
--   CANDIDATE  its metadata looks like a Robinhood Stock Token
--   VERIFIED   an authoritative source confirms this exact contract address
--
-- `verified` is kept as a convenience mirror and is only ever true for
-- VERIFIED, enforced by the trigger below rather than by convention.
-- ---------------------------------------------------------------------------
create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  chain_id integer not null,
  contract_address text not null,
  symbol text,
  name text,
  asset_type text not null default 'other'
    check (asset_type in ('stock_token','crypto','stablecoin','other')),
  decimals integer not null default 18,
  verified boolean not null default false,
  verification_status text not null default 'OBSERVED'
    check (verification_status in ('OBSERVED','CANDIDATE','VERIFIED')),
  verification_evidence text,
  verification_source text,
  verified_at timestamptz,
  source text,
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assets_identity unique (chain_id, contract_address)
);

create index if not exists idx_assets_contract on assets (contract_address);
create index if not exists idx_assets_type on assets (asset_type);
create index if not exists idx_assets_verification on assets (verification_status);

-- `verified` cannot drift from `verification_status`. Without this the boolean
-- is a second source of truth, and the two disagreeing is exactly how 13 stock
-- tokens ended up asserting verification nobody had performed.
create or replace function assets_sync_verified() returns trigger as $$
begin
  new.verified := (new.verification_status = 'VERIFIED');
  return new;
end;
$$ language plpgsql;

drop trigger if exists assets_verified_guard on assets;
create trigger assets_verified_guard
  before insert or update on assets
  for each row execute function assets_sync_verified();

-- ---------------------------------------------------------------------------
-- transfers — the observed chain, one row per ERC-20 Transfer log
--
-- (tx_hash, log_index) is the only pair unique for a log, which is what makes
-- re-reading a block range idempotent.
-- ---------------------------------------------------------------------------
create table if not exists transfers (
  tx_hash text not null,
  log_index integer not null,
  block_number bigint not null,
  chain_id integer not null,
  asset_id uuid references assets(id) on delete set null,
  from_address text not null,
  to_address text not null,
  amount numeric not null,
  timestamp timestamptz not null,
  persisted_at timestamptz not null default now(),
  primary key (tx_hash, log_index)
);

create index if not exists idx_transfers_time on transfers (timestamp desc);
create index if not exists idx_transfers_asset_time on transfers (asset_id, timestamp desc);
create index if not exists idx_transfers_from on transfers (from_address, timestamp desc);
create index if not exists idx_transfers_to on transfers (to_address, timestamp desc);
create index if not exists idx_transfers_block on transfers (block_number desc);

-- ---------------------------------------------------------------------------
-- wallets, contracts, protocols — identity registries
-- ---------------------------------------------------------------------------
create table if not exists wallets (
  address text primary key,
  first_seen timestamptz not null default now(),
  last_seen timestamptz
);

create table if not exists contracts (
  address text primary key,
  chain_id integer not null,
  label text,
  contract_type text,
  protocol_id uuid,
  evidence text,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists protocols (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  category text,
  description text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- indexer_state — the cursor, and how far coverage actually reaches
--
-- A 24H window is not complete because the query ran. These columns are what
-- let a window report PARTIAL instead of presenting ten minutes of data under a
-- twenty-four hour label.
-- ---------------------------------------------------------------------------
create table if not exists indexer_state (
  chain_id integer primary key,
  last_processed_block bigint not null default 0,
  last_finalized_block bigint,
  earliest_indexed_block bigint,
  earliest_indexed_at timestamptz,
  continuous_since timestamptz,
  gap_blocks bigint not null default 0,
  last_gap_at timestamptz,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- flow_windows — precomputed directional flow, per address AND per asset
--
-- entity_id is `<address>:<asset_id>`. Net flow is only meaningful inside one
-- unit: -420 is not a fact, -420 USDG is. Storing it per address alone would
-- require summing token units across assets, which produces a number with no
-- unit and no meaning.
-- ---------------------------------------------------------------------------
create table if not exists flow_windows (
  entity_type text not null,
  entity_id text not null,
  window text not null,
  inflow numeric not null default 0,
  outflow numeric not null default 0,
  net_flow numeric not null default 0,
  transaction_count integer not null default 0,
  unique_counterparties integer not null default 0,
  calculated_at timestamptz not null default now(),
  primary key (entity_type, entity_id, window)
);

create index if not exists idx_flow_windows_window on flow_windows (window, net_flow desc);

-- ---------------------------------------------------------------------------
-- price_observations — raw, per-source, with full provenance
--
-- Four timestamps kept apart on purpose:
--
--   provider_timestamp  when the source says the value was true
--   fetched_at          when the network call carrying it completed
--   observed_at         the semantic observation time we adopt
--   persisted_at        when this row was written
--
-- Collapsing any pair of them lets a cache read masquerade as a new
-- observation, manufacturing historical density that never happened.
--
-- Identity is deliberately NOT the price: two genuine observations may carry
-- the same number, and discarding the second would lose a real data point. What
-- makes an observation unique is which source produced it, for which asset, at
-- which venue, from which network fetch — with pair_key standing in for a venue
-- that was never identified, so NULL cannot defeat the constraint.
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
  -- pair_address with NULL collapsed to ''. NOT NULL from the start so the
  -- unique index below actually enforces something for pairless observations.
  pair_key text not null default '',
  dex_id text,
  liquidity_usd numeric,
  liquidity_basis text check (liquidity_basis in ('PAIR_RESERVE','TOKEN_TOTAL_RESERVE')),
  metadata_json jsonb
);

create unique index if not exists price_observations_identity_key
  on price_observations (asset_id, source, price_type, fetched_at, pair_key);

create index if not exists idx_price_obs_asset_time on price_observations (asset_id, observed_at desc);
create index if not exists idx_price_obs_source on price_observations (source, observed_at desc);

-- ---------------------------------------------------------------------------
-- canonical_prices — one coherent series per asset
--
-- Two providers are not one market. Pooling GeckoTerminal's $230.12 and DEX
-- Screener's $229.79 into one candle would print a high and a low no venue ever
-- traded through. Reconciliation picks ONE observation per moment by a stated
-- rule, charts read only from here, and the row names the raw observation it
-- selected so a past decision stays auditable.
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
  divergence_pct numeric,
  constraint canonical_prices_identity unique (asset_id, observed_at, source)
);

create index if not exists idx_canonical_asset_time on canonical_prices (asset_id, observed_at desc);
create index if not exists idx_canonical_source_observation on canonical_prices (source_observation_id);

-- ---------------------------------------------------------------------------
-- market_state — the row a reader reads
--
-- Without this, rendering a page is a provider call and the product's cost
-- scales with its audience. One process writes here; every page and API route
-- selects from it and reaches no network at all.
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

create index if not exists idx_market_state_contract on market_state (contract_address);

-- ---------------------------------------------------------------------------
-- provider_refresh_state — the lease across processes
--
-- An in-memory schedule protects one process from its own enthusiasm. It cannot
-- stop three processes from each spending a provider call for the same asset in
-- the same second. They share a quota, not memory; the database is their only
-- common ground.
-- ---------------------------------------------------------------------------
create table if not exists provider_refresh_state (
  provider text not null,
  scope text not null,
  last_fetch_at timestamptz,
  next_allowed_at timestamptz not null default now(),
  last_status text,
  consecutive_errors integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (provider, scope)
);

-- ---------------------------------------------------------------------------
-- prices — the legacy pre-reconciliation table
--
-- Kept so historical rows imported from the previous database have somewhere to
-- land and readers can fall back to them. Nothing new is written here.
-- ---------------------------------------------------------------------------
create table if not exists prices (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references assets(id) on delete cascade,
  price numeric not null,
  currency text not null default 'USD',
  source text not null,
  observed_at timestamptz not null,
  persisted_at timestamptz not null default now()
);

create index if not exists idx_prices_asset_time on prices (asset_id, observed_at desc);

commit;
