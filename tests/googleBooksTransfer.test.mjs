import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const compiled = await build({ stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
  export * from './shared/googleBooks'; export { complementWithGoogleBooks } from './src/services/googleBooks';
  export { completeTitleEdition, mergeTitleEditionDetails } from './src/services/titleEditionDetails';
  export { createRegistrationDraft } from './src/utils/draft';
` }, bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{ name: 'unused-session', setup(b) {
  b.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'session', namespace: 'mock' }));
  b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const supabase={auth:{getSession:async()=>{throw Error("Google must not use Amazon session")}}}' }));
} }] });
const api = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const real = JSON.parse(await readFile('tests/fixtures/google-books-hobbit-projection-2026-11-13.json', 'utf8'));
const isbn = '9788550303628';
// Synthetic schema-conformance input: these measurements do not describe either real Hobbit record.
const response = dimensions => ({ kind: 'books#volumes', totalItems: 1, items: [{ id: 'dimensions_fixture', volumeInfo: {
  title: 'Livro sintético', printType: 'BOOK', contentVersion: 'not-an-edition', dimensions,
  industryIdentifiers: [{ type: 'ISBN_13', identifier: isbn }],
} }] });

test('documented Google dimensions reach title/ISBN mapping and the existing draft, with no invented binding or weight', () => {
  const payload = response({ height: ' 21.5 cm ', width: '14,2', thickness: '1.25 CM' });
  const title = api.mapGoogleBooksTitleResponse(payload).candidates[0];
  const found = api.mapGoogleBooksResponse(payload, isbn).book;
  for (const book of [title.book, found]) {
    assert.equal(book.height, 21.5); assert.equal(book.width, 14.2); assert.equal(book.depth, 1.25);
    assert.equal(book.dimensionsUnit, 'cm'); assert.equal(book.provenance.height, 'Google Books');
    const draft = api.createRegistrationDraft(book);
    assert.equal(draft.height, 21.5); assert.equal(draft.width, 14.2); assert.equal(draft.depth, 1.25);
    assert.equal(draft.format, ''); assert.equal(draft.weight, undefined); assert.equal(draft.edition, undefined);
  }
  const original = structuredClone(title); delete original.book.height; delete original.book.width; delete original.book.depth;
  const completed = api.mergeTitleEditionDetails(original, found);
  assert.equal(completed.height, 21.5); assert.equal(completed.width, 14.2); assert.equal(completed.depth, 1.25);
});
test('missing, unknown units, malformed and non-positive dimensions remain empty; axes are independent', () => {
  for (const value of [undefined, null, 21, '', 'unknown', '21 in', '21 mm', '21 x 14', '-2 cm', '0 cm', '1e2', {}, 'Infinity']) {
    const book = api.mapGoogleBooksTitleResponse(response({ height: value, width: value, thickness: value })).candidates[0].book;
    for (const field of ['height', 'width', 'depth', 'dimensionsUnit']) assert.equal(book[field], undefined);
  }
  const book = api.mapGoogleBooksTitleResponse(response({ height: '21 cm', width: 'unknown' })).candidates[0].book;
  assert.equal(book.height, 21); assert.equal(book.width, undefined); assert.equal(book.depth, undefined);
});
test('ISBN Google complement fills only missing dimensions, preserves selected/manual values and exact identity', () => {
  const incoming = api.mapGoogleBooksResponse(response({ height: '21', width: '14', thickness: '2' }), isbn).book;
  const base = { id: 'selected', title: 'Título editado', isbn13: isbn, width: 15, provenance: { title: 'manual', height: 'manual' } };
  const result = api.complementWithGoogleBooks(base, incoming, isbn);
  assert.equal(result.title, base.title); assert.equal(result.width, 15); assert.equal(result.height, undefined);
  assert.equal(result.depth, 2); assert.equal(result.dimensionsUnit, 'cm'); assert.equal(base.depth, undefined);
  assert.equal(api.complementWithGoogleBooks(base, incoming, '9788576573357'), base);
  const incompatible = { ...base, dimensionsUnit: 'mm' };
  assert.equal(api.complementWithGoogleBooks(incompatible, incoming, isbn).depth, undefined);
});
test('real Case A projection: provided bibliography reaches draft, ISBN-free editing remains possible and no second lookup occurs', async t => {
  const candidate = real.withoutIsbn;
  assert.equal(candidate.key, 'XdU7EAAAQBAJ');
  t.mock.method(globalThis, 'fetch', () => assert.fail('No valid ISBN: no lookup to any source'));
  const book = await api.completeTitleEdition(candidate);
  const draft = api.createRegistrationDraft(book);
  assert.equal(draft.title, 'O Hobbit'); assert.deepEqual(draft.authors, ['Eduardo']);
  assert.equal(draft.publisher, 'Clube de Autores'); assert.equal(draft.year, '2021');
  assert.equal(draft.pageCount, 21); assert.equal(draft.language, 'Português');
  for (const field of ['isbn13', 'isbn10', 'ean', 'childCode', 'format', 'synopsis']) assert.equal(draft[field], '');
  for (const field of ['weight', 'width', 'height', 'depth', 'edition', 'mainImageUrl']) assert.equal(draft[field], undefined);
  assert.ok(book.googleBooksReference.coverUrl); assert.equal(book.googleBooksReference.descriptionAvailable, true);
  assert.equal(book.googleBooksReference.contentReviewRequired, true);
  assert.equal(draft.editionReferences[0].id, candidate.key);
  draft.publisher = 'Editora conferida'; draft.isbn13 = '9788550303628';
  assert.equal(draft.publisher, 'Editora conferida'); assert.equal(book.publisher, 'Clube de Autores');
});
test('real Case B projection: same Google ISBN/volume reaches EAN and draft with one same-source complement and original links', async t => {
  const candidate = real.withIsbn, original = structuredClone(candidate);
  assert.equal(candidate.key, 'J3WDPwAACAAJ'); assert.equal(candidate.book.isbn13, '9789721043053');
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push(url); assert.equal(url, '/api/google-books?isbn=9789721043053'); assert.equal(init.method, 'GET');
    return Response.json(real.isbnResponse);
  });
  const completed = await api.completeTitleEdition(candidate);
  assert.equal(calls.length, 1); assert.deepEqual(candidate, original);
  assert.equal(completed.googleBooksReference.volumeId, candidate.key);
  assert.deepEqual(completed.sourceLinks, candidate.book.sourceLinks);
  const draft = api.createRegistrationDraft(completed);
  assert.equal(draft.isbn13, candidate.book.isbn13); assert.equal(draft.isbn10, '9721043052');
  assert.equal(draft.ean, candidate.book.isbn13); assert.equal(draft.title, candidate.book.title);
  assert.deepEqual(draft.authors, ['J. R. R. Tolkien']); assert.equal(draft.year, '1997'); assert.equal(draft.pageCount, 259);
  assert.equal(draft.publisher, ''); assert.equal(draft.editionReferences[0].id, candidate.key);
});
