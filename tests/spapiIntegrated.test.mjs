import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const serverBuild = await build({ stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `export * from './server/spapi/core'; export * from './server/spapi/handler'; export * from './shared/publicationDate'; export {createRegistrationDraft} from './src/utils/draft'; export * from './src/utils/imageUrls';` },
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
    assert.equal(url.searchParams.get('includedData'), 'summaries,attributes,identifiers,dimensions,images');
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
  assert.deepEqual(data.items[0].images, [{ variant: 'MAIN', link: 'https://images.example.invalid/cover.jpg', width: null, height: null }]); assert.equal(data.items[0].synopsis, null);
  assert.equal(data.contentPolicy, 'synopsis_omitted');
  assert.doesNotMatch(JSON.stringify(data), /Atzr|synthetic-secret|synthetic-access|Restricted description/);
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

const clientBuild = await build({ stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `export * from './src/services/amazonOfficial'; export { searchAmazonLab } from './src/services/amazonLabClient';` }, bundle: true, write: false, platform: 'node', format: 'esm', define: { 'import.meta.env.DEV': 'false' },
  plugins: [{ name: 'mock-session', setup(b) {
    b.onResolve({ filter: /lib\/supabase(?:\.js)?$/ }, () => ({ path: 'session', namespace: 'mock' }));
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
  [/\/lib\/supabase(?:\.js)?$/, 'exports.supabase={auth:{getSession:async()=>({data:{session:{user:{id:deps.user.currentUser.id},access_token:"synthetic-session"}}})}}'],
  [/(?:^|\/)amazonLabClient$/, 'exports.searchAmazonLab=(...args)=>deps.lab(...args)'],
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
    curitiba: { book: null, diagnostic: { status: 404 } }, lab: async () => ({ status: 'interrompida' }), audit() {}, ...options };
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
  return { deps, render, find, search: (value = isbn) => find('SearchForm').props.onSearch(value) };
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
    attributes: { ...item.attributes, publication_date: [{ marketplace_id: api.MARKETPLACE, value: '2013-05-07T00:00:01Z' }] }, images: [] } });
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
  assert.deepEqual(client.complementWithAmazon(priority, result.book), { ...priority, authors: ['Synthetic Author'], publisher: 'Synthetic Publisher',
    rawIdentifiers: [{ type: 'ISBN_13', identifier: reportedIsbn }], provenance: { authors: 'amazon_spapi_catalog_2022-04-01', publisher: 'amazon_spapi_catalog_2022-04-01', rawIdentifiers: 'amazon_spapi_catalog_2022-04-01' } });
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
  assert.equal(result.book.language, 'Inglês'); assert.equal(result.book.format, 'Capa comum');
  assert.equal(result.book.publishedDate, '2013-05-07'); assert.equal(result.book.year, '2013');
  assert.equal(api.createRegistrationDraft(client.complementWithAmazon(null, result.book)).year, '2013');
  assert.equal(result.book.publisher, undefined); assert.equal(result.book.coverUrl, undefined); assert.equal(result.book.synopsis, undefined);
});

// Synthetic catalog attributes/measurements exercise the official schema, not a claim about the live book.
const expandedItem = { ...item,
  summaries: [{ marketplaceId: api.MARKETPLACE, itemName: 'Fixture Book', contributors: [
    { role: { value: 'editor' }, value: 'Not an author' }, { role: { value: 'author' }, value: 'Fixture Author' }] }],
  identifiers: [{ marketplaceId: api.MARKETPLACE, identifiers: [
    { identifierType: 'ISBN', identifier: '8535914846' }, { identifierType: 'EAN', identifier: isbn },
    { identifierType: 'ISBN', identifier: '8535914847' }, { identifierType: 'EAN', identifier: '9780515154559' }] }],
  attributes: { publisher: [{ marketplace_id: 'OTHER', value: 'Wrong marketplace' }, { name: 'Fixture Press' }],
    number_of_pages: [{ value: 0 }, { marketplace_id: api.MARKETPLACE, value: '320' }], edition: [{ value: 2 }],
    language: [{ type: 'translated', value: 'spanish' }, { type: 'original', value: 'english' }], binding: [{ value: 'paperback' }],
    externally_assigned_product_identifier: [{ type: 'isbn', value: '8535914846' }],
    item_weight: [{ value: 99, unit: 'grams' }], product_description: [{ value: 'Restricted prose' }], list_price: [{ value: 100 }] },
  dimensions: [{ marketplaceId: 'OTHER', item: { weight: { value: 999, unit: 'kilograms' } } }, { marketplaceId: api.MARKETPLACE,
    item: { weight: { value: 1.5, unit: 'kilograms' }, height: { value: 8, unit: 'inches' },
      width: { value: 100, unit: 'millimeters' }, length: { value: 2, unit: 'centimeters' } },
    package: { weight: { value: 2, unit: 'kilograms' }, height: { value: 30, unit: 'centimeters' } } }],
  images: [{ marketplaceId: 'OTHER', images: [{ variant: 'MAIN', link: 'https://images.example.invalid/other.jpg' }] },
    { marketplaceId: api.MARKETPLACE, images: [{ variant: 'MAIN', width: 300, height: 400, link: 'https://images.example.invalid/restricted.jpg' },
      { variant: 'PT01', width: 600, height: 800, link: 'https://images.example.invalid/restricted2.jpg' }] }] };

test('catalog projects publisher, pages, edition, authors, exact ISBN identifiers and item/package measurements in one request', async () => {
  const h = server({ item: expandedItem }), response = await h.handler(h.request()), data = await response.json(), book = data.items[0];
  assert.equal(response.status, 200); assert.equal(book.publisher, 'Fixture Press'); assert.equal(book.pageCount, 320); assert.equal(book.edition, '2');
  assert.deepEqual(book.authors, ['Fixture Author']); assert.equal(book.language, 'english');
  assert.equal(book.isbn10, '8535914846'); assert.equal(book.isbn13, isbn);
  assert.deepEqual(book.identifiers, [{ type: 'ISBN_10', identifier: '8535914846' }, { type: 'ISBN_13', identifier: isbn }]);
  assert.deepEqual(book.physical, { item: expandedItem.dimensions[1].item, package: expandedItem.dimensions[1].package });
  assert.equal(h.calls.length, 5); assert.equal(h.calls.filter(c => c.url.pathname.includes('/catalog/')).length, 1);
  assert.doesNotMatch(JSON.stringify(data), /Wrong marketplace|999|Not an author|Restricted prose|list_price|diagnostics/);
});

test('authorized image references and metadata are projected without downloads, secrets or description content', async () => {
  const h = server({ item: expandedItem }), data = await (await h.handler(h.request())).json();
  assert.deepEqual(data.items[0].imageMetadata, { datasetReturned: true, count: 2, entries: [
    { variant: 'MAIN', width: 300, height: 400, hasUrl: true }, { variant: 'PT01', width: 600, height: 800, hasUrl: true }] });
  assert.deepEqual(data.items[0].images, expandedItem.images[1].images); assert.equal(data.items[0].synopsis, null);
  assert.doesNotMatch(JSON.stringify(data), /other\.jpg|Restricted prose|synthetic-secret|synthetic-access|Atzr\|/);
  assert.equal(h.calls.length, 5);
  for (const [images, returned] of [[undefined, false], [[], true]]) {
    const empty = server({ item: { ...expandedItem, images } }), result = await (await empty.handler(empty.request())).json();
    assert.deepEqual(result.items[0].imageMetadata, { datasetReturned: returned, count: 0, entries: [] });
  }
});

test('client fills physical/bibliographic fields and authorized images in the existing book flow, preserving units and omitting synopsis', async t => {
  const h = server({ item: expandedItem }), payload = await (await h.handler(h.request())).json();
  globalThis.__spapiSession = { data: { session: { user: { id: uid }, access_token: 'synthetic-session' } } };
  t.after(() => { delete globalThis.__spapiSession; });
  t.mock.method(globalThis, 'fetch', async () => Response.json(payload));
  const { book } = await client.searchAmazonOfficial(isbn, user);
  assert.equal(book.language, 'Inglês'); assert.equal(book.format, 'Capa comum'); assert.equal(book.weight, 1500); assert.equal(book.weightUnit, 'g');
  assert.equal(book.height, 20.32); assert.equal(book.width, 10); assert.equal(book.depth, 2); assert.equal(book.dimensionsUnit, 'cm');
  assert.deepEqual(book.amazonPhysical, payload.items[0].physical); assert.deepEqual(book.rawIdentifiers, payload.items[0].identifiers);
  const primary = { id: 'primary', title: 'Priority', authors: ['Priority Author'], publisher: 'Priority Press', pageCount: 200,
    year: '1998', edition: '1', language: 'Português', format: 'Brochura', isbn10: '8535914846', isbn13: isbn,
    weight: .5, weightUnit: 'kg', width: 15, height: 20, dimensionsUnit: 'cm' };
  const before = structuredClone(primary), merged = client.complementWithAmazon(primary, book);
  for (const key of Object.keys(primary)) assert.deepEqual(merged[key], primary[key], 'primary value preserved: ' + key);
  assert.deepEqual(primary, before); assert.equal(merged.depth, 2); assert.equal(merged.provenance.depth, 'amazon_spapi_catalog_2022-04-01');
  assert.equal(merged.provenance.weight, undefined); assert.equal(merged.provenance.weightUnit, undefined);
  const draft = api.createRegistrationDraft(merged);
  assert.equal(draft.weight, 500); assert.equal(draft.weightUnit, 'g'); assert.equal(draft.depth, 2);
  assert.equal(draft.amazonPhysical, undefined); assert.equal(book.coverUrl, expandedItem.images[1].images[0].link); assert.equal(book.synopsis, undefined); assert.equal(book.imageMetadata, undefined);
});

test('attribute measurements and explicit publisher aliases supplement missing datasets without inventing publisher or pages', async () => {
  const fixture = { ...expandedItem, dimensions: undefined, attributes: { publisher_name: [{ value: 'Fixture Publisher Alias' }],
    manufacturer: [{ value: 'Manufacturer must not become publisher' }], number_of_pages: [{ value: -1 }, { value: 'unknown' }],
    item_dimensions: [{ width: { value: 12, unit: 'centimeters' }, height: { value: 20, unit: 'centimeters' }, length: { value: 3, unit: 'centimeters' } }],
    item_weight: [{ value: 0, unit: 'grams' }, { value: 250, unit: 'grams' }], item_package_weight: [{ value: 300, unit: 'grams' }] } };
  const h = server({ item: fixture }), data = await (await h.handler(h.request())).json();
  assert.equal(data.items[0].publisher, 'Fixture Publisher Alias'); assert.equal(data.items[0].pageCount, null);
  assert.equal(data.items[0].physical.item.weight.value, 250); assert.equal(data.items[0].physical.package.weight.value, 300);
  assert.equal(data.items[0].physical.item.length.value, 3);
  const missing = server({ item: { ...fixture, attributes: { manufacturer: [{ value: 'Manufacturer' }] } } });
  const result = await (await missing.handler(missing.request())).json();
  assert.equal(result.items[0].publisher, null); assert.equal(result.items[0].physical, null);
});

test('package-only, invalid and unsupported measurements never masquerade as item g/cm; invalid ISBN check digits ignored', async t => {
  globalThis.__spapiSession = { data: { session: { user: { id: uid }, access_token: 'synthetic-session' } } };
  t.after(() => { delete globalThis.__spapiSession; });
  let payload, label;
  t.mock.method(globalThis, 'fetch', async () => Response.json({ isbn, items: [{ isbn, asin: 'SYNTHETIC1', marketplaceId: api.MARKETPLACE,
    title: 'Fixture', language: label, binding: label, physical: payload, identifiers: [{ type: 'ISBN_10', identifier: '8535914847' }, { type: 'ISBN_13', identifier: '9780515154559' }, { type: 'ISBN_13', identifier: Number(isbn) }] }] }));
  for (const physical of [{ package: { weight: { value: 3, unit: 'kilograms' }, width: { value: 30, unit: 'centimeters' } } },
    { item: { weight: { value: 7, unit: 'unknown' }, width: { value: -1, unit: 'centimeters' }, height: { value: '20', unit: 'centimeters' } } }]) {
    payload = physical; label = physical.item ? '__proto__' : 'constructor';
    const { book } = await client.searchAmazonOfficial(isbn, user);
    assert.equal(book.weight, undefined); assert.equal(book.weightUnit, undefined); assert.equal(book.width, undefined); assert.equal(book.height, undefined);
    assert.equal(book.rawIdentifiers, undefined); assert.equal(book.isbn10, undefined); assert.equal(book.isbn13, isbn);
    assert.equal(book.language, label); assert.equal(book.format, label);
    if (physical.item) assert.deepEqual(book.amazonPhysical, { item: { weight: { value: 7, unit: 'unknown' } } });
    else assert.deepEqual(book.amazonPhysical, physical);
  }
  const invalidId = server({ item: { ...item, identifiers: [{ marketplaceId: api.MARKETPLACE, identifiers: [{ identifierType: 'ISBN', identifier: '8535914847' }] }] } });
  assert.deepEqual((await (await invalidId.handler(invalidId.request())).json()).items, []);
});

for (const [reportedIsbn, width, height] of [['9780515154559', 1400, 1900], ['9780593984215', 1435, 2560]]) {
  test(`MAIN ${width}x${height} for ${reportedIsbn} reaches the existing ISBN form without an extra Amazon request`, async t => {
    // Real reported dimensions, synthetic public references; no credentials or downloaded image files.
    const cover = `https://m.media-amazon.com/images/I/SYNTH${reportedIsbn}.jpg`, back = `https://m.media-amazon.com/images/I/SYNTH${reportedIsbn}BACK.jpg`;
    const raw = [{ variant: 'MAIN', link: cover.replace('.jpg', '._SX42_.jpg'), width: 42, height: 75 },
      { variant: 'MAIN', link: cover, width, height }, { variant: 'MAIN', link: cover.replace('.jpg', '._SY500_.jpg'), width: 280, height: 500 },
      { variant: 'PT01', link: back.replace('.jpg', '._SX100_.jpg'), width: 100, height: 200 },
      { variant: 'PT01', link: back, width: 600, height: 800 }, { variant: 'PT02', link: cover, width, height }];
    const h = server({ item: { ...item, identifiers: [{ marketplaceId: api.MARKETPLACE, identifiers: [{ identifierType: 'ISBN', identifier: reportedIsbn }] }],
      images: [{ marketplaceId: api.MARKETPLACE, images: raw }] } });
    const data = await (await h.handler(h.request('/api/amazon/spapi/catalog?isbn=' + reportedIsbn))).json();
    assert.deepEqual(data.items[0].images, raw); assert.equal(h.calls.length, 5);
    assert.equal(h.calls.filter(c => c.url.pathname.includes('/catalog/')).length, 1);
    let clientCalls = 0;
    t.mock.method(globalThis, 'fetch', async url => { clientCalls++; assert.equal(url, '/api/amazon/spapi/catalog?isbn=' + reportedIsbn); return Response.json(data); });
    const app = mountApp(); await app.search(reportedIsbn); app.render();
    assert.equal(app.find('BookDetailsCard').props.book.coverUrl, cover);
    app.find('Header').props.onTabChange('cadastro'); app.render();
    const draft = app.find('ProductRegistrationForm').props.draft;
    assert.equal(draft.mainImageUrl, cover); assert.deepEqual(draft.additionalImageUrls, [back]);
    assert.equal(clientCalls, 1, 'no lookup, probe or download for image URLs');
  });
}

test('image URL projection rejects credentials, signed references, HTML and executable schemes; malformed images cannot break ISBN', async t => {
  const cover = 'https://images.example.invalid/public.jpg';
  const unsafe = ['javascript:alert(1)', 'data:image/svg+xml,<svg/>', 'http://images.example.invalid/a.jpg',
    'https://user:pass@images.example.invalid/a.jpg', 'https://images.example.invalid/a.jpg?token=synthetic-secret',
    'https://images.example.invalid/a.jpg#synthetic-secret', 'https://images.example.invalid/index.html', 'https://images.example.invalid/images/'];
  const h = server({ item: { ...item, images: [{ marketplaceId: api.MARKETPLACE, images: [
    ...unsafe.map(link => ({ variant: 'MAIN', link, width: 9000, height: 9000 })),
    null, { variant: 'UNKNOWN', link: cover }, { variant: 'MAIN', link: cover, width: 500, height: 600 }] }] } });
  const data = await (await h.handler(h.request())).json();
  assert.deepEqual(data.items[0].images, [{ variant: 'MAIN', link: cover, width: 500, height: 600 }]);
  assert.doesNotMatch(JSON.stringify(data), /synthetic-secret|user:pass|javascript:|<svg|index\.html/);
  globalThis.__spapiSession = { data: { session: { user: { id: uid }, access_token: 'synthetic-session' } } };
  t.after(() => { delete globalThis.__spapiSession; });
  t.mock.method(globalThis, 'fetch', async () => Response.json({ ...data, items: [{ ...data.items[0], images: [
    ...unsafe.map(link => ({ variant: 'MAIN', link, width: 9000, height: 9000 })), null, 'invalid', ...data.items[0].images] }] }));
  assert.equal((await client.searchAmazonOfficial(isbn, user)).book.coverUrl, cover);
});

test('Amazon joins other source images without replacing the existing cover, repeating variants or mutating primary data', () => {
  const old = 'https://example.invalid/primary.jpg', thumb = 'https://example.invalid/thumbnail.jpg', extra = 'https://example.invalid/extra.jpg';
  const cover = 'https://images.example.invalid/main.jpg', back = 'https://images.example.invalid/back.jpg';
  const base = { id: 'base', title: 'Priority', coverUrl: old, thumbnailUrl: thumb, additionalImages: [extra, old, extra] };
  const amazon = { id: 'amazon', title: 'Amazon', coverUrl: cover, additionalImages: [back, cover, extra] };
  const before = structuredClone(base), merged = client.complementWithAmazon(base, amazon);
  assert.equal(merged.coverUrl, old); assert.deepEqual(merged.additionalImages, [thumb, extra, cover, back]);
  assert.deepEqual(base, before); assert.equal(merged.provenance.coverUrl, undefined);
  const draft = api.createRegistrationDraft(merged);
  assert.equal(draft.mainImageUrl, old); assert.deepEqual(draft.additionalImageUrls, [thumb, extra, cover, back]);
  const thumbnailOnly = client.complementWithAmazon({ id: 'base', title: 'Priority', thumbnailUrl: thumb }, amazon);
  assert.equal(api.createRegistrationDraft(thumbnailOnly).mainImageUrl, thumb); assert.equal(thumbnailOnly.provenance.coverUrl, undefined);
  const noCover = client.complementWithAmazon({ id: 'base', title: 'Priority', additionalImages: [extra] }, amazon);
  assert.equal(noCover.coverUrl, cover); assert.equal(noCover.provenance.coverUrl, 'amazon_spapi_catalog_2022-04-01');
  assert.deepEqual(api.createRegistrationDraft(noCover).additionalImageUrls, [extra, back]);
});

const cdn = asset => `https://m.media-amazon.com/images/I/SYNTH${asset}.jpg`;
const labImages = (images = [cdn('MAIN'), cdn('BACK'), cdn('INSIDE')]) => ({
  status: 'concluida', modo: 'http', isbn_pesquisado: isbn, correspondencia: 'corresponde',
  isbn_encontrado: { isbn10: { valor: '8535914846', valido: true }, isbn13: { valor: isbn, valido: true } },
  book_info: { title: 'Must not replace bibliography', publisher: 'Must not enter registration', synopsis: 'Must not import' },
  imagens: { itens: images.map((referencia, i) => ({ referencia, papel: i ? 'adicional' : 'principal' })), download_realizado: false },
});

test('image identity collapses known CDN resizes and normalized URLs, retaining distinct assets, variants and unknown URL transformations', () => {
  const cover = cdn('MAIN'), back = cdn('BACK');
  assert.deepEqual(api.imageReferences([cover, cover.replace('.jpg', '._AC_SL1500_.jpg'),
    cover.replace('m.media-amazon.com', 'images-na.ssl-images-amazon.com').replace('.jpg', '._SX75_.jpg'),
    back, 'HTTPS://EXAMPLE.INVALID:443/cover.jpg', 'https://example.invalid/cover.jpg',
    'https://example.invalid/cover.jpg?size=100', 'https://example.invalid/cover.jpg?size=500']),
  [cover, back, 'https://example.invalid/cover.jpg', 'https://example.invalid/cover.jpg?size=100', 'https://example.invalid/cover.jpg?size=500']);
  const draft = api.createRegistrationDraft({ id: 'fixture', title: 'Fixture', coverUrl: cover,
    thumbnailUrl: cover.replace('.jpg', '._SX75_.jpg'), additionalImages: [back, back.replace('.jpg', '._SX50_.jpg')] });
  assert.equal(draft.mainImageUrl, cover); assert.deepEqual(draft.additionalImageUrls, [back]);
});

test('official selection retains MAIN roles separately from different PT01 images, choosing the largest resolution per identity', async t => {
  globalThis.__spapiSession = { data: { session: { user: { id: uid }, access_token: 'synthetic-session' } } };
  t.after(() => { delete globalThis.__spapiSession; });
  const images = [
    { variant: 'MAIN', link: cdn('MAIN').replace('.jpg', '._SX75_.jpg'), width: 50, height: 75 },
    { variant: 'MAIN', link: cdn('MAIN'), width: 1400, height: 1900 },
    { variant: 'MAIN', link: cdn('ALTERNATE'), width: 500, height: 700 },
    { variant: 'PT01', link: cdn('BACK'), width: 1000, height: 1500 },
    { variant: 'PT01', link: cdn('INSIDE'), width: 800, height: 900 },
    { variant: 'PT02', link: cdn('BACK').replace('.jpg', '._SX50_.jpg'), width: 50, height: 75 },
    { variant: 'PT02', link: cdn('SIDE'), width: 600, height: 800 },
  ];
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({ isbn,
    items: [{ isbn, asin: 'SYNTHETIC1', marketplaceId: api.MARKETPLACE, title: 'Fixture', images }] }); });
  const { book } = await client.searchAmazonOfficial(isbn, user);
  assert.equal(book.coverUrl, cdn('MAIN'));
  assert.deepEqual(book.additionalImages, [cdn('BACK'), cdn('INSIDE'), cdn('SIDE')]);
  assert.deepEqual(book.amazonImages, [
    { variant: 'MAIN', link: cdn('MAIN') }, { variant: 'MAIN', link: cdn('ALTERNATE') },
    { variant: 'PT01', link: cdn('BACK') }, { variant: 'PT01', link: cdn('INSIDE') }, { variant: 'PT02', link: cdn('SIDE') },
  ]);
  const merged = client.complementWithAmazon({ id: 'primary', title: 'Priority' }, book);
  assert.deepEqual(merged.amazonImages, book.amazonImages, 'roles survive the merge with priority sources');
  assert.equal(api.createRegistrationDraft(merged).amazonImages, undefined, 'classification is not a Magazord field');
  assert.equal(calls, 1);
});

test('9781419762109: two distinct MAIN references trigger one real laboratory client request through the normal ISBN flow', async t => {
  // Controlled responses for the reported ISBN; no claim that these synthetic URLs are actual Amazon assets.
  const query = '9781419762109', cover = cdn('BATMANCOVER'), alternate = cdn('BATMANALTERNATECOVER'), inside = cdn('BATMANINSIDE'), detail = cdn('BATMANDETAIL');
  const rawImages = [
    { variant: 'MAIN', link: cover.replace('.jpg', '._SX75_.jpg'), width: 50, height: 75 },
    { variant: 'MAIN', link: cover, width: 1400, height: 1900 },
    { variant: 'MAIN', link: alternate, width: 600, height: 800 },
    // A cover also labelled PT01 is not evidence of a distinct gallery image.
    { variant: 'PT01', link: alternate.replace('.jpg', '._SX50_.jpg'), width: 50, height: 75 },
  ];
  const backend = server({ item: { ...item, identifiers: [{ marketplaceId: api.MARKETPLACE,
    identifiers: [{ identifierType: 'ISBN', identifier: query }] }], images: [{ marketplaceId: api.MARKETPLACE, images: rawImages }] } });
  globalThis.__spapiSession = { data: { session: { user: { id: uid }, access_token: 'synthetic-session' } } };
  t.after(() => { delete globalThis.__spapiSession; });
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push({ url, init });
    if (url === '/api/amazon/spapi/catalog?isbn=' + query) return backend.handler(backend.request('/api/amazon/spapi/catalog?isbn=' + query));
    assert.equal(url, '/api/amazon?acao=search'); assert.equal(init.method, 'POST');
    assert.equal(init.headers.Authorization, 'Bearer synthetic-session'); assert.equal(init.credentials, 'same-origin');
    assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store');
    assert.deepEqual(JSON.parse(init.body), { isbn: query, modo: 'http' });
    const payload = labImages([cdn('BATMANLABCOVER'), cover, alternate, inside, inside.replace('.jpg', '._SX75_.jpg'), detail]);
    payload.isbn_pesquisado = query; payload.isbn_encontrado = { isbn13: { valor: query, valido: true } };
    return Response.json(payload);
  });
  for (const primary of [null, { id: 'primary', title: 'Priority title', isbn13: query,
    coverUrl: 'https://example.invalid/priority-cover.jpg', thumbnailUrl: 'https://example.invalid/priority-thumb.jpg' }]) {
    requests.length = 0;
    const view = mountApp({ brasil: { book: primary, diagnostic: { status: primary ? 200 : 404 } }, lab: client.searchAmazonLab });
    const pending = view.search(query); await view.search(query); await pending; view.render();
    assert.equal(requests.length, 2, 'one official query and one existing Lab search, no probes/retries');
    const book = view.find('BookDetailsCard').props.book;
    assert.equal(book.coverUrl, primary?.coverUrl || cover);
    assert.deepEqual(book.amazonImages.map(image => image.variant), ['MAIN', 'MAIN']);
    const expectedAdditional = primary ? [primary.thumbnailUrl, cover, inside, detail] : [inside, detail];
    assert.deepEqual(book.additionalImages, expectedAdditional, 'no alternate MAIN, laboratory cover or resized duplicate');
    view.find('Header').props.onTabChange('cadastro'); view.render();
    const draft = view.find('ProductRegistrationForm').props.draft;
    assert.equal(draft.mainImageUrl, primary?.coverUrl || cover); assert.deepEqual(draft.additionalImageUrls, expectedAdditional);
  }
  assert.equal(backend.calls.filter(call => call.url.pathname.includes('/catalog/')).length, 2, 'one official upstream query per search');
});

test('9781419762109: only MAIN plus blocked/empty laboratory preserves the cover, without retries or a false gallery', async t => {
  const query = '9781419762109', cover = cdn('BATMANCOVER'), alternate = cdn('BATMANALTERNATECOVER');
  let labCalls = 0;
  t.mock.method(globalThis, 'fetch', async () => Response.json({ isbn: query, items: [{ isbn: query, asin: 'SYNTHETIC1', marketplaceId: api.MARKETPLACE,
    title: 'The Art of the Batman', images: [{ variant: 'MAIN', link: alternate, width: 600, height: 800 },
      { variant: 'MAIN', link: cover, width: 1400, height: 1900 }] }] }));
  for (const response of [{ status: 'interrompida', diagnostico: { codigo: 'amazon_captcha' } },
    { status: 'interrompida', status_http: 403 }, { ...labImages([]), isbn_pesquisado: query, isbn_encontrado: { isbn13: { valor: query, valido: true } } }]) {
    const view = mountApp({ lab: async () => { labCalls++; return response; } });
    const before = labCalls; await view.search(query); view.render();
    const book = view.find('BookDetailsCard').props.book;
    assert.equal(labCalls, before + 1); assert.equal(book.coverUrl, cover); assert.equal(book.additionalImages, undefined);
  }
});

test('a distinct PT01 image suppresses the laboratory, but cover/thumbnail URLs alone do not', async t => {
  const query = '9781419762109', cover = cdn('BATMANCOVER'), inside = cdn('BATMANINSIDE');
  t.mock.method(globalThis, 'fetch', async () => Response.json({ isbn: query, items: [{ isbn: query, asin: 'SYNTHETIC1', marketplaceId: api.MARKETPLACE,
    title: 'The Art of the Batman', images: [{ variant: 'MAIN', link: cover, width: 1400, height: 1900 },
      { variant: 'PT01', link: inside, width: 600, height: 800 }] }] }));
  const view = mountApp({ lab: () => assert.fail('a real additional image needs no fallback') });
  await view.search(query); view.render(); assert.deepEqual(view.find('BookDetailsCard').props.book.additionalImages, [inside]);
  let calls = 0;
  const onlyCovers = mountApp({ brasil: { book: { id: 'base', title: 'Priority', coverUrl: cover, thumbnailUrl: cdn('THUMB') }, diagnostic: { status: 200 } },
    lab: async () => { calls++; return { status: 'interrompida' }; } });
  t.mock.method(globalThis, 'fetch', async () => Response.json({ isbn: query, items: [] }));
  await onlyCovers.search(query); assert.equal(calls, 1, 'thumbnail is not evidence of an additional photograph');
});

test('automatic fallback reuses one authenticated laboratory request, imports only matched images and preserves SP-API cover', async t => {
  globalThis.__spapiSession = { data: { session: { user: { id: uid }, access_token: 'synthetic-session' } } };
  t.after(() => { delete globalThis.__spapiSession; });
  const base = { id: 'base', title: 'Priority title', publisher: 'Priority publisher', coverUrl: cdn('MAIN') };
  const before = structuredClone(base), calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push(url); assert.equal(url, '/api/amazon?acao=search'); assert.equal(init.method, 'POST');
    assert.equal(init.headers.Authorization, 'Bearer synthetic-session'); assert.equal(init.credentials, 'same-origin');
    assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store'); assert.ok(init.signal instanceof AbortSignal);
    assert.deepEqual(JSON.parse(init.body), { isbn, modo: 'http' });
    return Response.json(labImages([cdn('MAIN').replace('.jpg', '._SX75_.jpg'), cdn('BACK'), cdn('BACK').replace('.jpg', '._SX50_.jpg'), cdn('INSIDE')]));
  });
  const merged = await client.complementAmazonImages(base, isbn, user);
  assert.equal(merged.coverUrl, base.coverUrl); assert.deepEqual(merged.additionalImages, [cdn('BACK'), cdn('INSIDE')]);
  assert.equal(merged.title, base.title); assert.equal(merged.publisher, base.publisher); assert.equal(merged.synopsis, undefined);
  assert.deepEqual(base, before); assert.equal(calls.length, 1);
  const draft = api.createRegistrationDraft(merged);
  assert.equal(draft.mainImageUrl, base.coverUrl); assert.deepEqual(draft.additionalImageUrls, [cdn('BACK'), cdn('INSIDE')]);
  await client.complementAmazonImages(merged, isbn, user); assert.equal(calls.length, 1, 'an available gallery needs no laboratory lookup');
});

test('fallback skips restricted actors, invalid ISBNs, existing galleries and changed sessions', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('must not request Amazon'));
  const base = { id: 'base', title: 'Priority', coverUrl: cdn('MAIN') };
  for (const actor of [{ ...user, role: 'operator' }, { ...user, storeId: uid }, { ...user, active: false }])
    assert.equal(await client.complementAmazonImages(base, isbn, actor), base);
  for (const query of ['invalid', '9788535914848', '9791090636071']) assert.equal(await client.complementAmazonImages(base, query, user), base);
  const gallery = { ...base, additionalImages: [cdn('BACK')] };
  assert.equal(await client.complementAmazonImages(gallery, isbn, user), gallery);
  globalThis.__spapiSession = { data: { session: { user: { id: 'other-user' }, access_token: 'synthetic-session' } } };
  t.after(() => { delete globalThis.__spapiSession; });
  assert.equal(await client.complementAmazonImages(base, isbn, user), base);
});

test('blocked, empty, mismatched, malformed and failing laboratory responses preserve SP-API or allow registration without images, without retries', async t => {
  globalThis.__spapiSession = { data: { session: { user: { id: uid }, access_token: 'synthetic-session' } } };
  t.after(() => { delete globalThis.__spapiSession; });
  const base = { id: 'base', title: 'Priority', coverUrl: cdn('MAIN') };
  const bad = [
    () => Response.json({ status: 'interrompida', diagnostico: { codigo: 'amazon_captcha' } }),
    () => Response.json(labImages([])), () => Response.json(labImages([cdn('MAIN').replace('.jpg', '._SX50_.jpg')])),
    () => Response.json({ ...labImages(), correspondencia: 'divergente' }),
    () => Response.json({ ...labImages(), isbn_pesquisado: '9780515154559' }),
    () => Response.json({ ...labImages(), isbn_encontrado: {} }),
    () => Response.json({ ...labImages(), isbn_encontrado: { id: { valor: '9780515154559', valido: true } } }),
    () => Response.json({ ...labImages(), isbn_encontrado: { id: { valor: isbn, valido: true }, other: { valor: '9780515154559', valido: true } } }),
    () => Response.json(labImages(['javascript:alert(1)', 'https://example.invalid/a.jpg?token=secret', 'https://user:pass@example.invalid/a.jpg'])),
    () => new Response('blocked', { status: 403 }), () => new Response('unavailable', { status: 503 }),
    () => new Response('{', { headers: { 'Content-Type': 'application/json' } }),
    () => { throw new DOMException('Timeout', 'TimeoutError'); },
  ];
  let calls = 0, response;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return response(); });
  for (response of bad) {
    const initial = calls; assert.equal(await client.complementAmazonImages(base, isbn, user), base);
    assert.equal(calls, initial + 1, 'one bounded request and no retry');
  }
  response = () => Response.json(labImages([]));
  assert.equal(await client.complementAmazonImages(null, isbn, user), null);
  const draft = api.createRegistrationDraft({ id: 'manual', title: '', isbn13: isbn });
  assert.equal(draft.mainImageUrl, undefined); assert.deepEqual(draft.additionalImageUrls, []);
  response = () => Response.json(labImages());
  const onlyImages = await client.complementAmazonImages(null, isbn, user);
  assert.equal(onlyImages.title, ''); assert.equal(onlyImages.coverUrl, cdn('MAIN'));
});

test('normal ISBN lookup automatically consolidates fallback gallery once and forwards it to the existing registration draft', async t => {
  let official = 0, laboratory = 0;
  t.mock.method(globalThis, 'fetch', async () => { official++; return Response.json({ isbn, items: [{ isbn, asin: 'SYNTHETIC1', marketplaceId: api.MARKETPLACE,
    title: 'Amazon title', images: [{ variant: 'MAIN', link: cdn('MAIN'), width: 1400, height: 1900 }] }] }); });
  const view = mountApp({ lab: async () => { laboratory++; return labImages(); } });
  const pending = view.search(); await view.search(); await pending; view.render();
  assert.equal(official, 1); assert.equal(laboratory, 1);
  assert.equal(view.find('BookDetailsCard').props.book.title, 'Existing title');
  view.find('Header').props.onTabChange('cadastro'); view.render();
  const draft = view.find('ProductRegistrationForm').props.draft;
  assert.equal(draft.mainImageUrl, cdn('MAIN')); assert.deepEqual(draft.additionalImageUrls, [cdn('BACK'), cdn('INSIDE')]);
});

test('late laboratory images are discarded if the actor changes and production mode never invokes the fallback', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ isbn, items: [] }));
  let release, started;
  const ready = new Promise(resolve => { started = resolve; });
  const view = mountApp({ lab: () => { started(); return new Promise(resolve => { release = resolve; }); } });
  const pending = view.search(); await ready;
  view.deps.user.currentUser = { ...user, storeId: uid }; view.render(); release(labImages()); await pending; view.render();
  assert.equal(view.find('BookDetailsCard').props.book.coverUrl, undefined);
  const production = mountApp({ user: { currentUser: user, operationEnvironment: 'production' }, lab: () => assert.fail('no fallback in production') });
  await production.search(); production.render(); assert.equal(production.find('BookDetailsCard').props.book.coverUrl, undefined);
});

test('switching environments while laboratory images are pending discards the development result', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ isbn, items: [] }));
  let release, started;
  const ready = new Promise(resolve => { started = resolve; });
  const view = mountApp({ lab: () => { started(); return new Promise(resolve => { release = resolve; }); } });
  const pending = view.search(); await ready;
  view.deps.user.operationEnvironment = 'production'; view.render(); release(labImages()); await pending; view.render();
  assert.equal(view.find('BookDetailsCard').props.book.coverUrl, undefined);
});

const registrationBuild = await build({ stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
  export { default as Form } from './src/components/magazord/ProductRegistrationForm';
  export { default as Images } from './src/components/magazord/ImagesSection';` },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', plugins: [{ name: 'registration-images', setup(b) {
    const mocks = [[/^react$/, 'module.exports=deps.react'], [/^react\/jsx-runtime$/, 'exports.jsx=exports.jsxs=(type,props)=>({type,props})'],
      [/^lucide-react$/, 'module.exports=new Proxy({},{get:(_,key)=>String(key)})'],
      [/\/lib\/supabase$/, 'exports.supabase={};exports.supabaseUrl="https://jcxdkrpmrfbrhzwbzhph.supabase.co"'],
      [/\/services\/magazordMockService$/, 'exports.magazordMockService=deps.service']];
    for (const name of ['ProductIdentitySection', 'CategoryAndBrandSection', 'CommercialSection', 'BibliographicSection', 'PhysicalAttributesSection', 'SynopsisSection', 'AdvancedFiscalSection'])
      mocks.push([new RegExp(`(?:^|/)${name}$`), `module.exports=${JSON.stringify(name)}`]);
    b.onResolve({ filter: /.*/ }, args => { const mock = mocks.find(([pattern]) => pattern.test(args.path)); return mock ? { path: args.path, namespace: 'mock', pluginData: mock[1] } : undefined; });
    b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: args.pluginData }));
  } }] });
const imageNodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(imageNodes) : [node, ...imageNodes(node.props?.children)];
const imageText = node => node == null || typeof node === 'boolean' ? '' : typeof node !== 'object' ? String(node) : Array.isArray(node) ? node.map(imageText).join('') : imageText(node.props?.children);
function mountRegistration(component, initialProps, service) {
  let props = initialProps, cursor = 0, effects = [], tree; const slots = [], deps = { service };
  deps.react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useEffect(fn, dependencies) { const i = cursor++; if (!slots[i] || dependencies.some((v, n) => !Object.is(v, slots[i][n]))) { slots[i] = dependencies; effects.push(fn); } },
  };
  const module = { exports: {} }; new Function('deps', 'module', 'exports', 'document', registrationBuild.outputFiles[0].text)(deps, module, module.exports, { querySelector: () => null });
  function render(updates = {}) { props = { ...props, ...updates }; cursor = 0; effects = []; tree = module.exports[component](props); effects.forEach(fn => fn()); }
  render(); return { render, all: predicate => imageNodes(tree).filter(predicate), find: predicate => imageNodes(tree).find(predicate), text: () => imageText(tree) };
}

test('existing image gallery renders automatic cover, permits manual replacement without duplicates and submits current URLs to Magazord', async () => {
  const cover = 'https://images.example.invalid/main.jpg', back = 'https://images.example.invalid/back.jpg', manual = 'https://example.invalid/operator.jpg';
  const book = { id: 'amazon', title: 'Fixture', isbn13: isbn, coverUrl: cover, additionalImages: [back] };
  for (const mode of ['automatic', 'fallback-gallery', 'manual', 'without-images']) {
    const selected = mode === 'fallback-gallery' ? { ...book, additionalImages: [back, cdn('INSIDE')] } : book;
    let draft = { ...api.createRegistrationDraft(mode === 'without-images' ? { ...book, coverUrl: undefined, additionalImages: [] } : selected), parentCode: 'IMG-P', price: '10' };
    let gallery;
    const onChange = updates => { draft = { ...draft, ...updates }; gallery.render({ draft }); };
    gallery = mountRegistration('Images', { draft, onChange });
    if (mode !== 'without-images') assert.equal(gallery.find(n => n.type === 'img' && n.props.alt === 'Capa principal').props.src, cover);
    else assert.match(gallery.text(), /Sem fotos no momento/);
    if (mode === 'manual') {
      gallery.find(n => n.props.title === 'Tornar capa principal').props.onClick();
      assert.equal(draft.mainImageUrl, back); assert.deepEqual(draft.additionalImageUrls, [cover]);
      gallery.find(n => n.type === 'button' && imageText(n) === 'Adicionar URL').props.onClick(); gallery.render();
      const enter = value => { gallery.find(n => n.type === 'input' && n.props.type === 'url').props.onChange({ target: { value } }); gallery.render();
        gallery.find(n => n.type === 'input' && n.props.type === 'url').props.onKeyDown({ key: 'Enter', preventDefault() {} }); gallery.render(); };
      enter(back); assert.deepEqual(draft.additionalImageUrls, [cover], 'pasting the current main URL cannot add a duplicate');
      gallery.find(n => n.type === 'button' && imageText(n) === 'Adicionar URL').props.onClick(); gallery.render(); enter(manual);
      gallery.all(n => n.props.title === 'Tornar capa principal').at(-1).props.onClick();
      assert.equal(draft.mainImageUrl, manual); assert.deepEqual(draft.additionalImageUrls, [back, cover]);
      assert.equal(gallery.find(n => n.type === 'img' && n.props.alt === 'Capa principal').props.src, manual);
    }
    const calls = [], service = { getSimulationConfig: () => ({ mode: 'auto' }), createProduct: async (payload, actionMode) => {
      calls.push({ payload, actionMode }); return { success: true, parentCode: 'IMG-P', childCode: isbn, registeredAt: 1 }; } };
    const form = mountRegistration('Form', { draft, originalBook: book, onSuccessRegistration() {}, onUpdateDraft() {} }, service);
    const imageSection = form.find(n => typeof n.type === 'function' && n.type.name === 'ImagesSection');
    assert.equal(imageSection.props.draft.mainImageUrl, draft.mainImageUrl);
    await form.find(n => n.props.id === 'btn-submit-magazord-registration').props.onClick();
    assert.equal(calls.length, 1); assert.equal(calls[0].payload.mainImageUrl, draft.mainImageUrl);
    assert.deepEqual(calls[0].payload.additionalImageUrls, draft.additionalImageUrls); assert.equal(calls[0].actionMode, 'auto');
  }
});

test('manual image management preserves the chosen cover and rejects another resolution of the same Amazon asset', () => {
  const cover = cdn('MAIN'), back = cdn('BACK');
  let draft = api.createRegistrationDraft({ id: 'fixture', title: 'Fixture', coverUrl: cover, additionalImages: [back] });
  let gallery;
  gallery = mountRegistration('Images', { draft, onChange: updates => { draft = { ...draft, ...updates }; gallery.render({ draft }); } });
  gallery.find(n => n.props.title === 'Tornar capa principal').props.onClick();
  assert.equal(draft.mainImageUrl, back); assert.deepEqual(draft.additionalImageUrls, [cover]);
  gallery.find(n => n.type === 'button' && imageText(n) === 'Adicionar URL').props.onClick(); gallery.render();
  gallery.find(n => n.type === 'input' && n.props.type === 'url').props.onChange({ target: { value: back.replace('.jpg', '._SX75_.jpg') } }); gallery.render();
  gallery.find(n => n.type === 'input' && n.props.type === 'url').props.onKeyDown({ key: 'Enter', preventDefault() {} }); gallery.render();
  assert.equal(draft.mainImageUrl, back); assert.deepEqual(draft.additionalImageUrls, [cover]);
});

test('normal navigation preserves selected and removed images; pending uploads block navigation and new searches', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({ isbn, items: [] }); });
  const view = mountApp(); await view.search(); view.render();
  const search = view.find('SearchForm').props.onSearch;
  view.find('Header').props.onTabChange('cadastro'); view.render();
  const main = 'https://example.invalid/operator.jpg', extra = 'https://example.invalid/detail.jpg';
  let form = view.find('ProductRegistrationForm');
  form.props.onUpdateDraft({ mainImageUrl: main, additionalImageUrls: [extra], imageSelectionManual: true }); view.render();
  form = view.find('ProductRegistrationForm'); form.props.onImageUploadBusyChange(true);
  view.find('Header').props.onTabChange('consultar'); view.render();
  assert.ok(view.find('ProductRegistrationForm'), 'header cannot unmount the form during upload');
  // Return to the form using normal navigation after the protected work finishes.
  const before = calls; await search(isbn); assert.equal(calls, before);
  form.props.onImageUploadBusyChange(false);
  view.find('Header').props.onTabChange('consultar'); view.render();
  view.find('MagazordStatusCard').props.onOpenRegistration('usado'); view.render();
  const reopened = view.find('ProductRegistrationForm').props.draft;
  assert.equal(reopened.mainImageUrl, main); assert.deepEqual(reopened.additionalImageUrls, [extra]);
  assert.equal(reopened.imageSelectionManual, true);
  view.find('ProductRegistrationForm').props.onUpdateDraft({ mainImageUrl: undefined, additionalImageUrls: [] }); view.render();
  view.find('Header').props.onTabChange('consultar'); view.render();
  view.find('MagazordStatusCard').props.onOpenRegistration('novo'); view.render();
  assert.equal(view.find('ProductRegistrationForm').props.draft.mainImageUrl, undefined);
  assert.deepEqual(view.find('ProductRegistrationForm').props.draft.additionalImageUrls, [], 'normal reopen cannot reinsert removed images');
});

test('registration waits for photo processing and forwards one main plus ordered deduplicated private references', async () => {
  const privateRef = `https://jcxdkrpmrfbrhzwbzhph.supabase.co/storage/v1/object/authenticated/isbn-registration-images/${sid}/${uid}/${'a'.repeat(64)}.png`;
  const cover = cdn('MAIN'), inside = cdn('INSIDE');
  const draft = { ...api.createRegistrationDraft({ id: 'book', title: 'Fixture', isbn13: isbn }), parentCode: 'IMG-P', price: '10',
    mainImageUrl: privateRef, additionalImageUrls: [cover, privateRef, cover.replace('.jpg', '._SX75_.jpg'), inside] };
  const calls = [], busy = []; let back = 0;
  const form = mountRegistration('Form', { draft, originalBook: {}, imageUser: user, onUpdateDraft() {},
    onImageUploadBusyChange: value => busy.push(value), onBackToSearch: () => back++, onSuccessRegistration() {} },
    { getSimulationConfig: () => ({ mode: 'auto' }), createProduct: async payload => { calls.push(payload); return { success: true }; } });
  form.find(n => typeof n.type === 'function' && n.type.name === 'ImagesSection').props.onUploadBusyChange(true);
  form.render(); assert.equal(form.find(n => n.props.id === 'btn-submit-magazord-registration').props.disabled, true);
  await form.find(n => n.props.id === 'btn-submit-magazord-registration').props.onClick();
  form.find(n => n.props.title === 'Voltar para a pesquisa de ISBN').props.onClick();
  assert.equal(calls.length, 0); assert.equal(back, 0);
  form.find(n => typeof n.type === 'function' && n.type.name === 'ImagesSection').props.onUploadBusyChange(false); form.render();
  await form.find(n => n.props.id === 'btn-submit-magazord-registration').props.onClick();
  assert.equal(calls.length, 1); assert.equal(calls[0].mainImageUrl, privateRef);
  assert.deepEqual(calls[0].additionalImageUrls, [cover, inside]); assert.deepEqual(busy, [true, false]);
});
