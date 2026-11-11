import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
  export * from './shared/googleBooks'; export * from './server/googleBooksFunction';
  export * from './src/services/googleBooks'; export * from './src/utils/draft';
` }, bundle: true, write: false, platform: 'node', format: 'esm' });
const api = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const isbn = '9788550303628', isbn10 = '8550303623';
const volume = (id, info = {}) => ({ id, volumeInfo: { title: 'Título de teste', ...info } });
const payload = (...items) => ({ kind: 'books#volumes', totalItems: items.length, items });
const editions = payload(volume('first', { publisher: 'Editora A', publishedDate: '2001', authors: ['Autor A'] }),
  volume('second', { publisher: 'Editora B', publishedDate: '2020', industryIdentifiers: [{ type: 'ISBN_10', identifier: isbn10 }] }));

test('title keeps multiple editions and source/volume identity without filling from another edition', () => {
  const result = api.mapGoogleBooksTitleResponse(editions);
  assert.equal(result.status, 'success'); assert.equal(result.candidates.length, 2);
  const [first, second] = result.candidates;
  assert.equal(first.source, 'google_books'); assert.equal(first.key, 'first');
  assert.equal(first.book.isbn13, undefined); assert.equal(second.book.isbn13, isbn); assert.equal(second.book.isbn10, isbn10);
  assert.equal(second.book.authors, undefined); assert.equal(first.book.year, 2001); assert.equal(second.book.year, 2020);
  assert.equal(second.book.publisher, 'Editora B'); assert.equal(second.book.provenance.publisher, 'Google Books');
});

test('absent and conflicting ISBNs never become fabricated or cross-edition identifiers', () => {
  for (const identifiers of [undefined, [{ type: 'ISBN_13', identifier: '123' }],
    [{ type: 'ISBN_13', identifier: isbn }, { type: 'ISBN_13', identifier: '9798276439839' }]]) {
    const book = api.mapGoogleBooksTitleResponse(payload(volume('missing', { industryIdentifiers: identifiers }))).candidates[0].book;
    assert.equal(book.isbn13, undefined); assert.equal(book.isbn10, undefined);
    const draft = api.createRegistrationDraft(book);
    for (const field of ['isbn13', 'isbn10', 'ean', 'childCode', 'synopsis', 'publisher', 'language']) assert.equal(draft[field], '');
    assert.deepEqual(draft.authors, []); assert.equal(draft.mainImageUrl, undefined);
  }
  const thirteen = api.mapGoogleBooksTitleResponse(payload(volume('thirteen', { industryIdentifiers: [{ type: 'ISBN_13', identifier: isbn }] }))).candidates[0].book;
  assert.equal(thirteen.isbn13, isbn); assert.equal(thirteen.isbn10, undefined);
});

test('empty, malformed, partial and duplicate volumes have explicit outcomes', () => {
  assert.equal(api.mapGoogleBooksTitleResponse({ kind: 'books#volumes', totalItems: 0 }).status, 'not_found');
  for (const value of [null, {}, { kind: 'books#volumes', totalItems: 2 }]) assert.equal(api.mapGoogleBooksTitleResponse(value).status, 'unavailable');
  const partial = api.mapGoogleBooksTitleResponse(payload({}, volume('no_title', { title: null }), volume('valid'), volume('valid')));
  assert.equal(partial.candidates.length, 1); assert.equal(partial.candidates[0].book.publisher, undefined);
  assert.equal(api.mapGoogleBooksTitleResponse(payload({})).diagnostic.code, 'no_usable_results');
});

test('title endpoint uses fixed Google host, bibliographic filters, bounded results and retains ISBN endpoint', async () => {
  const calls = [];
  const handler = api.createGoogleBooksFunction({ env: { GOOGLE_BOOKS_API_KEY: 'synthetic' }, fetcher: async (url, init) => {
    calls.push({ url, init }); return Response.json(editions);
  } });
  const result = await (await handler(new Request('https://test.invalid/api/google-books?title=T%C3%ADtulo%20de%20teste'))).json();
  assert.equal(result.candidates.length, 2); assert.equal(calls.length, 1);
  assert.equal(calls[0].url.origin, 'https://www.googleapis.com');
  assert.equal(calls[0].url.searchParams.get('q'), 'intitle:"Título de teste"');
  assert.equal(calls[0].url.searchParams.get('printType'), 'books'); assert.equal(calls[0].url.searchParams.get('maxResults'), '20');
  assert.equal(calls[0].init.credentials, 'omit'); assert.doesNotMatch(JSON.stringify(result), /synthetic/);
  await handler(new Request('https://test.invalid/api/google-books?isbn=' + isbn));
  assert.equal(calls[1].url.searchParams.get('q'), 'isbn:' + isbn);
});

test('title rejects mixed/duplicate/invalid queries and cross-origin requests before upstream', async () => {
  const handler = api.createGoogleBooksFunction({ env: { GOOGLE_BOOKS_API_KEY: 'synthetic' }, fetcher: () => assert.fail('no upstream') });
  for (const query of ['title=ab&isbn=' + isbn, 'title=ab&title=cd', 'title=a', 'title=' + 'a'.repeat(201)]) {
    const response = await handler(new Request('https://test.invalid/api/google-books?' + query));
    assert.ok(response.status >= 400); assert.deepEqual((await response.json()).candidates, []);
  }
  assert.equal((await handler(new Request('https://test.invalid/api/google-books?title=valid', { headers: { origin: 'https://other.invalid' } }))).status, 403);
});

test('title failures and incomplete upstream stay unavailable; client integrates with server using same-origin cookies', async t => {
  for (const fetcher of [async () => new Response('failure', { status: 503 }), async () => Response.json({}), async () => { throw Error('offline'); }]) {
    const handler = api.createGoogleBooksFunction({ env: { GOOGLE_BOOKS_API_KEY: 'synthetic' }, fetcher });
    const result = await (await handler(new Request('https://test.invalid/api/google-books?title=test'))).json();
    assert.equal(result.status, 'unavailable'); assert.deepEqual(result.candidates, []);
  }
  const handler = api.createGoogleBooksFunction({ env: { GOOGLE_BOOKS_API_KEY: 'synthetic' }, fetcher: async () => Response.json(editions) });
  t.mock.method(globalThis, 'fetch', (url, init) => {
    assert.equal(init.credentials, 'same-origin'); assert.equal(init.redirect, 'error');
    return handler(new Request('https://test.invalid' + url, init));
  });
  assert.equal((await api.searchGoogleBooksByTitle('Título de teste')).candidates.length, 2);
  const controller = new AbortController(); controller.abort();
  assert.equal((await api.searchGoogleBooksByTitle('Título de teste', controller.signal)).status, 'unavailable');
});

const uiBundle = await build({ entryPoints: ['src/components/TitleSearch.tsx'], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
  plugins: [{ name: 'title-ui', setup(b) {
    b.onResolve({ filter: /^(react|react\/jsx-runtime)$|\/services\/googleBooks$/ }, args => ({ path: args.path, namespace: 'mock' }));
    b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: args.path === 'react' ? 'module.exports=deps.react'
      : args.path === 'react/jsx-runtime' ? 'exports.jsx=exports.jsxs=(type,props)=>({type,props})' : 'exports.searchGoogleBooksByTitle=(...args)=>deps.search(...args)' }));
  } }] });
function mountTitle(search) {
  let cursor = 0, tree; const slots = [], confirmed = [], cleanups = [];
  const deps = { search, react: {
    useState(value) { const i = cursor++; if (!(i in slots)) slots[i] = value; return [slots[i], next => { slots[i] = next; }]; },
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useEffect(fn) { const i = cursor++; if (!(i in slots)) { slots[i] = true; cleanups.push(fn()); } },
  } };
  const module = { exports: {} }; new Function('deps', 'module', 'exports', uiBundle.outputFiles[0].text)(deps, module, module.exports);
  const render = () => { cursor = 0; tree = module.exports.default({ onConfirm: book => confirmed.push(book) }); };
  const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
  render(); return { render, confirmed, all: () => nodes(tree), unmount: () => cleanups.forEach(fn => fn?.()),
    query(value) { nodes(tree).find(n => n.type === 'input').props.onChange({ target: { value } }); render(); },
    async submit() { nodes(tree).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); await new Promise(resolve => setImmediate(resolve)); render(); } };
}
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : '';
test('UI displays editions, disables future sources and requires selection plus confirmation', async () => {
  const view = mountTitle(async () => api.mapGoogleBooksTitleResponse(editions)); view.query('Título'); await view.submit();
  assert.equal(view.all().filter(n => n.type === 'article').length, 2);
  for (const name of ['Amazon', 'Distribuidora Curitiba']) assert.equal(view.all().find(n => n.type === 'button' && text(n).includes(name)).props.disabled, true);
  view.all().filter(n => n.type === 'button' && text(n) === 'Selecionar esta edição')[1].props.onClick({ currentTarget: { focus() {} } }); view.render();
  assert.equal(view.confirmed.length, 0);
  const dialog = view.all().find(n => n.type === 'dialog'); assert.ok(dialog);
  assert.equal(dialog.props['aria-labelledby'], 'edition-confirmation-title');
  assert.match(text(dialog), /Editora B/); assert.match(text(dialog), /2020/); assert.match(text(dialog), /Google Books/);
  view.all().find(n => n.type === 'button' && text(n) === 'Confirmar edição e abrir cadastro').props.onClick();
  assert.equal(view.confirmed[0].publisher, 'Editora B'); assert.equal(view.confirmed[0].year, 2020);
});
test('modal cancel and Escape retain results, restore trigger focus and do not fetch or confirm', async () => {
  let calls = 0, focused = 0, prevented = 0;
  const view = mountTitle(async () => { calls++; return api.mapGoogleBooksTitleResponse(editions); });
  view.query('Título'); await view.submit();
  for (const method of ['button', 'escape']) {
    view.all().filter(n => n.type === 'button' && text(n) === 'Selecionar esta edição')[0]
      .props.onClick({ currentTarget: { focus() { focused++; } } }); view.render();
    const dialog = view.all().find(n => n.type === 'dialog');
    assert.match(text(dialog), /ISBN-13: Não informado/);
    if (method === 'button') view.all().find(n => n.type === 'button' && text(n) === 'Cancelar').props.onClick();
    else dialog.props.onCancel({ preventDefault() { prevented++; } });
    view.render();
    assert.equal(view.all().some(n => n.type === 'dialog'), false);
    assert.equal(view.all().filter(n => n.type === 'article').length, 2);
    assert.equal(view.confirmed.length, 0);
  }
  assert.equal(calls, 1); assert.equal(focused, 2); assert.equal(prevented, 1);
});
test('UI discards late results after query edit or unmount', async () => {
  let resolve, signal;
  const view = mountTitle((_query, requestSignal) => { signal = requestSignal; return new Promise(done => { resolve = done; }); });
  view.query('Anterior'); await view.submit(); view.query('Atual');
  assert.equal(signal.aborted, true); resolve(api.mapGoogleBooksTitleResponse(editions));
  await new Promise(done => setImmediate(done)); view.render();
  assert.equal(view.all().filter(n => n.type === 'article').length, 0);
  await view.submit(); view.unmount(); assert.equal(signal.aborted, true);
  resolve(api.mapGoogleBooksTitleResponse(editions));
});
