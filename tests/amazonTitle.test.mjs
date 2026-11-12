import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function client(development = true, preview = false) {
  const result = await build({ entryPoints: ['src/services/amazonTitle.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
    define: { 'import.meta.env.DEV': String(development), 'import.meta.env.ISBN_AMAZON_TITLE_PREVIEW': String(preview) }, plugins: [{ name: 'session-fixture', setup(b) {
      b.onResolve({ filter: /\/lib\/supabase$/ }, () => ({ path: 'session', namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'exports.supabase={auth:{getSession:async()=>deps.session}}' }));
    } }] });
  const deps = { session: { data: { session: { access_token: 'synthetic-session' } } } }, module = { exports: {} };
  new Function('deps', 'module', 'exports', result.outputFiles[0].text)(deps, module, module.exports);
  return { ...module.exports, deps };
}
const user = { id: 'synthetic', storeId: 'synthetic-store', role: 'developer', active: true };
const item = { source: 'amazon_spapi_catalog_2022-04-01', asin: 'ASIN000001', marketplaceId: 'A2Q3Y263D00KWC', title: 'O Alquimista',
  isbn13: '9788584396375', authors: ['Autor'], images: [{ variant: 'MAIN', link: 'https://images.example.invalid/cover.jpg' }] };

test('title client uses official same-origin route, session and store, maps each edition without commercial cover', async t => {
  const api = await client(false, true);
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, '/api/amazon/spapi/catalog?title=O%20Alquimista');
    assert.equal(init.credentials, 'same-origin'); assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store');
    assert.equal(init.headers.Authorization, 'Bearer synthetic-session'); assert.equal(init.headers['x-isbn-store-id'], user.storeId);
    return Response.json({ query: 'O Alquimista', items: [item, { ...item, asin: 'ASIN000002', isbn13: undefined, authors: undefined }], hasMore: true });
  });
  const result = await api.searchAmazonByTitle(' O Alquimista ', user, 'development');
  assert.equal(result.status, 'success'); assert.equal(result.candidates.length, 2); assert.equal(result.hasMore, true);
  assert.equal(result.candidates[0].book.amazonTitleReference.coverUrl, item.images[0].link);
  assert.equal(result.candidates[0].book.coverUrl, undefined); assert.equal(result.candidates[1].book.authors, undefined);
});
test('title client blocks production deployments, invalid roles, inactive users, missing stores and absent sessions without fetch', async t => {
  let calls = 0; t.mock.method(globalThis, 'fetch', async () => { calls++; throw Error('forbidden'); });
  const api = await client();
  for (const [principal, environment] of [[{ ...user, role: 'unknown' }, 'production'], [{ ...user, storeId: '' }, 'development'], [{ ...user, active: false }, 'development'], [undefined, 'development']])
    assert.equal((await api.searchAmazonByTitle('O Alquimista', principal, environment)).status, 'unauthorized');
  assert.equal((await (await client(false)).searchAmazonByTitle('O Alquimista', user, 'development')).status, 'unauthorized');
  assert.equal((await api.searchAmazonByTitle('x', user, 'development')).status, 'invalid_query');
  api.deps.session = { data: { session: null } };
  assert.equal((await api.searchAmazonByTitle('O Alquimista', user, 'development')).status, 'unauthorized'); assert.equal(calls, 0);
});

test('Preview accepts exactly the existing catalog roles regardless of their operational simulation environment', async t => {
  const api = await client(false, true); let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({ query: 'O Alquimista', items: [item] }); });
  for (const role of ['developer', 'admin', 'operator']) {
    assert.equal((await api.searchAmazonByTitle('O Alquimista', { ...user, role }, role === 'developer' ? 'development' : 'production')).status, 'success');
  }
  assert.equal(calls, 3);
  const production = await client(false, false);
  for (const role of ['developer', 'admin', 'operator']) assert.equal((await production.searchAmazonByTitle('O Alquimista', { ...user, role }, 'development')).status, 'unauthorized');
  assert.equal(calls, 3);
});
test('title client handles authorization, throttling, transport, empty and malformed payloads', async t => {
  const api = await client();
  for (const [status, body, expected] of [[403, {}, 'unauthorized'], [429, {}, 'rate_limited'],
    [502, { code: 'upstream_authorization' }, 'unauthorized'], [503, {}, 'unavailable'],
    [200, { query: 'O Alquimista', items: [] }, 'not_found'], [200, {}, 'unavailable'],
    [200, { query: 'other', items: [item] }, 'unavailable']]) {
    const mock = t.mock.method(globalThis, 'fetch', async () => Response.json(body, { status }));
    assert.equal((await api.searchAmazonByTitle('O Alquimista', user, 'development')).status, expected); mock.mock.restore();
  }
  t.mock.method(globalThis, 'fetch', async () => { throw Error('offline'); });
  assert.equal((await api.searchAmazonByTitle('O Alquimista', user, 'development')).status, 'unavailable');
});
