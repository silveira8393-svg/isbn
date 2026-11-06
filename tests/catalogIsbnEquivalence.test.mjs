import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

const output = await build({ stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
  export {magazordMockService} from './src/services/magazordMockService';
  export {createRegistrationDraft} from './src/utils/draft';
` }, bundle: true, write: false, platform: 'node', format: 'cjs' });
const isbn13 = '9788551003664', isbn10 = '8551003666';
const storeId = '11111111-1111-4111-8111-111111111111';
const statusOutput = await build({ stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
  export {default as StatusCard} from './src/components/magazord/MagazordStatusCard';
  export {renderToStaticMarkup} from 'react-dom/server'; export {createElement} from 'react';
` }, bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
  plugins: [{ name: 'isolated-user', setup(builder) {
    builder.onResolve({ filter: /contexts\/UserContext$/ }, () => ({ path: 'user', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents:
      `export const useUser=()=>({currentUser:{role:'operator',storeId:'${storeId}'},isDeveloper:false});` }));
  } }] });
const statusModule = { exports: {} };
new Function('module', 'exports', 'require', statusOutput.outputFiles[0].text)(statusModule, statusModule.exports, createRequire(import.meta.url));
const ui = statusModule.exports;
function setup(t) {
  const previous = globalThis.localStorage, storage = new Map(), writes = [];
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => { writes.push(key); storage.set(key, value); } };
  t.after(() => { if (previous === undefined) delete globalThis.localStorage; else globalThis.localStorage = previous; });
  const reload = () => {
    const module = { exports: {} };
    new Function('module', 'exports', 'setTimeout', output.outputFiles[0].text)(module, module.exports, callback => queueMicrotask(callback));
    return module.exports;
  };
  const api = reload();
  const draft = (condition, identifier, childCode = condition === 'novo' ? identifier : 'LV10001') => ({
    ...api.createRegistrationDraft({ id: 'manual-entry', title: 'Obra de ensaio',
      ...(identifier ? identifier.length === 13 ? { isbn13: identifier } : { isbn10: identifier } : {}) }, condition),
    parentCode: `${childCode}-P`, childCode, price: '20,00', quantity: 2,
  });
  return { storage, writes, draft, service: api.magazordMockService.forStore(storeId),
    reload: () => reload().magazordMockService.forStore(storeId) };
}

for (const [stored, searched] of [[isbn13, isbn10], [isbn10, isbn13]])
test(`manual NEW stored as ${stored} is recognized bibliographically as ${searched}`, async t => {
  const h = setup(t); await h.service.createProduct(h.draft('novo', stored), 'auto');
  const before = [...h.storage], writes = h.writes.length;
  const result = await h.reload().checkProductByEan(searched, undefined, undefined, 'auto');
  assert.equal(result.status, 'NEW_PRODUCT_FOUND'); assert.equal(result.childCode, stored);
  assert.equal(result.currentStock, 2); assert.equal(result.canReuseCommercialRegistration, true);
  assert.deepEqual([...h.storage], before); assert.equal(h.writes.length, writes);
});

test('a USED copy is found by its edition ISBN while retaining its independent commercial code', async t => {
  const h = setup(t); await h.service.createProduct(h.draft('usado', isbn13, 'LV10001'), 'auto');
  const before = [...h.storage];
  const result = await h.service.checkProductByEan(isbn10, undefined, undefined, 'auto');
  assert.equal(result.status, 'USED_EDITION_FOUND'); assert.equal(result.childCode, 'LV10001');
  assert.equal(result.canReuseCommercialRegistration, false); assert.equal(result.matches[0].childCode, 'LV10001');
  assert.deepEqual([...h.storage], before);
});

test('two USED copies stored under opposite ISBN forms both remain distinct in either bibliographic lookup', async t => {
  const h = setup(t);
  await h.service.createProduct(h.draft('usado', isbn13, 'LV10001'), 'auto');
  await h.service.createProduct(h.draft('usado', isbn10, 'LV10002'), 'auto');
  const before = [...h.storage], writes = h.writes.length;
  for (const query of [isbn13, isbn10, '978-85-510-0366-4']) {
    const result = await h.reload().checkProductByEan(query, undefined, undefined, 'auto');
    assert.equal(result.status, 'MULTIPLE_MATCHES'); assert.equal(result.canReuseCommercialRegistration, false);
    assert.deepEqual(result.matches.map(record => record.childCode).sort(), ['LV10001', 'LV10002']);
    assert.equal(new Set(result.matches.map(record => record.id)).size, 2);
    assert.ok(result.matches.every(record => record.stock === 2));
  }
  assert.deepEqual([...h.storage], before); assert.equal(h.writes.length, writes);
});

test('equivalent lookups retain NEW plus USED classification and the original stock target', async t => {
  const h = setup(t);
  await h.service.createProduct(h.draft('novo', isbn13), 'auto');
  await h.service.createProduct(h.draft('usado', isbn10, 'LV10001'), 'auto');
  const before = [...h.storage];
  const result = await h.service.checkProductByEan(isbn10, undefined, undefined, 'auto');
  assert.equal(result.status, 'MULTIPLE_MATCHES'); assert.equal(result.canReuseCommercialRegistration, true);
  assert.equal(result.childCode, isbn13); assert.equal(result.matches.length, 2);
  assert.deepEqual([...h.storage], before);
});

for (const condition of ['novo', 'usado']) test(`ISBN-free ${condition} remains discoverable by its exact internal commercial code`, async t => {
  const h = setup(t); await h.service.createProduct(h.draft(condition, '', 'LV10001'), 'auto');
  assert.equal(h.service.getRecordsForEan('LV10001')[0].bibliographicIsbn, null);
  assert.equal((await h.service.checkProductByEan('LV10001', undefined, undefined, 'auto')).exists, true);
  assert.equal((await h.service.checkProductByEan(isbn13, undefined, undefined, 'auto')).status, 'NOT_FOUND');
});

test('a numeric internal code is never used as evidence for an equivalent bibliographic ISBN', async t => {
  const h = setup(t); await h.service.createProduct(h.draft('usado', '', isbn13), 'auto');
  assert.equal(h.service.getRecordsForEan(isbn13).length, 1);
  assert.equal(h.service.getRecordsForEan(isbn10).length, 0);
  assert.equal((await h.service.checkProductByEan(isbn10, undefined, undefined, 'auto')).status, 'NOT_FOUND');
});

for (const stored of [isbn13, isbn10]) test(`existing 1.4.1 record with EAN ${stored} is recognized without rewriting stored data`, async t => {
  const h = setup(t);
  const record = { id: 'legacy-copy', ean: stored, parentCode: 'LV10001-P', childCode: 'LV10001',
    condition: 'usado', title: 'Obra cadastrada anteriormente', stock: 7, registeredAt: 1 };
  const key = `sebo_magazord_simulated_db_v3:store:${storeId}`;
  h.storage.set(key, JSON.stringify({ [stored]: [record] }));
  const before = [...h.storage];
  for (const query of [isbn10, isbn13]) {
    const result = await h.reload().checkProductByEan(query, undefined, undefined, 'auto');
    assert.equal(result.status, 'USED_EDITION_FOUND'); assert.equal(result.currentStock, 7);
    assert.equal(result.childCode, 'LV10001');
  }
  assert.deepEqual([...h.storage], before); assert.deepEqual(h.writes, []);
});

test('commercial duplicate checks stay exact and continue to distinguish copies sharing an ISBN', async t => {
  const h = setup(t); await h.service.createProduct(h.draft('usado', isbn13, 'LV10001'), 'auto');
  assert.ok(h.service.getRecordsForEan('LV10001').some(record => record.childCode === 'LV10001'));
  assert.deepEqual(h.service.getRecordsForEan('LV10002'), []);
  assert.deepEqual(h.service.getRecordsForEan(isbn10), []);
});

test('unrelated editions and invalid ISBN check digits remain absent, with no HTTP or stock writes', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('Catalog recognition must remain local'));
  const h = setup(t); await h.service.createProduct(h.draft('novo', isbn13), 'auto');
  const before = [...h.storage], writes = h.writes.length;
  for (const query of ['9781234567897', '8551003667', '9788551003665'])
    assert.equal((await h.service.checkProductByEan(query, undefined, undefined, 'auto')).status, 'NOT_FOUND');
  assert.equal((await h.service.checkProductByEan(isbn13, undefined, undefined, 'auto')).status, 'NEW_PRODUCT_FOUND');
  assert.deepEqual([...h.storage], before); assert.equal(h.writes.length, writes);
});

test('the actual status card shows not-found only for a genuinely absent simulated catalog result', async t => {
  const h = setup(t); await h.service.createProduct(h.draft('novo', isbn13), 'auto');
  const render = checkResult => ui.renderToStaticMarkup(ui.createElement(ui.StatusCard, {
    checkResult, isChecking: false, checkError: null, book: { id: 'fixture', title: 'Obra de ensaio', isbn10 },
    onOpenRegistration() {}, onRetryCheck() {}, onResetForNextBook() {},
  }));
  const found = render(await h.service.checkProductByEan(isbn10, undefined, undefined, 'auto'));
  assert.doesNotMatch(found, /Produto não encontrado no simulador Magazord/);
  const absent = render(await h.service.checkProductByEan('9781234567897', undefined, undefined, 'auto'));
  assert.match(absent, /Produto não encontrado no simulador Magazord/);
});
