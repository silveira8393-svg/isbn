-- LOCAL PREPARATION ONLY. Apply separately after approval, before enabling real registration.
-- Durable intent + cross-namespace code reservations; no changes to existing tables/policies.
begin;
create table public.magazord_registration_jobs (
  id uuid primary key,
  store_id uuid not null,
  actor_id uuid not null,
  parent_code text not null check (length(parent_code) between 1 and 25),
  child_code text not null check (length(child_code) between 1 and 25),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  stage text not null default 'prepared' check (stage in ('prepared','parent_started','parent_confirmed','child_started','verified')),
  created_at timestamptz not null default now(),
  check (lower(parent_code) <> lower(child_code))
);
create table public.magazord_registration_codes (
  store_id uuid not null,
  code text not null,
  job_id uuid not null references public.magazord_registration_jobs(id),
  primary key (store_id, code)
);
alter table public.magazord_registration_jobs enable row level security;
alter table public.magazord_registration_codes enable row level security;
revoke all on public.magazord_registration_jobs, public.magazord_registration_codes from public, anon, authenticated;
grant select, insert, update on public.magazord_registration_jobs to service_role;
grant select, insert on public.magazord_registration_codes to service_role;

create function public.magazord_reserve_codes() returns trigger language plpgsql security invoker
set search_path = pg_catalog, public as $$
begin
  if new.stage <> 'prepared' then raise check_violation using message = 'invalid_initial_stage'; end if;
  -- The job and BOTH reservations commit atomically. PK handles concurrent/cross-role codes.
  insert into public.magazord_registration_codes(store_id, code, job_id)
    values (new.store_id, lower(new.parent_code), new.id), (new.store_id, lower(new.child_code), new.id);
  return new;
end;
$$;
create trigger magazord_reserve_codes after insert on public.magazord_registration_jobs
for each row execute function public.magazord_reserve_codes();

create function public.magazord_guard_progress() returns trigger language plpgsql security invoker
set search_path = pg_catalog, public as $$
begin
  if (to_jsonb(new) - 'stage') <> (to_jsonb(old) - 'stage') or not (
    (old.stage = 'prepared' and new.stage = 'parent_started') or
    (old.stage = 'parent_started' and new.stage = 'parent_confirmed') or
    (old.stage = 'parent_confirmed' and new.stage = 'child_started') or
    (old.stage = 'child_started' and new.stage = 'verified')
  ) then raise check_violation using message = 'invalid_operation_transition'; end if;
  return new;
end;
$$;
create trigger magazord_guard_progress before update on public.magazord_registration_jobs
for each row execute function public.magazord_guard_progress();
revoke all on function public.magazord_reserve_codes(), public.magazord_guard_progress() from public, anon, authenticated;
grant execute on function public.magazord_reserve_codes(), public.magazord_guard_progress() to service_role;
commit;
