import { hasAal2ForUser } from '../supabase/functions/_shared/mfa.js';
import { readLimitedJson } from './amazonAuthorization.js';

/** HTTP boundary for the existing read-only source handlers. Does not change their payloads. */
export function withMfa(handler: (request: Request) => Promise<Response>, options: { env?: NodeJS.ProcessEnv; fetcher?: typeof fetch } = {}) {
  return async (request: Request): Promise<Response> => {
    const deny = (status: number, code: string) => Response.json({ code }, { status,
      headers: { 'Cache-Control': 'private, no-store', 'Vary': 'Authorization', 'X-Content-Type-Options': 'nosniff' } });
    const bearer = request.headers.get('authorization');
    if (!bearer || !/^Bearer [A-Za-z0-9._~-]{16,8192}$/.test(bearer)) return deny(401, 'unauthenticated');
    const env = options.env ?? process.env;
    const key = env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
    let base: URL;
    try {
      base = new URL(env.SUPABASE_URL || env.VITE_SUPABASE_URL || '');
      if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash || !key) throw new Error();
      if (!key.startsWith('sb_publishable_')) {
        if (!key.startsWith('eyJ') || JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role !== 'anon') throw new Error();
      }
    } catch { return deny(503, 'auth_configuration'); }
    try {
      const signal = AbortSignal.timeout(5000);
      const response = await (options.fetcher ?? fetch)(new URL('/auth/v1/user', base), {
        method: 'GET', headers: { apikey: key!, Authorization: bearer }, signal, redirect: 'error', credentials: 'omit', cache: 'no-store',
      });
      if (!response.ok) {
        void response.body?.cancel();
        return deny(response.status === 401 || response.status === 403 ? 401 : 503, 'authentication_failed');
      }
      const user = await readLimitedJson(response.body, 65536, signal);
      if (!user || typeof user.id !== 'string' || user.is_anonymous === true) return deny(401, 'unauthenticated');
      if (!hasAal2ForUser(bearer.slice(7), user.id)) return deny(403, 'mfa_required');
    } catch { return deny(503, 'auth_unavailable'); }
    const result = await handler(request);
    result.headers.set('Vary', 'Authorization');
    result.headers.set('Cache-Control', 'private, no-store');
    return result;
  };
}
