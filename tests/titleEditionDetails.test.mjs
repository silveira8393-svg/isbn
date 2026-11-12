import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle = await build({ entryPoints: ['src/services/titleEditionDetails.ts'], bundle: true, write: false,
  platform: 'node', format: 'esm', plugins: [{ name: 'session-only', setup(b) {
    b.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'session', namespace: 'mock' }));
    b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const supabase={auth:{getSession:async()=>({data:{session:{user:{id:"test"},access_token:"synthetic"}}})}}' }));
  } }] });
const api = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const isbn = '9788550303628', isbn10 = '8550303623', marketplaceId = 'A2Q3Y263D00KWC';
const user = { id: 'test', active: true, role: 'operator', storeId: 'test-store' };
const candidate = source => ({ source, key: 'chosen', book: { id: 'chosen', title: 'Livro', isbn13: isbn,
  provider: { amazon: 'Amazon SP-API', google_books: 'Google Books', curitiba: 'Distribuidora Curitiba' }[source],
  ...(source === 'amazon' ? { amazonTitleReference: { asin: 'TESTASIN01', marketplaceId } }
    : source === 'google_books' ? { googleBooksReference: { volumeId: 'chosen', isbn } }
    : { curitibaTitleReference: { productId: 'chosen' } }),
  editionReferences: [{ source, id: 'chosen', url: 'https://reference.example.invalid/chosen' }],
  sourceLinks: [{ source, url: 'https://reference.example.invalid/chosen', kind: 'info', isbn }],
} });
const details = c => ({ ...c.book, subtitle: 'Subtítulo', publisher: 'Editora', authors: ['Autora'], year: 2020,
  edition: '2', language: 'por', format: 'brochura', pageCount: 200, weight: 250, weightUnit: 'g',
  width: 14, height: 21, depth: 2, dimensionsUnit: 'cm', categories: ['Literatura'],
  ...(c.source === 'amazon' ? { amazonCatalogReference: { ...c.book.amazonTitleReference, isbn } } : {}),
  ...(c.source === 'curitiba' ? { reference: 'chosen' } : {}),
});

for (const source of ['amazon', 'google_books', 'curitiba']) {
  test(`${source}: fills omissions only and preserves identity, reference, media and manual data`, () => {
    const c = candidate(source), original = structuredClone(c);
    Object.assign(c.book, { publisher: 'Editora selecionada', authors: ['Autora manual'],
      provenance: { subtitle: 'manual' }, coverUrl: 'https://image.example.invalid/original', description: 'Original' });
    const incoming = details(c);
    Object.assign(incoming, { publisher: 'Outra', authors: ['Outro'], description: 'Não importar', coverUrl: 'https://other.invalid/a', price: 99 });
    const result = api.mergeTitleEditionDetails(c, incoming);
    assert.equal(result.publisher, 'Editora selecionada'); assert.deepEqual(result.authors, ['Autora manual']);
    assert.equal(result.subtitle, undefined); assert.equal(result.pageCount, 200);
    assert.equal(result.format, 'CC — Capa Comum'); assert.equal(result.language, 'Português');
    assert.deepEqual(result.sourceLinks, original.book.sourceLinks); assert.deepEqual(result.editionReferences, original.book.editionReferences);
    assert.equal(result.coverUrl, c.book.coverUrl); assert.equal(result.description, 'Original'); assert.equal(result.price, undefined);
    assert.equal(c.book.pageCount, undefined); assert.equal(result.id, 'chosen');
  });
}
test('equivalent ISBN-10 and ISBN-13 are accepted; invalid, conflicting and cross-source identities rejected', () => {
  const c = candidate('amazon'), incoming = details(c);
  delete incoming.isbn13; incoming.isbn10 = isbn10;
  assert.equal(api.mergeTitleEditionDetails(c, incoming).pageCount, 200);
  for (const patch of [{ isbn10: '123' }, { isbn13: '9788576573357' }, { provider: 'Google Books' }]) {
    const result = api.mergeTitleEditionDetails(c, { ...incoming, ...patch });
    assert.equal(result.pageCount, undefined); assert.ok(result.bibliographicWarnings.length);
  }
});
test('different ASIN, marketplace, volume, product, title, edition or binding reject the whole complement', () => {
  for (const source of ['amazon', 'google_books', 'curitiba']) {
    const c = candidate(source); Object.assign(c.book, { edition: '2', format: 'CC' });
    const incompatible = source === 'amazon' ? [{ amazonCatalogReference: { asin: 'OTHERASIN1', marketplaceId, isbn } },
      { amazonCatalogReference: { asin: 'TESTASIN01', marketplaceId: 'other', isbn } }]
      : source === 'google_books' ? [{ googleBooksReference: { volumeId: 'other', isbn } }] : [{ reference: 'other' }];
    for (const patch of [...incompatible, { title: 'Outro livro' }, { edition: '3' }, { format: 'hardcover' }])
      assert.equal(api.mergeTitleEditionDetails(c, { ...details(c), ...patch }).pageCount, undefined);
    assert.equal(api.mergeTitleEditionDetails(c, details(c)).pageCount, 200);
  }
});
test('invalid numeric values and unit ambiguity do not enter the draft', () => {
  const c = candidate('amazon'), incoming = details(c);
  Object.assign(incoming, { pageCount: -1, weight: 5, weightUnit: undefined, width: 10, dimensionsUnit: undefined, year: 'unknown' });
  const result = api.mergeTitleEditionDetails(c, incoming);
  for (const field of ['pageCount', 'weight', 'width', 'year']) assert.equal(result[field], undefined);
});
test('Google title confirmation reuses only the Google ISBN route', async t => {
  const c = candidate('google_books'), calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push(String(url)); assert.ok(init.signal); return Response.json({ status: 'success', book: details(c), diagnostic: { code: 'exact_isbn' } });
  });
  assert.equal((await api.completeTitleEdition(c, user)).pageCount, 200);
  assert.deepEqual(calls, ['/api/google-books?isbn=' + isbn]);
});
test('Amazon official ISBN route selects only the chosen ASIN among multiple products', async t => {
  const c = candidate('amazon'), calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push(String(url)); assert.equal(init.headers['x-isbn-store-id'], user.storeId);
    return Response.json({ isbn, items: ['OTHERASIN1', 'TESTASIN01'].map((asin, i) => ({ asin, marketplaceId, isbn,
      isbn13: isbn, identifiers: [{ type: 'ISBN_13', identifier: isbn }], title: 'Livro', publisher: i ? 'Selecionada' : 'Outra', pageCount: i ? 200 : 999 })) });
  });
  const result = await api.completeTitleEdition(c, user);
  assert.equal(result.publisher, 'Selecionada'); assert.equal(result.pageCount, 200);
  assert.equal(result.amazonTitleReference.asin, 'TESTASIN01'); assert.deepEqual(calls, ['/api/amazon/spapi/catalog?isbn=' + isbn]);
});
test('Amazon does not use another ASIN when the chosen one is missing', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ isbn, items: [{ asin: 'OTHERASIN1', marketplaceId, isbn, isbn13: isbn, title: 'Livro', pageCount: 999 }] }));
  assert.equal((await api.completeTitleEdition(candidate('amazon'), user)).pageCount, undefined);
});
test('Curitiba reuses public ISBN service and validates selected product', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push(String(url)); assert.ok(init.signal);
    if (String(url).includes('loginAcessoPublico')) return Response.json({ usuario: {}, empresa: {}, cliente: {} });
    if (String(url).includes('findAllByExampleByPages')) {
      assert.equal(JSON.parse(init.body).opcaoFiltro, 4); assert.equal(JSON.parse(init.body).dsPalavraChave, isbn);
      return Response.json([{ cdProduto: 'other', dsProduto: 'Outra' }, { cdProduto: 'chosen', dsProduto: 'Livro' }]);
    }
    assert.equal(JSON.parse(init.body).cdProduto, 'chosen');
    return Response.json({ cdProduto: 'chosen', dsProduto: 'Livro', nuCdBarras: isbn, AD_CDISBN: isbn10, AD_NRPAGINA: 200, AD_DSFORMATO: 'brochura' });
  });
  const result = await api.completeTitleEdition(candidate('curitiba'), user);
  assert.equal(result.pageCount, 200); assert.equal(result.format, 'CC — Capa Comum');
  assert.equal(calls.length, 3); assert.ok(calls.every(url => url.startsWith('https://distribuidoracuritiba.com.br/')));
});
test('missing/invalid ISBN never triggers a second lookup', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('no lookup'));
  for (const id of [undefined, '123']) {
    const c = candidate('google_books'); c.book.isbn13 = id;
    assert.deepEqual(await api.completeTitleEdition(c, user), c.book);
  }
});
test('403, 429, empty response and transport failure retain original data', async t => {
  for (const fetcher of [async () => new Response('', { status: 403 }), async () => new Response('', { status: 429 }),
    async () => Response.json({ status: 'not_found', book: null, diagnostic: { code: 'none' } }), async () => { throw Error('offline'); }]) {
    const mock = t.mock.method(globalThis, 'fetch', fetcher);
    const c = candidate('google_books'), result = await api.completeTitleEdition(c, user);
    assert.equal(result.title, c.book.title); assert.equal(result.id, c.book.id); assert.equal(result.pageCount, undefined);
    assert.ok(result.bibliographicWarnings.length); mock.mock.restore();
  }
});
test('timeout returns the original edition even when transport ignores abort; late response cannot mutate it', async t => {
  let finish, requestSignal;
  t.mock.method(globalThis, 'fetch', (_url, init) => { requestSignal = init.signal; return new Promise(resolve => { finish = resolve; }); });
  const c = candidate('google_books'), result = await api.completeTitleEdition(c, user, undefined, 10);
  assert.equal(requestSignal.aborted, true); assert.equal(result.pageCount, undefined);
  finish(Response.json({ status: 'success', book: details(c), diagnostic: { code: 'exact_isbn' } }));
  await new Promise(resolve => setImmediate(resolve)); assert.equal(result.pageCount, undefined);
});
