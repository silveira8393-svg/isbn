import { canonicalBookIsbn } from '../src/utils/isbn.js';
import { mapGoogleBooksResponse, type GoogleBooksResult } from '../shared/googleBooks.js';

export const GOOGLE_BOOKS_TIMEOUT_MS = 4000;
const MAX_RESPONSE_BYTES = 1024 * 1024;
export function createGoogleBooksFunction(options: { fetcher?: typeof fetch; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}) {
  const fetcher = options.fetcher || fetch, env = options.env || process.env;
  return async (request: Request): Promise<Response> => {
    const started = performance.now();
    const reply = (result: GoogleBooksResult, status = 200) => Response.json({ ...result,
      diagnostic: { ...result.diagnostic, durationMs: Math.round(performance.now() - started) } },
      { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', ...(status === 405 ? { Allow: 'GET' } : {}) } });
    const fail = (code: string, httpStatus?: number) => reply({ status: 'unavailable', book: null, diagnostic: { code, httpStatus } });
    const url = new URL(request.url);
    if (request.method !== 'GET') return reply({ status: 'invalid_query', book: null, diagnostic: { code: 'method_not_allowed' } }, 405);
    if (url.pathname !== '/api/google-books' || [...url.searchParams.keys()].some(k => k !== 'isbn')
      || url.searchParams.getAll('isbn').length !== 1 || (url.searchParams.get('isbn') || '').length > 40) {
      return reply({ status: 'invalid_query', book: null, diagnostic: { code: 'invalid_query' } }, 400);
    }
    const isbn = canonicalBookIsbn(url.searchParams.get('isbn') || '');
    if (!isbn) return reply({ status: 'invalid_query', book: null, diagnostic: { code: 'invalid_isbn' } }, 422);
    if ((request.headers.get('origin') && request.headers.get('origin') !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
      return reply({ status: 'invalid_query', book: null, diagnostic: { code: 'origin_denied' } }, 403);
    }
    const key = env.GOOGLE_BOOKS_API_KEY?.trim();
    if (!key) return fail('not_configured');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? GOOGLE_BOOKS_TIMEOUT_MS);
    const abort = () => controller.abort();
    request.signal.addEventListener('abort', abort, { once: true });
    if (request.signal.aborted) controller.abort();
    try {
      const endpoint = new URL('https://www.googleapis.com/books/v1/volumes');
      endpoint.searchParams.set('q', `isbn:${isbn}`); endpoint.searchParams.set('maxResults', '10');
      endpoint.searchParams.set('printType', 'books'); endpoint.searchParams.set('key', key);
      // Fixed official host, no user credentials, redirects, pagination or retries.
      const response = await fetcher(endpoint, { method: 'GET', headers: { Accept: 'application/json' },
        signal: controller.signal, redirect: 'error', credentials: 'omit', cache: 'no-store' });
      if (!response.ok) { await response.body?.cancel(); return fail('upstream_http', response.status); }
      if (!/^application\/json(?:;|$)/i.test(response.headers.get('content-type') || '')) {
        await response.body?.cancel(); return fail('invalid_response', response.status);
      }
      const reader = response.body?.getReader();
      if (!reader) return fail('invalid_response', response.status);
      const chunks: Uint8Array[] = []; let length = 0;
      try {
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          length += value.length;
          if (length > MAX_RESPONSE_BYTES) { await reader.cancel(); return fail('response_limit', response.status); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const bytes = new Uint8Array(length); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      const result = mapGoogleBooksResponse(JSON.parse(new TextDecoder().decode(bytes)), isbn);
      return reply({ ...result, diagnostic: { ...result.diagnostic, httpStatus: response.status } });
    } catch { return fail(controller.signal.aborted ? 'aborted_or_timeout' : 'transport_or_response'); }
    finally { clearTimeout(timer); request.signal.removeEventListener('abort', abort); }
  };
}
