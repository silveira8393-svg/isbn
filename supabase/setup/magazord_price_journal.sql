-- Prepared migration source, validated in isolated PostgreSQL; NOT applied remotely.
-- Apply migrations/20261119161609_magazord_price_journal.sql only after separate authorization.
begin;
create table public.magazord_price_jobs (
  id uuid primary key,
  registration_id uuid not null references public.magazord_registration_jobs(id),
  store_id uuid not null,
  actor_id uuid not null,
  environment text not null check (environment = 'homologation'),
  parent_code text not null check (length(parent_code) between 1 and 25),
  child_code text not null check (length(child_code) between 1 and 25),
  channel_id bigint not null check (channel_id > 0 and channel_id <= 9007199254740991),
  table_id bigint not null check (table_id > 0 and table_id <= 9007199254740991),
  ad_scope text not null check (ad_scope = 'none'),
  cents bigint not null check (cents > 0 and cents <= 9007199254740991),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  stage text not null default 'prepared' check (stage in ('prepared','price_started','price_verified')),
  created_at timestamptz not null default now(),
  check (lower(parent_code) <> lower(child_code))
);
create index magazord_price_jobs_registration on public.magazord_price_jobs(registration_id);
create table public.magazord_price_reservations (
  store_id uuid not null,
  environment text not null check (environment = 'homologation'),
  child_code text not null,
  table_id bigint not null,
  ad_scope text not null check (ad_scope = 'none'),
  job_id uuid not null unique references public.magazord_price_jobs(id),
  primary key (store_id, environment, child_code, table_id, ad_scope)
);
alter table public.magazord_price_jobs enable row level security;
alter table public.magazord_price_reservations enable row level security;
revoke all on public.magazord_price_jobs, public.magazord_price_reservations from public, anon, authenticated;
grant select, insert, update on public.magazord_price_jobs to service_role;
grant select, insert on public.magazord_price_reservations to service_role;

create function public.magazord_reserve_price() returns trigger language plpgsql security invoker
set search_path = pg_catalog, public as $$
declare registration public.magazord_registration_jobs%rowtype;
begin
  if new.stage <> 'prepared' then raise check_violation using message = 'invalid_price_initial_stage'; end if;
  select * into registration from public.magazord_registration_jobs where id = new.registration_id for share;
  if not found or registration.stage <> 'verified' or registration.store_id <> new.store_id
    or registration.actor_id <> new.actor_id or registration.parent_code <> new.parent_code
    or registration.child_code <> new.child_code then
    raise check_violation using message = 'price_registration_not_verified';
  end if;
  -- Same transaction as the job INSERT. Reservations never auto-expire or get released.
  insert into public.magazord_price_reservations(store_id, environment, child_code, table_id, ad_scope, job_id)
    values (new.store_id, new.environment, lower(new.child_code), new.table_id, new.ad_scope, new.id);
  return new;
end;
$$;
create trigger magazord_reserve_price after insert on public.magazord_price_jobs
for each row execute function public.magazord_reserve_price();

create function public.magazord_guard_price_progress() returns trigger language plpgsql security invoker
set search_path = pg_catalog, public as $$
begin
  if (to_jsonb(new) - 'stage') <> (to_jsonb(old) - 'stage') or not (
    (old.stage = 'prepared' and new.stage = 'price_started') or
    (old.stage = 'price_started' and new.stage = 'price_verified')
  ) then raise check_violation using message = 'invalid_price_transition'; end if;
  return new;
end;
$$;
create trigger magazord_guard_price_progress before update on public.magazord_price_jobs
for each row execute function public.magazord_guard_price_progress();
revoke all on function public.magazord_reserve_price(), public.magazord_guard_price_progress() from public, anon, authenticated;
grant execute on function public.magazord_reserve_price(), public.magazord_guard_price_progress() to service_role;
commit;
