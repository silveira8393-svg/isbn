// Offline contract tests: actual client, handler, transport, extractor and draft; no Amazon/DB access.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { build } from 'esbuild';

const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
  export * from './src/services/amazonOfficial';
  export { createRegistrationDraft } from './src/utils/draft';
  export { createAmazonFunction } from './server/amazonFunction';
  export { fetchHtml, validateAmazonQuery } from './experimentos/amazon/consulta_amazon';
  export { parseAmazonHtml, toLabResult } from './experimentos/amazon/extrator_amazon';
` }, bundle: true, write: false, platform: 'node', format: 'esm', define: { 'import.meta.env.DEV': 'false' },
  plugins: [{ name: 'session-only', setup(b) {
    b.onResolve({ filter: /lib\/supabase(?:\.js)?$/ }, () => ({ path: 'session', namespace: 'mock' }));
    b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: `export const supabase={auth:{getSession:async()=>globalThis.__asinSession}};` }));
  } }] });
const api = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const isbn = '9798276439839', asin = 'B0G4CS2PMG', marketplaceId = 'A2Q3Y263D00KWC';
const user = { id: '11111111-1111-4111-8111-111111111111', storeId: '22222222-2222-4222-8222-222222222222', active: true, role: 'developer' };
const cover = 'https://isbn-fixtures.invalid/capa-autoral.svg';
const back = 'https://isbn-fixtures.invalid/contracapa-autoral.svg';
const catalog = { isbn, items: [{ asin, isbn, marketplaceId, title: 'O Rei de Amarelo', authors: ['W. Chambers, Robert'],
  publicationDate: '2025-11-27', language: 'portuguese', binding: 'paperback', identifiers: [{ type: 'ISBN_13', identifier: isbn }],
  images: [{ variant: 'MAIN', link: cover, width: 1000, height: 1499 }] }], hasMore: false };
// Authored HTML contract fixture, not downloaded Amazon content. ISBN and page ASIN are independent signals.
const html = `<!doctype html><html><head><link rel="canonical" href="https://www.amazon.com.br/dp/${asin}"></head><body>
  <input id="ASIN" name="ASIN" value="${asin}">
  <h1 id="productTitle">O Rei de Amarelo</h1>
  <table id="productDetails_detailBullets_sections1"><tr><th>ISBN-13</th><td>${isbn}</td></tr></table>
  <img id="landingImage" src="${cover}">
  <div id="altImages"><li class="imageThumbnail"><img src="${back}"></li></div>
  </body></html>`;
const parse = (value = html, target = isbn) => api.parseAmazonHtml(value, target, 'memory', 'fixture_sintetica', asin);
function session(t) {
  globalThis.__asinSession = { data: { session: { user: { id: user.id }, access_token: 'synthetic-test-session-only' } }, error: null };
  t.after(() => { delete globalThis.__asinSession; });
}

test('979: official ASIN reference flows through existing Lab to a deduplicated draft gallery, without another catalog lookup', async t => {
  session(t); const calls = [], reads = [];
  const handler = api.createAmazonFunction({ authorize: async () => {}, log: () => {}, fetchHtml: async (value, unused, targetAsin) => {
    reads.push([value, targetAsin]); return { html, status_http: 200 };
  } });
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push(String(url));
    if (String(url).startsWith('/api/amazon/spapi/catalog?')) return Response.json(catalog);
    assert.equal(url, '/api/amazon?acao=search');
    assert.deepEqual(JSON.parse(init.body), { isbn, modo: 'http', asin });
    assert.equal(init.headers['X-ISBN-Store-Id'], user.storeId);
    return handler(new Request('https://fixture.invalid/api/amazon?acao=search', init));
  });
  const result = await api.searchAmazonOfficial(isbn, user);
  assert.equal(result.status, 'success');
  assert.deepEqual(result.book.amazonCatalogReference, { asin, isbn, marketplaceId });
  const primary = { id: 'primary', title: 'Primary title', isbn13: isbn, authors: ['Primary author'], synopsis: 'Primary synopsis' };
  const consolidated = api.complementWithAmazon(primary, result.book);
  const enriched = await api.complementAmazonImages(consolidated, isbn, user);
  assert.deepEqual(reads, [[isbn, asin]]);
  assert.deepEqual(calls, ['/api/amazon/spapi/catalog?isbn=' + isbn, '/api/amazon?acao=search']);
  assert.equal(enriched.title, primary.title); assert.deepEqual(enriched.authors, primary.authors); assert.equal(enriched.synopsis, primary.synopsis);
  assert.equal(enriched.coverUrl, cover); assert.deepEqual(enriched.additionalImages, [back]);
  const again = await api.complementAmazonImages(enriched, isbn, user);
  assert.strictEqual(again, enriched); // Duplicate gallery does not create another item or overwrite bibliography.
  for (const condition of ['novo', 'usado']) {
    const draft = api.createRegistrationDraft(enriched, condition);
    assert.equal(draft.mainImageUrl, cover); assert.deepEqual(draft.additionalImageUrls, [back]);
    assert.equal(draft.isbn13, isbn); assert.equal(draft.amazonCatalogReference, undefined);
    assert.equal(draft.childCode, condition === 'novo' ? isbn : '');
  }
});

test('ASIN transport uses one fixed-host GET and preserves 978 fallback, redirects and CAPTCHA stopping rules', async () => {
  for (const [target, targetAsin, expected] of [[isbn, asin, asin], ['9788535914849', asin, asin], ['9788535914849', undefined, '8535914846']]) {
    for (const [status, body] of [[200, html], [302, ''], [403, ''], [429, ''], [200, 'robot check captcha']]) {
      let count = 0;
      const requester = (options, callback) => {
        count++; assert.equal(options.hostname, 'www.amazon.com.br'); assert.equal(options.path, '/dp/' + expected);
        assert.equal(options.method, 'GET');
        const req = new EventEmitter(); req.end = () => {
          const response = Readable.from([Buffer.from(body)]); response.statusCode = status; response.headers = { 'content-type': 'text/html' };
          callback(response); queueMicrotask(() => req.emit('close'));
        }; req.destroy = () => {}; return req;
      };
      const result = await api.fetchHtml(target, requester, targetAsin);
      assert.equal(count, 1); assert.equal(result.status_http, status);
      assert.equal(result.html !== null, status === 200 && !body.includes('captcha'));
    }
  }
  assert.throws(() => api.fetchHtml(isbn, () => assert.fail('No network')), error => error.status === 422);
  for (const value of ['', '../secret', 'https://evil.invalid', 'B0G4CS2PMG?x', 'b0g4cs2pmg', 1, null]) {
    assert.throws(() => api.validateAmazonQuery({ isbn, modo: 'http', asin: value }), error => error.status === 422);
  }
  assert.throws(() => api.validateAmazonQuery({ isbn, asin, url: 'https://evil.invalid' }), error => error.status === 400);
});

test('ASIN and ISBN must both identify the page; absence, conflicting canonical and recommendation IDs never authorize images', () => {
  const valid = parse(); assert.equal(valid.correspondencia, 'corresponde'); assert.equal(valid.asin_correspondencia, 'corresponde');
  assert.equal(valid.imagens.itens.length, 2);
  for (const value of [
    html.replaceAll(asin, 'B0WRONG123'),
    html.replace('<input id="ASIN" name="ASIN" value="' + asin + '">', '').replace(/<link[^>]+>/, ''),
    html.replace('/dp/' + asin, '/dp/B0WRONG123'),
    html.replace('https://www.amazon.com.br/dp/', 'https://evil.invalid/dp/'),
    html.replace(isbn, '9788535914849'),
    html.replace('<tr><th>ISBN-13</th><td>' + isbn + '</td></tr>', ''),
    html.replace(isbn, '9798276439830'),
  ]) {
    const report = parse(value); assert.notEqual(report.correspondencia, 'corresponde'); assert.deepEqual(report.imagens.itens, []);
    assert.equal(api.toLabResult(report, 'http').book_info.coverUrl, undefined);
  }
  const missing = html.replace(/<input[^>]+>/, '').replace(/<link[^>]+>/, '') + `<div id="recommendations" data-asin="${asin}"></div>`;
  assert.equal(parse(missing).asin_correspondencia, 'nao_verificavel');
});

test('gallery scripts support alphanumeric ASIN and exclude another edition without executing scripts', () => {
  const script = target => `<script>var x={"asin":"${target}","colorImages":{"initial":[{"variant":"MAIN","hiRes":"${cover}"},{"hiRes":"https://isbn-fixtures.invalid/miolo-autoral.svg"}]}};</script>`;
  assert.equal(parse(html + script(asin)).imagens.itens.length, 3);
  const mismatch = parse(html + script('B0WRONG123'));
  assert.equal(mismatch.imagens.itens.length, 2);
  assert.doesNotMatch(JSON.stringify(mismatch.imagens), /miolo-autoral/);
});

test('979 without trusted reference skips Lab; stale/mismatching ASIN/ISBN responses and failures preserve the existing book', async t => {
  session(t); const book = { id: 'base', title: 'Existing', isbn13: isbn, coverUrl: cover, additionalImages: [back] };
  t.mock.method(globalThis, 'fetch', () => assert.fail('No request without a verified reference'));
  for (const reference of [undefined, { asin, isbn: '9788535914849', marketplaceId }, { asin: '../secret', isbn, marketplaceId }, { asin, isbn, marketplaceId: 'OTHER' }]) {
    const candidate = { ...book, amazonCatalogReference: reference };
    assert.strictEqual(await api.complementAmazonImages(candidate, isbn, user), candidate);
  }
  const candidate = { ...book, amazonCatalogReference: { asin, isbn, marketplaceId } };
  const valid = api.toLabResult(parse(), 'http');
  for (const failure of [new Response('blocked', { status: 403 }), new Response('limited', { status: 429 }),
    { ...valid, asin_pesquisado: 'B0WRONG123' }, { ...valid, asin_correspondencia: 'nao_verificavel' },
    { ...valid, correspondencia: 'divergente' }, { ...valid, isbn_pesquisado: '9788535914849' }]) {
    let count = 0;
    t.mock.method(globalThis, 'fetch', async () => { count++; return failure instanceof Response ? failure : Response.json(failure); });
    assert.strictEqual(await api.complementAmazonImages(candidate, isbn, user), candidate); assert.equal(count, 1);
  }
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Network unavailable'); });
  assert.strictEqual(await api.complementAmazonImages(candidate, isbn, user), candidate);
});

test('official references require a matching returned identifier and stay bound to that edition', async t => {
  session(t);
  for (const item of [{ ...catalog.items[0], identifiers: [] }, { ...catalog.items[0], asin: '../secret' },
    { ...catalog.items[0], identifiers: [{ type: 'ISBN_13', identifier: '9788535914849' }] }]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ isbn, items: [item] }));
    const result = await api.searchAmazonOfficial(isbn, user);
    assert.equal(result.book.amazonCatalogReference, undefined);
  }
  const official = { id: 'official', title: 'Official', isbn13: isbn, amazonCatalogReference: { asin, isbn, marketplaceId } };
  assert.equal(api.complementWithAmazon({ id: 'other', title: 'Other', isbn13: '9788535914849' }, official).amazonCatalogReference, undefined);
});

test('automatic ASIN images retain existing three-role access and never overwrite bibliography or the existing primary cover', async t => {
  session(t); const oldCover = 'https://isbn-fixtures.invalid/another-cover.svg';
  const book = { id: 'base', title: 'Existing title', authors: ['Existing author'], synopsis: 'Existing synopsis', isbn13: isbn,
    coverUrl: oldCover, amazonCatalogReference: { asin, isbn, marketplaceId } };
  const original = structuredClone(book), response = api.toLabResult(parse(), 'http');
  for (const role of ['operator', 'admin', 'developer']) {
    let count = 0;
    t.mock.method(globalThis, 'fetch', async () => { count++; return Response.json(response); });
    const result = await api.complementAmazonImages(book, isbn, { ...user, role });
    assert.equal(count, 1); assert.equal(result.coverUrl, oldCover); assert.deepEqual(result.additionalImages, [back]);
    for (const field of ['title', 'authors', 'synopsis']) assert.deepEqual(result[field], original[field]);
    assert.deepEqual(book, original);
  }
  t.mock.method(globalThis, 'fetch', () => assert.fail('Inactive user cannot fetch'));
  assert.strictEqual(await api.complementAmazonImages(book, isbn, { ...user, active: false }), book);
});
