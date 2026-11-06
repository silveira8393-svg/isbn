import { canonicalBookIsbn } from '../src/utils/isbn.js';
import { validSourceLink } from '../src/utils/bookSourceLinks.js';
import type { BookSourceLink } from '../src/types.js';

/** Read the returned link, never build a product slug or import catalog bibliography. */
export function selectCuritibaProductLink(data: unknown, product: string, isbn: string): BookSourceLink | null {
  const expected = canonicalBookIsbn(isbn);
  if (!expected || !/^LV[0-9]{1,10}$/.test(product) || !Array.isArray(data)) return null;
  const matches = data.filter(item => item && item.productReference === product && Array.isArray(item.items)
    && item.items.some((sku: { ean?: string; referenceId?: { Key: string; Value: string }[] }) => typeof sku.ean === 'string'
      && canonicalBookIsbn(sku.ean) === expected && Array.isArray(sku.referenceId)
      && sku.referenceId.some(ref => ref?.Key === 'RefId' && ref.Value === product)));
  if (matches.length !== 1 || typeof matches[0].link !== 'string') return null;
  const link: BookSourceLink = { source: 'curitiba', kind: 'info', isbn: expected, url: matches[0].link };
  return validSourceLink(link, expected) && new URL(link.url).hostname === 'www.livrariascuritiba.com.br' ? link : null;
}

export function createCuritibaProductLinkFunction(options: { fetcher?: typeof fetch; timeoutMs?: number } = {}) {
  const fetcher = options.fetcher || fetch;
  return async (request: Request): Promise<Response> => {
    const reply = (status: string, link: BookSourceLink | null = null, http = 200) => Response.json({ status, link },
      { status: http, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
    const url = new URL(request.url), product = url.searchParams.get('product') || '', isbn = canonicalBookIsbn(url.searchParams.get('isbn') || '');
    if (request.method !== 'GET' || url.pathname !== '/api/curitiba/product-link' || !isbn || !/^LV[0-9]{1,10}$/.test(product)
      || [...url.searchParams.keys()].some(key => !['product', 'isbn'].includes(key))
      || ['product', 'isbn'].some(key => url.searchParams.getAll(key).length !== 1)) return reply('invalid_query', null, 400);
    if ((request.headers.get('origin') && request.headers.get('origin') !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') return reply('origin_denied', null, 403);
    const timeout = AbortSignal.timeout(options.timeoutMs ?? 3500), signal = AbortSignal.any([request.signal, timeout]);
    try {
      const endpoint = new URL('https://www.livrariascuritiba.com.br/api/catalog_system/pub/products/search');
      endpoint.searchParams.set('fq', 'alternateIds_RefId:' + product);
      endpoint.searchParams.set('_from', '0'); endpoint.searchParams.set('_to', '1');
      const response = await fetcher(endpoint, { method: 'GET', headers: { Accept: 'application/json' },
        credentials: 'omit', redirect: 'error', cache: 'no-store', signal });
      if (!response.ok || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') || '')) {
        await response.body?.cancel(); return reply('unavailable');
      }
      const reader = response.body?.getReader(); if (!reader) return reply('unavailable');
      const chunks: Uint8Array[] = []; let size = 0;
      try { while (true) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.length; if (size > 256 * 1024) { await reader.cancel(); return reply('unavailable'); }
        chunks.push(value);
      } } finally { reader.releaseLock(); }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      const link = selectCuritibaProductLink(JSON.parse(new TextDecoder().decode(bytes)), product, isbn);
      return reply(link ? 'success' : 'not_found', link);
    } catch { return reply('unavailable'); }
  };
}
