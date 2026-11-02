import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const serverBuild = await build({ stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `export * from './server/spapi/core'; export * from './server/spapi/handler'; export * from './shared/publicationDate'; export {createRegistrationDraft} from './src/utils/draft';` },
  bundle: true, write: false, platform: 'node', format: 'esm' });
const api = await import('data:text/javascript;base64,' + Buffer.from(serverBuild.outputFiles[0].text).toString('base64'));
const uid = '11111111-1111-4111-8111-111111111111', sid = api.PRIVATE_STORE_ID, isbn = '9788535914849';
const env = { AMAZON_SPAPI_ENABLED: 'true', AMAZON_SPAPI_REFRESH_TOKEN: 'Atzr|synthetic-refresh', AMAZON_SPAPI_CLIENT_ID: 'synthetic-client',
  AMAZON_SPAPI_CLIENT_SECRET: 'synthetic-secret', AMAZON_SPAPI_STORE_ID: sid, AMAZON_SPAPI_SELLER_ID: 'SELLERTEST',
  SUPABASE_URL: 'https://auth.example.invalid', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic', VERCEL_URL: 'isbn-preview.example.invalid', VERCEL_ENV: 'preview',
  AMAZON_SPAPI_ORIGIN: 'https://production.example.invalid', AMAZON_SPAPI_EXTERNAL_AUTH_APPROVED: 'false' };
const origin = 'https://' + env.VERCEL_URL, bearer = 'Bearer synthetic-user-session';
const item = { asin: 'SYNTHETIC1', identifiers: [{ marketplaceId: api.MARKETPLACE, identifiers: [{ identifierType: 'ISBN', identifier: '8535914846' }] }],
  summaries: [{ marketplaceId: api.MARKETPLACE, itemName: 'Synthetic title' }],
  attributes: { author: [{ marketplace_id: api.MARKETPLACE, name: 'Synthetic Author' }], publisher: [{ marketplace_id: api.MARKETPLACE, value: 'Synthetic Publisher' }],
    product_description: [{ marketplace_id: api.MARKETPLACE, value: '<b>Restricted description</b>' }] },
  images: [{ marketplaceId: api.MARKETPLACE, images: [{ link: 'https://images.example.invalid/cover.jpg', variant: 'MAIN' }] }] };
function server(options = {}) {
  const calls = [];
  const fetcher = async (value, init) => {
    const url = new URL(value); calls.push({ url, init });
    assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store');
    if (url.origin === env.SUPABASE_URL) {
      assert.equal(init.headers.apikey, env.SUPABASE_PUBLISHABLE_KEY); assert.equal(init.headers.Authorization, bearer);
      assert.ok(!url.href.includes('amazon_spapi')); assert.equal(init.method || 'GET', 'GET');
      if (url.pathname === '/auth/v1/user') return options.authError ? new Response('secret error', { status: 401 }) : Response.json({ id: uid });
      if (url.pathname === '/rest/v1/profiles') return Response.json(options.inactive ? [] : [{ id: uid, active: true }]);
      assert.equal(url.pathname, '/rest/v1/store_users'); assert.equal(url.searchParams.get('store_id'), 'eq.' + sid);
      assert.equal(url.searchParams.get('role'), 'eq.developer');
      return Response.json(options.noMembership ? [] : [{ user_id: uid, store_id: sid, active: true, role: options.role || 'developer' }]);
    }
    if (url.href === 'https://api.amazon.com/auth/o2/token') {
      assert.equal(init.body.get('refresh_token'), env.AMAZON_SPAPI_REFRESH_TOKEN); assert.equal(init.body.get('client_id'), env.AMAZON_SPAPI_CLIENT_ID);
      assert.equal(init.body.get('client_secret'), env.AMAZON_SPAPI_CLIENT_SECRET);
      return Response.json({ access_token: 'synthetic-access', expires_in: 3600, token_type: 'bearer' });
    }
    assert.equal(url.origin, 'https://sellingpartnerapi-na.amazon.com'); assert.equal(url.pathname, '/catalog/2022-04-01/items');
    assert.equal(init.method, 'GET'); assert.equal(url.searchParams.get('identifiersType'), 'ISBN');
    assert.ok(!url.searchParams.get('includedData').includes('images'));
    return Response.json({ numberOfResults: 1, items: [options.item || item] });
  };
  const handler = api.createSpapiHandler('catalog', { env: { ...env, ...options.env }, fetcher,
    store: new Proxy({}, { get() { assert.fail('Simplified catalog must not use authorization store'); } }) });
  const request = (path = `/api/amazon/spapi/catalog?isbn=${isbn}`, headers = {}) => new Request(origin + path, { headers: { authorization: bearer, origin, ...headers } });
  return { handler, request, calls };
}
test('Preview uses environment refresh token without AES, APP_ID, service role, tables or provisioning', async () => {
  const h = server(), response = await h.handler(h.request());
  assert.equal(response.status, 200); const data = await response.json();
  assert.equal(data.items[0].title, 'Synthetic title'); assert.deepEqual(data.items[0].authors, ['Synthetic Author']);
  assert.deepEqual(data.items[0].images, []); assert.equal(data.items[0].synopsis, null);
  assert.equal(data.contentPolicy, 'images_and_synopsis_omitted');
  assert.doesNotMatch(JSON.stringify(data), /Atzr|synthetic-secret|synthetic-access|Restricted description|cover.jpg/);
  assert.equal(h.calls.length, 5); assert.equal(response.headers.get('cache-control'), 'private, no-store');
});
test('private token cannot serve another store or an operator; no Amazon call on denied access', async () => {
  for (const options of [{ env: { AMAZON_SPAPI_STORE_ID: uid } }, { noMembership: true }, { role: 'operator' }, { inactive: true }, { authError: true }]) {
    const h = server(options), response = await h.handler(h.request());
    assert.ok([401, 403].includes(response.status)); assert.equal(h.calls.filter(c => c.url.hostname.includes('amazon.com')).length, 0);
  }
});
test('missing environment token never falls back to encrypted storage; cross-origin and malformed ISBN denied', async () => {
  const missing = server({ env: { AMAZON_SPAPI_REFRESH_TOKEN: '' } });
  assert.equal((await missing.handler(missing.request())).status, 503); assert.equal(missing.calls.length, 0);
  const h = server(); assert.equal((await h.handler(h.request(undefined, { origin: 'https://evil.invalid' }))).status, 403);
  assert.equal((await h.handler(h.request('/api/amazon/spapi/catalog?isbn=9788535914848'))).status, 422);
  assert.equal(h.calls.filter(c => c.url.hostname.includes('amazon.com')).length, 0);
});
test('catalog rejects mismatched marketplace/ISBN rather than assigning the requested ISBN to an unrelated book', async () => {
  const h = server({ item: { ...item, identifiers: [{ marketplaceId: api.MARKETPLACE, identifiers: [{ identifierType: 'ISBN', identifier: '9788584390670' }] }] } });
  assert.deepEqual((await (await h.handler(h.request())).json()).items, []);
});

const clientBuild = await build({ entryPoints: ['src/services/amazonOfficial.ts'], bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'mock-session', setup(b) {
    b.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'session', namespace: 'mock' }));
    b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const supabase={auth:{getSession:async()=>globalThis.__spapiSession}}' }));
  } }] });
const client = await import('data:text/javascript;base64,' + Buffer.from(clientBuild.outputFiles[0].text).toString('base64'));
const user = { id: uid, storeId: sid, role: 'developer', active: true };
test('automatic client uses same-origin session only for authorized Lab developer, without extra actions', async t => {
  const calls = []; globalThis.__spapiSession = { data: { session: { user: { id: uid }, access_token: 'synthetic-session' } } };
  t.after(() => { delete globalThis.__spapiSession; });
  t.mock.method(globalThis, 'fetch', async (url, init) => { calls.push({ url, init }); return Response.json({ isbn, items: [{ isbn, asin: 'SYNTHETIC1', marketplaceId: api.MARKETPLACE, title: 'Title', publisher: 'Publisher', images: ['forbidden'], synopsis: 'forbidden' }] }); });
  for (const other of [{ ...user, role: 'operator' }, { ...user, storeId: uid }, { ...user, active: false }]) assert.equal((await client.searchAmazonOfficial(isbn, other)).status, 'skipped');
  assert.equal(calls.length, 0);
  const result = await client.searchAmazonOfficial(isbn, user); assert.equal(result.status, 'success'); assert.equal(result.book.publisher, 'Publisher');
  assert.equal(result.book.synopsis, undefined); assert.equal(result.book.coverUrl, undefined);
  assert.equal(calls[0].url, '/api/amazon/spapi/catalog?isbn=' + isbn); assert.equal(calls[0].init.credentials, 'same-origin');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer synthetic-session');
});
test('client handles source failure, ambiguity and session changes without retry or replacing existing data', async t => {
  globalThis.__spapiSession = { data: { session: { user: { id: uid }, access_token: 'synthetic-session' } } };
  t.after(() => { delete globalThis.__spapiSession; });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response('secret upstream error', { status: 502 }); });
  assert.equal((await client.searchAmazonOfficial(isbn, user)).status, 'unavailable'); assert.equal(calls, 1);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ isbn, items: [1, 2].map(() => ({ isbn, marketplaceId: api.MARKETPLACE })) }));
  assert.equal((await client.searchAmazonOfficial(isbn, user)).status, 'ambiguous');
  t.mock.method(globalThis, 'fetch', async () => Response.json({ isbn, hasMore: true, items: [{ isbn, marketplaceId: api.MARKETPLACE }] }));
  assert.equal((await client.searchAmazonOfficial(isbn, user)).status, 'ambiguous');
  globalThis.__spapiSession.data.session.user.id = 'different';
  t.mock.method(globalThis, 'fetch', () => assert.fail('Session mismatch must not fetch'));
  assert.equal((await client.searchAmazonOfficial(isbn, user)).status, 'unavailable');
  const base = { id: 'base', title: 'Existing', authors: ['Existing author'], coverUrl: 'https://example.invalid/base.jpg', synopsis: 'Existing synopsis' };
  const copy = structuredClone(base), merged = client.complementWithAmazon(base, { id: 'amazon', title: 'Other', publisher: 'Missing Publisher', coverUrl: 'forbidden', synopsis: 'forbidden' });
  assert.equal(merged.title, 'Existing'); assert.deepEqual(merged.authors, base.authors); assert.equal(merged.publisher, 'Missing Publisher');
  assert.equal(merged.synopsis, base.synopsis); assert.equal(merged.coverUrl, base.coverUrl); assert.deepEqual(base, copy);
  assert.equal(merged.provenance.publisher, 'amazon_spapi_catalog_2022-04-01');
});

const appMocks = [
  [/^react$/, 'module.exports=deps.react'], [/^react\/jsx-runtime$/, 'exports.jsx=exports.jsxs=(type,props)=>({type,props})'],
  [/^lucide-react$/, 'module.exports=new Proxy({},{get:(_,key)=>String(key)})'],
  [/\/contexts\/UserContext$/, 'exports.useUser=()=>deps.user'],
  [/\/hooks\/useOperationAudit$/, 'exports.useOperationAudit=()=>({saveOperation:deps.audit,pending:[],retry:()=>{}})'],
  [/\/hooks\/useLocalHistory$/, 'exports.useLocalHistory=()=>({history:[],setHistory:()=>{},clearHistory:()=>{}})'],
  [/\/services\/brasilApi$/, 'exports.searchBookByIsbnBrasilApi=async()=>deps.brasil'],
  [/\/services\/distribuidoraCuritiba$/, 'exports.searchBookByIsbnDistribuidoraCuritiba=async()=>deps.curitiba;exports.mergeBookWithDistribuidora=(a,b)=>({...a,...b})'],
  [/\/lib\/supabase$/, 'exports.supabase={auth:{getSession:async()=>({data:{session:{user:{id:deps.user.currentUser.id},access_token:"synthetic-session"}}})}}'],
  [/\/services\/magazordMockService$/, 'exports.magazordMockService={getSimulationConfig:()=>({mode:"auto"}),checkProductByEan:async()=>({matches:[]})}'],
];
for (const name of ['Header', 'SearchForm', 'BookDetailsCard', 'SearchHistoryGroup', 'CameraScannerModal', 'MagazordStatusCard', 'ProductRegistrationForm', 'OwnerDashboard', 'SettingsView'])
  appMocks.push([new RegExp(`(?:^|/)${name}$`), `module.exports=${JSON.stringify(name)}`]);
const appBundle = await build({ entryPoints: ['src/App.tsx'], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
  plugins: [{ name: 'app-offline', setup(b) {
    b.onResolve({ filter: /.*/ }, args => { const mock = appMocks.find(([pattern]) => pattern.test(args.path)); return mock ? { path: args.path, namespace: 'mock', pluginData: mock[1] } : undefined; });
    b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: args.pluginData }));
  } }] });
function mountApp(options = {}) {
  const deps = { user: { currentUser: { ...user, name: 'Synthetic Developer' }, operationEnvironment: 'development' },
    brasil: { book: { id: 'base', title: 'Existing title', isbn13: isbn, authors: ['Existing author'] }, diagnostic: { status: 200 } },
    curitiba: { book: null, diagnostic: { status: 404 } }, audit() {}, ...options };
  const slots = []; let cursor = 0, effects = [], tree;
  deps.react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useEffect(fn, dependencies) { const i = cursor++; if (!slots[i] || dependencies.some((v, n) => v !== slots[i][n])) { slots[i] = dependencies; effects.push(fn); } },
  };
  const module = { exports: {} }; new Function('deps', 'module', 'exports', appBundle.outputFiles[0].text)(deps, module, module.exports);
  function render() { cursor = 0; effects = []; tree = module.exports.default(); effects.forEach(fn => fn()); }
  function nodes(node) { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(n => nodes(n)); return [node, ...nodes(node.props?.children)]; }
  const find = type => nodes(tree).find(n => n.type === type); render();
  return { deps, render, find, search: () => find('SearchForm').props.onSearch(isbn) };
}
test('existing ISBN form automatically complements missing fields without replacing sources or adding operator actions', async t => {
  let calls = 0; t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({ isbn, items: [{ isbn, asin: 'SYNTHETIC1', marketplaceId: api.MARKETPLACE, title: 'Amazon title', publisher: 'Amazon Publisher' }] }); });
  const view = mountApp(); await view.search(); view.render();
  const book = view.find('BookDetailsCard').props.book;
  assert.equal(book.title, 'Existing title'); assert.equal(book.publisher, 'Amazon Publisher'); assert.equal(calls, 1);
  view.find('Header').props.onTabChange('cadastro'); view.render();
  assert.equal(view.find('ProductRegistrationForm').props.draft.publisher, 'Amazon Publisher');
});
test('Amazon can supply a missing book and its failures preserve successful primary lookup', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ isbn, items: [{ isbn, asin: 'SYNTHETIC1', marketplaceId: api.MARKETPLACE, title: 'Amazon title' }] }));
  const view = mountApp({ brasil: { book: null, diagnostic: { status: 404 } } }); await view.search(); view.render();
  assert.equal(view.find('BookDetailsCard').props.book.title, 'Amazon title');
  t.mock.method(globalThis, 'fetch', async () => new Response('private failure', { status: 503 }));
  const failure = mountApp(); await failure.search(); failure.render(); assert.equal(failure.find('BookDetailsCard').props.book.title, 'Existing title');
});
test('late Amazon result is discarded after role/store change during the normal ISBN lookup', async t => {
  let release; const pending = new Promise(resolve => { release = resolve; });
  t.mock.method(globalThis, 'fetch', async () => { await pending; return Response.json({ isbn, items: [{ isbn, asin: 'SYNTHETIC1', marketplaceId: api.MARKETPLACE, publisher: 'Must not leak' }] }); });
  const view = mountApp(), work = view.search();
  await new Promise(resolve => setImmediate(resolve));
  view.deps.user.currentUser = { ...view.deps.user.currentUser, storeId: uid }; view.render(); release(); await work; view.render();
  assert.equal(view.find('BookDetailsCard').props.book.publisher, undefined);
});

test('ISO publication dates normalize without timezone shifts and invalid dates cannot enter the year field', () => {
  for (const raw of ['2013', '2013-05', '2013-05-07', '2013-05-07T00:00:01Z', '2013-05-07T00:00:01.123Z', '2013-01-01T00:30:00+14:00']) {
    assert.equal(api.publicationYear(raw), '2013'); assert.doesNotMatch(api.normalizePublicationDate(raw), /T/);
  }
  assert.equal(api.normalizePublicationDate('2013-05-07T00:00:01Z'), '2013-05-07');
  assert.equal(api.normalizePublicationDate('2024-02-29T23:59:59Z'), '2024-02-29');
  assert.equal(api.publicationYear('0999'), '0999');
  assert.equal(api.normalizePublicationDate('0096-02-29'), '0096-02-29');
  for (const raw of ['', null, '0000', '07T00:00:01Z/05/2013', '2013-02-29', '2013-13-01', '2013-05-07Tgarbage', '2013-05-07T25:00:00Z'])
    assert.equal(api.publicationYear(raw), undefined);
});
test('Amazon timestamp for reported ISBN becomes year 2013 through the official handler, client and registration draft', async t => {
  const reportedIsbn = '9780515154559';
  const h = server({ item: { ...item, identifiers: [{ marketplaceId: api.MARKETPLACE, identifiers: [{ identifierType: 'ISBN', identifier: reportedIsbn }] }],
    attributes: { ...item.attributes, publication_date: [{ marketplace_id: api.MARKETPLACE, value: '2013-05-07T00:00:01Z' }] } } });
  const data = await (await h.handler(h.request('/api/amazon/spapi/catalog?isbn=' + reportedIsbn))).json();
  assert.equal(data.items[0].publicationDate, '2013-05-07');
  globalThis.__spapiSession = { data: { session: { user: { id: uid }, access_token: 'synthetic-session' } } };
  t.after(() => { delete globalThis.__spapiSession; });
  t.mock.method(globalThis, 'fetch', async () => Response.json(data));
  const result = await client.searchAmazonOfficial(reportedIsbn, user);
  assert.equal(result.book.year, '2013'); assert.equal(result.book.publishedDate, '2013-05-07');
  const merged = client.complementWithAmazon(null, result.book);
  assert.equal(merged.year, '2013'); assert.equal(api.createRegistrationDraft(merged).year, '2013');
  const priority = { id: 'priority', title: 'Priority title', isbn13: reportedIsbn, publishedDate: '1998-03-02', year: '1998' };
  assert.deepEqual(client.complementWithAmazon(priority, result.book), { ...priority, authors: ['Synthetic Author'], publisher: 'Synthetic Publisher', provenance: { authors: 'amazon_spapi_catalog_2022-04-01', publisher: 'amazon_spapi_catalog_2022-04-01' } });
  const noYear = { ...priority, year: undefined };
  assert.equal(client.complementWithAmazon(noYear, result.book).publishedDate, '1998-03-02');
  assert.equal(client.complementWithAmazon(noYear, result.book).year, undefined, 'Amazon year must not override a priority source date');
});

const cardBuild = await build({ entryPoints: ['src/components/BookDetailsCard.tsx'], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
  plugins: [{ name: 'date-render', setup(b) {
    const mocks = [[/^react$/, 'exports.useState=v=>[v,()=>{}];exports.useEffect=()=>{}'],
      [/^react\/jsx-runtime$/, 'exports.jsx=exports.jsxs=(type,props)=>({type,props})'], [/^lucide-react$/, 'module.exports=new Proxy({},{get:(_,key)=>String(key)})']];
    b.onResolve({ filter: /.*/ }, args => { const mock = mocks.find(([pattern]) => pattern.test(args.path)); return mock ? { path: args.path, namespace: 'mock', pluginData: mock[1] } : undefined; });
    b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: args.pluginData }));
  } }] });
test('book card renders Ano: 2013 for ISO timestamp, never the malformed reversed timestamp', () => {
  const module = { exports: {} }; new Function('module', 'exports', cardBuild.outputFiles[0].text)(module, module.exports);
  const text = node => node == null ? '' : Array.isArray(node) ? node.map(text).join('') : typeof node === 'object' ? text(node.props?.children) : String(node);
  for (const book of [{ id: 'synthetic', title: 'Synthetic', publishedDate: '2013-05-07T00:00:01Z' },
    { id: 'synthetic', title: 'Synthetic', publishedDate: '2013-05-07', year: '2013' }]) {
    const rendered = text(module.exports.default({ book }));
    assert.match(rendered, /Ano: 2013/); assert.doesNotMatch(rendered, /07T|00:00:01|\/05\/2013/);
  }
});
test('recorded Preview response for Jack Reacher retains bibliographic fields and yields year 2013', async t => {
  // Public bibliographic JSON supplied from the user's Network tab; no credentials or headers.
  const response = { isbn: '9780515154559', items: [{ asin: '0515154555', isbn: '9780515154559', title: 'Jack Reacher Boxed Set',
    authors: ['Child, Lee'], publisher: null, publicationDate: '2013-05-07T00:00:01Z', language: 'english', binding: 'paperback',
    edition: null, pageCount: null, synopsis: null, images: [], source: 'amazon_spapi_catalog_2022-04-01', marketplaceId: 'A2Q3Y263D00KWC' }],
    hasMore: false, requiresReview: true, contentPolicy: 'images_and_synopsis_omitted' };
  globalThis.__spapiSession = { data: { session: { user: { id: uid }, access_token: 'synthetic-session' } } };
  t.after(() => { delete globalThis.__spapiSession; });
  t.mock.method(globalThis, 'fetch', async () => Response.json(response));
  const result = await client.searchAmazonOfficial(response.isbn, user);
  assert.equal(result.book.title, 'Jack Reacher Boxed Set'); assert.deepEqual(result.book.authors, ['Child, Lee']);
  assert.equal(result.book.language, 'english'); assert.equal(result.book.format, 'paperback');
  assert.equal(result.book.publishedDate, '2013-05-07'); assert.equal(result.book.year, '2013');
  assert.equal(api.createRegistrationDraft(client.complementWithAmazon(null, result.book)).year, '2013');
  assert.equal(result.book.publisher, undefined); assert.equal(result.book.coverUrl, undefined); assert.equal(result.book.synopsis, undefined);
});
