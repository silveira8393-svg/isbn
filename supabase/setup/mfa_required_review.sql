-- PREPARED ONLY. DO NOT RUN WITHOUT EXPLICIT AUTHORIZATION.
-- Target: existing ISBN project jcxdkrpmrfbrhzwbzhph. No additional environment is required/created.
-- Runbook/Storage/rollback: docs/MFA_TOTP.md and docs/MFA_STORAGE.md.
-- This transaction changes public objects ONLY. Storage must be completed separately via its Dashboard.
-- Publish the MFA frontend/APIs and both Edge Functions in the same approved maintenance window.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
set local search_path = pg_catalog, public;

-- The three RPC implementations stay untouched. Fail instead of overwriting/assuming changed semantics.
-- Fingerprints refer to the exact definitions inspected in the read-only audit (see mfa_rpc_baseline.json).
do $preflight$
declare
  item record;
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
      raise exception 'MFA preflight: RPC drift at %. Re-audit before applying.', item.signature;
    end if;
  end loop;

  select md5(regexp_replace(p.prosrc, '[[:space:]]', '', 'g')) into guard_body
    from pg_proc p where p.oid = to_regprocedure('public.infra_is_developer(uuid)')
      and p.prosecdef and p.provolatile = 's' and p.prorettype = 'boolean'::regtype
      and p.proowner = 'postgres'::regrole and p.proconfig = array['search_path=""'];
  if guard_body is null or guard_body not in ('b1a2dad1d8f95ff53556a34b257891ea', '7acd8dbb68dbac9383187229d688b8fc') then
    raise exception 'MFA preflight: infra_is_developer drift. Do not overwrite unrelated changes.';
  end if;
end;
$preflight$;

-- Keep original role/store/active checks and SECURITY DEFINER semantics; add MFA at the shared gate.
-- All three user-callable mutating RPCs and the five infrastructure read policies call this gate.
-- Service-only infra_claim_run/infra_finish_run do not call it and are deliberately unchanged.
create or replace function public.infra_is_developer(p_store_id uuid)
returns boolean language sql stable security definer set search_path to ''
AS $function$
  SELECT coalesce((select auth.jwt()->>'aal') = 'aal2', false)
    AND EXISTS (SELECT 1 FROM public.profiles p
      JOIN public.store_users su ON su.user_id=p.id
      JOIN public.stores s ON s.id=su.store_id
      WHERE p.id=auth.uid() AND p.active AND su.active AND s.active
        AND su.role::text='developer' AND s.id=p_store_id);
$function$;

-- Never drop or edit preexisting business policies. Reexecution only updates our marked policies.
-- Unknown name collisions, missing tables or disabled RLS abort the WHOLE transaction.
do $policies$
declare
  table_name text;
  relation regclass;
  existing record;
  marker constant text := 'isbn-mfa-totp:v1';
begin
  foreach table_name in array array[
    'profiles', 'stores', 'store_users', 'operations', 'store_settings', 'audit_logs',
    'infra_monitor_configs', 'infra_metric_limits', 'infra_metric_snapshots',
    'infra_sync_runs', 'infra_config_audit'
  ] loop
    relation := to_regclass(format('public.%I', table_name));
    if relation is null or not exists (select 1 from pg_class c where c.oid=relation and c.relrowsecurity) then
      raise exception 'MFA preflight: %.% missing or RLS disabled.', 'public', table_name;
    end if;
    select p.*, obj_description(p.oid, 'pg_policy') as marker into existing
      from pg_policy p where p.polrelid=relation and p.polname='isbn_require_mfa';
    if found then
      if existing.marker is distinct from marker or existing.polpermissive or existing.polcmd <> '*' then
        raise exception 'MFA policy collision at %. Do not overwrite an unrecognized policy.', relation;
      end if;
      execute format('alter policy isbn_require_mfa on %s to anon, authenticated using ((select auth.jwt()->>''aal'') = ''aal2'') with check ((select auth.jwt()->>''aal'') = ''aal2'')', relation);
    else
      execute format('create policy isbn_require_mfa on %s as restrictive for all to anon, authenticated using ((select auth.jwt()->>''aal'') = ''aal2'') with check ((select auth.jwt()->>''aal'') = ''aal2'')', relation);
      execute format('comment on policy isbn_require_mfa on %s is %L', relation, marker);
    end if;
  end loop;
end;
$policies$;

-- Do NOT add storage.objects DDL here: the audited SQL role does not own that managed table.
-- Dashboard: edit isbn_registration_images_read and isbn_registration_images_insert to AND aal2
-- with EACH entire existing predicate. Do not add a permissive MFA-only policy (it would broaden access).
-- See docs/MFA_STORAGE.md for exact expressions, supported workflow and read-only verification.
commit;
