import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const compiled = await build({ stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
 export * from './shared/amazonBibliography'; export * from './shared/amazonTitle';
 export * from './src/services/distribuidoraCuritiba'; export * from './src/utils/editionReferences';
 export {createRegistrationDraft} from './src/utils/draft'; export {createRegistrationSnapshot} from './src/utils/registrationSnapshot';
 export {searchCatalog} from './server/spapi/catalog';
 export {default as References} from './src/components/EditionReferenceLinks';
 export {default as History} from './src/components/SearchHistoryGroup';
 export {createElement} from 'react'; export {renderToStaticMarkup} from 'react-dom/server';
` }, bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic' });
const module = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const api = module.exports, isbn = '9788584390670', marketplace = 'A2Q3Y263D00KWC';
const amazon = { source: 'amazon_spapi_catalog_2022-04-01', marketplaceId: marketplace, asin: 'ASIN000001', title: 'O Alquimista' };
const render = (component, props) => api.renderToStaticMarkup(api.createElement(component, props));

test('Amazon cover formats use existing CC/CD codes; unknown formats remain editable and empty', () => {
  for (const input of ['paperback', ' softcover ', 'PAPERBACK', 'Soft  Cover']) assert.equal(api.amazonCoverFormat(input), 'CC - Capa Convencional');
  for (const input of ['hardcover', 'HARDBACK', ' hard cover ']) assert.equal(api.amazonCoverFormat(input), 'CD - Capa Dura');
  for (const binding of [undefined, '', 'unknown', 'wirebound']) {
    const book = api.mapAmazonTitleResponse({ query: 'book', items: [{ ...amazon, binding }] }).candidates[0].book;
    assert.equal(book.format, undefined); assert.equal(api.createRegistrationDraft(book).format, '');
  }
  const book = api.mapAmazonTitleResponse({ query: 'book', items: [{ ...amazon, binding: 'hardback' }] }).candidates[0].book;
  assert.equal(api.createRegistrationDraft(book).format, 'CD - Capa Dura');
});
test('Amazon personal authors normalize clear inversion and retain particles, ambiguous credits and individual identity', () => {
  for (const [input, expected] of [['Coelho, Paulo', 'Paulo Coelho'], ['da Silva, Maria', 'Maria da Silva'],
    ['García Márquez, Gabriel', 'Gabriel García Márquez'], ['Paulo Coelho', 'Paulo Coelho'],
    ['Silva, João, Jr.', 'Silva, João, Jr.'], ['Editora, Exemplo', 'Editora, Exemplo'], ['Silva, J.', 'Silva, J.'],
    ['Coelho (org.), Paulo', 'Coelho (org.), Paulo'], ['Silva, Maria e João', 'Silva, Maria e João']]) assert.equal(api.amazonAuthorName(input), expected);
  const book = api.mapAmazonTitleResponse({ query: 'book', items: [{ ...amazon, authors: ['Coelho, Paulo', 'da Silva, Maria'] }] }).candidates[0].book;
  assert.deepEqual(book.authors, ['Paulo Coelho', 'Maria da Silva']);
});
test('Publisher uses only explicit selected-ASIN publisher attributes and never manufacturer or another marketplace', async () => {
  const item = { asin: amazon.asin, summaries: [{ marketplaceId: marketplace, itemName: 'Book' }], attributes: {
    manufacturer: [{ value: 'Not a publisher' }], publisher: [{ marketplace_id: 'OTHER', value: 'Wrong marketplace' }],
    book_publisher: [{ marketplace_id: marketplace, value: 'Selected Press' }] } };
  const result = await api.searchCatalog({}, async () => Response.json({ numberOfResults: 2, items: [item, { ...item, asin: 'ASIN000002', attributes: { manufacturer: [{ value: 'Factory' }] } }] }), '', 'synthetic', 'book');
  assert.equal(result.items[0].publisher, 'Selected Press'); assert.equal(result.items[1].publisher, null);
});
test('References are edition-specific, HTTPS and optional even without ISBN; no ISBN-to-ASIN substitution', () => {
  const book = api.mapAmazonTitleResponse({ query: 'book', items: [amazon] }).candidates[0].book;
  const references = api.editionReferences(book);
  assert.deepEqual(references, [{ source: 'amazon', id: amazon.asin, marketplaceId: marketplace, url: 'https://www.amazon.com.br/dp/ASIN000001' }]);
  assert.deepEqual(api.editionReferences({ id: 'none', title: 'Book', isbn13: isbn, provider: 'Amazon SP-API' }), []);
  const google = { volumeId: 'actual-volume', isbn: '', infoLink: 'https://books.google.com/books?id=actual-volume', descriptionAvailable: false, contentReviewRequired: true };
  assert.equal(api.editionReferences({ provider: 'Google Books', googleBooksReference: google })[0].id, 'actual-volume');
  assert.deepEqual(api.editionReferences({ provider: 'Google Books', googleBooksReference: { ...google, infoLink: 'https://books.google.com/books?id=other' } }), []);
  for (const url of ['http://www.amazon.com.br/dp/ASIN000001', 'https://evil.invalid/dp/ASIN000001', 'https://www.amazon.com.br/dp/ASIN000002', 'https://www.amazon.com.br/s?k=book'])
    assert.equal(api.validEditionReference({ ...references[0], url }), false);
  const markup = render(api.References, { book }); assert.match(markup, /Referência da obra/); assert.match(markup, /target="_blank"/); assert.match(markup, /noopener noreferrer/);
  assert.equal(render(api.References, { book: { id: 'missing', title: 'No URL' } }), '');
  const draft = api.createRegistrationDraft(book); assert.deepEqual(draft.editionReferences, references);
  assert.equal(JSON.stringify(api.createRegistrationSnapshot(draft)).includes('amazon.com.br'), false);
  assert.equal(draft.price, ''); assert.equal(draft.parentCode, '');
});
test('History keeps original references through serialization and renders old URL-free entries safely', () => {
  const book = api.mapAmazonTitleResponse({ query: 'book', items: [amazon] }).candidates[0].book;
  const reference = api.editionReferences(book)[0];
  const restored = JSON.parse(JSON.stringify({ timestamp: 1, title: book.title, isbn: '', success: true, provider: book.provider, editionReferences: [reference] }));
  const markup = render(api.History, { items: [restored, { timestamp: 2, title: 'Legacy', isbn, success: true }], onSelect() {}, onClear() {}, onExport() {} });
  assert.match(markup, /ASIN000001/); assert.match(markup, /Legacy/); assert.match(markup, /Abrir produto na fonte/);
  const existing = { ...reference, url: reference.url + '/' };
  assert.equal(api.editionReferences({ ...book, editionReferences: [existing] })[0].url, existing.url);
  const other = { ...reference, id: 'ASIN000002', url: 'https://www.amazon.com.br/dp/ASIN000002' };
  assert.equal(api.editionReferences({ ...book, editionReferences: [other] }).some(ref => ref.id === 'ASIN000002'), false);
});

const first = { cdProduto: 'LV1', dsProduto: 'Edição A', nuCdBarras: isbn };
const second = { cdProduto: 'LV2', dsProduto: 'Edição B', camposDinamicos: [{ AD_DSEDITORA: 'Editora B', AD_NUEDICAO: '2' }] };
function publicCatalog(t, settings = {}) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const path = String(url), body = JSON.parse(init.body || '{}'); calls.push({ path, body });
    assert.ok(init.signal instanceof AbortSignal);
    if (settings.transport) throw new DOMException('timeout', 'TimeoutError');
    if (path.endsWith('/auth/loginAcessoPublico')) return Response.json({ sessionId: 'synthetic-public-session', cdSistema: 50, empresa: { cdEmpresa: 1 }, usuario: { cdUsuario: 2 }, cliente: { cdCliente: 3 } });
    if (path.includes('/findAllByExampleByPages')) {
      assert.equal(body.opcaoFiltro, 1); assert.equal(body.pageLines, 20); assert.equal(body.dsPalavraChave, 'O Alquimista');
      return Response.json(settings.search || { multiple: true, collections: [[first, second], [{ cdProduto: 'LV1', vlPrecoFinal: 123 }]] }, { status: settings.status || 200 });
    }
    if (path.endsWith('/findProdutoByPrimaryKey')) return Response.json(settings.detail || second, { status: settings.detailStatus || 200 });
    throw Error('Unexpected request: ' + path);
  }); return calls;
}
test('Curitiba title preserves multiple products, fetches only the chosen detail and caches it in the current search', async t => {
  const calls = publicCatalog(t); const result = await api.searchCuritibaByTitle('O Alquimista');
  assert.equal(result.status, 'success'); assert.deepEqual(result.candidates.map(c => c.key), ['LV1', 'LV2']); assert.equal(calls.length, 2);
  const selected = await result.loadDetail('LV2'); assert.equal(selected.book.publisher, 'Editora B'); assert.equal(selected.book.edition, '2');
  assert.equal(selected.book.isbn13, undefined); assert.equal(selected.book.id, 'curitiba:LV2'); assert.equal(calls.length, 3);
  assert.equal(calls[2].body.cdProduto, 'LV2'); assert.equal((await result.loadDetail('LV2')).key, 'LV2'); assert.equal(calls.length, 3);
  assert.equal(await result.loadDetail('LV999'), null); assert.equal(calls.length, 3); assert.doesNotMatch(JSON.stringify(result.candidates), /sessionId|vlPrecoFinal|synthetic-public-session/);
});
test('Curitiba timeout, invalid response, empty list and individual failure are explicit and isolated', async t => {
  for (const settings of [{ transport: true }, { status: 503 }, { search: {} }]) {
    const scope = t.mock; publicCatalog(t, settings); assert.equal((await api.searchCuritibaByTitle('O Alquimista')).status, 'unavailable'); scope.restoreAll();
  }
  publicCatalog(t, { search: { collections: [] } }); assert.equal((await api.searchCuritibaByTitle('O Alquimista')).status, 'not_found'); t.mock.restoreAll();
  publicCatalog(t, { detail: { ...second, cdProduto: 'LV999' } }); const result = await api.searchCuritibaByTitle('O Alquimista'); assert.equal(await result.loadDetail('LV2'), null);
});
test('Curitiba ISBN retains filter 4, exact request and the original detailed mapping', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls++; const body = JSON.parse(init.body);
    if (String(url).endsWith('/auth/loginAcessoPublico')) return Response.json({ sessionId: 'synthetic', cdSistema: 50, empresa: { cdEmpresa: 1 }, usuario: { cdUsuario: 2 } });
    if (String(url).includes('/findAllByExampleByPages')) { assert.equal(body.opcaoFiltro, 4); assert.equal(body.dsPalavraChave, isbn); assert.equal(body.pageLines, 16); return Response.json({ collections: [[first]] }); }
    assert.equal(body.cdProduto, 'LV1');
    return Response.json({ ...first, camposDinamicos: [{ AD_DSEDITORA: 'ISBN Press', AD_DSAUTOR: 'Autor original', AD_NRPAGINA: '240', AD_ANOEDICAO: '2020' }] });
  });
  const result = await api.searchBookByIsbnDistribuidoraCuritiba(isbn);
  assert.equal(result.diagnostic.state, 'success'); assert.equal(result.book.isbn13, isbn); assert.equal(result.book.publisher, 'ISBN Press');
  assert.equal(result.book.pageCount, 240); assert.deepEqual(result.book.authors, ['Autor original']); assert.equal(calls, 3);
});
