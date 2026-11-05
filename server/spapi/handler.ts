import { configuration, catalogConfiguration, SpapiError, fail, nonce, hash, cookie, browserCookie, encrypt } from './core.js';
import { createStore, authorize, authorizeCatalog, type Store, type State } from './store.js';
import { lwa, normalizeIsbn, searchCatalog } from './catalog.js';

type Mode = 'start' | 'login' | 'callback' | 'catalog';
export function createSpapiHandler(mode: Mode, options: { env?: NodeJS.ProcessEnv; fetcher?: typeof fetch; store?: Store } = {}) {
  if (mode === 'catalog') return createCatalogHandler(options);
  const env = options.env || process.env, fetcher = options.fetcher || fetch;
  return async (request: Request): Promise<Response> => {
    const headers: Record<string, string> = { 'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", Vary: 'Authorization, Cookie' };
    const reply = (data: object, status = 200) => Response.json(data, { status, headers });
    const redirect = (url: URL) => new Response(null, { status: 303, headers: { ...headers, Location: url.href } });
    try {
      const config = configuration(env), url = new URL(request.url), store = options.store || createStore(config, fetcher);
      const path = `/api/amazon/oauth/${mode}`;
      if (url.origin !== config.origin || url.pathname !== path) fail(404, 'not_found');
      if (request.method !== (mode === 'start' ? 'POST' : 'GET')) {
        headers.Allow = mode === 'start' ? 'POST' : 'GET'; return reply({ code: 'method_not_allowed' }, 405);
      }
      // Exact parameters and no duplicates: no ambiguous proxy/framework interpretation.
      const allowed = mode === 'start' ? [] : mode === 'login'
        ? ['amazon_callback_uri', 'amazon_state', 'selling_partner_id', 'version'] : ['state', 'selling_partner_id', 'spapi_oauth_code', 'error', 'error_description'];
      if (url.search.length > 12000 || [...url.searchParams.keys()].some(k => !allowed.includes(k) || url.searchParams.getAll(k).length !== 1)) fail(400, 'invalid_parameters');
      const param = (name: string, max = 4096) => {
        const value = url.searchParams.get(name);
        if (!value || value.length > max || /[\x00-\x1f\x7f]/.test(value)) return fail(400, 'invalid_parameters');
        return value;
      };
      const approved = () => { if (env.AMAZON_SPAPI_EXTERNAL_AUTH_APPROVED !== 'true') fail(403, 'developer_classification_pending'); };
      const context = `${config.store}:${config.seller}:v1`;
      async function issue(principal: { user_id: string; store_id: string }, browser: string, phase: State['phase'], expires = Date.now() + 600000) {
        const state = nonce();
        await store.issue({ ...principal, state_hash: hash(state), browser_hash: hash(browser), phase, seller_id: config.seller, expires_at: new Date(expires).toISOString() });
        return state;
      }
      if (mode === 'start') {
        if (request.headers.get('origin') !== config.origin || request.headers.get('sec-fetch-site') === 'cross-site') fail(403, 'origin_denied');
        const principal = await authorize(request, config, store, fetcher); approved();
        const browser = nonce(), state = await issue(principal, browser, 'start');
        headers['Set-Cookie'] = cookie(browser);
        const target = new URL('https://sellercentral.amazon.com.br/apps/authorize/consent');
        target.search = new URLSearchParams({ application_id: config.app, state, redirect_uri: config.redirect,
          ...(config.beta ? { version: 'beta' } : {}) }).toString();
        return reply({ authorization_url: target.href });
      }
      approved();
      const browser = browserCookie(request);
      if (mode === 'login') {
        const seller = param('selling_partner_id', 100), amazonState = param('amazon_state', 2048);
        if (seller !== config.seller || (url.searchParams.has('version') && url.searchParams.get('version') !== 'beta')) fail(403, 'seller_denied');
        let target: URL;
        try { target = new URL(param('amazon_callback_uri')); } catch { return fail(400, 'invalid_amazon_callback'); }
        if (target.protocol !== 'https:' || !['sellercentral.amazon.com.br', 'sellercentral.amazon.com', 'amazon.com', 'amazon.com.br'].includes(target.hostname)
          || target.username || target.password || target.port || target.hash || target.search
          || target.pathname !== `/apps/authorize/confirm/${config.app}`) fail(400, 'invalid_amazon_callback');
        // Login is a continuation of an authenticated start. Appstore-first onboarding is deliberately closed.
        // Consume the unique outstanding start for this browser, using the browser hash as lookup key.
        const prior = await store.consume('', hash(browser), 'start');
        if (!prior || prior.store_id !== config.store || prior.seller_id !== seller) fail(403, 'invalid_state');
        await store.active(prior);
        const state = await issue(prior, browser, 'callback', Date.parse(prior.expires_at));
        target.search = new URLSearchParams({ amazon_state: amazonState, state, redirect_uri: config.redirect,
          ...(config.beta ? { version: 'beta' } : {}) }).toString();
        return redirect(target);
      }
      const state = param('state', 43);
      if (!/^[A-Za-z0-9_-]{43}$/.test(state)) fail(403, 'invalid_state');
      const prior = await store.consume(hash(state), hash(browser), 'callback');
      // Website consent can return straight to redirect URI without a login intermediate.
      const saved = prior || await store.consume(hash(state), hash(browser), 'start');
      if (!saved || saved.store_id !== config.store || saved.seller_id !== config.seller) fail(403, 'invalid_state');
      headers['Set-Cookie'] = cookie('');
      await store.active(saved);
      if (url.searchParams.has('error')) return reply({ code: 'amazon_consent_denied' }, 400);
      if (param('selling_partner_id', 100) !== saved.seller_id) fail(403, 'seller_denied');
      const code = param('spapi_oauth_code');
      const tokens = await lwa(config, fetcher, { grant_type: 'authorization_code', code, redirect_uri: config.redirect });
      await store.save({ store_id: config.store, selling_partner_id: saved.seller_id, ...encrypt(tokens.refresh_token!, config.key, context) });
      return reply({ code: 'amazon_authorized' });
    } catch (error) {
      // Never log request URLs, query strings, upstream bodies, credentials or exception messages.
      const safe = error instanceof SpapiError ? error : new SpapiError(503, 'spapi_unavailable');
      if (safe.status === 429) headers['Retry-After'] = '2';
      return reply({ code: safe.code }, safe.status);
    }
  };
}

function createCatalogHandler(options: { env?: NodeJS.ProcessEnv; fetcher?: typeof fetch }) {
  return async (request: Request) => {
    const headers: Record<string, string> = { 'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', Vary: 'Authorization' };
    const reply = (data: object, status = 200) => Response.json(data, { status, headers });
    try {
      const url = new URL(request.url);
      if (url.pathname !== '/api/amazon/spapi/catalog') fail(404, 'not_found');
      if (request.method !== 'GET') { headers.Allow = 'GET'; return reply({ code: 'method_not_allowed' }, 405); }
      const env = options.env || process.env;
      const diagnose = url.searchParams.has('diagnostic');
      if (url.search.length > 100 || [...url.searchParams.keys()].some(k => k !== 'isbn' && k !== 'diagnostic')
        || url.searchParams.getAll('isbn').length !== 1
        || (diagnose && (env.VERCEL_ENV !== 'preview' || url.searchParams.getAll('diagnostic').length !== 1
          || url.searchParams.get('diagnostic') !== 'bibliography'
          || !['9798276439839', '9798286828647'].includes(url.searchParams.get('isbn') || '')))) fail(400, 'invalid_parameters');
      const fetcher = options.fetcher || fetch, config = catalogConfiguration(env, request);
      const origin = request.headers.get('origin');
      if ((origin && origin !== config.origin) || request.headers.get('sec-fetch-site') === 'cross-site') fail(403, 'origin_denied');
      await authorizeCatalog(request, config, fetcher);
      const isbn = normalizeIsbn(url.searchParams.get('isbn') || '');
      const token = await lwa(config, fetcher, { grant_type: 'refresh_token', refresh_token: config.refresh });
      return reply({ ...await searchCatalog(config, fetcher, isbn, token.access_token, diagnose), contentPolicy: 'synopsis_omitted' });
    } catch (error) {
      const safe = error instanceof SpapiError ? error : new SpapiError(503, 'spapi_unavailable');
      if (safe.status === 429) headers['Retry-After'] = '2';
      return reply({ code: safe.code }, safe.status);
    }
  };
}
