import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
 export * from './src/utils/bibliographicNormalization'; export * from './src/utils/draft';
 export {searchBookByIsbnBrasilApi} from './src/services/brasilApi';
 export {mapGoogleBooksTitleResponse} from './shared/googleBooks';
` }, bundle: true, write: false, platform: 'node', format: 'esm' });
const api = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const cc = 'CC — Capa Comum', cd = 'CD — Capa Dura', isbn = '9788584390670';

test('one canonical CC/CD normalizer accepts equivalent names, legacy labels, accents, whitespace and existing codes', () => {
  for (const value of ['brochura', ' BROCHURA ', 'paperback', 'Softcover', 'capa comum', ' CÁPA   COMUM ', 'CC', 'cc',
    'CC - Capa Convencional', 'CC - Capa Comum', 'CC–Capa Comum', cc]) assert.equal(api.normalizeCoverFormat(value), cc, value);
  for (const value of ['capa dura', 'HARDCOVER', ' hardback ', 'CD', 'cd', 'CD - Capa Dura', 'CD–Capa Dura', cd])
    assert.equal(api.normalizeCoverFormat(value), cd, value);
  for (const value of [undefined, null, '', '  ']) assert.equal(api.normalizeCoverFormat(value), '');
  for (const value of ['Espiral', 'Bolso', 'Brochura ou capa dura', 'unknown', 'Formato artesanal']) assert.equal(api.normalizeCoverFormat(value), value);
});

for (const provider of ['BrasilAPI', 'Google Books', 'Amazon SP-API', 'Distribuidora Curitiba']) {
  for (const mode of ['isbn', 'title']) test(`${provider}/${mode}: the existing registration receives canonical format without changing source metadata or commercial rules`, () => {
    for (const [format, expected] of [['Brochura', cc], ['hardback', cd], ['CC', cc], ['CD', cd], [undefined, ''], ['Espiral', 'Espiral']]) {
      const book = { id: `${provider}:${mode}`, title: 'Edição selecionada', provider, ...(mode === 'isbn' ? { isbn13: isbn } : {}), format };
      const before = structuredClone(book), draft = api.createRegistrationDraft(book);
      assert.equal(draft.format, expected); assert.deepEqual(book, before);
      assert.equal(draft.price, ''); assert.equal(draft.parentCode, ''); assert.equal(draft.synopsis, '');
      const used = api.createRegistrationDraft(book, 'usado'); assert.equal(used.format, expected); assert.equal(used.childCode, '');
    }
  });
}

test('real BrasilAPI mapping stays intact while its raw binding is normalized at the shared registration boundary', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ title: 'Obra', format: 'brochura', provider: 'BrasilAPI' }));
  const result = await api.searchBookByIsbnBrasilApi(isbn); assert.equal(result.book.format, 'brochura');
  assert.equal(api.createRegistrationDraft(result.book).format, cc);
});
test('Google Books without an attested binding cannot acquire a fabricated format from printType', () => {
  const result = api.mapGoogleBooksTitleResponse({ kind: 'books#volumes', totalItems: 1, items: [{ id: 'volume', volumeInfo: { title: 'Obra', printType: 'BOOK' } }] });
  assert.equal(api.createRegistrationDraft(result.candidates[0].book).format, '');
});
