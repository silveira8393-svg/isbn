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
  [/\/utils\/draft$/, 'exports.createRegistrationDraft=(book,condition="novo")=>({...book,condition});exports.buildFinalDescription=()=>"description";exports.registrationModeForCondition=(condition,mode)=>condition==="usado"?"new_used_from_known_edition":mode==="reuse_existing_new"?mode:"new_product"'],
  [/\/utils\/metrics$/, 'exports.CANONICAL_CSV_DATASET=[]'],
];
async function component(entry) {
  // Preserve each component name so assertions can find the public event props.
  const mocks = [...componentMocks];
  const paths = ['Header', 'SearchForm', 'BookDetailsCard', 'SearchHistoryGroup', 'CameraScannerModal', 'MagazordStatusCard', 'ProductRegistrationForm', 'OwnerDashboard', 'SettingsView',
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
    magazord: { getSimulationConfig: () => ({ mode: 'auto' }), checkProductByEan: async () => ({ matches: [] }), addStockToExistingProduct: async () => ({ success: true, newStock: 5 }), createProduct: async () => ({ success: true, parentCode: 'P', childCode: 'C', registeredAt: Date.now() }) },
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

test('Lost INSERT response can be retried with the same UUID and confirmed under RLS without UPDATE', async () => {
  const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  let committed, attempts = 0;
  const fake = { supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: actor } } } }) },
    from(table) {
      assert.equal(table, 'operations');
      const query = { async insert(payload) {
        attempts++;
        if (!committed) { committed = { ...payload, user_id: actor }; throw new Error('lost response'); }
        assert.equal(payload.id, committed.id);
        return { error: { code: '23505' } };
      }, select() { return query; }, eq() { return query; }, async maybeSingle() { return { data: committed, error: null }; } };
      return query;
    },
  } };
  const api = service(fake);
  assert.equal(await api.recordOperation({ ...input, id }, actor), false);
  assert.equal(await api.recordOperation({ ...input, id }, actor), true);
  assert.equal(attempts, 2);
  committed.title = 'different event';
  assert.equal(await api.recordOperation({ ...input, id }, actor), false);
  committed.title = null; committed.user_id = 'another actor';
  assert.equal(await api.recordOperation({ ...input, id }, actor), false);
});

test('Pending audit warns and retries the identical event without repeating the ISBN search', async () => {
  let calls = 0, searches = 0;
  const deps = dependencies({ record: async row => { deps.records.push(row); return ++calls > 1; },
    brasil: async () => { searches++; return { book: { title: 'Livro' }, diagnostic: { status: 200 } }; } });
  const view = mount(app, deps); await search(view);
  const initial = structuredClone(deps.records[0]);
  assert.match(initial.id, /^[a-f0-9-]{36}$/);
  assert.equal(initial.metadata.purpose, 'operational_test');
  assert.equal(initial.metadata.operational_test_run_id, 'isbn-operational-20261014-01');
  assert.ok(view.find(n => n.props?.role === 'alert'));
  const retry = view.find(n => n.type === 'button' && n.props.children === 'Reenviar auditoria pendente').props.onClick;
  retry(); retry(); await flush();
  assert.equal(calls, 2); assert.equal(searches, 1);
  assert.deepEqual(deps.records[1], initial);
  assert.equal(view.find(n => n.props?.role === 'alert'), null);
});

test('Outbox survives a reload in the same tab and isolates a different signed-in actor', async t => {
  const previous = globalThis.sessionStorage; const storage = new Map();
  globalThis.sessionStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  t.after(() => { if (previous === undefined) delete globalThis.sessionStorage; else globalThis.sessionStorage = previous; });
  const first = dependencies({ record: async () => false }); const view = mount(app, first); await search(view);
  assert.equal(storage.size, 1); const saved = JSON.parse([...storage.values()][0])[0];
  const other = dependencies(); other.user.currentUser = { ...other.user.currentUser, id: 'different-actor' };
  const otherView = mount(app, other); await flush();
  assert.equal(otherView.find(n => n.props?.role === 'alert'), null); assert.equal(other.records.length, 0);
  const restored = dependencies(); const reload = mount(app, restored); await flush();
  assert.match(JSON.stringify(reload.tree()), /sem confirmação de registro/); assert.equal(restored.records.length, 0);
  reload.find(n => n.type === 'button' && n.props.children === 'Reenviar auditoria pendente').props.onClick(); await flush();
  assert.deepEqual(restored.records[0], saved.input); assert.equal(storage.size, 0);
});

test('Outbox storage failure is visible and audit can still succeed without stopping the workflow', async t => {
  const previous = globalThis.sessionStorage;
  globalThis.sessionStorage = { getItem() { return null; }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('blocked'); } };
  t.after(() => { if (previous === undefined) delete globalThis.sessionStorage; else globalThis.sessionStorage = previous; });
  const deps = dependencies({ record: async () => false }); const view = mount(app, deps); await search(view);
  assert.match(JSON.stringify(view.tree()), /Não foi possível preservar a fila/);
  assert.ok(view.find(n => n.type === 'MagazordStatusCard'));
});

test('Catalog check and post-registration check failures produce separate sanitized evidence', async () => {
  const deps = dependencies(); deps.magazord.checkProductByEan = async () => { throw new Error('secret access token'); };
  const view = mount(app, deps); await search(view);
  assert.equal(deps.records[1].metadata.flow, 'magazord_check');
  view.find(n => n.type === 'Header').props.onTabChange('cadastro'); await flush();
  const props = view.find(n => n.type === 'ProductRegistrationForm').props;
  props.onSuccessRegistration({ success: true, registeredAt: Date.now(), parentCode: 'P', childCode: 'C' }, { ...props.draft, condition: 'novo', quantity: 1 }); await flush();
  assert.deepEqual(deps.records.map(row => row.operationType), ['isbn_search', 'operation_error', 'new_product_created', 'operation_error']);
  assert.equal(deps.records.at(-1).metadata.flow, 'magazord_post_registration_check');
  assert.ok(deps.records.every(row => !String(row.errorMessage).includes('secret')));
});

test('Completed registrations persist the final versioned snapshot; searches, errors and stock reuse do not', async () => {
  const deps = dependencies(); const view = mount(app, deps); await search(view);
  await view.find(n => n.type === 'MagazordStatusCard').props.onLinkStock(2);
  view.find(n => n.type === 'Header').props.onTabChange('cadastro'); await flush();
  const props = view.find(n => n.type === 'ProductRegistrationForm').props;
  const finalDraft = { ...props.draft, condition: 'usado', title: 'Título final editado', authors: ['Autor final'], quantity: 1,
    parentCode: 'UP', childCode: 'UC', price: '18,00', usedBookConditionNotes: 'Marcas na capa', synopsis: 'Sinopse final', description: 'Descrição final' };
  props.onSuccessRegistration({ success: true, registeredAt: Date.now(), parentCode: 'UP', childCode: 'UC' }, finalDraft); await flush();
  const snapshot = deps.records.at(-1).metadata.registrationSnapshot;
  assert.equal(snapshot.version, 1); assert.equal(snapshot.fields.title, 'Título final editado');
  assert.equal(snapshot.fields.usedBookConditionNotes, 'Marcas na capa'); assert.equal(snapshot.fields.price, '18,00');
  finalDraft.authors.push('later'); assert.deepEqual(snapshot.fields.authors, ['Autor final']);
  assert.ok(deps.records.slice(0, 2).every(row => !row.metadata.registrationSnapshot));
});

test('Denied duplicate-confirmation read remains visibly pending instead of accepting an unverified conflict', async () => {
  const fake = { supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: actor } } } }) },
    from() { const query = { insert: async () => ({ error: { code: '23505' } }), select() { return query; }, eq() { return query; },
      maybeSingle: async () => ({ data: null, error: { code: '42501' } }) }; return query; } } };
  assert.equal(await service(fake).recordOperation({ ...input, id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' }, actor), false);
});

test('Browser storage access denial does not throw out of the operational flow', async t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get() { throw new Error('storage security policy'); } });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, 'sessionStorage', descriptor); else delete globalThis.sessionStorage; });
  const deps = dependencies(); const view = mount(app, deps); await search(view);
  assert.equal(deps.records.length, 1); assert.ok(view.find(n => n.type === 'MagazordStatusCard'));
  assert.match(JSON.stringify(view.tree()), /Não foi possível preservar a fila/);
});

test('A negative registration result cannot show success or call the completed-registration snapshot handler', async () => {
  let completions = 0, errors = 0;
  const deps = dependencies(); deps.magazord.createProduct = async () => ({ success: false });
  const view = mount(form, deps, { draft: { condition: 'usado', parentCode: 'P', childCode: 'C', title: 'Livro', category: 'Livro', price: '10', quantity: 1 },
    originalBook: { title: 'Livro' }, onSuccessRegistration: () => completions++, onRegistrationError: () => errors++,
    onUpdateDraft() {}, onBackToSearch() {}, onProcessNextBook() {} });
  await view.find(n => n.props?.id === 'btn-submit-magazord-registration').props.onClick(); await flush();
  assert.equal(completions, 0); assert.equal(errors, 1);
  assert.equal(view.find(n => n.props?.id === 'btn-process-next-book'), null);
});
