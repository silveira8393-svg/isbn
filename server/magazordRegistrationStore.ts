import { readLimitedJson } from './amazonAuthorization.js';
import { serviceHeaders } from './spapi/supabaseHeaders.js';

export type Stage = 'prepared' | 'parent_started' | 'parent_confirmed' | 'child_started' | 'verified';
export interface RegistrationRecord {
  id: string; store_id: string; actor_id: string; parent_code: string; child_code: string; fingerprint: string; stage: Stage;
}
export interface RegistrationStore {
  reserve(record: RegistrationRecord): Promise<RegistrationRecord>;
  advance(record: RegistrationRecord, next: Stage): Promise<boolean>;
}
export class JournalError extends Error {}
export function createRegistrationStore(env: NodeJS.ProcessEnv, fetcher: typeof fetch): RegistrationStore {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const raw = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  let url: URL;
  try { url = new URL(raw!); } catch { throw new JournalError('journal_not_configured'); }
  if (!key || url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/')
    throw new JournalError('journal_not_configured');
  async function call(method: string, query: Record<string, string>, body?: unknown): Promise<any[]> {
    const target = new URL('/rest/v1/magazord_registration_jobs', url);
    target.search = new URLSearchParams(query).toString();
    const signal = AbortSignal.timeout(5000);
    const response = await fetcher(target, { method, signal, redirect: 'error', credentials: 'omit', cache: 'no-store',
      headers: { ...serviceHeaders(key!), Prefer: 'return=representation' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) { void response.body?.cancel(); throw new JournalError(response.status === 409 ? 'code_reserved' : 'journal_unavailable'); }
    const data = await readLimitedJson(response.body, 65536, signal);
    if (!Array.isArray(data)) throw new JournalError('journal_unavailable');
    return data;
  }
  return {
    async reserve(record) {
      const scope = { id: `eq.${record.id}`, store_id: `eq.${record.store_id}`, actor_id: `eq.${record.actor_id}`, select: '*' };
      const existing = await call('GET', scope);
      if (existing.length === 1) return existing[0];
      try { const rows = await call('POST', {}, record); if (rows.length === 1) return rows[0]; }
      catch (error) {
        // Concurrent same-key request may have reserved the row first.
        if (error instanceof JournalError && error.message === 'code_reserved') {
          const rows = await call('GET', scope); if (rows.length === 1) return rows[0];
        }
        throw error;
      }
      throw new JournalError('journal_unavailable');
    },
    async advance(record, next) {
      const rows = await call('PATCH', { id: `eq.${record.id}`, store_id: `eq.${record.store_id}`,
        actor_id: `eq.${record.actor_id}`, stage: `eq.${record.stage}`, fingerprint: `eq.${record.fingerprint}` }, { stage: next });
      return rows.length === 1;
    },
  };
}
