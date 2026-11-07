import { authorizeAmazonSearch, AmazonAccessError, readLimitedJson } from './amazonAuthorization.js';
import { canonicalBookIsbn } from '../src/utils/isbn.js';
import { normalizeProductQuery, unavailableProductLookup, type ProductQuery, type ProductLookup, type CommercialParent, type CommercialChild } from '../shared/magazordProducts.js';

const BASE = 'https://livrariasul.painel.magazord.com.br/api';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
class LookupError extends Error { constructor(public code: string) { super(code); } }
const codeValue = (value: unknown): value is string => typeof value === 'string' && !!normalizeProductQuery('child', value) && value.trim() === value;
function parent(item: any): CommercialParent {
  if (!item || !codeValue(item.codigo) || typeof item.ativo !== 'boolean') throw new LookupError('invalid_response');
  return { code: item.codigo, name: typeof item.nome === 'string' ? item.nome.slice(0, 500) : null, active: item.ativo, children: [] };
}
function child(item: any, parentCode?: string): (CommercialChild & { parentCode: string; eans: string[] }) | null {
  if (!item || !codeValue(item.codigo) || typeof item.tipoRegistro !== 'string') throw new LookupError('invalid_response');
  if (item.tipoRegistro.toLocaleLowerCase('pt-BR') !== 'filho') return null;
  if (!codeValue(item.agrupador) || (parentCode && item.agrupador !== parentCode) || typeof item.ativo !== 'boolean'
    || (item.ean != null && typeof item.ean !== 'string') || (item.derivacaoEan != null && !Array.isArray(item.derivacaoEan))) throw new LookupError('invalid_relationship');
  const eans = [item.ean, ...(item.derivacaoEan || []).map((entry: any) => entry?.ean)].filter((ean): ean is string => typeof ean === 'string' && ean.length <= 20);
  return { code: item.codigo, parentCode: item.agrupador, name: typeof (item.nomeCompleto ?? item.nome) === 'string' ? (item.nomeCompleto ?? item.nome).slice(0, 500) : null,
    active: item.ativo, ean: item.ean ?? null, eans };
}
const publicChild = ({ code, name, active, ean }: CommercialChild): CommercialChild => ({ code, name, active, ean });

export function createProductLookup(options: { env?: NodeJS.ProcessEnv; fetcher?: typeof fetch; timeoutMs?: number } = {}) {
  const env = options.env || process.env, fetcher = options.fetcher || fetch;
  return async (query: ProductQuery): Promise<ProductLookup> => {
    if (env.MAGAZORD_BASE_URL?.replace(/\/$/, '') !== BASE || !env.MAGAZORD_API_USER || !env.MAGAZORD_API_PASSWORD)
      return unavailableProductLookup(query, 'not_configured');
    const signal = AbortSignal.timeout(options.timeoutMs ?? 15_000);
    let calls = 0, truncated = false;
    async function get(path: string, params?: Record<string, string>, allowMissing = false): Promise<any> {
      if (++calls > 8) throw new LookupError('query_limit');
      const url = new URL(BASE + path);
      if (params) url.search = new URLSearchParams(params).toString();
      const response = await fetcher(url, { method: 'GET', signal, redirect: 'error', cache: 'no-store', credentials: 'omit',
        headers: { Accept: 'application/json', Authorization: 'Basic ' + Buffer.from(`${env.MAGAZORD_API_USER}:${env.MAGAZORD_API_PASSWORD}`).toString('base64') } });
      if (allowMissing && response.status === 404) { void response.body?.cancel(); return null; }
      if (!response.ok) { void response.body?.cancel(); throw new LookupError('upstream_http'); }
      if (!/^application\/json(?:;|$)/i.test(response.headers.get('content-type') || '')) { void response.body?.cancel(); throw new LookupError('invalid_response'); }
      const body = await readLimitedJson(response.body, 512 * 1024, signal);
      if (!body || body.status !== 'success' || body.data == null) throw new LookupError('invalid_response');
      return body.data;
    }
    async function page(path: string, params: Record<string, string>, limit: number) {
      const data = await get(path, { ...params, limit: String(limit), page: '1' });
      if (!Array.isArray(data.items) || data.items.length > limit || data.page !== 1 || data.limit !== limit
        || typeof data.has_more !== 'boolean' || !Number.isSafeInteger(data.total) || data.total < data.items.length
        || !Number.isSafeInteger(data.total_pages) || data.total_pages < 0 || (data.has_more && !data.items.length)
        || (!data.has_more && data.total !== data.items.length)) throw new LookupError('invalid_response');
      truncated ||= data.has_more;
      return data.items as any[];
    }
    async function readParent(code: string, allowMissing = false) {
      const data = await get('/v2/site/produto/' + encodeURIComponent(code), undefined, allowMissing);
      if (data === null) return null;
      const result = parent(data);
      if (result.code !== code) throw new LookupError('invalid_relationship');
      return result;
    }
    async function readChildren(code: string) {
      const data = await get('/v2/site/produto/' + encodeURIComponent(code) + '/derivacao');
      if (!Array.isArray(data) || data.length > 200) throw new LookupError('query_limit');
      const children = data.map(item => child(item, code)).filter((item): item is NonNullable<typeof item> => !!item);
      if (new Set(children.map(item => item.code)).size !== children.length) throw new LookupError('invalid_relationship');
      return children;
    }
    try {
      const parents: CommercialParent[] = [];
      if (query.kind === 'child') {
        const matches = (await page('/v2/site/produtoDerivacoes', { codigo: query.value }, 20))
          .filter(item => item?.codigo === query.value).map(item => child(item)).filter((item): item is NonNullable<typeof item> => !!item);
        if (matches.length > 1) throw new LookupError('invalid_relationship');
        if (matches[0]) {
          const p = await readParent(matches[0].parentCode);
          if (!p) throw new LookupError('invalid_relationship');
          p.children = [publicChild(matches[0])]; parents.push(p);
        }
      } else if (query.kind === 'parent') {
        const p = await readParent(query.value, true);
        if (p) { p.children = (await readChildren(p.code)).map(publicChild); parents.push(p); }
      } else {
        const candidates = (await page('/v2/site/produto', { ean: query.value, order: 'id', orderDirection: 'asc' }, 5)).map(parent);
        if (new Set(candidates.map(item => item.code)).size !== candidates.length) throw new LookupError('invalid_relationship');
        for (const p of candidates) {
          p.children = (await readChildren(p.code)).filter(item => item.eans.some(ean => ean === query.value
            || (canonicalBookIsbn(query.value) && canonicalBookIsbn(ean) === canonicalBookIsbn(query.value)))).map(publicChild);
          if (!p.children.length) throw new LookupError('unverified_ean');
          parents.push(p);
        }
        // An EAN-filtered parent without a verifiable matching child is not proof of absence.
        if (candidates.length && !parents.length) throw new LookupError('unverified_ean');
      }
      if (!parents.length && truncated) throw new LookupError('query_limit');
      const count = parents.reduce((sum, p) => sum + p.children.length, 0);
      return { source: 'magazord', query, match: query.kind === 'ean' ? 'bibliographic' : 'commercial', parents, truncated,
        status: !parents.length ? 'not_found' : parents.length > 1 || count > 1 ? 'multiple' : 'found' };
    } catch (error) {
      return unavailableProductLookup(query, error instanceof LookupError ? error.code : signal.aborted ? 'timeout' : 'upstream_unavailable');
    }
  };
}

export function createMagazordProductsFunction(options: { env?: NodeJS.ProcessEnv; fetcher?: typeof fetch; timeoutMs?: number; now?: () => number } = {}) {
  const env = options.env || process.env, fetcher = options.fetcher || fetch, now = options.now || Date.now;
  const lookup = createProductLookup(options);
  const cache = new Map<string, { expires: number; result: Promise<ProductLookup> }>();
  return async (request: Request): Promise<Response> => {
    const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', ...(status === 405 ? { Allow: 'GET' } : {}) } });
    if (request.method !== 'GET') return reply({ code: 'method_not_allowed' }, 405);
    const url = new URL(request.url);
    const query = normalizeProductQuery(url.searchParams.get('kind') || '', url.searchParams.get('value') || '');
    if (url.pathname !== '/api/magazord/products' || !query || [...url.searchParams.keys()].some(key => !['kind', 'value'].includes(key))
      || url.searchParams.getAll('kind').length !== 1 || url.searchParams.getAll('value').length !== 1) return reply({ code: 'invalid_query' }, 400);
    if ((request.headers.get('origin') && request.headers.get('origin') !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') return reply(unavailableProductLookup(query, 'origin_denied'), 403);
    try {
      if (!request.headers.get('authorization')) return reply(unavailableProductLookup(query, 'unauthenticated'), 401);
      const store = request.headers.get('x-isbn-store-id') || '';
      if (!UUID.test(store)) return reply(unavailableProductLookup(query, 'store_required'), 403);
      if (!env.MAGAZORD_STORE_ID || !UUID.test(env.MAGAZORD_STORE_ID)) return reply(unavailableProductLookup(query, 'store_not_configured'), 503);
      if (store !== env.MAGAZORD_STORE_ID) return reply(unavailableProductLookup(query, 'store_access_denied'), 403);
      await authorizeAmazonSearch(request, env, fetcher);
      const key = JSON.stringify(query), cached = cache.get(key);
      if (cached && cached.expires > now()) { const result = await cached.result; return reply(result, result.status === 'unavailable' ? 503 : 200); }
      for (const [key, value] of cache) if (value.expires <= now()) cache.delete(key);
      if (cache.size >= 100) cache.delete(cache.keys().next().value!);
      const entry = { expires: now() + 30_000, result: lookup(query) };
      cache.set(key, entry);
      const result = await entry.result;
      if (result.status === 'unavailable') cache.delete(key);
      return reply(result, result.status === 'unavailable' ? 503 : 200);
    } catch (error) {
      const status = error instanceof AmazonAccessError ? error.status : 503;
      return reply(unavailableProductLookup(query, status === 401 ? 'unauthenticated' : status === 403 ? 'store_access_denied' : 'auth_unavailable'), status);
    }
  };
}
