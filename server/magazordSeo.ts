import { authorizeAmazonSearch, AmazonAccessError, readLimitedJson } from './amazonAuthorization.js';
import { resolveMagazordBaseUrl } from './magazordBaseUrl.js';

const HOMOLOGATION = 'https://homologacaosilveiralab.painel.magazord.com.br/api';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SKU = /^[\p{L}\p{N}][\p{L}\p{N}._ -]{0,24}$/u;

/**
 * Deliberately READ ONLY. A page-list filter is useful for discovery, but does
 * not by itself prove that an arbitrary page ID is safe to update.
 * No PATCH, POST or mutation is allowed toward Magazord in this handler.
 */
export function createMagazordSeoLookup(options: { env?: NodeJS.ProcessEnv; fetcher?: typeof fetch } = {}) {
  const env = options.env || process.env, fetcher = options.fetcher || fetch;
  const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: {
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', ...(status === 405 ? { Allow: 'POST' } : {}),
  } });
  return async (request: Request): Promise<Response> => {
    try {
      if (request.method !== 'POST') return reply({ code: 'method_not_allowed' }, 405);
      const url = new URL(request.url);
      if (url.pathname !== '/api/magazord/price' || url.search !== '?seo=1') return reply({ code: 'invalid_request' }, 400);
      if ((request.headers.get('origin') && request.headers.get('origin') !== url.origin)
        || request.headers.get('sec-fetch-site') === 'cross-site') return reply({ code: 'origin_denied' }, 403);
      if (resolveMagazordBaseUrl(env.MAGAZORD_BASE_URL) !== HOMOLOGATION) return reply({ code: 'homologation_only' }, 403);
      const store = request.headers.get('x-isbn-store-id');
      if (!store || !UUID.test(store) || store !== env.MAGAZORD_STORE_ID) return reply({ code: 'store_access_denied' }, 403);
      await authorizeAmazonSearch(request, env, fetcher);
      if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) return reply({ code: 'json_required' }, 415);
      const input = await readLimitedJson(request.body, 2048, AbortSignal.timeout(5000));
      if (!input || typeof input !== 'object' || Array.isArray(input)
        || Object.keys(input).sort().join(',') !== 'action,childCode'
        || input.action !== 'lookup' || typeof input.childCode !== 'string'
        || !SKU.test(input.childCode) || input.childCode.trim() !== input.childCode) return reply({ code: 'invalid_request' }, 400);
      let channels: unknown;
      try { channels = JSON.parse(env.MAGAZORD_HOMOLOGATION_CHANNELS || ''); } catch { return reply({ code: 'channel_not_configured' }, 503); }
      if (!channels || typeof channels !== 'object' || Array.isArray(channels)) return reply({ code: 'channel_not_configured' }, 503);
      const channel = (channels as Record<string, unknown>)[store];
      if (!Number.isSafeInteger(channel) || Number(channel) <= 0) return reply({ code: 'channel_not_configured' }, 503);
      const endpoint = new URL(HOMOLOGATION + '/v2/site/paginas');
      endpoint.search = new URLSearchParams({ codigoDerivacao: input.childCode, id_loja: String(channel),
        limit: '100', page: '1' }).toString();
      const signal = AbortSignal.timeout(15000);
      const response = await fetcher(endpoint, { method: 'GET', redirect: 'error', credentials: 'omit', cache: 'no-store', signal,
        headers: { Accept: 'application/json', Authorization: 'Basic ' + Buffer.from(`${env.MAGAZORD_API_USER}:${env.MAGAZORD_API_PASSWORD}`).toString('base64') } });
      if (!response.ok) { void response.body?.cancel(); return reply({ code: 'remote_unavailable', remoteStatus: response.status }, 503); }
      if (!/^application\/json(?:;|$)/i.test(response.headers.get('content-type') || '')) {
        void response.body?.cancel(); return reply({ code: 'invalid_remote_response' }, 503);
      }
      const result = await readLimitedJson(response.body, 256 * 1024, signal);
      const data = result?.data;
      if (result?.status !== 'success' || !data || !Array.isArray(data.items)
        || data.items.length > 100 || data.page !== 1 || data.limit !== 100
        || data.has_more !== false || !Number.isSafeInteger(data.total)
        || data.total !== data.items.length) return reply({ code: 'ambiguous_pages' }, 409);
      const pages = data.items.map((item: any) => {
        if (!item || !Number.isSafeInteger(item.id) || item.id <= 0 || item.id_loja !== channel
          || typeof item.metaDescription !== 'string' || item.metaDescription.length > 5000
          || typeof item.title !== 'string' || item.title.length > 500) return null;
        return { id: item.id, title: item.title, metaDescription: item.metaDescription };
      });
      if (pages.some((page: unknown) => page === null) || new Set(pages.map((page: any) => page.id)).size !== pages.length)
        return reply({ code: 'invalid_remote_response' }, 503);
      return reply({ status: pages.length === 0 ? 'not_found' : pages.length === 1 ? 'single_candidate' : 'multiple_candidates',
        environment: 'homologation', childCode: input.childCode, pages,
        warning: 'Somente consulta. O filtro de derivação não constitui autorização para PATCH.' });
    } catch (error) {
      if (error instanceof AmazonAccessError) return reply({ code: error.status === 401 ? 'unauthenticated' : 'access_denied' }, error.status);
      return reply({ code: 'lookup_unavailable' }, 503);
    }
  };
}
