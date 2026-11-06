import { buildCategoryTree, type CategoryCatalog, type MagazordCategory } from '../shared/magazordCategories.js';
import { readLimitedJson, authorizeAmazonSearch, AmazonAccessError } from './amazonAuthorization.js';

export class CategoryError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
const BASE = 'https://livrariasul.painel.magazord.com.br/api';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CACHE_MS = 5 * 60_000, REFRESH_INTERVAL_MS = 30_000;

export function createCategoryLoader(options: { env?: NodeJS.ProcessEnv; fetcher?: typeof fetch; now?: () => number; timeoutMs?: number } = {}) {
  const env = options.env || process.env, fetcher = options.fetcher || fetch, now = options.now || Date.now;
  let cached: CategoryCatalog | undefined, expires = 0, lastAttempt = -Infinity;
  let inFlight: Promise<CategoryCatalog> | undefined;
  async function load(): Promise<CategoryCatalog> {
    if (env.MAGAZORD_BASE_URL?.replace(/\/$/, '') !== BASE || !env.MAGAZORD_API_USER || !env.MAGAZORD_API_PASSWORD)
      throw new CategoryError(503, 'not_configured');
    const signal = AbortSignal.timeout(options.timeoutMs ?? 20_000);
    const categories: MagazordCategory[] = [];
    const ids = new Set<number>();
    let expectedTotal: number | undefined;
    try {
      for (let page = 1; page <= 100; page++) {
        const url = new URL(`${BASE}/v2/site/categoria`);
        url.search = new URLSearchParams({ limit: '100', page: String(page), order: 'id', orderDirection: 'asc' }).toString();
        const response = await fetcher(url, { method: 'GET', redirect: 'error', cache: 'no-store', credentials: 'omit', signal,
          headers: { Accept: 'application/json', Authorization: 'Basic ' + Buffer.from(`${env.MAGAZORD_API_USER}:${env.MAGAZORD_API_PASSWORD}`).toString('base64') } });
        if (!response.ok) { void response.body?.cancel(); throw new CategoryError(502, 'upstream_http'); }
        if (!/^application\/json(?:;|$)/i.test(response.headers.get('content-type') || '')) {
          void response.body?.cancel(); throw new CategoryError(502, 'invalid_response');
        }
        const data = (await readLimitedJson(response.body, 512 * 1024, signal))?.data;
        if (!data || !Array.isArray(data.items) || data.items.length > 100 || data.page !== page || data.limit !== 100
          || !Number.isSafeInteger(data.total) || data.total < 0 || data.total > 10_000
          || !Number.isSafeInteger(data.total_pages) || data.total_pages < 0 || data.total_pages > 100
          || typeof data.has_more !== 'boolean' || (expectedTotal !== undefined && expectedTotal !== data.total))
          throw new CategoryError(502, 'invalid_pagination');
        expectedTotal = data.total;
        for (const item of data.items) {
          if (!item || !Number.isSafeInteger(item.id) || item.id <= 0 || typeof item.nome !== 'string' || !item.nome.trim() || item.nome.length > 500
            || (item.pai !== null && (!Number.isSafeInteger(item.pai) || item.pai <= 0)) || ids.has(item.id))
            throw new CategoryError(502, 'invalid_category');
          ids.add(item.id); categories.push({ id: item.id, nome: item.nome, pai: item.pai });
        }
        if (!data.has_more) {
          if (categories.length !== expectedTotal || (expectedTotal > 0 && page !== data.total_pages)) throw new CategoryError(502, 'incomplete_categories');
          const tree = buildCategoryTree(categories);
          return { source: 'magazord', categories: tree.options, invalidCount: tree.invalidCount, fetchedAt: new Date(now()).toISOString() };
        }
        if (!data.items.length || page >= data.total_pages) throw new CategoryError(502, 'invalid_pagination');
      }
      throw new CategoryError(502, 'page_limit');
    } catch (error) {
      if (error instanceof CategoryError) throw error;
      throw new CategoryError(signal.aborted ? 504 : 502, signal.aborted ? 'timeout' : 'upstream_unavailable');
    }
  }
  return (refresh = false): Promise<CategoryCatalog> => {
    if (inFlight) return inFlight;
    if (cached && now() < expires && (!refresh || now() - lastAttempt < REFRESH_INTERVAL_MS)) return Promise.resolve(cached);
    if (now() - lastAttempt < REFRESH_INTERVAL_MS) return Promise.reject(new CategoryError(503, 'retry_later'));
    lastAttempt = now();
    inFlight = load().then(result => { cached = result; expires = now() + CACHE_MS; return result; }).finally(() => { inFlight = undefined; });
    return inFlight;
  };
}

export function createMagazordCategoriesFunction(options: { env?: NodeJS.ProcessEnv; fetcher?: typeof fetch; now?: () => number; timeoutMs?: number } = {}) {
  const env = options.env || process.env, fetcher = options.fetcher || fetch;
  const load = createCategoryLoader(options);
  return async (request: Request): Promise<Response> => {
    const reply = (body: unknown, status = 200) => Response.json(body, { status,
      headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', ...(status === 405 ? { Allow: 'GET' } : {}) } });
    if (request.method !== 'GET') return reply({ code: 'method_not_allowed' }, 405);
    const url = new URL(request.url);
    if (url.pathname !== '/api/magazord/categories' || [...url.searchParams.keys()].some(key => key !== 'refresh')
      || url.searchParams.getAll('refresh').length > 1 || (url.searchParams.has('refresh') && url.searchParams.get('refresh') !== '1'))
      return reply({ code: 'invalid_query' }, 400);
    if ((request.headers.get('origin') && request.headers.get('origin') !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site')
      return reply({ code: 'origin_denied' }, 403);
    try {
      if (!request.headers.get('authorization')) return reply({ code: 'unauthenticated' }, 401);
      const store = request.headers.get('x-isbn-store-id') || '';
      if (!UUID.test(store)) return reply({ code: 'store_required' }, 403);
      // This credential pair belongs to exactly one operational store, never any caller-selected tenant.
      if (!env.MAGAZORD_STORE_ID || !UUID.test(env.MAGAZORD_STORE_ID)) throw new CategoryError(503, 'store_not_configured');
      if (store !== env.MAGAZORD_STORE_ID) return reply({ code: 'store_access_denied' }, 403);
      await authorizeAmazonSearch(request, env, fetcher);
      return reply(await load(url.searchParams.get('refresh') === '1'));
    } catch (error) {
      if (error instanceof AmazonAccessError) return reply({ code: error.status === 401 ? 'unauthenticated' : error.status === 403 ? 'store_access_denied' : 'auth_unavailable' }, error.status);
      if (error instanceof CategoryError) return reply({ code: error.code }, error.status);
      return reply({ code: 'unavailable' }, 503);
    }
  };
}
