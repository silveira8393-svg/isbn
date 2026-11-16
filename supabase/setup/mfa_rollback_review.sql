-- PREPARED ONLY. Emergency rollback requires EXPLICIT AUTHORIZATION and closed application/API access.
-- This removes MFA enforcement; never silently roll back to password-only access in a live application.
-- Restore Storage via Dashboard separately using the exported original predicates (docs/MFA_STORAGE.md).
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
set local search_path = pg_catalog, public;

do $rollback$
declare
  item record;
  table_name text;
  relation regclass;
  existing record;
  guard_body text;
begin
  for item in select * from (values
    ('public.infra_initialize(uuid)', '63a3115729f3a4862d4be87c7fb739a8'),
    ('public.infra_save_config(uuid,integer,jsonb,jsonb)', '27e601251461588bf595281192dc6a76'),
    ('public.infra_authorize_action(uuid,text)', 'c4dfa789384ff51b358557c6da366fb7')
  ) as expected(signature, fingerprint)
  loop
    if to_regprocedure(item.signature) is null or
       md5(pg_get_functiondef(to_regprocedure(item.signature))) is distinct from item.fingerprint then
      raise exception 'MFA rollback: RPC drift at %. Re-audit before reverting.', item.signature;
    end if;
  end loop;
  select md5(regexp_replace(p.prosrc, '[[:space:]]', '', 'g')) into guard_body
    from pg_proc p where p.oid=to_regprocedure('public.infra_is_developer(uuid)')
      and p.prosecdef and p.provolatile='s' and p.prorettype='boolean'::regtype
      and p.proowner='postgres'::regrole and p.proconfig=array['search_path=""'];
  if guard_body is null or guard_body not in ('b1a2dad1d8f95ff53556a34b257891ea', '7acd8dbb68dbac9383187229d688b8fc') then
    raise exception 'MFA rollback: helper drift. Do not overwrite unrelated changes.';
  end if;
  foreach table_name in array array[
    'profiles', 'stores', 'store_users', 'operations', 'store_settings', 'audit_logs',
    'infra_monitor_configs', 'infra_metric_limits', 'infra_metric_snapshots',
    'infra_sync_runs', 'infra_config_audit'
  ] loop
    relation := to_regclass(format('public.%I', table_name));
    if relation is null then raise exception 'MFA rollback: missing table %.', table_name; end if;
    select p.*, obj_description(p.oid, 'pg_policy') as marker into existing
      from pg_policy p where p.polrelid=relation and p.polname='isbn_require_mfa';
    if found then
      if existing.marker is distinct from 'isbn-mfa-totp:v1' or existing.polpermissive or existing.polcmd <> '*' then
        raise exception 'MFA rollback: unrecognized policy at %.', relation;
      end if;
      execute format('drop policy isbn_require_mfa on %s', relation);
    end if;
  end loop;
end;
$rollback$;

-- Audited original body. CREATE OR REPLACE retains the function's owner, signature and ACL.
create or replace function public.infra_is_developer(p_store_id uuid)
returns boolean language sql stable security definer set search_path to ''
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.profiles p
    JOIN public.store_users su ON su.user_id=p.id
    JOIN public.stores s ON s.id=su.store_id
    WHERE p.id=auth.uid() AND p.active AND su.active AND s.active
      AND su.role::text='developer' AND s.id=p_store_id);
$function$;
commit;
