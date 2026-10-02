import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function compile(entry, component = false) {
  const mocks = [[/\/lib\/supabase$/, 'exports.supabase=deps.supabase']];
  if (component) mocks.push(
    [/^react$/, 'module.exports=deps.react'],
    [/^react\/jsx-runtime$/, 'exports.jsx=exports.jsxs=(type,props)=>({type,props})'],
    [/^lucide-react$/, 'module.exports=new Proxy({},{get:(_,key)=>String(key)})'],
    [/\/contexts\/UserContext$/, 'exports.useUser=()=>deps.user'],
  );
  const output = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    plugins: [{ name: 'mock-sdk', setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        const mock = mocks.find(([pattern]) => pattern.test(args.path));
        return mock ? { path: args.path, namespace: 'mock', pluginData: mock[1] } : undefined;
      });
      builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: args.pluginData, loader: 'js' }));
    } }],
  });
  return deps => {
    const module = { exports: {} };
    new Function('deps', 'module', 'exports', output.outputFiles[0].text)(deps, module, module.exports);
    return module.exports;
  };
}

const service = await compile('src/services/productionService.ts');
const metrics = (await compile('src/utils/metrics.ts'))({});
const component = await compile('src/components/ProductionView.tsx', true);
const storeId = '11111111-2222-3333-4444-555555555555';
const otherStore = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const userId = '22222222-3333-4444-5555-666666666666';
const row = (type = 'isbn_search', overrides = {}) => ({
  id: 'row', store_id: storeId, user_id: userId, environment: 'production', operation_type: type,
  condition: type === 'used_copy_created' ? 'used' : 'new', status: 'success', metadata: {},
  isbn: '9788535914849', title: 'Livro', parent_code: null, child_code: null,
  created_at: '2026-01-01T12:00:00.000Z', completed_at: '2026-01-02T12:00:00.000Z', ...overrides,
});

function sdk(rows, { cap = 500, errorPage = -1, profileError = false, profiles = [], defer = false, leak = false } = {}) {
  const calls = [], releases = [];
  return { calls, releases, supabase: { from(table) {
    const call = { table, filters: [], ors: [], orders: [] }; calls.push(call);
    const query = {
      select(fields, options) { call.fields = fields; call.options = options; return query; },
      eq(field, value) { call.filters.push([field, value]); return query; },
      or(filter) { call.ors.push(filter); return query; },
      order(field, options) { call.orders.push([field, options]); return query; },
      range(start, end) { call.range = [start, end]; return query; },
      in(field, values) { call.ids = values; return query; },
      abortSignal(signal) { call.signal = signal; return query; },
      then(resolve, reject) {
        const respond = () => {
          if (table === 'profiles') return { data: profiles.filter(p => call.ids.includes(p.id)), error: profileError ? { message: 'private profile' } : null };
          if (calls.filter(c => c.table === 'operations').indexOf(call) === errorPage) return { data: null, count: null, error: { message: 'private token database' } };
          let filtered = rows.filter(r => leak || call.filters.every(([field, value]) => r[field] === value));
          for (const filter of call.ors) {
            const match = filter.match(/^completed_at\.(gte|lte)\.([^,]+)/);
            assert.ok(match, filter);
            filtered = filtered.filter(r => match[1] === 'gte' ? (r.completed_at ?? r.created_at) >= match[2] : (r.completed_at ?? r.created_at) <= match[2]);
          }
          filtered.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
          const [start, end] = call.range;
          return { data: filtered.slice(start, Math.min(end + 1, start + cap)), count: filtered.length, error: null };
        };
        const promise = defer && table === 'operations' ? new Promise(r => releases.push(() => r(respond()))) : Promise.resolve(respond());
        return promise.then(resolve, reject);
      },
    };
    return query;
  } } };
}

test('SELECT isolates store and admin/production or developer/development', async () => {
  for (const environment of ['production', 'development']) {
    const fake = sdk([row(), row('used_copy_created', { id: 'dev', environment: 'development' }), row('isbn_search', { id: 'other', store_id: otherStore })]);
    const data = await service(fake).loadProduction(storeId, environment, 'all');
    assert.equal(data.operations.length, 1);
    assert.ok(data.operations.every(r => r.store_id === storeId && r.environment === environment));
    assert.deepEqual(fake.calls[0].filters, [['store_id', storeId], ['environment', environment]]);
    assert.equal(fake.calls[0].options.count, 'exact');
    assert.deepEqual(fake.calls[0].orders.map(([field]) => field), ['created_at', 'id']);
  }
});

test('Defensive isolation excludes unexpected rows from another store/environment', async () => {
  const fake = sdk([row(), row('isbn_search', { store_id: otherStore }), row('isbn_search', { environment: 'development' })], { leak: true });
  assert.equal((await service(fake).loadProduction(storeId, 'production', 'all')).operations.length, 1);
});

test('Pagination retains more than 1000 operations even with a smaller server cap', async () => {
  const fake = sdk(Array.from({ length: 1207 }, (_, i) => row('new_product_created', { id: String(i).padStart(5, '0') })), { cap: 137 });
  const data = await service(fake).loadProduction(storeId, 'production', 'all');
  assert.equal(data.operations.length, 1207);
  assert.equal(metrics.calculateProductionMetrics(data.operations).totalProcessed, 1207);
  assert.equal(new Set(data.operations.map(r => r.id)).size, 1207);
  assert.deepEqual(fake.calls.filter(c => c.table === 'operations').map(c => c.range[0]), [0, 137, 274, 411, 548, 685, 822, 959, 1096]);
});

test('Period SELECT uses completed_at first and created_at only when completion is null', async () => {
  const now = new Date(), recent = new Date(now.getTime() - 60000).toISOString();
  const fake = sdk([row('isbn_search', { id: 'completed', completed_at: recent }), row('isbn_search', { id: 'fallback', completed_at: null, created_at: recent }), row('isbn_search', { id: 'old', created_at: recent }), row('isbn_search', { id: 'future', completed_at: '2999-01-01T00:00:00.000Z' })]);
  const data = await service(fake).loadProduction(storeId, 'production', '7days');
  assert.deepEqual(new Set(data.operations.map(r => r.id)), new Set(['completed', 'fallback']));
  assert.equal(fake.calls[0].ors.length, 2);
  for (const filter of fake.calls[0].ors) assert.match(filter, /and\(completed_at.is.null,created_at\./);
  const api = service(fake), fixed = new Date('2026-10-02T12:00:00Z');
  assert.equal(api.productionPeriodBounds('all', fixed).start, null);
  assert.equal(api.productionPeriodBounds('30days', fixed).start, '2026-09-02T12:00:00.000Z');
  assert.equal(new Date(api.productionPeriodBounds('today', fixed).start).getHours(), 0);
});

test('Structured fields classify Novo, reused Novo and old Usado despite incorrect registrationMode', () => {
  const result = metrics.calculateProductionMetrics([
    row('new_product_created', { metadata: { quantity: 5 } }),
    row('new_product_reused', { metadata: { quantity: 3 } }),
    row('used_copy_created', { metadata: { quantity: 1, registrationMode: 'new_product' } }),
    row('isbn_search', { metadata: { quantity: 100 } }),
    row('operation_error', { status: 'error', metadata: { flow: 'isbn_search', quantity: 100 } }),
  ]);
  assert.deepEqual(result, { searches: 1, totalProcessed: 3, newCreated: 1, newReused: 1, usedCreated: 1, errors: 1, units: 9 });
});

test('Invalid commercial quantities default to one; errors, pending and inconsistent fields do not inflate production', () => {
  for (const quantity of [undefined, null, '5', 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(metrics.productionUnits(row('new_product_created', { metadata: { quantity } })), 1);
  }
  const result = metrics.calculateProductionMetrics([
    row('new_product_created', { status: 'error' }), row('used_copy_created', { status: 'pending' }),
    row('new_product_created', { condition: 'used' }), row('isbn_search', { status: 'error' }),
  ]);
  assert.equal(result.totalProcessed, 0); assert.equal(result.units, 0); assert.equal(result.searches, 0); assert.equal(result.errors, 2);
});

test('Profiles resolve real UUIDs and unavailable names remain unresolved safely', async () => {
  for (const profileError of [false, true]) {
    const fake = sdk([row()], { profileError, profiles: [{ id: userId, display_name: ' Pessoa real ' }] });
    const data = await service(fake).loadProduction(storeId, 'production', 'all');
    assert.deepEqual(data.names, profileError ? {} : { [userId]: 'Pessoa real' });
    assert.deepEqual(fake.calls.find(c => c.table === 'profiles').ids, [userId]);
  }
});

test('Read errors discard partial pages and invalid contexts never query', async () => {
  const fake = sdk(Array.from({ length: 501 }, () => row()), { errorPage: 1 });
  await assert.rejects(service(fake).loadProduction(storeId, 'production', 'all'), /Não foi possível carregar/);
  const invalid = sdk([]);
  await assert.rejects(service(invalid).loadProduction('', 'production', 'all'));
  assert.equal(invalid.calls.length, 0);
});

const flush = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); };

function mount(fake, role = 'admin') {
  const deps = { ...fake, user: { currentUser: { id: userId, storeId, role, name: 'Conta atual' }, isAdmin: role === 'admin', isDeveloper: role === 'developer', operationEnvironment: role === 'developer' ? 'development' : 'production' } };
  let cursor = 0, slots = [], effects = [], tree, scheduled = false;
  globalThis.localStorage = { getItem() { throw new Error('Production must not read localStorage'); } };
  deps.react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], next => {
      const value = typeof next === 'function' ? next(slots[i]) : next;
      if (Object.is(value, slots[i])) return;
      slots[i] = value;
      if (!scheduled) { scheduled = true; queueMicrotask(() => { scheduled = false; render(); }); }
    }]; },
    useMemo(factory, dependencies) { const i = cursor++; if (!slots[i] || dependencies.some((v, j) => !Object.is(v, slots[i].deps[j]))) slots[i] = { deps: dependencies, value: factory() }; return slots[i].value; },
    useEffect(effect, dependencies) { const i = cursor++; if (!slots[i] || dependencies.some((v, j) => !Object.is(v, slots[i].deps[j]))) {
      slots[i]?.cleanup?.(); slots[i] = { deps: dependencies }; effects.push(() => { slots[i].cleanup = effect(); });
    } },
  };
  const api = component(deps);
  function render() { cursor = 0; effects = []; tree = api.default(); effects.forEach(effect => effect()); }
  function nodes(node = tree) { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(child => nodes(child ?? null)); return [node, ...nodes(node.props?.children ?? null)]; }
  function text(node = tree) { if (node == null || typeof node === 'boolean') return ''; if (typeof node !== 'object') return String(node); if (Array.isArray(node)) return node.map(child => text(child ?? null)).join(' '); return text(node.props?.children ?? null); }
  render();
  return { render, nodes, text, deps, unmount() { for (const slot of slots) slot?.cleanup?.(); } };
}

test('ProductionView loads Supabase without localStorage and rerenders/user filters do not refetch', async () => {
  const fake = sdk([row('new_product_created', { metadata: { quantity: 5 } })], { profiles: [{ id: userId, display_name: 'Pessoa real' }] });
  const view = mount(fake);
  assert.ok(view.nodes().some(n => n.props?.role === 'status'));
  await flush();
  assert.match(view.text(), /5\s+unidades movimentadas/);
  assert.match(view.text(), /Pessoa real/);
  const count = fake.calls.length;
  view.render(); view.render(); await flush();
  const select = view.nodes().find(n => n.type === 'select');
  select.props.onChange({ target: { value: userId } }); await flush();
  assert.equal(fake.calls.length, count);
  assert.equal(view.nodes().find(n => n.type === 'select').props.value, userId);
  view.unmount();
});

test('ProductionView developer only displays development and UUID fallback', async () => {
  const fake = sdk([row('new_product_created'), row('used_copy_created', { environment: 'development', metadata: { quantity: 7 } })], { profileError: true });
  const view = mount(fake, 'developer'); await flush();
  assert.match(view.text(), /7\s+unidades movimentadas/); assert.match(view.text(), new RegExp(userId));
  assert.doesNotMatch(view.text(), /Conta atual/);
  assert.deepEqual(fake.calls[0].filters, [['store_id', storeId], ['environment', 'development']]);
  view.unmount();
});

test('ProductionView read failure shows safe error without local metrics or partial success', async () => {
  const fake = sdk([row('new_product_created')], { errorPage: 0 });
  const view = mount(fake); await flush();
  assert.ok(view.nodes().some(n => n.props?.role === 'alert'));
  assert.match(view.text(), /Não foi possível carregar/);
  assert.doesNotMatch(view.text(), /private|token|Produtos Processados|unidades movimentadas/);
  view.unmount();
});

test('ProductionView empty period and period changes issue one new read', async () => {
  const fake = sdk([]), view = mount(fake); await flush();
  assert.match(view.text(), /Nenhuma operação/);
  view.nodes().find(n => n.type === 'button' && n.props.children === 'Hoje').props.onClick(); await flush();
  assert.equal(fake.calls.filter(c => c.table === 'operations').length, 2);
  assert.equal(fake.calls[1].ors.length, 2);
  view.unmount();
});

test('Late requests cannot replace a newer period or reveal previous-account data', async () => {
  const fake = sdk([row('new_product_created')], { defer: true }), view = mount(fake);
  await flush();
  view.nodes().find(n => n.type === 'button' && n.props.children === 'Hoje').props.onClick(); await flush();
  assert.ok(fake.calls[0].signal.aborted);
  fake.releases[1](); await flush();
  assert.match(view.text(), /Nenhuma operação/);
  fake.releases[0](); await flush();
  assert.match(view.text(), /Nenhuma operação/);
  view.deps.user.currentUser = { ...view.deps.user.currentUser, storeId: otherStore };
  view.render(); assert.doesNotMatch(view.text(), /Produtos Processados/);
  await flush(); fake.releases[2](); await flush();
  assert.match(view.text(), /Nenhuma operação/);
  view.unmount();
});

test('Legacy CSV metrics stay unchanged', () => {
  assert.deepEqual(metrics.calculateMetrics(metrics.CANONICAL_CSV_DATASET), { searches: 2, totalProcessed: 5, newCreated: 2, newReused: 0, usedCreated: 3, errors: 0 });
});

test('Real UUID grouping and user filter keep equal display names separate', async () => {
  const secondUser = '33333333-4444-5555-6666-777777777777';
  const fake = sdk([
    row('new_product_created', { metadata: { quantity: 2 } }),
    row('used_copy_created', { user_id: secondUser, metadata: { quantity: 3 } }),
    row('isbn_search', { user_id: null }),
  ], { profiles: [{ id: userId, display_name: 'Mesmo nome' }, { id: secondUser, display_name: 'Mesmo nome' }] });
  const view = mount(fake); await flush();
  assert.match(view.text(), /5\s+unidades movimentadas/);
  const options = view.nodes().filter(n => n.type === 'option').map(n => n.props.value);
  assert.deepEqual(options, ['all', userId, secondUser]);
  view.nodes().find(n => n.type === 'select').props.onChange({ target: { value: userId } }); await flush();
  assert.match(view.text(), /2\s+unidades movimentadas/);
  assert.doesNotMatch(view.text(), /5\s+unidades movimentadas/);
  assert.equal(fake.calls.filter(c => c.table === 'operations').length, 1);
  view.unmount();
});
