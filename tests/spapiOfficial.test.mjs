import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
const compiled = await build({ stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
  export * from './server/spapi/core'; export * from './server/spapi/handler';
  export * from './server/spapi/store'; export * from './server/spapi/catalog';
  export { default as start } from './api/amazon/oauth/start';
  export { default as login } from './api/amazon/oauth/login';
  export { default as callback } from './api/amazon/oauth/callback';
  export { default as catalog } from './api/amazon/spapi/catalog';
` }, bundle: true, write: false, metafile: true, platform: 'node', format: 'esm', target: 'node24' });
const api = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const uid = '11111111-1111-4111-8111-111111111111', sid = api.PRIVATE_STORE_ID;
const operationalStore='6058abd1-96e5-465b-a1df-292e5cf76de3';
const env = { AMAZON_SPAPI_ENABLED: 'true', AMAZON_SPAPI_EXTERNAL_AUTH_APPROVED: 'true', AMAZON_SPAPI_ORIGIN: 'https://isbn.example.invalid',
  AMAZON_SPAPI_APP_ID: 'amzn1.sellerapps.app.synthetic', AMAZON_SPAPI_CLIENT_ID: 'synthetic-client', AMAZON_SPAPI_CLIENT_SECRET: 'synthetic-secret',
  AMAZON_SPAPI_TOKEN_KEY: 'ab'.repeat(32), AMAZON_SPAPI_STORE_ID: sid, AMAZON_SPAPI_SELLER_ID: 'SELLERTEST', AMAZON_SPAPI_REFRESH_TOKEN: 'Atzr|synthetic-refresh',
  SUPABASE_URL: 'https://db.example.invalid', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service' };
const isbn = '9788535914849', principal = { user_id: uid, store_id: sid };
const tokens = { access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 3600 };
const item = { asin: 'SYNTHETIC1', summaries: [{ marketplaceId: api.MARKETPLACE, itemName: 'Synthetic Book' }],
  identifiers: [{ marketplaceId: api.MARKETPLACE, identifiers: [{ identifierType: 'EAN', identifier: isbn }] }],
  attributes: { author: [{ marketplace_id: api.MARKETPLACE, value: 'Synthetic Author' }], publisher: [{ marketplace_id: api.MARKETPLACE, value: 'Publisher' }],
    list_price: [{ value: 999 }], number_of_pages: [{ marketplace_id: api.MARKETPLACE, value: 300 }] } };
function harness(settings = {}) {
  const states = new Map(), saved = [], calls = []; let active = true;
  const store = {
    async issue(state) { states.set(state.state_hash, structuredClone(state)); },
    async consume(hash, browser, phase) { // Models the atomic database DELETE, not a production store.
      const entry = [...states.entries()].find(([key, row]) => (!hash || hash === key) && row.browser_hash === browser && row.phase === phase && Date.parse(row.expires_at) > Date.now());
      if (!entry) return null; states.delete(entry[0]); return entry[1];
    },
    async active(value) { assert.equal(value.store_id, sid); if (!active) throw new api.SpapiError(403, 'developer_required'); },
    async save(value) { saved.push(value); }, async token() { return saved.at(-1) || null; },
  };
  const fetcher = async (url, init) => {
    calls.push({ url: String(url), init }); assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store');
    const parsed = new URL(url);
    if (parsed.pathname === '/auth/v1/user') return Response.json(settings.user || { id: uid });
    if (parsed.pathname === '/rest/v1/profiles') return Response.json(active ? [{ id: uid, active: true }] : []);
    if (parsed.pathname === '/rest/v1/store_users') return Response.json(active ? [{ user_id: uid, store_id: operationalStore, role: 'developer', active: true }] : []);
    if (parsed.pathname === '/rest/v1/stores') return Response.json([{id:operationalStore,active:true}]);
    if (parsed.href === 'https://api.amazon.com/auth/o2/token') {
      assert.equal(init.method, 'POST'); assert.equal(init.body.get('client_secret'), env.AMAZON_SPAPI_CLIENT_SECRET);
      if (settings.lwaError) return new Response('sensitive-upstream-error', { status: settings.lwaError });
      return Response.json(settings.tokens || tokens);
    }
    assert.equal(parsed.origin, 'https://sellingpartnerapi-na.amazon.com'); assert.equal(init.method, 'GET');
    assert.equal(parsed.pathname, '/catalog/2022-04-01/items'); assert.equal(parsed.searchParams.get('identifiersType'), 'ISBN');
    assert.equal(parsed.searchParams.get('marketplaceIds'), api.MARKETPLACE); assert.equal(init.headers['x-amz-access-token'], tokens.access_token);
    if (settings.catalogError) return new Response('sensitive-upstream-error', { status: settings.catalogError });
    return Response.json(settings.catalog || { numberOfResults: 1, items: [item] });
  };
  const handler = mode => api.createSpapiHandler(mode, { env: { ...env, ...settings.env }, fetcher, store });
  const request = (mode, query = {}, options = {}) => new Request(`${env.AMAZON_SPAPI_ORIGIN}/api/amazon/${mode === 'catalog' ? 'spapi/catalog' : 'oauth/' + mode}?${new URLSearchParams(query)}`, {
    method: mode === 'start' ? 'POST' : 'GET', headers: { authorization: 'Bearer synthetic-session-token', origin: env.AMAZON_SPAPI_ORIGIN, ...(mode==='catalog'?{'x-isbn-store-id':operationalStore}:{}), ...options.headers }, ...options.init });
  async function start() {
    const response = await handler('start')(request('start')); assert.equal(response.status, 200);
    const target = new URL((await response.json()).authorization_url), cookie = response.headers.get('set-cookie').split(';')[0];
    return { state: target.searchParams.get('state'), cookie, target };
  }
  const callback = auth => handler('callback')(request('callback', { state: auth.state, selling_partner_id: env.AMAZON_SPAPI_SELLER_ID, spapi_oauth_code: 'synthetic-code' }, { headers: { cookie: auth.cookie } }));
  return { states, saved, calls, store, handler, request, start, callback, revoke: () => { active = false; } };
}
test('all four Vercel entries bundle independently of experimental Amazon and frontend', () => {
  for (const mode of ['start', 'login', 'callback', 'catalog']) assert.equal(typeof api[mode].fetch, 'function');
  assert.ok(!Object.keys(compiled.metafile.inputs).some(p => /experimentos|amazonFunction|amazonAuthorization|src\//.test(p)));
});
test('disabled and classification-pending block authorization before any Amazon call', async () => {
  for (const settings of [{ AMAZON_SPAPI_ENABLED: 'false' }, { AMAZON_SPAPI_EXTERNAL_AUTH_APPROVED: 'false' }]) {
    const h = harness({ env: settings });
    const response = await h.handler('start')(h.request('start'));
    assert.equal(response.status, settings.AMAZON_SPAPI_ENABLED ? 503 : 403);
    assert.equal(h.calls.filter(c => /amazon\.com/.test(c.url)).length, 0); assert.equal(h.states.size, 0);
  }
});
test('start requires real bearer, active developer and same origin; no client claims', async () => {
  const h = harness();
  for (const [headers, status] of [[{ authorization: '' }, 401], [{ origin: 'https://evil.invalid' }, 403], [{ origin: '' }, 403], [{ 'sec-fetch-site': 'cross-site' }, 403]])
    assert.equal((await h.handler('start')(h.request('start', {}, { headers }))).status, status);
  const anon = harness({ user: { id: uid, is_anonymous: true, user_metadata: { role: 'developer' } } });
  assert.equal((await anon.handler('start')(anon.request('start'))).status, 403);
  h.revoke(); assert.equal((await h.handler('start')(h.request('start'))).status, 403);
});
test('state is hashed, browser-bound, expiring; cookies and responses are protected', async () => {
  const h = harness(), auth = await h.start(), row = [...h.states.values()][0];
  assert.equal(row.state_hash, api.hash(auth.state)); assert.equal(row.phase, 'start');
  assert.ok(Date.parse(row.expires_at) <= Date.now() + 600000);
  assert.ok(!JSON.stringify(row).includes(auth.state));
  const response = await h.handler('start')(h.request('start'));
  assert.match(response.headers.get('set-cookie'), /__Host-isbn_spapi=.*; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=600/);
  assert.match(response.headers.get('cache-control'), /no-store/); assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  const bad = await h.handler('callback')(h.request('callback', { state: auth.state, selling_partner_id: env.AMAZON_SPAPI_SELLER_ID, spapi_oauth_code: 'x' }, { headers: { cookie: '__Host-isbn_spapi=' + 'z'.repeat(43) } }));
  assert.equal(bad.status, 403); assert.equal(h.saved.length, 0);
});
test('direct callback exchanges code once, encrypts refresh, never returns tokens; concurrent replay denied', async () => {
  const h = harness(), auth = await h.start();
  const results = await Promise.all([h.callback(auth), h.callback(auth)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 403]); assert.equal(h.saved.length, 1);
  assert.equal(h.calls.filter(c => c.url.includes('/auth/o2/token')).length, 1);
  assert.equal(api.decrypt(h.saved[0], env.AMAZON_SPAPI_TOKEN_KEY, `${sid}:SELLERTEST:v1`), tokens.refresh_token);
  assert.ok(!JSON.stringify(h.saved).includes(tokens.refresh_token));
  for (const response of results) assert.doesNotMatch(await response.text(), /synthetic-(?:access|refresh|secret|code)/);
});
test('login validates exact callback and seller, rotates state, preserves Amazon state', async () => {
  const h = harness(), auth = await h.start();
  const query = { amazon_callback_uri: `https://sellercentral.amazon.com.br/apps/authorize/confirm/${env.AMAZON_SPAPI_APP_ID}`, amazon_state: 'amazon-synthetic-state', selling_partner_id: 'SELLERTEST' };
  for (const invalid of ['https://evil.invalid/apps/authorize/confirm/x', `https://sellercentral.amazon.com.br.evil.invalid/apps/authorize/confirm/${env.AMAZON_SPAPI_APP_ID}`, `https://sellercentral.amazon.com.br/apps/authorize/confirm/other`, query.amazon_callback_uri + '?redirect=evil']) {
    assert.equal((await h.handler('login')(h.request('login', { ...query, amazon_callback_uri: invalid }, { headers: { cookie: auth.cookie } }))).status, 400);
  }
  const response = await h.handler('login')(h.request('login', query, { headers: { cookie: auth.cookie } }));
  assert.equal(response.status, 303); const target = new URL(response.headers.get('location'));
  assert.equal(target.searchParams.get('amazon_state'), query.amazon_state); assert.notEqual(target.searchParams.get('state'), auth.state);
  assert.equal((await h.callback(auth)).status, 403);
  assert.equal((await h.callback({ ...auth, state: target.searchParams.get('state') })).status, 200);
  assert.equal((await h.handler('login')(h.request('login', query, { headers: { cookie: auth.cookie } }))).status, 403);
});
test('expired state, missing cookie, wrong seller, duplicate params and revoked role fail closed', async () => {
  const h = harness(), auth = await h.start();
  h.states.get(api.hash(auth.state)).expires_at = new Date(0).toISOString(); assert.equal((await h.callback(auth)).status, 403);
  const fresh = await h.start(); h.revoke(); assert.equal((await h.callback(fresh)).status, 403); assert.equal(h.saved.length, 0);
  const h2 = harness(), a2 = await h2.start();
  assert.equal((await h2.callback({ ...a2, cookie: '' })).status, 403);
  const wrong = await h2.handler('callback')(h2.request('callback', { state: a2.state, selling_partner_id: 'OTHERSELLER', spapi_oauth_code: 'synthetic-code' }, { headers: { cookie: a2.cookie } }));
  assert.equal(wrong.status, 403); assert.equal((await h2.callback(a2)).status, 403);
  const req = h2.request('catalog', { isbn }); const duplicate = new Request(req.url + '&isbn=' + isbn, req);
  assert.equal((await h2.handler('catalog')(duplicate)).status, 400);
});
test('consent refusal and LWA rejection consume state; upstream bodies never leak', async () => {
  const h = harness(), auth = await h.start();
  const denied = await h.handler('callback')(h.request('callback', { state: auth.state, error: 'access_denied', error_description: 'sensitive' }, { headers: { cookie: auth.cookie } }));
  assert.equal(denied.status, 400); assert.equal((await h.callback(auth)).status, 403);
  for (const settings of [{ lwaError: 400 }, { tokens: { access_token: 'bad' } }]) {
    const bad = harness(settings), pending = await bad.start(), response = await bad.callback(pending);
    assert.equal(response.status, 502); assert.doesNotMatch(await response.text(), /sensitive|synthetic/);
    assert.equal((await bad.callback(pending)).status, 403); assert.equal(bad.saved.length, 0);
  }
});
test('AES-GCM rejects tampering, incorrect key and different tenant; IV is random', () => {
  const a = api.encrypt('test-token', env.AMAZON_SPAPI_TOKEN_KEY, 'context'), b = api.encrypt('test-token', env.AMAZON_SPAPI_TOKEN_KEY, 'context');
  assert.notEqual(a.iv, b.iv);
  for (const [value, key, context] of [[a, 'cd'.repeat(32), 'context'], [a, env.AMAZON_SPAPI_TOKEN_KEY, 'other'], [{ ...a, tag: Buffer.alloc(16).toString('base64') }, env.AMAZON_SPAPI_TOKEN_KEY, 'context']])
    assert.throws(() => api.decrypt(value, key, context), /token_decryption/);
});
test('ISBN validates check digits and accepts 10/13 plus hyphens; no request injection', () => {
  assert.equal(api.normalizeIsbn('978-85-359-1484-9'), isbn); assert.equal(api.normalizeIsbn('8535914846'), '8535914846');
  for (const bad of ['9788535914848', '8535914847', 'http://evil', '123', '9788535914849&sellerId=evil']) assert.throws(() => api.normalizeIsbn(bad));
});
test('catalog returns projected bibliographic fields only, filters ISBN mismatch, refreshes without persistence', async () => {
  const h = harness({ catalog: { numberOfResults: 2, items: [item, { ...item, identifiers: [] }] } });
  assert.equal((await h.handler('catalog')(h.request('catalog', { isbn }))).status, 200);
  await h.callback(await h.start());
  const response = await h.handler('catalog')(h.request('catalog', { isbn })); assert.equal(response.status, 200);
  const result = await response.json(); assert.equal(result.items.length, 1); assert.equal(result.items[0].title, 'Synthetic Book');
  assert.deepEqual(result.items[0].authors, ['Synthetic Author']); assert.equal(result.items[0].pageCount, 300);
  assert.equal(result.requiresReview, true); assert.doesNotMatch(JSON.stringify(result), /synthetic-access|refresh_token|list_price|inventory/);
  assert.equal(h.saved.length, 1); assert.equal(h.calls.at(-2).init.body.get('grant_type'), 'refresh_token');
});

const recoveryIsbn = '9798276439839';
const recoveryQuery = { isbn: recoveryIsbn, diagnostic: 'bibliography' };
const recoveryItem = () => ({ ...structuredClone(item), asin: 'B0G4CS2PMG', identifiers: [{ marketplaceId: api.MARKETPLACE,
  identifiers: [{ identifierType: 'ISBN', identifier: recoveryIsbn }] }] });
test('observed pages attributes recover 143 and 193 without changing the other factual projections', async () => {
  for (const [targetIsbn, count] of [['9798276439839',143],['9798286828647',193]]) {
  const factual = JSON.parse(await readFile(new URL(`./fixtures/spapi-recovery-${targetIsbn}.json`, import.meta.url), 'utf8'));
  assert.equal(factual.processedBefore.pageCount, null); assert.ok(factual.absentAttributes.includes('number_of_pages'));
  const original = { ...recoveryItem(), asin: factual.asin, attributes: factual.attributes, summaries: [factual.summary], dimensions: factual.dimensions,
    identifiers: [{marketplaceId:api.MARKETPLACE,identifiers:[{identifierType:'ISBN',identifier:targetIsbn}]}] };
  const h = harness({ catalog: { numberOfResults: 1, items: [original] } });
  const response = await h.handler('catalog')(h.request('catalog', { isbn: factual.isbn }));
  assert.equal(response.status, 200); const body = await response.json();
  const expected = { ...factual.processedBefore, pageCount: count };
  for (const key of Object.keys(expected)) assert.deepEqual(body.items[0][key], expected[key], key);
  assert.equal(body.items[0].asin, factual.asin); assert.equal(body.items[0].isbn13, factual.isbn);
  assert.equal(body.items[0].synopsis, null); assert.equal(body.diagnostics, undefined);
  assert.equal(h.calls.filter(c => c.url.includes('/catalog/')).length, 1); assert.equal(h.saved.length, 0);
  }
});
test('pages fallback preserves number_of_pages priority, marketplace filtering and existing positive-integer validation', async () => {
  for (const [primary, fallback, expected, marketplace = api.MARKETPLACE] of [
    [211, 143, 211], [null, 143, 143], [null, '143', 143], [0, 143, 143],
    [undefined, -1, null], [undefined, 143.5, null], [undefined, '143 pages', null],
    [undefined, {}, null], [undefined, 143, null, 'OTHER_MARKET'], [undefined, undefined, null],
  ]) {
    const original = recoveryItem();
    delete original.attributes.number_of_pages;
    if (primary !== undefined) original.attributes.number_of_pages = [{ value: primary, marketplace_id: api.MARKETPLACE }];
    if (fallback !== undefined) original.attributes.pages = [{ value: fallback, marketplace_id: marketplace }];
    const h = harness({ catalog: { numberOfResults: 1, items: [original] } });
    const body = await (await h.handler('catalog')(h.request('catalog', { isbn: recoveryIsbn }))).json();
    assert.equal(body.items[0].pageCount, expected);
    assert.equal(h.calls.filter(c => c.url.includes('/catalog/')).length, 1);
  }
});
test('ISBN-13 query accepts equivalent ISBN-10 identifiers returned by Amazon', async () => {
  const h = harness({ catalog: { numberOfResults: 1, items: [{ ...item, identifiers: [{ marketplaceId: api.MARKETPLACE,
    identifiers: [{ identifierType: 'ISBN', identifier: '8535914846' }] }] }] } });
  await h.callback(await h.start());
  const response = await h.handler('catalog')(h.request('catalog', { isbn }));
  assert.equal((await response.json()).items.length, 1);
});
test('failed persistence does not report authorization success or permit replay', async () => {
  const h = harness(), auth = await h.start(); h.store.save = async () => { throw new Error('sensitive database failure'); };
  const response = await h.callback(auth); assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /sensitive|authorized|refresh/);
  assert.equal((await h.callback(auth)).status, 403);
});
test('catalog supports no results, 429, 401/403, 5xx and malformed payload without retries', async () => {
  for (const [settings, status] of [[{ catalog: { numberOfResults: 0, items: [] } }, 200], [{ catalogError: 429 }, 429], [{ catalogError: 401 }, 502], [{ catalogError: 403 }, 502], [{ catalogError: 500 }, 502], [{ catalog: {} }, 502]]) {
    const h = harness(settings); await h.callback(await h.start());
    const response = await h.handler('catalog')(h.request('catalog', { isbn })); assert.equal(response.status, status);
    assert.equal(h.calls.filter(c => c.url.includes('/catalog/')).length, 1);
    if (status === 429) assert.equal(response.headers.get('retry-after'), '2');
    assert.doesNotMatch(await response.text(), /sensitive-upstream-error/);
  }
});
test('transport redirects, oversized and malformed bodies produce safe failures', async () => {
  for (const fetcher of [async () => { throw Error('credential secret'); }, async () => new Response('x'.repeat(100)), async () => new Response('{bad')])
    await assert.rejects(api.jsonRequest(fetcher, 'https://example.invalid', {}, 20), error => error instanceof api.SpapiError && !/secret/.test(error.message));
});
test('SQL restricts every table and RPC; no SECURITY DEFINER or client policy', async () => {
  const sql = await readFile('supabase/setup/amazon_spapi_official.sql', 'utf8');
  assert.match(sql, /delete from public\.amazon_spapi_oauth_states[\s\S]*returning \*/);
  assert.match(sql, /expires_at > statement_timestamp\(\)/); assert.match(sql, /security invoker set search_path = ''/);
  assert.equal((sql.match(/enable row level security/g) || []).length, 2);
  assert.match(sql, /from public, anon, authenticated/); assert.doesNotMatch(sql, /create policy/i);
});
test('Supabase adapter scopes token lookups, uses atomic RPC and never forwards user bearer to service storage', async () => {
  const config = api.configuration(env), calls = [];
  const fetcher = async (url, init) => {
    const target = new URL(url); calls.push({ target, init });
    assert.equal(target.origin, env.SUPABASE_URL); assert.equal(init.headers.apikey, env.SUPABASE_SERVICE_ROLE_KEY);
    assert.equal(init.headers.Authorization, `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`);
    assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store');
    return Response.json(target.pathname.endsWith('/profiles') ? [{ id: uid }] : target.pathname.endsWith('/store_users') ? [{ user_id: uid }] : []);
  };
  const store = api.createStore(config, fetcher);
  await store.active(principal); assert.equal(calls[1].target.searchParams.get('role'), 'eq.developer');
  assert.equal(calls[1].target.searchParams.get('store_id'), `eq.${sid}`);
  assert.equal(await store.token(sid, 'SELLERTEST'), null);
  assert.equal(calls.at(-1).target.searchParams.get('selling_partner_id'), 'eq.SELLERTEST');
  await store.consume('state-hash', 'browser-hash', 'callback');
  assert.equal(calls.at(-1).target.pathname, '/rest/v1/rpc/consume_amazon_spapi_state');
  assert.deepEqual(JSON.parse(calls.at(-1).init.body), { p_state: 'state-hash', p_browser: 'browser-hash', p_phase: 'callback' });
  const state = { ...principal, state_hash: 'a'.repeat(64), browser_hash: 'b'.repeat(64), phase: 'start', seller_id: 'SELLERTEST', expires_at: new Date().toISOString() };
  await store.issue(state); assert.deepEqual(JSON.parse(calls.at(-1).init.body), state);
  await store.save({ store_id: sid, selling_partner_id: 'SELLERTEST', ...api.encrypt('synthetic-refresh', config.key, 'context') });
  assert.equal(calls.at(-1).target.searchParams.get('on_conflict'), 'store_id,selling_partner_id');
  assert.doesNotMatch(calls.at(-1).init.body, /synthetic-refresh/);
});
test('real authorization rejects inactive profile, absent membership, operator/admin and invalid Auth', async () => {
  for (const deniedPath of ['/profiles', '/store_users']) {
    const config = api.configuration(env), store = api.createStore(config, async url => Response.json(String(url).includes(deniedPath) ? [] : [{ id: uid }]));
    await assert.rejects(store.active(principal), /developer_required/);
  }
  const config = api.configuration(env), h = harness();
  for (const status of [401, 403, 500]) {
    await assert.rejects(api.authorize(h.request('start'), config, h.store, async () => new Response('secret', { status })), error => error.status === (status === 500 ? 503 : 401));
  }
  const store = api.createStore(config, async (url) => { const query = new URL(url).searchParams;
    // The server must ask for developer only, regardless of caller-supplied metadata.
    if (String(url).includes('/store_users')) { assert.equal(query.get('role'), 'eq.developer'); return Response.json([]); }
    return Response.json([{ id: uid }]);
  });
  await assert.rejects(store.active(principal), /developer_required/);
  await assert.rejects(store.active({ ...principal, store_id: uid }), /developer_required/);
});
for (const prefix of ['amzn1.sellerapps.app.', 'amzn1.sp.solution.']) {
  test(`configuration accepts application ID prefix ${prefix}`, () => {
    const app = prefix + 'synthetic-01234567-89AB-cdef';
    assert.equal(api.configuration({ ...env, AMAZON_SPAPI_APP_ID: app }).app, app);
  });
}
test('configuration rejects empty, unknown, incomplete and malformed application IDs', () => {
  for (const app of ['', 'synthetic', 'amzn1.other.app.synthetic', 'amzn1.sellerapps.synthetic', 'amzn1.sp.synthetic',
    'amzn1.sellerapps.app.', 'amzn1.sp.solution.', 'amzn1.sellerapps.app.synthetic_extra', 'amzn1.sp.solution.synthetic_extra',
    'amzn1.sp.solution.synthetic.extra', 'amzn1XspXsolution.synthetic', 'AMZN1.sp.solution.synthetic',
    ' amzn1.sp.solution.synthetic', 'amzn1.sp.solution.synthetic ', 'amzn1.sp.solution.synthetic/token']) {
    assert.throws(() => api.configuration({ ...env, AMAZON_SPAPI_APP_ID: app }),
      error => error instanceof api.SpapiError && error.status === 503 && error.code === 'configuration', app);
  }
});
test('configuration rejects HTTP, public administrative key, missing seller and invalid encryption key', () => {
  for (const override of [{ AMAZON_SPAPI_ORIGIN: 'http://isbn.example.invalid' }, { SUPABASE_URL: 'https://user:pass@db.example.invalid' },
    { SUPABASE_PUBLISHABLE_KEY: 'sb_secret_invalid' }, { AMAZON_SPAPI_SELLER_ID: '' }, { AMAZON_SPAPI_TOKEN_KEY: 'bad' }])
    assert.throws(() => api.configuration({ ...env, ...override }), /configuration/);
});
test('limited reads enforce deadline even while response body stalls', async () => {
  const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); } }));
  await assert.rejects(api.limitedJson(response, 1024, AbortSignal.timeout(10)), error => error.status === 504);
});
test('wrong method, unknown query and unknown path do not run authentication or Amazon', async () => {
  const h = harness();
  for (const [req, status] of [[new Request(env.AMAZON_SPAPI_ORIGIN + '/api/amazon/oauth/start', { method: 'GET' }), 405],
    [h.request('catalog', { isbn, sellerId: 'OTHER' }), 400], [new Request(env.AMAZON_SPAPI_ORIGIN + '/api/amazon/oauth/other'), 404]])
    assert.equal((await h.handler(req.method === 'GET' && req.url.includes('catalog') ? 'catalog' : 'start')(req)).status, status);
  assert.equal(h.calls.length, 0);
});
