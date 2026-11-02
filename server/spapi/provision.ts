import { encrypt, limitedJson, UUID, SELLER } from './core.js';
import { serviceHeaders } from './supabaseHeaders.js';

type Code = 'supabase_project_mismatch' | 'own_account_confirmation_required' | 'invalid_configuration'
  | 'invalid_refresh_token' | 'invalid_service_key' | 'store_not_found' | 'authorization_exists_no_overwrite'
  | 'authorization_lookup_invalid' | 'supabase_request_failed' | 'supabase_response_invalid' | 'provisioning_timeout';
export class ProvisionError extends Error {
  constructor(public code: Code) { super(code); }
}
const stop = (code: Code): never => { throw new ProvisionError(code); };

function config(env: NodeJS.ProcessEnv) {
  const ref = env.ISBN_EXPECTED_SUPABASE_PROJECT_REF || '', raw = env.SUPABASE_URL || '';
  // Independent operator confirmation of the exact hosted project. No custom domains,
  // URL credentials, ports, whitespace, queries or paths, even if URL normalization hides them.
  if (!/^[a-z0-9]{20}$/.test(ref) || ![`https://${ref}.supabase.co`, `https://${ref}.supabase.co/`].includes(raw)) stop('supabase_project_mismatch');
  if (env.ISBN_CONFIRM_PRIVATE_OWN_ACCOUNT !== 'YES') stop('own_account_confirmation_required');
  const store = env.AMAZON_SPAPI_STORE_ID || '', seller = env.AMAZON_SPAPI_SELLER_ID || '';
  const key = env.AMAZON_SPAPI_TOKEN_KEY || '', token = env.AMAZON_SPAPI_REFRESH_TOKEN || '', service = env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!UUID.test(store) || !SELLER.test(seller) || !/^[a-f0-9]{64}$/i.test(key)) stop('invalid_configuration');
  if (!/^Atzr\|[\x21-\x7e]+$/.test(token) || token.length > 2048) stop('invalid_refresh_token');
  if (!/^sb_secret_[A-Za-z0-9_-]{16,512}$/.test(service)) {
    // This is a project/role guard, not local signature verification. Supabase authenticates the key.
    try {
      if (!/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(service) || service.length > 8192) stop('invalid_service_key');
      const claims = JSON.parse(Buffer.from(service.split('.')[1], 'base64url').toString());
      if (claims.role !== 'service_role' || claims.ref !== ref) stop('invalid_service_key');
    } catch { return stop('invalid_service_key'); }
  }
  return { origin: `https://${ref}.supabase.co`, store, seller, key, token, service };
}

// Operator-only utility, never imported by an HTTP route or frontend. No schema changes,
// Amazon calls, token verification/rotation, retries, UPDATE, PATCH, DELETE or upsert.
export async function provisionSelfAuthorization(env: NodeJS.ProcessEnv, fetcher: typeof fetch = fetch): Promise<void> {
  const value = config(env), signal = AbortSignal.timeout(10000), headers = serviceHeaders(value.service);
  const endpoint = `${value.origin}/rest/v1/amazon_spapi_authorizations`;
  async function call(url: string, init: RequestInit = {}) {
    const response = await fetcher(url, { ...init, headers: { ...headers, ...init.headers }, signal, redirect: 'error', cache: 'no-store', credentials: 'omit' });
    if (!response.ok) {
      void response.body?.cancel();
      if (init.method === 'POST' && response.status === 409) stop('authorization_exists_no_overwrite');
      stop('supabase_request_failed');
    }
    return response;
  }
  try {
    const storesUrl = `${value.origin}/rest/v1/stores?${new URLSearchParams({ id: `eq.${value.store}`, select: 'id', limit: '1' })}`;
    const stores = await limitedJson(await call(storesUrl), 4096, signal);
    if (!Array.isArray(stores) || stores.length !== 1 || stores[0]?.id !== value.store) stop('store_not_found');
    const query = new URLSearchParams({ store_id: `eq.${value.store}`, selling_partner_id: `eq.${value.seller}`, select: 'store_id,selling_partner_id', limit: '1' });
    const rows = await limitedJson(await call(`${endpoint}?${query}`), 4096, signal);
    if (!Array.isArray(rows) || rows.length > 1 || rows.some(row => row?.store_id !== value.store || row?.selling_partner_id !== value.seller)) stop('authorization_lookup_invalid');
    if (rows.length) stop('authorization_exists_no_overwrite');
    const payload = { store_id: value.store, selling_partner_id: value.seller,
      ...encrypt(value.token, value.key, `${value.store}:${value.seller}:v1`), updated_at: new Date().toISOString() };
    // Composite primary key is the concurrency guard. A prior SELECT alone is insufficient.
    // No on_conflict and no resolution=merge-duplicates: conflicts must fail, never overwrite.
    const response = await call(endpoint, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(payload) });
    void response.body?.cancel();
    if (response.status !== 201) stop('supabase_response_invalid');
  } catch (error) {
    if (error instanceof ProvisionError) throw error;
    stop(signal.aborted ? 'provisioning_timeout' : 'supabase_request_failed');
  }
}

export async function runProvisionCli({ env = process.env, argv = process.argv.slice(2), fetcher = fetch,
  out = (message: string) => console.log(message), err = (message: string) => console.error(message) } = {}) {
  if (argv.length) { err('Provisioning aborted: arguments_not_allowed'); return 1; }
  try {
    await provisionSelfAuthorization(env, fetcher);
    out('Encrypted private self-authorization provisioned to the confirmed ISBN project.');
    return 0;
  } catch (error) {
    err(`Provisioning aborted: ${error instanceof ProvisionError ? error.code : 'provisioning_failed'}`);
    return 1;
  }
}
