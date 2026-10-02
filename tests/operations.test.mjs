import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Run the actual service/event handlers with isolated SDK responses and controlled hooks.
// No DOM, network, credentials or additional test dependencies are required.
async function compile(entry, mocks) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    define: { 'import.meta.env.DEV': 'false' }, plugins: [{ name: 'isolated-dependencies', setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        const mock = mocks.find(([pattern]) => pattern.test(args.path));
        return mock ? { path: args.path, namespace: 'test', pluginData: mock[1] } : undefined;
      });
      builder.onLoad({ filter: /.*/, namespace: 'test' }, args => ({ contents: args.pluginData, loader: 'js' }));
    } }],
  });
  return deps => {
    const module = { exports: {} };
    new Function('deps', 'module', 'exports', result.outputFiles[0].text)(deps, module, module.exports);
    return module.exports;
  };
}

const service = await compile('src/services/operationsService.ts', [[/\/lib\/supabase$/, 'exports.supabase=deps.supabase']]);
const actor = 'actor-from-session';
const storeId = '11111111-2222-3333-4444-555555555555';
const completedAt = '2026-10-02T12:00:00.000Z';
const input = { storeId, isbn: '9788535914849', operationType: 'isbn_search', status: 'success', completedAt, metadata: { resultFound: false } };

function sdk({ session = { user: { id: actor } }, error = null, throws = false } = {}) {
  const rows = [];
  return { rows, supabase: {
    auth: { getSession: async () => ({ data: { session }, error: null }) },
    from(table) { assert.equal(table, 'operations'); return { async insert(row) { rows.push(row); if (throws) throw new Error('private'); return { error }; } }; },
  } };
}

test('INSERT uses the real table fields, a completion time and no actor/environment overrides', async () => {
  const fake = sdk();
  assert.equal(await service(fake).recordOperation(input, actor), true);
  assert.deepEqual(fake.rows[0], { store_id: storeId, isbn: input.isbn, title: null, condition: null,
    operation_type: 'isbn_search', status: 'success', parent_code: null, child_code: null, error_message: null,
    metadata: { resultFound: false }, completed_at: completedAt });
  for (const field of ['user_id', 'environment', 'id', 'created_at', 'legacy_operator_name']) assert.ok(!(field in fake.rows[0]));
});

test('Missing/changed session and invalid store prevent INSERT', async () => {
  for (const session of [null, { user: { id: 'another-account' } }]) {
    const fake = sdk({ session });
    assert.equal(await service(fake).recordOperation(input, actor), false);
    assert.equal(fake.rows.length, 0);
  }
  const fake = sdk();
  assert.equal(await service(fake).recordOperation({ ...input, storeId: '' }, actor), false);
  assert.equal(fake.rows.length, 0);
});

test('INSERT failures never throw or recursively record an operation_error', async () => {
  for (const options of [{ error: { message: 'private', code: '42501' } }, { throws: true }]) {
    const fake = sdk(options);
    assert.equal(await service(fake).recordOperation(input, actor), false);
    assert.equal(fake.rows.length, 1);
  }
});

const componentMocks = [
  [/^react$/, 'module.exports=deps.react'],
  [/^react\/jsx-runtime$/, 'exports.jsx=exports.jsxs=(type,props)=>({type,props})'],
  [/^lucide-react$/, 'module.exports=new Proxy({},{get:(_,key)=>String(key)})'],
  [/\/contexts\/UserContext$/, 'exports.useUser=()=>deps.user'],
  [/\/services\/operationsService$/, 'exports.recordOperation=(...args)=>deps.record(...args)'],
  [/\/services\/brasilApi$/, 'exports.searchBookByIsbnBrasilApi=(...args)=>deps.brasil(...args)'],
  [/\/services\/distribuidoraCuritiba$/, 'exports.searchBookByIsbnDistribuidoraCuritiba=(...args)=>deps.curitiba(...args);exports.mergeBookWithDistribuidora=(a,b)=>({...a,...b})'],
  [/\/services\/magazordMockService$/, 'exports.magazordMockService=deps.magazord'],
  [/\/utils\/draft$/, 'exports.createRegistrationDraft=(book)=>({...book,condition:"novo"});exports.buildFinalDescription=()=>"description"'],
  [/\/utils\/metrics$/, 'exports.CANONICAL_CSV_DATASET=[]'],
];
async function component(entry) {
  // Preserve each component name so assertions can find the public event props.
  const mocks = [...componentMocks];
  const paths = ['Header', 'SearchForm', 'BookDetailsCard', 'SearchHistoryGroup', 'CameraScannerModal', 'MagazordStatusCard', 'ProductRegistrationForm', 'ProductionView', 'SettingsView',
    'ProductIdentitySection', 'CategoryAndBrandSection', 'CommercialSection', 'BibliographicSection', 'PhysicalAttributesSection', 'ImagesSection', 'SynopsisSection', 'AdvancedFiscalSection'];
  for (const name of paths) mocks.push([new RegExp(`(?:^|/)${name}$`), `module.exports=${JSON.stringify(name)}`]);
  return compile(entry, mocks);
}
const app = await component('src/App.tsx');
const form = await component('src/components/magazord/ProductRegistrationForm.tsx');
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

function mount(factory, deps, props) {
  let slots = [], cursor = 0, effects = [], scheduled = false, tree;
  globalThis.localStorage = { getItem: () => '[]', setItem() {}, removeItem() {} };
  globalThis.document = { querySelector: () => null };
  deps.react = {
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], next => {
      const previous = slots[i];
      // Simulate StrictMode replay of state updaters to catch misplaced INSERTs.
      if (typeof next === 'function') next(previous);
      const value = typeof next === 'function' ? next(previous) : next;
      if (Object.is(value, previous)) return;
      slots[i] = value;
      if (!scheduled) { scheduled = true; queueMicrotask(() => { scheduled = false; render(); }); }
    }]; },
    useEffect(effect, dependencies) { const i = cursor++; if (!slots[i] || dependencies.some((v, j) => !Object.is(v, slots[i][j]))) { slots[i] = dependencies; effects.push(effect); } },
  };
  const api = factory(deps);
  function render() { cursor = 0; effects = []; tree = api.default(props); effects.forEach(effect => effect()); }
  function find(predicate, node = tree) {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) { for (const child of node) { const result = find(predicate, child ?? null); if (result) return result; } return null; }
    return predicate(node) ? node : find(predicate, node.props?.children ?? null);
  }
  render();
  return { render, find, tree: () => tree };
}

function dependencies(overrides = {}) {
  const records = [];
  const book = { title: 'Livro', isbn13: input.isbn, authors: [] };
  return { records, user: { currentUser: { id: actor, storeId, active: true, name: 'Operador', role: 'operator' }, operationEnvironment: 'production' },
    record: async (row, expectedActor) => { assert.equal(expectedActor, actor); records.push(row); return true; },
    brasil: async () => ({ book, diagnostic: { status: 200 } }),
    curitiba: async () => ({ book: null, diagnostic: { status: 'FALHA_CONEXAO' } }),
    magazord: { checkProductByEan: async () => ({ matches: [] }), addStockToExistingProduct: async () => ({ success: true, newStock: 5 }), createProduct: async () => ({ success: true, parentCode: 'P', childCode: 'C', registeredAt: Date.now() }) },
    ...overrides };
}
async function search(view) { await view.find(n => n.type === 'SearchForm').props.onSearch(input.isbn); await flush(); }

test('Multiple bibliographic sources, including enrichment failure, produce one successful search; rerender/reload do not replay', async () => {
  const deps = dependencies(); const view = mount(app, deps); await search(view);
  assert.equal(deps.records.length, 1); assert.equal(deps.records[0].operationType, 'isbn_search');
  assert.equal(deps.records[0].status, 'success'); assert.equal(deps.records[0].metadata.resultFound, true);
  view.render(); await flush(); mount(app, deps); await flush(); assert.equal(deps.records.length, 1);
});

test('Normal no-result lookup is success; fatal source failure is operation_error', async () => {
  for (const status of [404, 500, 'FALHA_CONEXAO']) {
    const deps = dependencies({ brasil: async () => ({ book: null, diagnostic: { status } }) });
    const view = mount(app, deps); await search(view);
    assert.equal(deps.records.length, 1); assert.equal(deps.records[0].operationType, status === 404 ? 'isbn_search' : 'operation_error');
    assert.equal(deps.records[0].metadata.resultFound, false);
  }
});

test('Concurrent clicks result in one search', async () => {
  let resolve; const deps = dependencies({ brasil: () => new Promise(r => { resolve = r; }) });
  const view = mount(app, deps); const handler = view.find(n => n.type === 'SearchForm').props.onSearch;
  const first = handler(input.isbn); await handler(input.isbn);
  resolve({ book: { title: 'Livro' }, diagnostic: { status: 200 } }); await first; await flush();
  assert.equal(deps.records.length, 1);
});

test('New and used registration record only final completion, using the correct condition/type/registrationMode', async () => {
  for (const [condition, type, databaseCondition, registrationMode] of [['novo', 'new_product_created', 'new', 'new_product'], ['usado', 'used_copy_created', 'used', 'used_copy']]) {
    const deps = dependencies(); const view = mount(app, deps); await search(view);
    view.find(n => n.type === 'Header').props.onTabChange('cadastro'); await flush();
    const props = view.find(n => n.type === 'ProductRegistrationForm').props;
    assert.equal(deps.records.length, 1);
    props.onSuccessRegistration({ success: true, parentCode: 'P', childCode: 'C', registeredAt: Date.now() }, { ...props.draft, condition, quantity: 2 });
    assert.equal(deps.records.length, 2); assert.equal(deps.records[1].operationType, type); assert.equal(deps.records[1].condition, databaseCondition);
    assert.equal(deps.records[1].metadata.quantity, 2);
    assert.equal(deps.records[1].metadata.registrationMode, registrationMode);
  }
});

test('Stock confirmation records exactly one new_product_reused', async () => {
  const deps = dependencies(); const view = mount(app, deps); await search(view);
  await view.find(n => n.type === 'MagazordStatusCard').props.onLinkStock(2, { parentCode: 'P', childCode: 'C' });
  assert.equal(deps.records.length, 2); assert.equal(deps.records[1].operationType, 'new_product_reused');
  assert.equal(deps.records[1].parentCode, 'P'); assert.equal(deps.records[1].metadata.quantity, 2);
});

test('Concurrent stock confirmations cannot produce a second operation', async () => {
  let resolve, calls = 0;
  const deps = dependencies();
  deps.magazord.addStockToExistingProduct = () => { calls++; return new Promise(r => { resolve = r; }); };
  const view = mount(app, deps); await search(view);
  const handler = view.find(n => n.type === 'MagazordStatusCard').props.onLinkStock;
  const first = handler(1); await assert.rejects(handler(1));
  resolve({ success: true, newStock: 4 }); await first; await flush();
  assert.equal(calls, 1); assert.equal(deps.records.length, 2);
});

test('All roles leave actor and environment out of operation data', async () => {
  for (const role of ['admin', 'operator', 'developer']) {
    const deps = dependencies(); deps.user.currentUser.role = role;
    deps.user.operationEnvironment = role === 'developer' ? 'development' : 'production';
    const view = mount(app, deps); await search(view);
    const row = deps.records[0];
    assert.equal(row.storeId, storeId);
    for (const key of ['user_id', 'userId', 'environment', 'operationEnvironment', 'role']) assert.ok(!(key in row));
  }
});

test('Fatal stock and registration errors record safe operation_error messages', async () => {
  const deps = dependencies(); deps.magazord.addStockToExistingProduct = async () => { throw new Error('private token'); };
  const view = mount(app, deps); await search(view);
  await assert.rejects(view.find(n => n.type === 'MagazordStatusCard').props.onLinkStock(1));
  assert.equal(deps.records[1].operationType, 'operation_error'); assert.ok(!deps.records[1].errorMessage.includes('private'));
  view.find(n => n.type === 'Header').props.onTabChange('cadastro'); await flush();
  const props = view.find(n => n.type === 'ProductRegistrationForm').props; props.onRegistrationError(props.draft);
  assert.equal(deps.records[2].operationType, 'operation_error');
});

test('INSERT failure displays a nondestructive warning without another record attempt', async () => {
  let calls = 0; const deps = dependencies({ record: async () => { calls++; return false; } });
  const view = mount(app, deps); await search(view);
  assert.equal(calls, 1); assert.ok(view.find(n => n.type === 'MagazordStatusCard'));
  assert.match(JSON.stringify(view.tree()), /histórico local foram preservados/);
});

test('Registration submission guard prevents duplicate service calls and completion callbacks', async () => {
  let resolve, calls = 0, completions = 0;
  const deps = dependencies(); deps.magazord.createProduct = () => { calls++; return new Promise(r => { resolve = r; }); };
  const view = mount(form, deps, { draft: { condition: 'novo', parentCode: 'P', childCode: 'C', title: 'Livro', category: 'Livro', price: '10', quantity: 1 },
    originalBook: { title: 'Livro' }, onSuccessRegistration: () => { completions++; }, onUpdateDraft() {}, onBackToSearch() {}, onProcessNextBook() {} });
  const handler = view.find(n => n.props?.id === 'btn-submit-magazord-registration').props.onClick;
  const first = handler(); await handler(); assert.equal(calls, 1);
  resolve({ success: true, parentCode: 'P', childCode: 'C', registeredAt: Date.now() }); await first; await handler();
  assert.equal(completions, 1); assert.equal(calls, 1);
});
