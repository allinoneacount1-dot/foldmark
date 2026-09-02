-- FOLDMARK — Robinhood Chain Financial Fabric
-- Initial schema — Supabase Free (500MB) — idempotent

create extension if not exists "pgcrypto";

-- indexer cursor — persistent, restart-safe, idempotent
create table if not exists indexer_state (
  chain_id integer primary key,
  last_processed_block bigint not null default 0,
  last_finalized_block bigint not null default 0,
  updated_at timestamptz not null default now()
);
insert into indexer_state (chain_id, last_processed_block) values (4663, 0) on conflict (chain_id) do nothing;

create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  chain_id integer not null,
  contract_address text not null unique,
  symbol text not null,
  name text not null,
  asset_type text not null check (asset_type in ('stock_token','crypto','stablecoin','other')),
  verified boolean not null default false,
  source text,
  decimals integer not null default 18,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_assets_symbol on assets(symbol);
create index if not exists idx_assets_verified on assets(verified);

create table if not exists asset_metadata (
  asset_id uuid primary key references assets(id) on delete cascade,
  underlying text,
  multiplier numeric,
  metadata_json jsonb,
  source text,
  observed_at timestamptz not null default now()
);

create table if not exists prices (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  price numeric not null,
  currency text not null default 'USD',
  source text not null,
  block_number bigint,
  observed_at timestamptz not null default now()
);
create index if not exists idx_prices_asset_time on prices(asset_id, observed_at desc);

create table if not exists transfers (
  id uuid primary key default gen_random_uuid(),
  tx_hash text not null,
  log_index integer not null,
  block_number bigint not null,
  asset_id uuid references assets(id) on delete set null,
  from_address text not null,
  to_address text not null,
  amount numeric not null,
  notional_value numeric,
  timestamp timestamptz not null,
  unique(tx_hash, log_index)
);
create index if not exists idx_transfers_block on transfers(block_number desc);
create index if not exists idx_transfers_asset on transfers(asset_id);
create index if not exists idx_transfers_from on transfers(from_address);
create index if not exists idx_transfers_to on transfers(to_address);

create table if not exists wallets (
  address text primary key,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create table if not exists protocols (
  id text primary key,
  name text not null,
  category text not null,
  verified boolean not null default false,
  website text
);

create table if not exists contracts (
  address text primary key,
  protocol_id text references protocols(id) on delete set null,
  contract_type text,
  verified boolean not null default false
);

create table if not exists relationships (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_id text not null,
  target_type text not null,
  target_id text not null,
  relationship_type text not null,
  weight numeric not null default 0,
  "window" text not null,
  updated_at timestamptz not null default now(),
  unique(source_type, source_id, target_type, target_id, "window")
);

create table if not exists flow_windows (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  "window" text not null check ("window" in ('1H','6H','24H','7D','30D')),
  inflow numeric not null default 0,
  outflow numeric not null default 0,
  net_flow numeric not null default 0,
  transaction_count integer not null default 0,
  unique_counterparties integer not null default 0,
  calculated_at timestamptz not null default now(),
  unique(entity_type, entity_id, "window")
);

create table if not exists data_sources (
  id text primary key,
  name text not null,
  url text,
  source_type text,
  freshness text,
  last_success timestamptz,
  last_error text
);
insert into data_sources (id, name, source_type) values
  ('rpc_4663','Robinhood Chain RPC','rpc'),
  ('robinhood_registry','Robinhood Stock Token Registry','registry'),
  ('chainlink','Chainlink','oracle'),
  ('blockscout','Blockscout','explorer')
on conflict (id) do nothing;

-- seed canonical Stock Tokens (verified) — contracts are placeholders until registry fetch live
insert into assets (chain_id, contract_address, symbol, name, asset_type, verified, source, decimals) values
  (4663, '0x0000000000000000000000000000000000000001', 'NVDA', 'NVIDIA', 'stock_token', true, 'Robinhood Registry', 18),
  (4663, '0x0000000000000000000000000000000000000002', 'AAPL', 'Apple', 'stock_token', true, 'Robinhood Registry', 18),
  (4663, '0x0000000000000000000000000000000000000003', 'TSLA', 'Tesla', 'stock_token', true, 'Robinhood Registry', 18),
  (4663, '0x0000000000000000000000000000000000000004', 'AMZN', 'Amazon', 'stock_token', true, 'Robinhood Registry', 18),
  (4663, '0x0000000000000000000000000000000000000005', 'MSFT', 'Microsoft', 'stock_token', true, 'Robinhood Registry', 18)
on conflict (contract_address) do nothing;
