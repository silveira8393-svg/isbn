import { readLimitedJson } from './amazonAuthorization.js';
import { serviceHeaders } from './spapi/supabaseHeaders.js';
import { priceFail } from '../shared/magazordPrice.js';
import type { PriceJob, PriceStore } from './magazordPriceOperation.js';

export function priceDatabase(env: NodeJS.ProcessEnv, fetcher: typeof fetch = fetch) {
  let base: URL;
  try { base = new URL((env.SUPABASE_URL || env.VITE_SUPABASE_URL)!); } catch { return priceFail('price_persistence_not_configured', 503); }
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || base.protocol !== 'https:' || base.username || base.password || base.port || base.search || base.hash || base.pathname !== '/')
    return priceFail('price_persistence_not_configured', 503);
  return async (table: 'magazord_registration_jobs' | 'magazord_price_jobs', method: 'GET' | 'POST' | 'PATCH', query: Record<string, string>, body?: unknown): Promise<any[]> => {
    if (table === 'magazord_registration_jobs' && method !== 'GET') return priceFail('registration_write_forbidden', 403);
    const url = new URL('/rest/v1/' + table, base); url.search = new URLSearchParams(query).toString();
    const signal = AbortSignal.timeout(5000);
    const response = await fetcher(url, { method, redirect: 'error', credentials: 'omit', cache: 'no-store', signal,
      headers: { ...serviceHeaders(key), Prefer: 'return=representation' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) { void response.body?.cancel(); return priceFail(response.status === 409 ? 'price_reserved' : 'price_persistence_unavailable', response.status === 409 ? 409 : 503); }
    if (!/^application\/json(?:;|$)/i.test(response.headers.get('content-type') || '')) { void response.body?.cancel(); return priceFail('price_persistence_unavailable', 503); }
    const rows = await readLimitedJson(response.body, 65536, signal);
    if (!Array.isArray(rows)) return priceFail('price_persistence_unavailable', 503);
    return rows;
  };
}

/** Independent journal adapter; preview never reserves or advances an operation. */
export function createPriceStore(env: NodeJS.ProcessEnv, fetcher: typeof fetch = fetch): PriceStore {
  const call = priceDatabase(env, fetcher);
  return {
    async reserve(job) {
      const scope = { id: `eq.${job.id}`, store_id: `eq.${job.store_id}`, actor_id: `eq.${job.actor_id}`, select: '*' };
      let rows = await call('magazord_price_jobs', 'GET', scope);
      if (rows.length === 1) return rows[0] as PriceJob;
      try { rows = await call('magazord_price_jobs', 'POST', {}, job); }
      catch (error) {
        // Same operation may have won a concurrent insert. Never release a tuple reservation.
        rows = await call('magazord_price_jobs', 'GET', scope);
        if (rows.length !== 1) throw error;
      }
      if (rows.length !== 1) return priceFail('price_persistence_unavailable', 503);
      return rows[0] as PriceJob;
    },
    async advance(job, next) {
      const rows = await call('magazord_price_jobs', 'PATCH', { id: `eq.${job.id}`, store_id: `eq.${job.store_id}`,
        actor_id: `eq.${job.actor_id}`, fingerprint: `eq.${job.fingerprint}`, stage: `eq.${job.stage}` }, { stage: next });
      return rows.length === 1;
    },
  };
}
