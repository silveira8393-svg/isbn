import { type Config, type Principal, type Envelope, fail, jsonRequest, limitedJson, UUID } from './core.js';
import { serviceHeaders } from './supabaseHeaders.js';

export type State = Principal & { state_hash: string; browser_hash: string; seller_id: string; phase: 'start' | 'callback'; expires_at: string };
export type Authorization = Envelope & { store_id: string; selling_partner_id: string };
export interface Store {
  issue(value: State): Promise<void>;
  consume(state: string, browser: string, phase: string): Promise<State | null>;
  save(value: Authorization): Promise<void>;
  token(store: string, seller: string): Promise<Authorization | null>;
  active(principal: Principal): Promise<void>;
}
export function createStore(config: Config, fetcher: typeof fetch): Store {
  const headers = serviceHeaders(config.service);
  const call = (path: string, init: RequestInit = {}) => jsonRequest(fetcher, `${config.supabase}/rest/v1/${path}`, { ...init, headers: { ...headers, ...init.headers } }, 65536);
  return {
    async issue(value) { await call('amazon_spapi_oauth_states', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(value) }); },
    async consume(state, browser, phase) {
      const rows = await call('rpc/consume_amazon_spapi_state', { method: 'POST', body: JSON.stringify({ p_state: state, p_browser: browser, p_phase: phase }) });
      return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
    },
    async save(value) { await call('amazon_spapi_authorizations?on_conflict=store_id,selling_partner_id', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify({ ...value, updated_at: new Date().toISOString() }) }); },
    async token(store, seller) {
      const query = new URLSearchParams({ store_id: `eq.${store}`, selling_partner_id: `eq.${seller}`, select: 'store_id,selling_partner_id,ciphertext,iv,tag,key_version', limit: '1' });
      const rows = await call(`amazon_spapi_authorizations?${query}`);
      return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
    },
    async active(principal) {
      if (!UUID.test(principal.user_id) || principal.store_id !== config.store) fail(403, 'developer_required');
      const profiles = await call(`profiles?${new URLSearchParams({ id: `eq.${principal.user_id}`, active: 'eq.true', select: 'id', limit: '1' })}`);
      const members = await call(`store_users?${new URLSearchParams({ user_id: `eq.${principal.user_id}`, store_id: `eq.${config.store}`, active: 'eq.true', role: 'eq.developer', select: 'user_id', limit: '1' })}`);
      if (!Array.isArray(profiles) || profiles.length !== 1 || !Array.isArray(members) || members.length !== 1) fail(403, 'developer_required');
    },
  };
}
export async function authorize(request: Request, config: Config, store: Store, fetcher: typeof fetch): Promise<Principal> {
  const bearer = request.headers.get('authorization');
  if (!bearer || !/^Bearer [A-Za-z0-9._~-]{16,8192}$/.test(bearer)) return fail(401, 'unauthenticated');
  // Auth validates the JWT; no trust in client role headers or user_metadata.
  const response = await fetcher(`${config.supabase}/auth/v1/user`, { headers: { apikey: config.publishable, Authorization: bearer },
    signal: AbortSignal.timeout(5000), redirect: 'error', cache: 'no-store', credentials: 'omit' });
  if (!response.ok) { void response.body?.cancel(); return fail(response.status === 401 || response.status === 403 ? 401 : 503, 'authentication_failed'); }
  const user = await limitedJson(response, 65536, AbortSignal.timeout(5000));
  if (!UUID.test(user?.id) || user.is_anonymous === true) return fail(403, 'developer_required');
  const principal = { user_id: user.id, store_id: config.store };
  await store.active(principal);
  return principal;
}
