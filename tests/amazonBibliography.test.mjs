import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';

// Authored HTML, not a download or a claim about the reference edition's real catalog.
const isbn = '9798276439839', asin = 'B0G4CS2PMG', marketplaceId = 'A2Q3Y263D00KWC';
const user = { id: '11111111-1111-4111-8111-111111111111', storeId: '22222222-2222-4222-8222-222222222222', role: 'developer', active: true };
const cover = 'https://m.media-amazon.com/images/I/ISBNFixtureCapa.jpg';
const back = 'https://m.media-amazon.com/images/I/ISBNFixtureContracapa.jpg';
const row = (label, value) => `<tr><th>${label}</th><td>${value}</td></tr>`;
const html = (rows = '', target = isbn) => `<link rel="canonical" href="https://www.amazon.com.br/dp/${asin}"><input id="ASIN" value="${asin}">
  <h1 id="productTitle">Obra de ensaio bibliográfico</h1><div id="bylineInfo"><span><a>Autor de ensaio</a> (Autor)</span></div>
  <table id="productDetails_detailBullets_sections1">${row('ISBN-13', target)}${rows}</table>
  <img id="landingImage" src="${cover}"><div id="altImages"><li class="imageThumbnail"><img src="${back}"></li></div>`;
const fullRows = row('Editora', 'Selo de ensaio') + row('Número de páginas', '211 páginas') + row('Peso do produto', '0,3195 kg')
  + row('Subtítulo', 'Caderno de ensaio')
  + row('Data da publicação', '15/03/2024') + row('Idioma', 'Português') + row('Formato', 'Capa comum') + row('Edição', '2ª edição')
  + row('Dimensões do produto', '140 x 210 x 20 mm (L x A x P)');
const output = await build({ stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
  export * from './src/services/amazonOfficial';
  export {searchCatalog} from './server/spapi/catalog';
  export {createRegistrationDraft} from './src/utils/draft';
  export {parseAmazonHtml,toLabResult,extractAmazon} from './experimentos/amazon/extrator_amazon';
  export {renderToStaticMarkup} from 'react-dom/server';
  export {createElement} from 'react';
  export {parseHtml} from './experimentos/amazon/html_local';
  export {default as Form} from './src/components/magazord/ProductRegistrationForm';
  export {default as Card} from './src/components/BookDetailsCard';
` }, bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
  define: { 'import.meta.env': '{}' }, plugins: [{ name: 'no-database', setup(b) {
    b.onResolve({ filter: /lib\/supabase(?:\.js)?$/ }, () => ({ path: 'session', namespace: 'mock' }));
    b.onResolve({ filter: /contexts\/UserContext$/ }, () => ({ path: 'user', namespace: 'mock' }));
    b.onLoad({ filter: /^user$/, namespace: 'mock' }, () => ({ contents: `export const useUser=()=>({currentUser:${JSON.stringify(user)}});` }));
    b.onLoad({ filter: /^session$/, namespace: 'mock' }, () => ({ contents: `export const supabaseUrl='https://database.invalid';export const supabase={auth:{getSession:async()=>globalThis.__bibSession},from:()=>{throw new Error('Persistence forbidden')}};` }));
  } }] });
const mod = { exports: {} }; new Function('module', 'exports', 'require', output.outputFiles[0].text)(mod, mod.exports, (await import('node:module')).createRequire(import.meta.url));
const api = mod.exports;
const result = (source = html(fullRows), target = isbn, targetAsin = asin) => api.toLabResult(api.parseAmazonHtml(source, target, 'memory', 'fixture_sintetica', targetAsin), 'http');
const base = (changes = {}) => ({ id: 'selected', title: 'Obra de ensaio bibliográfico', isbn13: isbn, authors: ['Autor de ensaio'],
  amazonCatalogReference: { asin, isbn, marketplaceId }, coverUrl: cover, ...changes });
function setup(t, payload = result()) {
  globalThis.__bibSession = { data: { session: { user: { id: user.id }, access_token: 'synthetic-session-only' } } };
  t.after(() => { delete globalThis.__bibSession; });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls++; assert.equal(url, '/api/amazon?acao=search');
    assert.deepEqual(JSON.parse(init.body), { isbn, modo: 'http', asin });
    if (payload instanceof Error) throw payload;
    return Response.json(payload);
  });
  return () => calls;
}
function formValues(book, condition) {
  const draft = api.createRegistrationDraft(book, condition);
  const markup = api.renderToStaticMarkup(api.createElement(api.Form, { draft, originalBook: book, onUpdateDraft() {},
    onBackToSearch() {}, onSuccessRegistration() {}, onProcessNextBook() {} }));
  const nodes = [...api.parseHtml(markup).root.walk()];
  const inputs = field => nodes.filter(n => n.attrs['data-registration-field'] === field
    || (field === 'subtitle' && n.tag === 'input' && n.attrs.placeholder === 'Ex: Uma reflexão...'));
  const value = field => { const node = inputs(field)[0]; if (!node) return undefined;
    return node.tag === 'select' ? [...node.walk()].find(n => Object.hasOwn(n.attrs, 'selected'))?.attrs.value : node.attrs.value ?? node.text(); };
  return { draft, nodes, value, inputs, markup };
}

test('979: factual extraction and one existing Lab call reach actual NOVO/USADO form inputs and Consulta', async t => {
  const calls = setup(t); const original = base(), before = structuredClone(original);
  const book = await api.complementAmazonImages(original, isbn, user);
  assert.equal(calls(), 1); assert.deepEqual(original, before);
  assert.equal(book.publisher, 'Selo de ensaio'); assert.equal(book.pageCount, 211); assert.equal(book.weight, 319.5);
  assert.equal(book.weightUnit, 'g'); assert.deepEqual([book.width, book.height, book.depth], [14, 21, 2]);
  assert.equal(book.publishedDate, '2024-03-15'); assert.equal(book.synopsis, undefined);
  assert.match(book.provenance.publisher, /^amazon_lab_verified:/);
  const card = api.renderToStaticMarkup(api.createElement(api.Card, { book }));
  assert.match(card, /Selo de ensaio/); assert.match(card, /211/); assert.match(card, /320 g/); // Existing Consulta presentation rounds grams; input retains 319.5.
  for (const condition of ['novo', 'usado']) {
    const form = formValues(book, condition);
    for (const [field, expected] of Object.entries({ title: original.title, subtitle: 'Caderno de ensaio', publisher: 'Selo de ensaio', year: '2024',
      pageCount: '211', weight: '319.5', width: '14', height: '21', depth: '2', language: 'Português', edition: '2ª' }))
      assert.equal(form.value(field), expected, `${condition} actual input ${field}`);
    assert.equal(form.inputs('authors')[0].attrs.value, 'Autor de ensaio');
    assert.equal(form.draft.format, 'CC - Capa Convencional'); assert.equal(form.draft.brand, '');
    assert.equal(form.draft.mainImageUrl, cover); assert.deepEqual(form.draft.additionalImageUrls, [back]);
    assert.equal(form.draft.childCode, condition === 'novo' ? isbn : '');
    assert.ok(form.nodes.some(n => n.tag === 'img' && n.attrs.src === cover));
    assert.ok(form.nodes.some(n => n.tag === 'img' && n.attrs.src === back));
  }
});

test('valid priority values, dimensions, manual synopsis and commercial fields are not overwritten; conflicts are reviewable', async t => {
  setup(t); const original = base({ title: 'Título escolhido', authors: ['Autor escolhido'], publisher: 'Editora escolhida',
    pageCount: 300, weight: .4, weightUnit: 'kg', year: '2020', publishedDate: '2020-01-01',
    width: .33, height: 9, depth: 6, dimensionsUnit: 'cm', synopsis: 'Sinopse manual', edition: undefined });
  const book = await api.complementAmazonImages(original, isbn, user);
  for (const key of Object.keys(original).filter(key => original[key] !== undefined)) assert.deepEqual(book[key], original[key], key);
  assert.ok(book.bibliographicWarnings.some(w => w.startsWith('editora:')));
  assert.ok(book.bibliographicWarnings.some(w => w.startsWith('peso:')));
  assert.match(api.renderToStaticMarkup(api.createElement(api.Card, { book })), /divergência no Laboratório Amazon/);
});

test('partial factual fields complement even when no image is added; invalid existing pages can be replaced', async t => {
  setup(t, result(html(row('Número de páginas', '211 páginas'))));
  const book = await api.complementAmazonImages(base({ pageCount: -1, additionalImages: [back] }), isbn, user);
  assert.equal(book.pageCount, 211); assert.equal(book.publisher, undefined); assert.equal(book.weight, undefined);
  assert.equal(book.synopsis, undefined); assert.equal(api.createRegistrationDraft(book).brand, '');
});

test('unknown language, binding, edition, publisher text or measurement units require review rather than automatic replacement', async t => {
  setup(t); const original=base({language:'Idioma composto',format:'Formato especial',edition:'Reimpressão',publisher:'Oferta editorial',
    weight:45,width:12,height:20,depth:3});
  const book=await api.complementAmazonImages(original,isbn,user);
  for(const key of ['language','format','edition','publisher','weight','width','height','depth'])assert.equal(book[key],original[key],key);
  assert.equal(book.weightUnit,undefined);assert.equal(book.dimensionsUnit,undefined);
  assert.ok(book.bibliographicWarnings.some(w=>w.includes('ambíguo ou unidade não identificada')));
});

test('generic/package/shipping weight and unlabeled dimension triples never become item measurements', async t => {
  const calls = setup(t, result(html(row('Peso', '319 g') + row('Peso da embalagem', '319 g') + row('Peso de envio', '319 g')
    + row('Dimensões do produto', '15,24 x 0,84 x 22,86 cm'))));
  const book = await api.complementAmazonImages(base(), isbn, user);
  assert.equal(calls(), 1); assert.equal(book.weight, undefined); assert.equal(book.width, undefined);
  assert.equal(result(html(row('Peso', '319 g'))).complementares.peso.estado, 'inconsistente');
  assert.equal(formValues(book, 'novo').value('weight'), '');
});

test('ISBN/ASIN mismatch, ambiguous edition, invalid/low-confidence values and laboratory failures preserve prior data', async t => {
  const original = base(); const responses = [result(html(fullRows, '9788535914849')), result(html(fullRows).replaceAll(asin, 'B000000000')),
    { status: 'interrompida', status_http: 403 }, { status: 'interrompida', status_http: 429 }, new Error('offline')];
  for (const payload of responses) { const calls = setup(t, payload); assert.deepEqual(await api.complementAmazonImages(original, isbn, user), original); assert.equal(calls(), 1); }
  const ambiguous = result(html(fullRows + row('Número de páginas', '299 páginas') + row('Editora', 'Outro selo')));
  setup(t, ambiguous); const partial = await api.complementAmazonImages(original, isbn, user);
  assert.equal(partial.pageCount, undefined); assert.equal(partial.publisher, undefined);
  setup(t, result()); const edition = await api.complementAmazonImages(base({ edition: '3ª' }), isbn, user);
  assert.equal(edition.publisher, undefined); assert.match(edition.bibliographicWarnings.join(' '), /Edição divergente/);
});

test('978 sanitized existing HTML complements its real explicit facts through the old transport contract', async t => {
  const target = '9788535914849';
  const source = await readFile(new URL('../experimentos/amazon/fixtures/amazon_1984_9788535914849.html', import.meta.url), 'utf8');
  const payload = api.toLabResult(api.parseAmazonHtml(source, target), 'http');
  globalThis.__bibSession = { data: { session: { user: { id: user.id }, access_token: 'synthetic-session-only' } } };
  t.after(() => { delete globalThis.__bibSession; });
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, '/api/amazon?acao=search'); assert.deepEqual(JSON.parse(init.body), { isbn: target, modo: 'http' }); return Response.json(payload);
  });
  const book = await api.complementAmazonImages({ id: 'primary', title: '', isbn13: target }, target, user);
  assert.equal(book.publisher, payload.book_info.publisher); assert.equal(book.pageCount, payload.book_info.pageCount);
  assert.equal(book.weight, 605); assert.equal(book.publishedDate, '2009-07-21'); assert.equal(book.synopsis, undefined);
  assert.equal(book.width, undefined, 'unlabeled axes are not inferred');
  assert.equal(formValues(book, 'novo').value('publisher'), payload.book_info.publisher);
});

test('even an explicit valid synopsis or injected brand is excluded from automatic factual complement', async t => {
  const payload = result(html(fullRows + row('Sinopse', 'A história apresenta personagens de ensaio que exploram um mundo imaginário e analisam escolhas ao longo de uma narrativa inteiramente autoral.')));
  payload.book_info.brand = 'Must not import'; setup(t, payload);
  const book = await api.complementAmazonImages(base(), isbn, user);
  assert.equal(book.synopsis, undefined); assert.equal(book.description, undefined); assert.equal(book.brand, undefined);
  assert.equal(formValues(book, 'usado').draft.synopsis, '');
});

test('actual previously supplied SP-API JSON retains its known facts in form inputs; missing facts are never invented', async t => {
  const payload = JSON.parse(await readFile(new URL('./fixtures/amazon_spapi_9798276439839_resposta_fornecida.json', import.meta.url), 'utf8'));
  assert.equal(createHash('sha256').update(JSON.stringify(payload)).digest('hex'), 'cd15b6d7ea4b656d857be112e45f8d496d7facbc365a78b140f1dba86fd81764');
  globalThis.__bibSession = { data: { session: { user: { id: user.id }, access_token: 'synthetic-session-only' } } };
  t.after(() => { delete globalThis.__bibSession; });
  let calls = 0; t.mock.method(globalThis, 'fetch', async url => { calls++; assert.equal(url, '/api/amazon/spapi/catalog?isbn='+isbn);return Response.json(payload); });
  const official = await api.searchAmazonOfficial(isbn, user);
  assert.equal(calls, 1); assert.equal(official.status, 'success');
  const book = api.complementWithAmazon(null, official.book);
  assert.equal(book.amazonCatalogReference.asin, asin); assert.equal(book.publisher, undefined); assert.equal(book.pageCount, undefined);
  assert.equal(book.edition, undefined); assert.equal(book.weight, undefined); assert.equal(book.amazonPhysical.package.weight.value, .6);
  assert.equal(book.synopsis, undefined); assert.equal(book.amazonImages.length, 2);
  for (const condition of ['novo','usado']) {
    const form = formValues(book,condition);
    for(const [field,value] of Object.entries({title:'O Rei de Amarelo',year:'2025',language:'Português',width:'0.84',height:'22.86',depth:'15.24'})) assert.equal(form.value(field),value);
    assert.equal(form.inputs('authors')[0].attrs.value,'W. Chambers, Robert');
    for(const field of ['publisher','pageCount','edition','weight']) assert.equal(form.value(field),'');
    assert.equal(form.draft.mainImageUrl,payload.items[0].images[0].link); assert.deepEqual(form.draft.additionalImageUrls,[]);
    assert.equal(form.draft.brand,''); assert.equal(form.draft.synopsis,'');
  }
});

test('both observed SP-API page counts flow through real parser, client, provenance, Consulta and NOVO/USADO inputs', async t => {
  for(const [targetIsbn,count,expectedWeight,expectedWidth] of [['9798276439839',143,'','0.84'],['9798286828647',193,'353.8','1.12']]) {
  const factual = JSON.parse(await readFile(new URL(`./fixtures/spapi-recovery-${targetIsbn}.json`, import.meta.url), 'utf8'));
  const original = { asin: factual.asin, attributes: factual.attributes, summaries: [factual.summary], dimensions: factual.dimensions,
    identifiers: [{ marketplaceId, identifiers: [{ identifierType: 'ISBN', identifier: factual.isbn }] }] };
  let upstreamCalls = 0;
  const projected = await api.searchCatalog({client:'synthetic-client',secret:'synthetic-secret'}, async (url, init) => {
    upstreamCalls++; assert.equal(new URL(url).origin, 'https://sellingpartnerapi-na.amazon.com'); assert.equal(init.method, 'GET');
    return Response.json({numberOfResults:1,items:[original]});
  }, factual.isbn, 'synthetic-access');
  globalThis.__bibSession = {data:{session:{user:{id:user.id},access_token:'synthetic-session-only'}}};
  t.after(()=>{delete globalThis.__bibSession;});
  let clientCalls = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    clientCalls++; assert.equal(url, '/api/amazon/spapi/catalog?isbn='+factual.isbn); return Response.json(projected);
  });
  const official = await api.searchAmazonOfficial(factual.isbn,user);
  const book = api.complementWithAmazon(null,official.book);
  assert.equal(book.pageCount,count); assert.equal(book.provenance.pageCount,'amazon_spapi_catalog_2022-04-01');
  assert.equal(book.amazonCatalogReference.asin,factual.asin); assert.equal(book.isbn13,factual.isbn);
  assert.equal(book.publisher,undefined); assert.equal(book.edition,undefined);
  assert.equal(book.weight,expectedWeight ? Number(expectedWeight) : undefined);
  assert.equal(book.synopsis,undefined); assert.equal(book.amazonPhysical.package.weight.value,factual.processedBefore.physical.package.weight.value);
  assert.match(api.renderToStaticMarkup(api.createElement(api.Card,{book})),new RegExp(String(count)));
  for(const condition of ['novo','usado']){
    const form = formValues(book,condition); assert.equal(form.value('pageCount'),String(count));
    assert.equal(form.value('title'),factual.processedBefore.title); assert.equal(form.value('year'),'2025');
    assert.equal(form.value('language'),'Português'); assert.equal(form.value('publisher'),''); assert.equal(form.value('weight'),expectedWeight);
    assert.equal(form.value('width'),expectedWidth); assert.equal(form.value('height'),'22.86'); assert.equal(form.value('depth'),'15.24');
    assert.equal(form.inputs('authors')[0].attrs.value,factual.processedBefore.authors[0]);
  }
  const selected = base({isbn13:targetIsbn,pageCount:300,provenance:{pageCount:'source-selected'}});
  const preserved = api.complementWithAmazon(selected,official.book);
  assert.equal(preserved.pageCount,300); assert.equal(preserved.provenance.pageCount,'source-selected');
  assert.equal(upstreamCalls,1); assert.equal(clientCalls,1);
  }
});

test('an empty laboratory book with only review warnings does not become a false bibliographic match', async t => {
  const target='9788535914849';
  const payload=api.toLabResult(api.parseAmazonHtml(html(row('Peso','100 g'),target).replace(/<h1[\s\S]*?<\/h1>/,''),target),'http');
  delete payload.campos.autores; delete payload.book_info.authors;
  globalThis.__bibSession={data:{session:{user:{id:user.id},access_token:'synthetic-only'}}};
  t.after(()=>{delete globalThis.__bibSession;});
  payload.imagens.itens=[];
  t.mock.method(globalThis,'fetch',async()=>Response.json(payload));
  assert.equal(await api.complementAmazonImages(null,target,user),null);
});
