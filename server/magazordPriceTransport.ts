import { readLimitedJson } from './amazonAuthorization.js';
import { resolveMagazordBaseUrl } from './magazordBaseUrl.js';
import { PRICE_HOMOLOGATION, priceFail, salePricePayload } from '../shared/magazordPrice.js';

/** Fixed homologation destination; no redirect, retry, raw response or secret logging. */
export function createPriceTransport(env: NodeJS.ProcessEnv, fetcher: typeof fetch = fetch) {
  if (resolveMagazordBaseUrl(env.MAGAZORD_BASE_URL) !== PRICE_HOMOLOGATION) return priceFail('homologation_only', 403);
  if (!env.MAGAZORD_API_USER || !env.MAGAZORD_API_PASSWORD) return priceFail('not_configured', 503);
  const signal = AbortSignal.timeout(20000);
  async function call(path: string, payload?: ReturnType<typeof salePricePayload>) {
    const response = await fetcher(PRICE_HOMOLOGATION + path, {
      method: payload ? 'POST' : 'GET', redirect: 'error', credentials: 'omit', cache: 'no-store', signal,
      headers: { Accept: 'application/json', Authorization: 'Basic ' + Buffer.from(`${env.MAGAZORD_API_USER}:${env.MAGAZORD_API_PASSWORD}`).toString('base64'),
        ...(payload ? { 'Content-Type': 'application/json' } : {}) },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    if (!response.ok || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') || '')) {
      void response.body?.cancel(); return priceFail(payload ? 'price_outcome_uncertain' : 'price_read_unavailable', 502);
    }
    return { status: response.status, body: await readLimitedJson(response.body, 512 * 1024, signal) };
  }
  return {
    get: async (path: string) => {
      if (!path.startsWith('/v2/site/') && !path.startsWith('/v1/listPreco?')) return priceFail('invalid_price_request', 400);
      return (await call(path)).body;
    },
    write: async (payload: ReturnType<typeof salePricePayload>) => {
      if (payload.length !== 1) return priceFail('invalid_price', 400);
      const item = payload[0];
      const checked = salePricePayload(item.produto, item.tabelaPreco, Math.round(item.precoVenda * 100));
      if (JSON.stringify(checked) !== JSON.stringify(payload)) return priceFail('invalid_price', 400);
      return call('/v1/preco', checked);
    },
  };
}
