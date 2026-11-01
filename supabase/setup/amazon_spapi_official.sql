-- PREPARATION ONLY. Review and apply manually in a separate test project first.
-- No existing products, prices, inventory, Magazord or experimental Amazon objects are touched.
begin;
create table public.amazon_spapi_oauth_states (
  state_hash text primary key check (state_hash ~ '^[0-9a-f]{64}$'),
  browser_hash text not null unique check (browser_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  seller_id text not null check (seller_id ~ '^[A-Z0-9]{4,100}$'),
  phase text not null check (phase in ('start', 'callback')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index amazon_spapi_states_expiry on public.amazon_spapi_oauth_states(expires_at);
create table public.amazon_spapi_authorizations (
  store_id uuid not null references public.stores(id) on delete cascade,
  selling_partner_id text not null check (selling_partner_id ~ '^[A-Z0-9]{4,100}$'),
  ciphertext text not null,
  iv text not null,
  tag text not null,
  key_version integer not null check (key_version = 1),
  updated_at timestamptz not null default now(),
  primary key (store_id, selling_partner_id)
);
alter table public.amazon_spapi_oauth_states enable row level security;
alter table public.amazon_spapi_authorizations enable row level security;
revoke all on public.amazon_spapi_oauth_states, public.amazon_spapi_authorizations from public, anon, authenticated, service_role;
grant select, insert, delete on public.amazon_spapi_oauth_states to service_role;
grant select, insert, update, delete on public.amazon_spapi_authorizations to service_role;
-- No client policies. No SECURITY DEFINER. A single DELETE ... RETURNING consumes
-- state under a row lock: parallel callbacks/serverless instances cannot both win.
create function public.consume_amazon_spapi_state(p_state text, p_browser text, p_phase text)
returns setof public.amazon_spapi_oauth_states
language sql security invoker set search_path = '' as $$
  delete from public.amazon_spapi_oauth_states
  where browser_hash = p_browser and phase = p_phase
    and (state_hash = p_state or (p_phase = 'start' and p_state = ''))
    and expires_at > statement_timestamp()
  returning *;
$$;
revoke all on function public.consume_amazon_spapi_state(text, text, text) from public, anon, authenticated;
grant execute on function public.consume_amazon_spapi_state(text, text, text) to service_role;
commit;
-- Maintenance (separate scheduled server/admin task, not called by frontend):
-- delete from public.amazon_spapi_oauth_states where expires_at <= now();
