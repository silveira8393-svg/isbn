import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

export class SpapiError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
export const fail = (status: number, code: string): never => { throw new SpapiError(status, code); };
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const nonce = () => randomBytes(32).toString('base64url');
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SELLER = /^[A-Z0-9]{4,100}$/;
export const MARKETPLACE = 'A2Q3Y263D00KWC';
export const COOKIE = '__Host-isbn_spapi';
export const cookie = (value: string) => `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${value ? 600 : 0}`;
export function browserCookie(request: Request) {
  const values = (request.headers.get('cookie') || '').split(';').map(v => v.trim()).filter(v => v.startsWith(`${COOKIE}=`));
  const value = values[0]?.slice(COOKIE.length + 1);
  return values.length === 1 && /^[A-Za-z0-9_-]{43}$/.test(value || '') ? value! : fail(403, 'invalid_state');
}
export function configuration(env: NodeJS.ProcessEnv) {
  if (env.AMAZON_SPAPI_ENABLED !== 'true') fail(503, 'spapi_disabled');
  const origin = env.AMAZON_SPAPI_ORIGIN || 'https://isbn.silveiralab.com.br';
  let parsed: URL, supabase: URL;
  try { parsed = new URL(origin); supabase = new URL(env.SUPABASE_URL!); } catch { return fail(503, 'configuration'); }
  if (parsed.origin !== origin || parsed.protocol !== 'https:' || supabase.protocol !== 'https:'
    || supabase.username || supabase.password || supabase.search || supabase.hash || supabase.pathname !== '/') fail(503, 'configuration');
  const required = ['AMAZON_SPAPI_APP_ID', 'AMAZON_SPAPI_CLIENT_ID', 'AMAZON_SPAPI_CLIENT_SECRET', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_PUBLISHABLE_KEY'];
  let publicKey = env.SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_');
  if (env.SUPABASE_PUBLISHABLE_KEY?.startsWith('eyJ')) {
    try { publicKey = JSON.parse(Buffer.from(env.SUPABASE_PUBLISHABLE_KEY.split('.')[1], 'base64url').toString()).role === 'anon'; }
    catch { publicKey = false; }
  }
  if (required.some(k => !env[k]) || !/^amzn1\.(?:sellerapps\.app|sp\.solution)\.[A-Za-z0-9-]+$/.test(env.AMAZON_SPAPI_APP_ID!)
    || !/^[0-9a-f]{64}$/i.test(env.AMAZON_SPAPI_TOKEN_KEY || '') || !UUID.test(env.AMAZON_SPAPI_STORE_ID || '')
    || !SELLER.test(env.AMAZON_SPAPI_SELLER_ID || '') || !publicKey) fail(503, 'configuration');
  return { origin, redirect: `${origin}/api/amazon/oauth/callback`, supabase: supabase.origin,
    store: env.AMAZON_SPAPI_STORE_ID!, seller: env.AMAZON_SPAPI_SELLER_ID!, app: env.AMAZON_SPAPI_APP_ID!,
    client: env.AMAZON_SPAPI_CLIENT_ID!, secret: env.AMAZON_SPAPI_CLIENT_SECRET!, key: env.AMAZON_SPAPI_TOKEN_KEY!,
    service: env.SUPABASE_SERVICE_ROLE_KEY!, publishable: env.SUPABASE_PUBLISHABLE_KEY!, beta: env.AMAZON_SPAPI_DRAFT === 'true' };
}
export type Config = ReturnType<typeof configuration>;
export type Principal = { user_id: string; store_id: string };
export type Envelope = { ciphertext: string; iv: string; tag: string; key_version: number };
// AAD prevents swapping encrypted tokens between stores/sellers. Key v1 must remain available until re-encryption.
export function encrypt(token: string, key: string, context: string): Envelope {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  cipher.setAAD(Buffer.from(context));
  return { ciphertext: Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]).toString('base64'),
    iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), key_version: 1 };
}
export function decrypt(value: Envelope, key: string, context: string) {
  if (value.key_version !== 1) fail(503, 'token_key_version');
  try {
    const cipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), Buffer.from(value.iv, 'base64'));
    cipher.setAAD(Buffer.from(context)); cipher.setAuthTag(Buffer.from(value.tag, 'base64'));
    return Buffer.concat([cipher.update(Buffer.from(value.ciphertext, 'base64')), cipher.final()]).toString('utf8');
  } catch { return fail(503, 'token_decryption'); }
}
export async function limitedJson(response: Response, limit: number, signal: AbortSignal): Promise<any> {
  if (!response.body) return fail(502, 'invalid_response');
  const reader = response.body.getReader(); let size = 0; const chunks: Uint8Array[] = [];
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    if (signal.aborted) fail(504, 'upstream_timeout');
    while (true) {
      const result = await reader.read();
      if (signal.aborted) fail(504, 'upstream_timeout');
      if (result.done) break;
      size += result.value.length;
      if (size > limit) fail(502, 'response_limit');
      chunks.push(result.value);
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  } catch (error) { if (error instanceof SpapiError) throw error; return fail(502, 'invalid_response'); }
  finally { signal.removeEventListener('abort', abort); void reader.cancel().catch(() => {}); }
}
export async function jsonRequest(fetcher: typeof fetch, url: URL | string, init: RequestInit, limit = 1024 * 1024) {
  const signal = AbortSignal.timeout(8000);
  try {
    const response = await fetcher(url, { ...init, signal, redirect: 'error', cache: 'no-store', credentials: 'omit' });
    if (!response.ok) {
      void response.body?.cancel();
      if (response.status === 429) fail(429, 'upstream_rate_limited');
      if (response.status === 401 || response.status === 403) fail(502, 'upstream_authorization');
      fail(502, 'upstream_failure');
    }
    if (response.status === 204 || response.headers.get('content-length') === '0') return null;
    return await limitedJson(response, limit, signal);
  } catch (error) {
    if (error instanceof SpapiError) throw error;
    return fail(signal.aborted ? 504 : 502, signal.aborted ? 'upstream_timeout' : 'upstream_transport');
  }
}
