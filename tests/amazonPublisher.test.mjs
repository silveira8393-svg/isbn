import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Controlled contract fixtures, not recorded responses for the operator's reported books.
const compiled = await build({ stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
  export { searchCatalog } from './server/spapi/catalog';
  export { mapAmazonTitleResponse } from './shared/amazonTitle';
  export { searchAmazonOfficial, complementWithAmazon } from './src/services/amazonOfficial';
  export { completeTitleEdition } from './src/services/titleEditionDetails';
  export { createRegistrationDraft } from './src/utils/draft';
` }, bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{ name: 'synthetic-session', setup(b) {
  b.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'session', namespace: 'mock' }));
  b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const supabase={auth:{getSession:async()=>({data:{session:{user:{id:"publisher-test"},access_token:"synthetic"}}})}}' }));
} }] });
const api = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const isbn = '9788550303628', marketplace = 'A2Q3Y263D00KWC', publisher = 'Editora de Teste Sintético';
const user = { id: 'publisher-test', active: true, role: 'operator', storeId: 'synthetic-store' };
const item = attributes => ({ asin: 'PUBTEST001', attributes,
  summaries: [{ marketplaceId: marketplace, itemName: 'Livro de teste sintético' }],
  identifiers: [{ marketplaceId: marketplace, identifiers: [{ identifierType: 'ISBN', identifier: isbn }] }] });
const catalog = (attributes, title = false) => api.searchCatalog({}, async (_url, init) => {
  assert.equal(init.method, 'GET');
  return Response.json({ numberOfResults: 1, items: [item(attributes)] });
}, title ? '' : isbn, 'synthetic', title ? 'Livro de teste sintético' : undefined);

test('publisher and editorial aliases support explicit simple and structured values in both official searches', async () => {
  for (const name of ['publisher', 'publisher_name', 'book_publisher', 'publishing_company']) {
    for (const value of [publisher, { value: publisher }, [{ value: publisher, marketplace_id: marketplace }],
      [{ name: publisher }], [{ value: { name: publisher }, marketplace_id: marketplace }],
      { publisher_name: [{ value: publisher }] }]) {
      for (const title of [false, true]) assert.equal((await catalog({ [name]: value }, title)).items[0].publisher, publisher);
    }
  }
});
test('publisher missing, empty, malformed or commercial-only remains absent', async () => {
  for (const attributes of [undefined, {}, { publisher: [] }, { publisher: [{ value: '  ' }] },
    { publisher_name: { value: 123 } }, { publisher: [{ value: '<b>Not text</b>' }] },
    { publisher: { unknown: publisher } }, { publisher: { value: { manufacturer: publisher } } },
    { manufacturer: [{ value: publisher }], brand: [{ value: publisher }], seller: [{ name: publisher }] }]) {
    for (const title of [false, true]) {
      const result = await catalog(attributes, title); assert.equal(result.items[0].publisher, null);
      if (title) assert.equal(api.createRegistrationDraft(api.mapAmazonTitleResponse(result).candidates[0].book).publisher, '');
    }
  }
});
test('foreign marketplace entries including nested structures never supply the publisher', async () => {
  for (const value of [{ value: publisher, marketplace_id: 'OTHER' },
    { value: { name: publisher, marketplace_id: 'OTHER' }, marketplace_id: marketplace },
    { name: publisher, marketplaceId: 'OTHER' }]) {
    assert.equal((await catalog({ publisher: [value] })).items[0].publisher, null);
  }
  assert.equal((await catalog({ publisher: [{ value: 'Unscoped' }, { value: publisher, marketplace_id: marketplace }] })).items[0].publisher, publisher);
});
test('selected ASIN publisher never comes from another catalog item', async () => {
  const result = await api.searchCatalog({}, async () => Response.json({ numberOfResults: 2,
    items: [item({ manufacturer: [{ value: publisher }] }), { ...item({ publisher_name: { value: publisher } }), asin: 'PUBTEST002' }] }), '', 'synthetic', 'Livro');
  const candidates = api.mapAmazonTitleResponse(result).candidates;
  assert.equal(candidates[0].book.publisher, undefined); assert.equal(candidates[1].book.publisher, publisher);
});
test('official title projection transfers structured publisher into the existing registration draft', async () => {
  const result = await catalog({ publisher_name: [{ value: { name: publisher }, marketplace_id: marketplace }] }, true);
  const candidate = api.mapAmazonTitleResponse(result).candidates[0];
  assert.equal(candidate.book.publisher, publisher);
  assert.equal(api.createRegistrationDraft(candidate.book).publisher, publisher);
});
test('official ISBN server to client to existing draft transfers publisher; absence stays editable and empty', async t => {
  for (const attributes of [{ publisher: { value: { name: publisher } } }, {}]) {
    const mock = t.mock.method(globalThis, 'fetch', async url => {
      assert.equal(url, '/api/amazon/spapi/catalog?isbn=' + isbn);
      return Response.json(await catalog(attributes));
    });
    const result = await api.searchAmazonOfficial(isbn, user);
    assert.equal(result.status, 'success');
    assert.equal(api.createRegistrationDraft(result.book).publisher, Object.keys(attributes).length ? publisher : '');
    mock.mock.restore();
  }
});
test('same-source ISBN complement fills title-selected publisher only when absent', async t => {
  const candidate = api.mapAmazonTitleResponse(await catalog({}, true)).candidates[0];
  t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(url, '/api/amazon/spapi/catalog?isbn=' + isbn);
    return Response.json(await catalog({ publisher_name: { value: publisher } }));
  });
  const original = structuredClone(candidate.book);
  const result = await api.completeTitleEdition(candidate, user);
  assert.equal(result.publisher, publisher); assert.equal(api.createRegistrationDraft(result).publisher, publisher);
  assert.deepEqual(candidate.book, original); assert.deepEqual(result.amazonTitleReference, original.amazonTitleReference);
  candidate.book.publisher = 'Editora informada pelo operador'; candidate.book.provenance.publisher = 'manual';
  assert.equal((await api.completeTitleEdition(candidate, user)).publisher, candidate.book.publisher);
});
test('traditional ISBN complement preserves prior publisher against missing and different Amazon publishers', () => {
  const base = { id: 'original', title: 'Livro', isbn13: isbn, publisher: 'Editora preenchida', provenance: { publisher: 'manual' } };
  for (const value of [undefined, '', publisher]) {
    const merged = api.complementWithAmazon(base, { id: 'amazon', title: 'Livro', isbn13: isbn, publisher: value });
    assert.equal(api.createRegistrationDraft(merged).publisher, base.publisher); assert.equal(merged.provenance.publisher, 'manual');
  }
});
