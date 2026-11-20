-- Diário independente para uma única entrada inicial de estoque por cadastro ISBN.
-- Aplicar em homologação após revisão; não executa movimentações na Magazord.
begin;
create table public.magazord_stock_jobs (
  id uuid primary key,
  registration_id uuid not null unique references public.magazord_registration_jobs(id),
  store_id uuid not null,
  actor_id uuid not null,
  environment text not null check (environment = 'homologation'),
  parent_code text not null check (length(parent_code) between 1 and 25),
  child_code text not null check (length(child_code) between 1 and 25),
  deposit_id integer not null check (deposit_id > 0),
  quantity integer not null check (quantity between 1 and 100000),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  stage text not null default 'prepared' check (stage in ('prepared','stock_started','stock_verified')),
  movement_id bigint,
  created_at timestamptz not null default now(),
  check (lower(parent_code) <> lower(child_code)),
  check (stage <> 'stock_verified' or movement_id is not null)
);
create unique index magazord_stock_jobs_child on public.magazord_stock_jobs(store_id, environment, lower(child_code));
alter table public.magazord_stock_jobs enable row level security;
revoke all on public.magazord_stock_jobs from public, anon, authenticated;
grant select, insert, update on public.magazord_stock_jobs to service_role;

create function public.magazord_guard_stock_insert() returns trigger language plpgsql security invoker
set search_path = pg_catalog, public as $$
declare registration public.magazord_registration_jobs%rowtype;
begin
  if new.stage <> 'prepared' or new.movement_id is not null then
    raise check_violation using message = 'invalid_stock_initial_state';
  end if;
  select * into registration from public.magazord_registration_jobs where id = new.registration_id for share;
  if not found or registration.stage <> 'verified' or registration.store_id <> new.store_id
    or registration.actor_id <> new.actor_id or registration.parent_code <> new.parent_code
    or registration.child_code <> new.child_code then
    raise check_violation using message = 'stock_registration_not_verified';
  end if;
  if not exists (select 1 from public.magazord_price_jobs p where p.registration_id = new.registration_id
    and p.store_id = new.store_id and p.actor_id = new.actor_id
    and p.parent_code = new.parent_code and p.child_code = new.child_code
    and p.stage = 'price_verified') then
    raise check_violation using message = 'stock_price_not_verified';
  end if;
  return new;
end;
$$;
create trigger magazord_guard_stock_insert before insert on public.magazord_stock_jobs
for each row execute function public.magazord_guard_stock_insert();

create function public.magazord_guard_stock_progress() returns trigger language plpgsql security invoker
set search_path = pg_catalog, public as $$
begin
  if (to_jsonb(new) - 'stage' - 'movement_id') <> (to_jsonb(old) - 'stage' - 'movement_id')
    or not (
      (old.stage = 'prepared' and new.stage = 'stock_started' and new.movement_id is null)
      or (old.stage = 'stock_started' and new.stage = 'stock_verified' and new.movement_id is not null and new.movement_id > 0)
    ) then raise check_violation using message = 'invalid_stock_transition'; end if;
  return new;
end;
$$;
create trigger magazord_guard_stock_progress before update on public.magazord_stock_jobs
for each row execute function public.magazord_guard_stock_progress();
revoke all on function public.magazord_guard_stock_insert(), public.magazord_guard_stock_progress() from public, anon, authenticated;
grant execute on function public.magazord_guard_stock_insert(), public.magazord_guard_stock_progress() to service_role;
commit;
