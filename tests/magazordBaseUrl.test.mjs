import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { mfaToken } from './helpers/mfa.mjs';

const built = await build({ stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
  export * from './server/magazordBaseUrl';
  export * from './server/magazordProducts';
  export * from './server/magazordCategories';
` }, bundle: true, write: false, platform: 'node', format: 'esm' });
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const products = JSON.parse(await readFile('tests/fixtures/magazord-products.json', 'utf8'));
const categories = JSON.parse(await readFile('tests/fixtures/magazord-categories.json', 'utf8'));
const bases = ['https://livrariasul.painel.magazord.com.br/api', 'https://homologacaosilveiralab.painel.magazord.com.br/api'];
const uid = '11111111-1111-4111-8111-111111111111', store = '22222222-2222-4222-8222-222222222222';
const config = base => ({ MAGAZORD_BASE_URL: base, MAGAZORD_API_USER: 'fixture-token', MAGAZORD_API_PASSWORD: 'fixture-password',
  MAGAZORD_STORE_ID: store, SUPABASE_URL: 'https://auth.invalid', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture' });
const page = (items, limit) => Response.json({ status: 'success', data: { items, total: items.length, page: 1, limit,
  total_pages: items.length ? 1 : 0, has_more: false } });

// Every handler receives this fetcher. There is no network transport in this suite.
function network(base, { member = true, profile = true, activeStore = true, upstreamStatus } = {}) {
  const calls = [], upstream = [];
  const fetcher = async (input, init) => {
    const url = new URL(input); calls.push({ url, init });
    assert.equal(init.method, 'GET'); assert.equal(init.body, undefined); assert.equal(init.redirect, 'error');
    if (url.origin === 'https://auth.invalid') {
      assert.match(init.headers.Authorization, /^Bearer /);
      if (url.pathname === '/auth/v1/user') return Response.json({ id: uid });
      if (url.pathname === '/rest/v1/profiles') return Response.json([{ id: uid, active: profile }]);
      if (url.pathname === '/rest/v1/store_users') return Response.json(member ? [{ user_id: uid, store_id: store, role: 'operator', active: true }] : []);
      if (url.pathname === '/rest/v1/stores') return Response.json([{ id: store, active: activeStore }]);
      assert.fail('Unexpected authorization path');
    }
    upstream.push({ url, init });
    assert.equal(url.origin, new URL(base).origin, 'must never switch environments');
    assert.equal(init.headers.Authorization, 'Basic ' + Buffer.from('fixture-token:fixture-password').toString('base64'));
    assert.equal(init.cache, 'no-store'); assert.equal(init.credentials, 'omit');
    if (upstreamStatus) return new Response(null, { status: upstreamStatus, headers: { Location: bases.find(item => item !== base) } });
    if (url.pathname === '/api/v2/site/categoria') return page(categories, 100);
    if (url.pathname === '/api/v2/site/produtoDerivacoes') return page(products.children.filter(c => c.codigo === url.searchParams.get('codigo')), 20);
    if (url.pathname === '/api/v2/site/produto') {
      const matches = products.children.filter(c => [c.ean, ...(c.derivacaoEan || []).map(e => e.ean)].includes(url.searchParams.get('ean')));
      return page(products.parents.filter(p => matches.some(c => c.agrupador === p.codigo)), 5);
    }
    const match = url.pathname.match(/^\/api\/v2\/site\/produto\/([^/]+)(\/derivacao)?$/);
    assert.ok(match, 'only existing product read paths are allowed');
    const parent = products.parents.find(p => p.codigo === decodeURIComponent(match[1]));
    return parent ? Response.json({ status: 'success', data: match[2] ? products.children.filter(c => c.agrupador === parent.codigo) : parent }) : new Response(null, { status: 404 });
  };
  return { calls, upstream, fetcher };
}
function request(path, headers = {}) {
  return new Request('https://isbn.invalid' + path, { headers: { authorization: `Bearer ${mfaToken(uid)}`, 'x-isbn-store-id': store, ...headers } });
}
const routes = [
  { path: '/api/magazord/categories', create: api.createMagazordCategoriesFunction },
  { path: '/api/magazord/products?kind=parent&value=FIXTURE-U-P', create: api.createMagazordProductsFunction },
];

const invalid = [undefined, '', 'not a URL', 'https://', 'http://livrariasul.painel.magazord.com.br/api',
  'https://evil.invalid/api', bases[0].replace('.com.br', '.com.br.evil.invalid'),
  bases[0].replace('https://', 'https://user:password@'), bases[1].replace('https://', 'https://user@'),
  bases[0].replace('/api', ':443/api'), bases[1].replace('/api', ':8443/api'),
  bases[0] + '/other', bases[0] + '//', bases[1] + '?env=production', bases[1] + '#fragment',
  ' ' + bases[0], bases[1] + '\n', bases[0].replace('/api', '/other/../api'),
  bases[0].replace('/api', '/%61pi'), bases[0].replace('https://', 'https:\\\\')];

test('base resolver accepts only the two exact authorized destinations and optional trailing slash', () => {
  for (const base of bases) for (const value of [base, base + '/']) assert.equal(api.resolveMagazordBaseUrl(value), base);
  for (const value of invalid) assert.equal(api.resolveMagazordBaseUrl(value), undefined);
});

test('missing and unsafe configuration never reaches Magazord or falls back to production', async () => {
  for (const base of invalid) {
    const fetcher = async () => assert.fail('Invalid configuration must not access upstream');
    assert.equal((await api.createProductLookup({ env: config(base), fetcher })({ kind: 'parent', value: 'FIXTURE-U-P' })).code, 'not_configured');
    await assert.rejects(api.createCategoryLoader({ env: config(base), fetcher })(), { code: 'not_configured' });
  }
});

for (const base of bases) {
  test(`${new URL(base).hostname}: both authenticated handlers and all product lookup kinds preserve Basic Auth and GET-only behavior`, async () => {
    for (const suffix of ['', '/']) {
      const n = network(base), env = config(base + suffix);
      for (const route of routes) assert.equal((await route.create({ env, fetcher: n.fetcher })(request(route.path))).status, 200);
      for (const query of [{ kind: 'child', value: 'FIXTURE-U-001' }, { kind: 'parent', value: 'FIXTURE-U-P' }, { kind: 'ean', value: '9788551003664' }]) {
        const result = await api.createProductLookup({ env, fetcher: n.fetcher })(query);
        assert.ok(['found', 'multiple'].includes(result.status));
      }
      assert.ok(n.upstream.some(c => c.url.pathname.endsWith('/categoria')));
      assert.ok(n.upstream.some(c => c.url.pathname.endsWith('/derivacao')));
    }
  });

  test(`${new URL(base).hostname}: session, AAL2, tenant, active membership and origin checks remain mandatory`, async () => {
    for (const route of routes) {
      for (const [headers, status] of [
        [{ authorization: '' }, 401], [{ authorization: `Bearer ${mfaToken(uid, 'aal1')}` }, 403],
        [{ authorization: `Bearer ${mfaToken(store)}` }, 403], [{ 'x-isbn-store-id': uid }, 403],
        [{ origin: 'https://other.invalid' }, 403], [{ 'sec-fetch-site': 'cross-site' }, 403],
      ]) {
        const n = network(base);
        assert.equal((await route.create({ env: config(base), fetcher: n.fetcher })(request(route.path, headers))).status, status);
        assert.equal(n.upstream.length, 0);
      }
      for (const flags of [{ member: false }, { profile: false }, { activeStore: false }]) {
        const n = network(base, flags);
        assert.equal((await route.create({ env: config(base), fetcher: n.fetcher })(request(route.path))).status, 403);
        assert.equal(n.upstream.length, 0);
      }
    }
  });

  test(`${new URL(base).hostname}: browser environment overrides and mutation methods are rejected`, async () => {
    for (const route of routes) {
      const n = network(base), handler = route.create({ env: config(base), fetcher: n.fetcher });
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        assert.equal((await handler(new Request('https://isbn.invalid' + route.path, { method, body: 'environment=production' }))).status, 405);
      }
      const separator = route.path.includes('?') ? '&' : '?';
      for (const key of ['url', 'baseUrl', 'environment', 'MAGAZORD_BASE_URL'])
        assert.equal((await handler(request(route.path + separator + key + '=' + encodeURIComponent(bases[0])))).status, 400);
      assert.equal(n.calls.length, 0);
    }
  });

  test(`${new URL(base).hostname}: errors and redirects never trigger environment fallback`, async () => {
    for (const upstreamStatus of [301, 302, 307, 308, 401, 403, 429, 503]) for (const route of routes) {
      const n = network(base, { upstreamStatus });
      const response = await route.create({ env: config(base), fetcher: n.fetcher })(request(route.path));
      assert.ok(response.status >= 500); assert.equal(n.upstream.length, 1);
      const body = await response.text();
      assert.ok(!body.includes('fixture-token')); assert.ok(!body.includes('fixture-password'));
    }
  });
}
