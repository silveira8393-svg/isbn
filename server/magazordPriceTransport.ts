import { readLimitedJson } from './amazonAuthorization.js';
import { resolveMagazordBaseUrl } from './magazordBaseUrl.js';
import { PRICE_HOMOLOGATION, PriceError, priceFail, salePricePayload, type PriceReadDiagnostic } from '../shared/magazordPrice.js';

// Static route templates only: never log identifiers, queries, headers, bodies or exception messages.
function readOperation(path: string): Pick<PriceReadDiagnostic, 'operation' | 'endpoint'> {
  const url = new URL(PRICE_HOMOLOGATION + path);
  if (/^\/api\/v2\/site\/produto\/[^/]+\/derivacao\/[^/]+$/.test(url.pathname))
    return { operation: 'read_child', endpoint: '/api/v2/site/produto/{pai}/derivacao/{filho}' };
  if (/^\/api\/v2\/site\/produto\/[^/]+$/.test(url.pathname))
    return { operation: 'read_parent', endpoint: '/api/v2/site/produto/{pai}' };
  if (url.pathname === '/api/v2/site/tabelaPreco')
    return { operation: 'read_price_table', endpoint: '/api/v2/site/tabelaPreco' };
  if (url.pathname === '/api/v1/listPreco' && ['0', '1'].includes(url.searchParams.get('ativo') || ''))
    return { operation: url.searchParams.get('ativo') === '0' ? 'read_prices_inactive' : 'read_prices_active', endpoint: '/api/v1/listPreco' };
  return priceFail('invalid_price_request', 400);
}

function safeContentType(response: Response): string {
  const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  return ['application/json', 'application/problem+json', 'text/html', 'text/plain', 'application/octet-stream'].includes(type)
    ? type : type ? 'other' : 'missing';
}

/** Fixed homologation destination; no redirect, retry, raw response or secret logging. */
export function createPriceTransport(env: NodeJS.ProcessEnv, fetcher: typeof fetch = fetch,
  log: (diagnostic: PriceReadDiagnostic) => void = diagnostic => console.warn(JSON.stringify({ event: 'magazord_price_read_failure', ...diagnostic }))) {
  if (resolveMagazordBaseUrl(env.MAGAZORD_BASE_URL) !== PRICE_HOMOLOGATION) return priceFail('homologation_only', 403);
  if (!env.MAGAZORD_API_USER || !env.MAGAZORD_API_PASSWORD) return priceFail('not_configured', 503);
  const signal = AbortSignal.timeout(20000);
  async function call(path: string, payload?: ReturnType<typeof salePricePayload>) {
    const operation = payload ? undefined : readOperation(path);
    let response: Response | undefined;
    const unavailable = (reason: PriceReadDiagnostic['reason']): never => {
      const diagnostic = { ...operation!, httpStatus: response?.status ?? null,
        contentType: response ? safeContentType(response) : 'missing', reason };
      try { log(diagnostic); } catch { /* Logging must not replace the known failure or trigger a retry. */ }
      throw new PriceError('price_read_unavailable', 502, diagnostic);
    };
    try {
      response = await fetcher(PRICE_HOMOLOGATION + path, {
        method: payload ? 'POST' : 'GET', redirect: 'error', credentials: 'omit', cache: 'no-store', signal,
        headers: { Accept: 'application/json', Authorization: 'Basic ' + Buffer.from(`${env.MAGAZORD_API_USER}:${env.MAGAZORD_API_PASSWORD}`).toString('base64'),
          ...(payload ? { 'Content-Type': 'application/json' } : {}) },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
      });
      if (!response.ok || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') || '')) {
        void response.body?.cancel().catch(() => {});
        if (payload) return priceFail('price_outcome_uncertain', 502);
        return unavailable(!response.ok ? 'http_error' : 'unexpected_content_type');
      }
      return { status: response.status, body: await readLimitedJson(response.body, 512 * 1024, signal) };
    } catch (error) {
      if (payload || error instanceof PriceError) throw error;
      return unavailable(signal.aborted || error instanceof DOMException && error.name === 'TimeoutError'
        ? 'timeout' : response ? 'invalid_response' : 'network_error');
    }
  }
  return {
    get: async (path: string) => {
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
