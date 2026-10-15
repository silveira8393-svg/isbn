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
const dashboard = (await compile('src/utils/dashboard.ts'))({});
const component = await compile('src/components/ProductionView.tsx', true);
const charts = await compile('src/components/dashboard/DashboardCharts.tsx', true);
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
            if (filter.startsWith('environment.eq.production,')) {
              filtered = filtered.filter(r => r.environment === 'production' || (r.environment === 'development'
                && r.metadata?.demo_batch_id === 'isbn-demo-20261014-realapp-01' && r.metadata?.demo === true && r.metadata?.mock === true));
              continue;
            }
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

function mount(fake, role = 'admin', factory = component, props) {
  const deps = { ...fake, user: { currentUser: { id: userId, storeId, role, active: true, name: 'Conta atual' }, canViewProduction: role === 'admin' || role === 'developer', isAdmin: role === 'admin', isDeveloper: role === 'developer', operationEnvironment: role === 'developer' ? 'development' : 'production' } };
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
  const api = factory(deps);
  function render() { cursor = 0; effects = []; tree = api.default(props); effects.forEach(effect => effect()); }
  function nodes(node = tree) { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(child => nodes(child ?? null)); return [node, ...nodes(node.props?.children ?? null)]; }
  function text(node = tree) { if (node == null || typeof node === 'boolean') return ''; if (typeof node !== 'object') return String(node); if (Array.isArray(node)) return node.map(child => text(child ?? null)).join(' '); return text(node.props?.children ?? null); }
  render();
  return { render, nodes, text, deps, unmount() { for (const slot of slots) slot?.cleanup?.(); } };
}

async function selectTab(view, label) {
  const tab = view.nodes().find(node => node.props?.role === 'tab' && node.props.children === label);
  assert.ok(tab, label);
  tab.props.onClick();
  await flush();
}

test('ProductionView loads Supabase without localStorage and rerenders/user filters do not refetch', async () => {
  const fake = sdk([row('new_product_created', { metadata: { quantity: 5 } })], { profiles: [{ id: userId, display_name: 'Pessoa real' }] });
  const view = mount(fake);
  assert.ok(view.nodes().some(n => n.props?.role === 'status'));
  await flush();
  assert.match(view.text(), /5\s+unidades informadas/);
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
  assert.match(view.text(), /7\s+unidades informadas/); assert.match(view.text(), new RegExp(userId));
  assert.doesNotMatch(view.text(), /Conta atual/);
  assert.deepEqual(fake.calls[0].filters, [['store_id', storeId], ['environment', 'development']]);
  view.unmount();
});

test('ProductionView read failure shows safe error without local metrics or partial success', async () => {
  const fake = sdk([row('new_product_created')], { errorPage: 0 });
  const view = mount(fake); await flush();
  assert.ok(view.nodes().some(n => n.props?.role === 'alert'));
  assert.match(view.text(), /Não foi possível carregar/);
  assert.doesNotMatch(view.text(), /private|token|Total de ações processadas|unidades informadas/);
  view.unmount();
});

test('ProductionView empty period and period changes issue one new read', async () => {
  const fake = sdk([]), view = mount(fake); await flush();
  assert.match(view.text(), /Nenhuma operação/);
  view.nodes().find(n => n.type === 'button' && n.props.children === 'Hoje').props.onClick(); await flush();
  assert.equal(fake.calls.filter(c => c.table === 'operations').length, 2);
  assert.equal(fake.calls[1].ors.length, 3);
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
  view.render(); assert.doesNotMatch(view.text(), /Total de ações processadas/);
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
  assert.match(view.text(), /5\s+unidades informadas/);
  const options = view.nodes(view.nodes().find(n => n.props?.id === 'select-operator-filter')).filter(n => n.type === 'option').map(n => n.props.value);
  assert.deepEqual(options, ['all', userId, secondUser]);
  view.nodes().find(n => n.type === 'select').props.onChange({ target: { value: userId } }); await flush();
  assert.match(view.text(), /2\s+unidades informadas/);
  assert.doesNotMatch(view.text(), /5\s+unidades informadas/);
  assert.equal(fake.calls.filter(c => c.table === 'operations').length, 1);
  view.unmount();
});

test('Dashboard origin classification is strict and partitions every existing metric without loss', () => {
  const rows = [
    row('new_product_created', { metadata: { mock: true, quantity: 4 } }),
    row('new_product_reused', { metadata: { mock: false, quantity: 2 } }),
    row('used_copy_created', { metadata: {} }),
    row('isbn_search', { metadata: null }),
    row('operation_error', { status: 'error', metadata: { mock: 'false' } }),
    row('new_product_created', { status: 'pending', metadata: { mock: true } }),
  ];
  assert.deepEqual(rows.map(dashboard.classifyOperationOrigin), ['simulated', 'declared', 'unknown', 'unknown', 'unknown', 'simulated']);
  for (const mock of [undefined, null, 'true', 'false', 0, 1]) {
    assert.equal(dashboard.classifyOperationOrigin(row('isbn_search', { metadata: { mock } })), 'unknown');
  }
  const groups = dashboard.metricsByOrigin(rows);
  assert.deepEqual(groups.map(group => group.records), [2, 1, 3]);
  const total = metrics.calculateProductionMetrics(rows);
  for (const key of Object.keys(total)) assert.equal(groups.reduce((sum, group) => sum + group.metrics[key], 0), total[key], key);
});

test('Daily evolution uses completion precedence, separates origins and never invents empty dates', () => {
  const rows = [
    row('isbn_search', { completed_at: '2026-01-04T12:00:00', metadata: { mock: true } }),
    row('new_product_created', { completed_at: null, created_at: '2026-01-02T12:00:00', metadata: { mock: false } }),
    row('operation_error', { completed_at: '2026-01-04T12:00:00', status: 'error' }),
    row('isbn_search', { completed_at: 'invalid' }),
  ];
  assert.deepEqual(dashboard.dailyOperationCounts(rows), [
    { day: '2026-01-02', total: 1, simulated: 0, declared: 1, unknown: 0 },
    { day: '2026-01-04', total: 2, simulated: 1, declared: 0, unknown: 1 },
  ]);
  assert.equal(dashboard.operationDate(rows[3]), null);
});

test('Direct operator mount refuses queries and renders nothing', async () => {
  const fake = sdk([row()]), view = mount(fake, 'operator');
  await flush();
  assert.equal(view.text(), ''); assert.equal(fake.calls.length, 0);
  view.unmount();
});

test('Revoking dashboard permission hides loaded data and aborts any read immediately', async () => {
  const fake = sdk([row()]), view = mount(fake);
  await flush(); await selectTab(view, 'Registros'); assert.match(view.text(), /Registros operacionais, sem associação/);
  view.deps.user.canViewProduction = false;
  view.deps.user.currentUser = { ...view.deps.user.currentUser, role: 'operator' };
  view.render(); await flush();
  assert.equal(view.text(), ''); assert.ok(fake.calls[0].signal.aborted);
  assert.equal(fake.calls.filter(call => call.table === 'operations').length, 1);
  view.unmount();
});

test('Origin and user filters update cards, daily evolution, productivity and recent activity without refetch', async () => {
  const fake = sdk([
    row('new_product_created', { id: 'sim', title: 'Simulado', metadata: { mock: true, quantity: 4 } }),
    row('used_copy_created', { id: 'decl', title: 'Declarado', completed_at: '2026-01-03T12:00:00Z', metadata: { mock: false } }),
    row('isbn_search', { id: 'unknown', title: 'Desconhecido', metadata: {} }),
  ]), view = mount(fake);
  await flush();
  await selectTab(view, 'Registros');
  assert.match(view.text(), /Simulado|Declarado|Desconhecido/);
  await selectTab(view, 'Visão Geral');
  assert.match(view.text(), /não confirmam publicação, estoque ou venda na Magazord/);
  assert.equal(view.nodes().filter(node => node.props?.['data-metric']).length, 6);
  view.nodes().find(node => node.props?.id === 'select-origin-filter').props.onChange({ target: { value: 'simulated' } });
  await flush();
  assert.match(view.text(), /4\s+unidades informadas/);
  assert.equal(view.nodes().find(node => node.type?.name === 'DailyOperationsChart').props.days.length, 1);
  await selectTab(view, 'Registros');
  assert.match(view.text(), /Simulado/); assert.doesNotMatch(view.text(), /Declarado|Desconhecido/);
  await selectTab(view, 'Operadores');
  assert.equal(view.nodes().filter(node => node.props?.['data-user-id']).length, 1);
  assert.equal(fake.calls.filter(call => call.table === 'operations').length, 1);
  view.unmount();
});

test('Records table shows all twelve completion dates in descending order on its first page', async () => {
  const rows = Array.from({ length: 12 }, (_, index) => row('isbn_search', {
    id: String(index), title: `Atividade ${index}`, completed_at: `2026-01-${String(index + 1).padStart(2, '0')}T12:00:00Z`,
  }));
  const view = mount(sdk(rows)); await flush();
  await selectTab(view, 'Registros');
  const section = view.nodes().find(node => node.type === 'section' && node.props['aria-label'] === 'Atividades recentes');
  const activities = view.nodes(section).filter(node => node.props?.['data-record-id']);
  assert.equal(activities.length, 12);
  assert.match(view.text(activities[0]), /Atividade 11/);
  assert.match(view.text(activities[11]), /Atividade 0/);
  view.unmount();
});

test('Retry performs only the existing read and does not render stale metrics during recovery', async () => {
  const fake = sdk([row()], { errorPage: 0 }), view = mount(fake); await flush();
  view.nodes().find(node => node.type === 'button' && node.props.children === 'Tentar novamente').props.onClick();
  assert.doesNotMatch(view.text(), /unidades informadas/);
  await flush(); assert.match(view.text(), /unidades informadas/);
  await selectTab(view, 'Registros'); assert.match(view.text(), /Registros operacionais, sem associação/);
  assert.equal(fake.calls.filter(call => call.table === 'operations').length, 2);
  view.unmount();
});

test('User-origin grouping retains UUID identity, missing authorship and the original metrics', () => {
  const rows = [row('new_product_created', { metadata: { mock: true, quantity: 3 } }),
    row('new_product_reused', { metadata: { mock: false } }), row('isbn_search', { user_id: null })];
  const groups = dashboard.userOriginMetrics(rows);
  assert.equal(groups.length, 3);
  assert.deepEqual(groups.map(group => [group.userId, group.origin]), [[userId, 'simulated'], [userId, 'declared'], [null, 'unknown']]);
  assert.equal(groups[0].metrics.units, 3); assert.equal(groups[1].metrics.newReused, 1); assert.equal(groups[2].metrics.searches, 1);
});

test('Daily series preserve all records, sparse dates, origins and canonical completion criteria', () => {
  const rows = [row('isbn_search', { metadata: { mock: true } }),
    row('new_product_created', { metadata: { mock: false } }), row('used_copy_created'),
    row('new_product_reused'), row('operation_error', { status: 'success' }),
    row('new_product_created', { status: 'error' }), row('isbn_search', { status: 'pending' }),
    row('new_product_created', { condition: 'used' }),
    row('isbn_search', { completed_at: '2026-01-04T12:00:00', metadata: { mock: false } }),
    row('new_product_created', { completed_at: 'invalid' }),
    row('isbn_search', { completed_at: null, created_at: 'invalid' })];
  const days = dashboard.dailyActivityCounts(rows);
  assert.deepEqual(days.map(day => day.day), ['2026-01-02', '2026-01-04']);
  assert.deepEqual(days.map(day => day.total), [8, 1]);
  assert.deepEqual(dashboard.activitySeries.map(series => days[0][series.key]), [1, 1, 1, 1, 2, 2]);
  for (const day of days) {
    assert.equal(dashboard.activitySeries.reduce((sum, series) => sum + day[series.key], 0), day.total);
    assert.equal(day.simulated + day.declared + day.unknown, day.total);
  }
  assert.deepEqual(dashboard.dailyActivityCounts([]), []);
});

test('Distribution percentages use processed actions only, ignoring searches, errors, units and pending records', () => {
  const rows = [row('new_product_created', { metadata: { quantity: 40 } }), row('new_product_created'),
    row('used_copy_created'), ...Array.from({ length: 3 }, () => row('new_product_reused')),
    ...Array.from({ length: 5 }, () => row('isbn_search')),
    row('new_product_created', { status: 'pending' }), row('operation_error', { status: 'error' })];
  const result = dashboard.processedDistribution(metrics.calculateProductionMetrics(rows));
  assert.deepEqual(result.map(item => item.value), [2, 1, 3]);
  for (const [index, percentage] of [100 / 3, 100 / 6, 50].entries()) assert.ok(Math.abs(result[index].percentage - percentage) < 1e-10);
  assert.ok(Math.abs(result.reduce((sum, item) => sum + item.percentage, 0) - 100) < 1e-10);
  for (const zeroRows of [[], [row('isbn_search')], [row('new_product_created', { status: 'pending' })]]) {
    assert.deepEqual(dashboard.processedDistribution(metrics.calculateProductionMetrics(zeroRows)).map(item => [item.value, item.percentage]), [[0, 0], [0, 0], [0, 0]]);
  }
});

test('Consolidated UUID rows retain origin breakdowns and separate missing authorship', () => {
  const secondUser = '33333333-4444-5555-6666-777777777777';
  const rows = [row('new_product_created', { metadata: { mock: true } }),
    row('used_copy_created', { metadata: { mock: false, quantity: 3 } }),
    row('isbn_search'), row('new_product_reused', { user_id: secondUser }),
    row('isbn_search', { user_id: null }), row('operation_error', { status: 'error', user_id: null })];
  const groups = dashboard.userDashboardMetrics(rows);
  assert.deepEqual(groups.map(group => group.userId), [userId, secondUser, null]);
  assert.equal(groups[0].metrics.totalProcessed, 2); assert.equal(groups[0].metrics.units, 4);
  assert.equal(groups[2].metrics.searches, 1); assert.equal(groups[2].metrics.errors, 1);
  for (const group of groups) for (const key of Object.keys(group.metrics)) {
    assert.equal(group.origins.reduce((sum, origin) => sum + origin.metrics[key], 0), group.metrics[key]);
  }
  assert.deepEqual(dashboard.userDashboardMetrics([]), []);
});

test('Dashboard renders one row per UUID despite multiple origins or equal display names', async () => {
  const secondUser = '33333333-4444-5555-6666-777777777777';
  const fake = sdk([row('new_product_created', { metadata: { mock: true } }),
    row('used_copy_created', { metadata: { mock: false } }), row('isbn_search'),
    row('new_product_reused', { user_id: secondUser }), row('isbn_search', { user_id: null })],
  { profiles: [{ id: userId, display_name: 'Mesmo nome' }, { id: secondUser, display_name: 'Mesmo nome' }] });
  const view = mount(fake); await flush();
  assert.equal(view.nodes().filter(node => node.props?.['data-metric']).some(card => view.nodes(card).some(node => node.type === 'dl')), false);
  await selectTab(view, 'Operadores');
  const rows = view.nodes().filter(node => node.props?.['data-user-id']);
  assert.deepEqual(rows.map(node => node.props['data-user-id']), [userId, secondUser, 'without-author']);
  assert.match(view.text(rows[2]), /Sem autoria identificada/);
  assert.equal(view.nodes(rows[0]).filter(node => node.type === 'details').length, 1);
  assert.equal(view.nodes(rows[0]).filter(node => node.type === 'td').length, 6);
  view.unmount();
});

test('Both chart datasets follow environment, origin and user filters without issuing extra reads', async () => {
  const secondUser = '33333333-4444-5555-6666-777777777777';
  const fake = sdk([row('new_product_created', { environment: 'production', metadata: { mock: true, quantity: 99 } }),
    row('used_copy_created', { environment: 'development', metadata: { mock: true, quantity: 3 } }),
    row('new_product_created', { environment: 'development', metadata: { mock: false }, user_id: secondUser }),
    row('isbn_search', { environment: 'development', completed_at: '2026-01-04T12:00:00' })]);
  const view = mount(fake, 'developer'); await flush();
  const props = name => view.nodes().find(node => node.type?.name === name).props;
  assert.equal(props('DailyOperationsChart').days.reduce((sum, day) => sum + day.total, 0), 3);
  assert.deepEqual(props('ProcessedDistributionChart').distribution.map(item => item.value), [1, 1, 0]);
  view.nodes().find(node => node.props?.id === 'select-origin-filter').props.onChange({ target: { value: 'simulated' } }); await flush();
  assert.deepEqual(props('ProcessedDistributionChart').distribution.map(item => item.value), [0, 1, 0]);
  assert.equal(props('DailyOperationsChart').days[0].simulated, 1);
  view.nodes().find(node => node.type === 'select').props.onChange({ target: { value: secondUser } }); await flush();
  assert.deepEqual(props('DailyOperationsChart').days, []);
  assert.ok(props('ProcessedDistributionChart').distribution.every(item => item.value === 0 && item.percentage === 0));
  assert.equal(fake.calls.filter(call => call.table === 'operations').length, 1);
  assert.deepEqual(fake.calls[0].filters, [['store_id', storeId], ['environment', 'development']]);
  view.unmount();
});

test('Invalid dates remain in metrics and distribution but are disclosed and excluded from the daily chart', async () => {
  const view = mount(sdk([row('new_product_created', { completed_at: '' })])); await flush();
  assert.match(view.text(), /1\s+registros sem data válida/);
  assert.deepEqual(view.nodes().find(node => node.type?.name === 'DailyOperationsChart').props.days, []);
  assert.equal(view.nodes().find(node => node.type?.name === 'ProcessedDistributionChart').props.distribution[0].value, 1);
  view.unmount();
});

test('Daily chart provides axes, keyboard/pointer/touch values, origins and a full text alternative', async () => {
  const days = dashboard.dailyActivityCounts([row('isbn_search', { metadata: { mock: true } }),
    ...Array.from({ length: 6 }, (_, index) => row('new_product_created', { completed_at: `2026-01-${String(index + 4).padStart(2, '0')}T12:00:00`, metadata: { mock: false } }))]);
  const view = mount(sdk([]), 'admin', deps => ({ default: charts(deps).DailyOperationsChart }), { days });
  assert.ok(view.nodes().some(node => node.type === 'svg' && node.props.viewBox === '0 0 600 268'));
  assert.match(view.text(), /Registros|Data operacional/);
  const bars = view.nodes().filter(node => node.type === 'g' && node.props.tabIndex === 0);
  assert.equal(bars.length, 7);
  assert.equal(view.nodes().filter(node => node.props?.['aria-label'] === 'Legenda da evolução').flatMap(node => view.nodes(node)).filter(node => node.type === 'li').length, 3);
  assert.match(bars[0].props['aria-label'], /Pesquisas ISBN: 1.*Simuladas: 1/);
  for (const action of ['onMouseEnter', 'onFocus', 'onClick']) {
    bars[0].props[action](); await flush();
    assert.match(view.text(view.nodes().find(node => node.props?.role === 'status')), /02\/01\/2026\s+·\s+1\s+registros.*Pesquisas ISBN: 1/);
  }
  bars[0].props.onBlur(); await flush();
  assert.match(view.text(view.nodes().find(node => node.props?.role === 'status')), /use Tab/);
  const details = view.nodes().find(node => node.type === 'details');
  assert.match(view.text(details), /02\/01\/2026.*04\/01\/2026/);
  assert.doesNotMatch(view.text(details), /03\/01\/2026/);
  view.unmount();
});

test('Daily chart summarizes fewer than seven observed days and caps the chart at the latest thirty', () => {
  for (const count of [0, 1, 2, 6]) {
    const days = dashboard.dailyActivityCounts(Array.from({ length: count }, (_, i) => row('isbn_search', { completed_at: `2026-01-${String(i + 1).padStart(2, '0')}T12:00:00` })));
    const view = mount(sdk([]), 'admin', deps => ({ default: charts(deps).DailyOperationsChart }), { days });
    assert.match(view.text(), /a partir de 7 dias/);
    assert.match(view.text(), new RegExp(`${count}\\s+registros em\\s+${count}\\s+dias`));
    assert.equal(view.nodes().filter(node => node.type === 'svg').length, 0); view.unmount();
  }
  const days = dashboard.dailyActivityCounts(Array.from({ length: 31 }, (_, index) => row('isbn_search', { completed_at: `2026-01-${String(index + 1).padStart(2, '0')}T12:00:00` })));
  const view = mount(sdk([]), 'admin', deps => ({ default: charts(deps).DailyOperationsChart }), { days });
  const bars = view.nodes().filter(node => node.type === 'g' && node.props.tabIndex === 0);
  assert.equal(bars.length, 30); assert.match(bars[0].props['aria-label'], /^02\/01\/2026/); assert.match(bars[29].props['aria-label'], /^31\/01\/2026/);
  view.unmount();
});

test('Horizontal composition exposes absolute and percentage values and a safe empty state', () => {
  for (const rows of [[], [row('isbn_search')], [row('new_product_created'), row('used_copy_created'), row('new_product_reused')]]) {
    const distribution = dashboard.processedDistribution(metrics.calculateProductionMetrics(rows));
    const view = mount(sdk([]), 'admin', deps => ({ default: charts(deps).ProcessedDistributionChart }), { distribution });
    assert.equal(view.nodes().filter(node => node.type === 'circle' || node.type === 'svg').length, 0);
    assert.doesNotMatch(view.text(), /NaN|Infinity/);
    if (distribution[0].value === 0) { assert.match(view.text(), /Nenhuma ação processada|0%/); assert.equal(view.nodes().filter(node => node.props?.['data-distribution-key']).length, 0); }
    else { assert.match(view.nodes().find(node => node.props?.role === 'img').props['aria-label'], /ações processadas/); assert.match(view.text(), /1\s+de\s+3\s+·\s+33,3%/); assert.equal(view.nodes().filter(node => node.props?.['data-distribution-key']).length, 3); }
    assert.match(view.text(), /Pesquisas, erros e pendências não entram/); view.unmount();
  }
});

const searchResultCounts = view => ({
  ...Object.fromEntries(view.nodes().filter(node => ['found', 'notFound'].includes(node.props?.['data-search-result']))
    .map(node => { const value = view.nodes(node).find(child => child.type === 'dd').props.children; return [node.props['data-search-result'], typeof value === 'number' ? value : null]; })),
  unidentified: view.nodes().find(node => node.props?.['data-unidentified-count'])?.props['data-unidentified-count'] ?? 0,
});

test('Dashboard tabs organize the retained sections and keep filters and data without refetch', async () => {
  const fake = sdk([row('new_product_created', { metadata: { mock: true, quantity: 4 } }),
    row('isbn_search', { id: 'search', metadata: { mock: true, resultFound: true } })]);
  const view = mount(fake); await flush();
  assert.deepEqual(view.nodes().filter(node => node.props?.role === 'tab').map(node => node.props.children),
    ['Visão Geral', 'Eficiência da Automação', 'Registros', 'Operadores', 'Consulta de Cadastros']);
  assert.equal(view.nodes().filter(node => node.props?.['data-metric']).length, 6);
  assert.equal(view.nodes().filter(node => ['DailyOperationsChart', 'ProcessedDistributionChart'].includes(node.type?.name)).length, 2);
  assert.doesNotMatch(view.text(), /Atividades recentes|Produtividade por usuário|Resultados registrados das pesquisas/);
  view.nodes().find(node => node.type === 'select').props.onChange({ target: { value: userId } });
  view.nodes().find(node => node.props?.id === 'select-origin-filter').props.onChange({ target: { value: 'simulated' } });
  await flush();
  const calls = fake.calls.length;
  for (const [label, section] of [['Eficiência da Automação', /Preenchimento automático por campo/],
    ['Registros', /Registros operacionais, sem associação/], ['Operadores', /Produtividade por usuário/], ['Visão Geral', /4\s+unidades informadas/]]) {
    await selectTab(view, label);
    assert.match(view.text(), section);
    assert.equal(view.nodes().find(node => node.type === 'select').props.value, userId);
    assert.equal(view.nodes().find(node => node.props?.id === 'select-origin-filter').props.value, 'simulated');
    const panels = view.nodes().filter(node => node.props?.role === 'tabpanel' && !node.props.hidden);
    const selected = view.nodes().filter(node => node.props?.role === 'tab' && node.props['aria-selected']);
    assert.equal(panels.length, 1); assert.equal(selected.length, 1);
    assert.equal(selected[0].props['aria-controls'], panels[0].props.id);
    assert.equal(panels[0].props['aria-labelledby'], selected[0].props.id);
  }
  assert.equal(fake.calls.length, calls);
  assert.equal(view.nodes().filter(node => node.props?.['data-metric']).length, 6);
  view.unmount();
});

test('Automation evidence uses strict recorded results and excludes errors, pending and registrations', async () => {
  const fake = sdk([
    row('isbn_search', { id: 'found', metadata: { mock: true, resultFound: true } }),
    row('isbn_search', { id: 'not-found', metadata: { mock: false, resultFound: false } }),
    ...[undefined, null, 'true', 'false', 1, 0].map((resultFound, index) =>
      row('isbn_search', { id: `unknown-${index}`, metadata: { resultFound } })),
    row('isbn_search', { id: 'legacy', metadata: null }),
    row('isbn_search', { id: 'pending', status: 'pending', metadata: { resultFound: true } }),
    row('isbn_search', { id: 'error', status: 'error', metadata: { resultFound: true } }),
    row('operation_error', { id: 'failure', metadata: { flow: 'isbn_search', resultFound: false } }),
    row('new_product_created', { id: 'registration', metadata: { resultFound: true } }),
  ]);
  const view = mount(fake); await flush(); await selectTab(view, 'Eficiência da Automação');
  assert.deepEqual(searchResultCounts(view), { found: 1, notFound: 1, unidentified: 7 });
  assert.match(view.text(), /9\s+pesquisas concluídas/);
  assert.equal(view.nodes().filter(node => node.props?.['data-evidence-origin']).length, 0);
  assert.match(view.text(), /completude, não precisão bibliográfica/);
  assert.equal(view.nodes().filter(node => node.props?.['data-bibliographic-field']).length, 9);
  assert.equal(view.nodes().filter(node => node.props?.['data-search-result']).length, 4);
  assert.match(view.text(), /falha técnica:\s+2\s+erros identificados/);
  assert.doesNotMatch(view.text(), /NaN|Infinity|\d[,.]?\d*%/);
  view.unmount();
});

test('Automation results honor user, origin, period and production/development across tabs', async () => {
  const secondUser = '33333333-4444-5555-6666-777777777777';
  for (const role of ['admin', 'developer']) {
    const environment = role === 'developer' ? 'development' : 'production';
    const recent = new Date(Date.now() - 60000).toISOString();
    const fake = sdk([
      row('isbn_search', { id: 'recent', environment, completed_at: recent, metadata: { mock: true, resultFound: true } }),
      row('isbn_search', { id: 'old', environment, metadata: { mock: true, resultFound: false } }),
      row('isbn_search', { id: 'other-user', environment, user_id: secondUser, metadata: { mock: true, resultFound: false } }),
      row('isbn_search', { id: 'declared', environment, metadata: { mock: false, resultFound: false } }),
      row('isbn_search', { id: 'other-environment', environment: environment === 'production' ? 'development' : 'production', metadata: { mock: true, resultFound: true } }),
      row('isbn_search', { id: 'other-store', environment, store_id: otherStore, metadata: { mock: true, resultFound: true } }),
    ]);
    const view = mount(fake, role); await flush(); await selectTab(view, 'Eficiência da Automação');
    assert.deepEqual(searchResultCounts(view), { found: 1, notFound: 3, unidentified: 0 });
    view.nodes().find(node => node.props?.id === 'select-origin-filter').props.onChange({ target: { value: 'simulated' } });
    view.nodes().find(node => node.type === 'select').props.onChange({ target: { value: userId } });
    await flush();
    assert.deepEqual(searchResultCounts(view), { found: 1, notFound: 1, unidentified: 0 });
    view.nodes().find(node => node.type === 'button' && node.props.children === '7 dias').props.onClick(); await flush();
    assert.deepEqual(searchResultCounts(view), { found: 1, notFound: 0, unidentified: 0 });
    await selectTab(view, 'Registros');
    assert.equal(view.nodes().filter(node => node.props?.['data-record-id']).length, 1);
    await selectTab(view, 'Operadores');
    assert.deepEqual(view.nodes().filter(node => node.props?.['data-user-id']).map(node => node.props['data-user-id']), [userId]);
    await selectTab(view, 'Visão Geral');
    assert.equal(view.nodes().find(node => node.props?.['data-metric'] === 'searches').props.children[1].props.children, 1);
    await selectTab(view, 'Eficiência da Automação');
    assert.deepEqual(searchResultCounts(view), { found: 1, notFound: 0, unidentified: 0 });
    assert.equal(fake.calls.filter(call => call.table === 'operations').length, 2);
    assert.ok(fake.calls.filter(call => call.table === 'operations').every(call =>
      role === 'admin' ? call.ors.some(filter => filter.startsWith('environment.eq.production,'))
        : call.filters.some(([field, value]) => field === 'environment' && value === environment)));
    view.unmount();
  }
});

test('Dashboard tabs support arrow keys, Home and End with matching focus and panels', async () => {
  const fake = sdk([]), view = mount(fake); await flush();
  for (const [key, expected] of [['ArrowRight', 'automation'], ['End', 'registrations'],
    ['ArrowRight', 'overview'], ['ArrowLeft', 'registrations'], ['Home', 'overview']]) {
    const selected = view.nodes().find(node => node.props?.role === 'tab' && node.props['aria-selected']);
    let prevented = false, focused;
    selected.props.onKeyDown({ key, preventDefault() { prevented = true; }, currentTarget: { parentElement: {
      querySelector(selector) { return { focus() { focused = selector; } }; },
    } } });
    await flush();
    assert.equal(prevented, true); assert.equal(focused, `#dashboard-tab-${expected}`);
    assert.equal(view.nodes().find(node => node.props?.role === 'tab' && node.props['aria-selected']).props.id, `dashboard-tab-${expected}`);
    assert.equal(view.nodes().filter(node => node.props?.role === 'tab' && node.props.tabIndex === 0).length, 1);
  }
  const selected = view.nodes().find(node => node.props?.role === 'tab' && node.props['aria-selected']);
  selected.props.onKeyDown({ key: 'Tab', preventDefault() { assert.fail('Tab must keep native focus navigation'); } });
  assert.equal(fake.calls.length, 1);
  view.unmount();
});

test('Automation empty and legacy results keep unavailable metrics pending instead of inventing evidence', async () => {
  for (const records of [[], [row('isbn_search')]]) {
    const view = mount(sdk(records)); await flush(); await selectTab(view, 'Eficiência da Automação');
    assert.deepEqual(searchResultCounts(view), { found: null, notFound: null, unidentified: records.length });
    const fieldRows = view.nodes().filter(node => node.props?.['data-bibliographic-field']);
    assert.deepEqual(fieldRows.map(node => node.props['data-bibliographic-field']), ['Título', 'Autores', 'Editora', 'Ano', 'Edição', 'Idioma', 'Formato', 'Páginas', 'Sinopse']);
    for (const node of fieldRows) for (const cell of view.nodes(node).filter(child => child.type === 'td')) {
      assert.match(view.text(cell), /Dados ainda não disponíveis/);
      assert.doesNotMatch(view.text(cell), /\d|%/);
    }
    assert.match(view.text(), /Aguardando instrumentação/);
    if (!records.length) assert.match(view.text(), /Nenhuma operação/);
    assert.doesNotMatch(view.text(), /NaN|Infinity|\d[,.]?\d*%/);
    view.unmount();
  }
});

test('Revocation and context changes hide every internal tab data before a new read completes', async () => {
  for (const label of ['Visão Geral', 'Eficiência da Automação', 'Registros', 'Operadores']) {
    const fake = sdk([row('isbn_search', { title: 'Dado da conta anterior', metadata: { resultFound: true } })], { defer: true });
    const view = mount(fake); await flush(); fake.releases[0](); await flush(); await selectTab(view, label);
    view.deps.user.currentUser = { ...view.deps.user.currentUser, storeId: otherStore };
    view.render();
    assert.doesNotMatch(view.text(), /Dado da conta anterior|Resultados registrados das pesquisas|Produtividade por usuário|Total de ações processadas/);
    assert.match(view.text(), /Carregando dashboard/);
    await flush();
    view.deps.user.canViewProduction = false; view.render(); await flush();
    assert.equal(view.text(), ''); assert.ok(fake.calls[1].signal.aborted);
    fake.releases[1](); await flush(); assert.equal(view.text(), '');
    view.unmount();
  }
});

test('Records paginate locally in groups of twenty, partition types and preserve global metrics', async () => {
  const records = Array.from({ length: 45 }, (_, i) => row('isbn_search', { id: `search-${String(i).padStart(2, '0')}` }));
  records.push(row('new_product_created', { id: 'new', status: 'pending' }), row('used_copy_created', { id: 'used' }),
    row('new_product_reused', { id: 'reuse' }), row('isbn_search', { id: 'failure', status: 'error' }),
    row('operation_error', { id: 'operation-error', metadata: { flow: 'registration' } }));
  const fake = sdk(records), view = mount(fake); await flush();
  const initialMetrics = Object.fromEntries(view.nodes().filter(n => n.props?.['data-metric']).map(n => [n.props['data-metric'], n.props.children[1].props.children]));
  await selectTab(view, 'Registros');
  const visible = () => view.nodes().filter(n => n.props?.['data-record-id']).map(n => n.props['data-record-id']);
  assert.equal(visible().length, 20); const first = visible();
  view.nodes().find(n => n.type === 'button' && n.props.children === 'Próxima').props.onClick(); await flush();
  assert.equal(visible().length, 20); assert.ok(visible().every(id => !first.includes(id)));
  view.nodes().find(n => n.type === 'button' && n.props.children === 'Próxima').props.onClick(); await flush();
  assert.equal(visible().length, 10);
  assert.match(view.text(), /Exibindo\s+41\s+–\s+50\s+de\s+50/);
  const chips = view.nodes().filter(n => n.props?.['data-record-type']);
  const counts = Object.fromEntries(chips.map(n => [n.props['data-record-type'], n.props.children[2].props.children]));
  assert.deepEqual(counts, { all: 50, searches: 45, registrations: 2, reused: 1, errors: 2 });
  chips.find(n => n.props['data-record-type'] === 'errors').props.onClick(); await flush();
  assert.deepEqual(visible(), ['failure', 'operation-error']);
  assert.ok(view.nodes().filter(n => n.props?.['data-record-id']).every(n => n.props.className.includes('bg-rose-50')));
  assert.equal(view.nodes().find(n => n.type === 'button' && n.props.children === 'Anterior').props.disabled, true);
  assert.equal(fake.calls.filter(c => c.table === 'operations').length, 1);
  await selectTab(view, 'Visão Geral');
  assert.deepEqual(Object.fromEntries(view.nodes().filter(n => n.props?.['data-metric']).map(n => [n.props['data-metric'], n.props.children[1].props.children])), initialMetrics);
  view.unmount();
});

test('Records reset pagination with global filters, expose long titles to keyboard and recover empty types', async () => {
  const title = 'Um título bastante longo '.repeat(20);
  const records = Array.from({ length: 22 }, (_, i) => row('isbn_search', { id: `row-${i}`, title, metadata: { mock: true } }));
  records.push(row('used_copy_created', { id: 'declared', metadata: { mock: false } }));
  const fake = sdk(records), view = mount(fake); await flush(); await selectTab(view, 'Registros');
  const titleNode = view.nodes().find(n => n.props?.title === title);
  assert.equal(titleNode.props.tabIndex, 0); assert.match(titleNode.props.className, /focus:whitespace-normal/);
  view.nodes().find(n => n.type === 'button' && n.props.children === 'Próxima').props.onClick(); await flush();
  view.nodes().find(n => n.props?.id === 'select-origin-filter').props.onChange({ target: { value: 'declared' } }); await flush();
  assert.deepEqual(view.nodes().filter(n => n.props?.['data-record-id']).map(n => n.props['data-record-id']), ['declared']);
  view.nodes().find(n => n.props?.['data-record-type'] === 'searches').props.onClick(); await flush();
  assert.equal(view.nodes().filter(n => n.props?.['data-record-id']).length, 0);
  assert.match(view.text(), /Nenhum registro deste tipo/);
  view.nodes().find(n => n.type === 'button' && n.props.children === 'Mostrar todos os tipos').props.onClick(); await flush();
  assert.equal(view.nodes().filter(n => n.props?.['data-record-id']).length, 1);
  assert.equal(fake.calls.filter(c => c.table === 'operations').length, 1);
  view.unmount();
});

test('Operators sort by resolved name with UUID tie breaks and totals include missing authorship', async () => {
  const secondUser = '33333333-4444-5555-6666-777777777777';
  const records = [row('new_product_created'), row('used_copy_created', { user_id: secondUser }), row('new_product_reused', { user_id: null }),
    row('isbn_search', { user_id: secondUser }), row('operation_error', { user_id: null })];
  const fake = sdk(records, { profiles: [{ id: userId, display_name: 'Zélia' }, { id: secondUser, display_name: 'Ana' }] });
  const view = mount(fake); await flush(); await selectTab(view, 'Operadores');
  assert.deepEqual(view.nodes().filter(n => n.props?.['data-user-id']).map(n => n.props['data-user-id']), [secondUser, 'without-author', userId]);
  const totals = view.nodes().find(n => n.props?.['data-operator-totals']);
  assert.deepEqual(view.nodes(totals).filter(n => n.type === 'td').map(n => n.props.children), [3, 1, 1, 1, 1, 1]);
  view.nodes().find(n => n.props?.id === 'select-origin-filter').props.onChange({ target: { value: 'simulated' } }); await flush();
  assert.deepEqual(view.nodes(view.nodes().find(n => n.props?.['data-operator-totals'])).filter(n => n.type === 'td').map(n => n.props.children), [0, 0, 0, 0, 0, 0]);
  view.unmount();
});

test('Shared footer retains environment and caveats across every tab and loading failures', async () => {
  for (const role of ['admin', 'developer']) for (const errorPage of [-1, 0]) {
    const fake = sdk([row()], { errorPage }), view = mount(fake, role); await flush();
    for (const tab of ['Visão Geral', 'Eficiência da Automação', 'Registros', 'Operadores']) {
      await selectTab(view, tab);
      const footer = view.nodes().find(n => n.type === 'footer');
      assert.match(view.text(footer), /não confirmam publicação, estoque ou venda na Magazord/);
      assert.match(view.text(footer), new RegExp(role === 'developer' ? 'development.*simulados classificados à parte' : 'production'));
      if (role === 'admin') assert.doesNotMatch(view.text(footer), /simulados classificados à parte/);
      if (errorPage === 0) assert.match(view.text(), /Tentar novamente/);
      assert.equal(view.nodes().filter(n => n.type === 'select').length, 3);
    }
    view.unmount();
  }
});

test('Owner scope includes only production plus the exact authorized demo; developer scope is unchanged', async () => {
  const demo = { demo: true, mock: true, demo_batch_id: 'isbn-demo-20261014-realapp-01' };
  const rows = [row(), row('used_copy_created', { id: 'demo', environment: 'development', metadata: demo }),
    row('isbn_search', { id: 'technical', environment: 'development' }),
    row('isbn_search', { id: 'other-batch', environment: 'development', metadata: { ...demo, demo_batch_id: 'another-batch' } }),
    row('isbn_search', { id: 'wrong-flag', environment: 'development', metadata: { ...demo, demo: 'true' } }),
    row('isbn_search', { id: 'other-store', store_id: otherStore, environment: 'development', metadata: demo })];
  const before = JSON.stringify(rows);
  for (const leak of [false, true]) {
    const fake = sdk(rows, { leak });
    const data = await service(fake).loadProduction(storeId, 'production', 'all', undefined, true);
    assert.deepEqual(data.operations.map(r => r.id), ['demo', 'row']);
    assert.match(fake.calls[0].ors[0], /metadata->>demo_batch_id.eq.isbn-demo-20261014-realapp-01/);
  }
  const dev = await service(sdk(rows)).loadProduction(storeId, 'development', 'all', undefined, true);
  assert.ok(dev.operations.every(r => r.environment === 'development'));
  assert.equal(JSON.stringify(rows), before);
});

test('1045 demo events across five UUIDs retain metrics, pagination and individual used copies in combined scope', async () => {
  // Synthetic data generated in memory; this test must work in a clean checkout without backup/preparation files.
  const actors = Array.from({ length: 5 }, (_, i) => `22222222-3333-4444-5555-${String(i + 1).padStart(12, '0')}`);
  const demo = [['isbn_search', 600], ['new_product_created', 200], ['new_product_reused', 80],
    ['used_copy_created', 140], ['operation_error', 25]].flatMap(([type, count]) => Array.from({ length: count }, (_, i) => row(type, {
      id: `demo-${type}-${i}`, user_id: actors[i % actors.length], environment: 'development',
      condition: type === 'used_copy_created' ? 'used' : ['new_product_created', 'new_product_reused'].includes(type) ? 'new' : null,
      status: type === 'operation_error' ? 'error' : 'success',
      metadata: { quantity: 1, demo: true, mock: true, demo_batch_id: 'isbn-demo-20261014-realapp-01' },
    })));
  const originals = Array.from({ length: 44 }, (_, i) => row('isbn_search', { id: `original-${i}`, environment: i < 22 ? 'production' : 'development' }));
  const before = JSON.stringify([...originals, ...demo]);
  const fake = sdk([...originals, ...demo], { cap: 137 });
  const loaded = await service(fake).loadProduction(storeId, 'production', 'all', undefined, true);
  assert.equal(loaded.operations.length, 1067);
  assert.equal(loaded.operations.filter(r => r.metadata?.demo).length, 1045);
  assert.equal(new Set(demo.map(r => r.user_id)).size, 5);
  assert.deepEqual(metrics.calculateProductionMetrics(loaded.operations.filter(r => r.metadata?.demo)),
    { searches: 600, totalProcessed: 420, newCreated: 200, newReused: 80, usedCreated: 140, errors: 25, units: 420 });
  assert.equal(fake.calls.filter(c => c.table === 'operations').length, 8);
  assert.equal(JSON.stringify([...originals, ...demo]), before);
});

test('Refresh records a confirmed timestamp, includes later events and preserves the active tab', async () => {
  const rows = [row()]; const fake = sdk(rows), view = mount(fake); await flush();
  assert.match(view.text(), /Última atualização: .*\d{2}:\d{2}/);
  await selectTab(view, 'Registros');
  rows.push(row('operation_error', { id: 'later', status: 'error', error_message: 'Erro seguro', metadata: { flow: 'registration' } }));
  view.nodes().find(n => n.type === 'button' && n.props.children === 'Atualizar').props.onClick(); await flush();
  assert.equal(view.nodes().filter(n => n.props?.['data-record-id']).length, 2);
  const errorRow = view.nodes().find(n => n.props?.['data-record-id'] === 'later');
  view.nodes(errorRow).find(n => n.type === 'button' && n.props.children === 'Evidência').props.onClick(); await flush();
  assert.match(view.text(), /Erro seguro/); assert.match(view.text(), /registration/);
  view.deps.user.canViewProduction = false; view.render();
  assert.doesNotMatch(view.text(), /Erro seguro/);
  view.unmount();
});

test('Nature filters separate fictitious history, actual test actions and unclassified legacy records', async () => {
  const rows = [row('new_product_created', { id: 'demo', metadata: { demo: true, mock: true } }),
    row('new_product_created', { id: 'test', metadata: { mock: true, purpose: 'operational_test', operational_test_run_id: 'round-1' } }),
    row('new_product_created', { id: 'legacy', metadata: { mock: false } })];
  const fake = sdk(rows), view = mount(fake); await flush(); await selectTab(view, 'Registros');
  for (const [value, id] of [['demo', 'demo'], ['operational_test', 'test'], ['unclassified', 'legacy']]) {
    view.nodes().find(n => n.props?.id === 'select-provenance-filter').props.onChange({ target: { value } }); await flush();
    assert.deepEqual(view.nodes().filter(n => n.props?.['data-record-id']).map(n => n.props['data-record-id']), [id]);
  }
  assert.equal(fake.calls.filter(c => c.table === 'operations').length, 1);
  view.unmount();
});
