import type { SupabaseClient } from '@supabase/supabase-js';
import type { InfrastructureConfig } from '../../../src/types/infrastructure.ts';
import { validateConfigDraft, validateLimits } from '../../../src/utils/infrastructure.ts';
import { collectConfiguration } from '../_shared/infrastructure/collector.ts';
import type { ProviderOptions } from '../_shared/infrastructure/providers.ts';
import { hasAal2ForUser } from '../_shared/mfa.ts';

interface Options extends ProviderOptions {
  allowedOrigins: readonly string[];
  userClient(token: string): SupabaseClient;
  adminClient(): SupabaseClient;
}
class RequestError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const requireResult = <T>(data: T, error: unknown): T => {
  if (error) {
    const code = (error as { code?: string }).code;
    throw new RequestError(code === '42501' ? 403 : code === '40001' ? 409 : 503,
      code === '42501' ? 'forbidden' : code === '40001' ? 'version_conflict' : 'module_unavailable');
  }
  return data;
};

async function boundedRequestText(request: Request): Promise<string> {
  if (!request.body) throw new RequestError(400, 'invalid_payload');
  const reader = request.body.getReader(); const decoder = new TextDecoder();
  let size = 0, text = '';
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > 32768) { await reader.cancel(); throw new RequestError(413, 'payload_too_large'); }
      text += decoder.decode(part.value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}

export function createInfrastructureHandler(options: Options) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('Origin');
    const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      Vary: 'Origin', 'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version' };
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
    if (origin && !options.allowedOrigins.includes(origin)) return json({ code: 'origin_forbidden' }, 403);
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return json({ code: 'method_not_allowed' }, 405);
    try {
      const token = request.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
      if (!token) throw new RequestError(401, 'unauthenticated');
      const client = options.userClient(token);
      const { data: identity, error: authError } = await client.auth.getUser(token);
      if (authError || !identity.user || !uuid(identity.user.id) || identity.user.is_anonymous) throw new RequestError(401, 'unauthenticated');
      if (!hasAal2ForUser(token, identity.user.id)) throw new RequestError(403, 'mfa_required');
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') ?? '')) throw new RequestError(400, 'invalid_payload');
      const text = await boundedRequestText(request);
      let payload: Record<string, unknown>;
      try { payload = JSON.parse(text); } catch { throw new RequestError(400, 'invalid_payload'); }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !uuid(payload.storeId)
        || !['read', 'initialize', 'save', 'test_connection', 'collect'].includes(String(payload.action))) throw new RequestError(400, 'invalid_payload');
      const keys = payload.action === 'save' ? ['action', 'storeId', 'configId', 'version', 'config', 'limits']
        : ['test_connection', 'collect'].includes(String(payload.action)) ? ['action', 'storeId', 'configId'] : ['action', 'storeId'];
      if (Object.keys(payload).length !== keys.length || keys.some(key => !Object.hasOwn(payload, key))) throw new RequestError(400, 'invalid_payload');
      const { data: allowed, error: permissionError } = await client.rpc('infra_is_developer', { p_store_id: payload.storeId });
      requireResult(allowed, permissionError);
      if (allowed !== true) throw new RequestError(403, 'forbidden');
      if (payload.action === 'initialize') {
        const result = await client.rpc('infra_initialize', { p_store_id: payload.storeId });
        requireResult(result.data, result.error);
      }
      if (payload.action === 'read' || payload.action === 'initialize') {
        const configs = await client.from('infra_monitor_configs').select('*').eq('store_id', payload.storeId).order('provider');
        const configRows = requireResult(configs.data, configs.error) ?? [];
        const configIds = configRows.map(row => row.id);
        // Bounded, deterministic pages. The UI identifies this window; history is not a cumulative counter.
        const queries = configIds.length ? await Promise.all([
          client.from('infra_metric_limits').select('*').in('config_id', configIds),
          client.from('infra_metric_snapshots').select('*').in('config_id', configIds).order('observed_at', { ascending: false }).order('id').limit(500),
          client.from('infra_sync_runs').select('*').in('config_id', configIds).order('started_at', { ascending: false }).order('id').limit(100),
        ]) : [];
        const [limits = [], snapshots = [], runs = []] = queries.map(result => requireResult(result.data, result.error) ?? []);
        const check = await client.rpc('infra_is_developer', { p_store_id: payload.storeId });
        if (requireResult(check.data, check.error) !== true) throw new RequestError(403, 'forbidden');
        return json({ configs: configRows, limits, snapshots, runs });
      }
      if (!uuid(payload.configId)) throw new RequestError(400, 'invalid_payload');
      const selected = await client.from('infra_monitor_configs').select('*').eq('store_id', payload.storeId).eq('id', payload.configId).maybeSingle();
      const config = requireResult(selected.data, selected.error) as InfrastructureConfig | null;
      if (!config) throw new RequestError(403, 'forbidden');
      if (payload.action === 'save') {
        let draft, limits;
        try { draft = validateConfigDraft(payload.config); limits = validateLimits(payload.limits); }
        catch { throw new RequestError(400, 'invalid_payload'); }
        if (!Number.isSafeInteger(payload.version) || Number(payload.version) < 1) throw new RequestError(400, 'invalid_payload');
        const result = await client.rpc('infra_save_config', { p_config_id: config.id, p_expected_version: payload.version, p_config: draft, p_limits: limits });
        return json({ config: requireResult(result.data, result.error) });
      }
      const authorized = await client.rpc('infra_authorize_action', { p_config_id: config.id, p_action: payload.action });
      requireResult(authorized.data, authorized.error);
      const result = await collectConfiguration(options.adminClient(), config, options, true);
      const check = await client.rpc('infra_is_developer', { p_store_id: payload.storeId });
      if (requireResult(check.data, check.error) !== true) throw new RequestError(403, 'forbidden');
      return json(result);
    } catch (error) {
      // Never log or serialize upstream exceptions, JWTs, request payloads or provider bodies.
      return error instanceof RequestError ? json({ code: error.code }, error.status) : json({ code: 'module_unavailable' }, 503);
    }
  };
}
