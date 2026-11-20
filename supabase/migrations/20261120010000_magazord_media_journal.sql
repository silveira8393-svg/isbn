-- Etapa 6: journal por imagem para cadastros de homologação, sem executar chamadas Magazord.
-- Guardas para garantir que imagens pertençam a Pai/Filho comprovados e prevenir repetição incerta.
begin;
create table public.magazord_media_jobs (
  id uuid primary key,
  registration_id uuid not null references public.magazord_registration_jobs(id),
  store_id uuid not null,
  actor_id uuid not null,
  environment text not null default 'homologation' check (environment = 'homologation'),
  parent_code text not null check (length(parent_code) between 1 and 25),
  child_code text not null check (length(child_code) between 1 and 25),
  image_position smallint not null check (image_position between 0 and 19),
  image_reference text not null check (length(image_reference) between 1 and 2048),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  stage text not null default 'prepared' check (stage in ('prepared','upload_started','uploaded','link_started','linked')),
  media_id bigint check (media_id > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (registration_id,image_position),
  unique (registration_id,fingerprint),
  check (lower(parent_code) <> lower(child_code)),
  check ((stage in ('prepared','upload_started') and media_id is null) or
         (stage in ('uploaded','link_started','linked') and media_id is not null))
);
create index magazord_media_jobs_registration on public.magazord_media_jobs(registration_id,store_id,actor_id);
alter table public.magazord_media_jobs enable row level security;
revoke all on public.magazord_media_jobs from public, anon, authenticated;
grant select,insert,update on public.magazord_media_jobs to service_role;

create function public.magazord_guard_media_insert() returns trigger
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare registration public.magazord_registration_jobs%rowtype;
begin
  if new.stage <> 'prepared' or new.media_id is not null then
    raise check_violation using message = 'invalid_media_initial_state';
  end if;
  select * into registration from public.magazord_registration_jobs where id = new.registration_id for share;
  if not found or registration.stage <> 'verified' or registration.store_id <> new.store_id
    or registration.actor_id <> new.actor_id or registration.parent_code <> new.parent_code
    or registration.child_code <> new.child_code then
    raise check_violation using message = 'media_registration_not_verified';
  end if;
  return new;
end;
$$;
create trigger magazord_guard_media_insert before insert on public.magazord_media_jobs
for each row execute function public.magazord_guard_media_insert();

create function public.magazord_guard_media_progress() returns trigger
language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  if (to_jsonb(new) - 'stage' - 'media_id' - 'updated_at') <>
     (to_jsonb(old) - 'stage' - 'media_id' - 'updated_at')
     or not (
        (old.stage = 'prepared' and new.stage = 'upload_started' and new.media_id is null)
        or (old.stage = 'upload_started' and new.stage = 'uploaded' and new.media_id is not null and new.media_id > 0)
        or (old.stage = 'uploaded' and new.stage = 'link_started' and new.media_id = old.media_id)
        or (old.stage = 'link_started' and new.stage = 'linked' and new.media_id = old.media_id)
     ) then raise check_violation using message = 'invalid_media_transition'; end if;
  new.updated_at = now();
  return new;
end;
$$;
create trigger magazord_guard_media_progress before update on public.magazord_media_jobs
for each row execute function public.magazord_guard_media_progress();

revoke all on function public.magazord_guard_media_insert(), public.magazord_guard_media_progress() from public,anon,authenticated;
grant execute on function public.magazord_guard_media_insert(), public.magazord_guard_media_progress() to service_role;
commit;
