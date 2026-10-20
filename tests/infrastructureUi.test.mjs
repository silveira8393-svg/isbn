import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function compile(entry, extra = []) {
  const mocks = [
    [/^react$/, 'module.exports=deps.react'],
    [/^react\/jsx-runtime$/, 'exports.jsx=exports.jsxs=(type,props)=>({type,props})'],
    [/^lucide-react$/, 'module.exports=new Proxy({},{get:(_,key)=>String(key)})'],
    [/\/contexts\/UserContext$/, 'exports.useUser=()=>deps.user'],
    [/\/lib\/supabase$/, 'exports.supabase=deps.supabase'], ...extra,
  ];
  const result = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    plugins: [{ name: 'infra-ui-fixtures', setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        const match = mocks.find(([pattern]) => pattern.test(args.path));
        if (match) return { path: args.path, namespace: 'mock', pluginData: match[1] };
      });
      builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: args.pluginData, loader: 'js' }));
    } }],
  });
  return deps => {
    const module = { exports: {} };
    new Function('deps', 'module', 'exports', result.outputFiles[0].text)(deps, module, module.exports);
    return module.exports;
  };
}
function harness(factory, deps, props) {
  const slots = [], cleanups = []; let cursor = 0, effects = [], tree;
  deps.react = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useEffect(effect, dependencies) { const index = cursor++; if (!slots[index] || dependencies.some((value, i) => value !== slots[index][i])) {
      cleanups[index]?.(); slots[index] = dependencies; effects.push(() => { cleanups[index] = effect(); });
    } },
  };
  const api = factory(deps);
  const render = () => { cursor = 0; effects = []; tree = api.default(props); effects.forEach(effect => effect()); return tree; };
  render();
  return { render, get tree() { return tree; }, slots, api };
}
function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}
function text(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node !== 'object') return String(node);
  if (Array.isArray(node)) return node.map(text).join(' ');
  return text(node.props?.children);
}
const settings = await compile('src/components/SettingsView.tsx', [
  [/\/MagazordTestMode$/, 'module.exports="MagazordTestMode"'], [/\/UserManagement$/, 'module.exports="UserManagement"'],
  [/\/InfrastructureEntry$/, 'module.exports="InfrastructureEntry"'],
]);
for (const role of ['admin', 'operator', 'developer']) test(`settings gates infrastructure navigation and forced mount for ${role}`, () => {
  const allowed = role === 'developer';
  const h = harness(settings, { user: { currentUser: { name: 'synthetic', role }, canViewDeveloperTools: allowed } });
  assert.equal(nodes(h.tree).some(n => n.type === 'button' && text(n).trim() === 'Infraestrutura'), allowed);
  h.slots[0] = 'infraestrutura'; h.render();
  assert.equal(nodes(h.tree).some(n => n.type === 'InfrastructureEntry'), allowed);
});

const panel = await compile('src/components/infrastructure/InfrastructurePanel.tsx', [
  [/\/hooks\/useInfrastructure$/, 'exports.useInfrastructure=()=>deps.infra'],
  [/\/InfrastructureOverview$/, 'module.exports="Overview"'], [/\/InfrastructureSettings$/, 'module.exports="Settings"'],
  [/\/InfrastructureHistory$/, 'module.exports="History"'],
]);
test('panel exposes consumption/configuration only and keeps monitored environments independent', () => {
  const actions = [];
  const deps = { infra: { allowed: true, busy: false, act: action => actions.push(action), refresh() {}, data: { configs: [
    { id: 'dev', environment: 'development', provider: 'supabase' }, { id: 'prod', environment: 'commercial_production', provider: 'supabase' },
  ], snapshots: [], limits: [], runs: [] } } };
  const h = harness(panel, deps);
  assert.ok(text(h.tree).includes('Consumo atual')); assert.ok(text(h.tree).includes('Contas e limites'));
  assert.equal(text(h.tree).includes('Histórico'), false);
  let overview = nodes(h.tree).find(n => n.type === 'Overview'); assert.equal(overview.props.configs[0].id, 'dev');
  nodes(h.tree).find(n => n.type === 'select').props.onChange({ target: { value: 'commercial_production' } }); h.render();
  overview = nodes(h.tree).find(n => n.type === 'Overview'); assert.equal(overview.props.configs[0].id, 'prod');
  assert.deepEqual(actions, []);
  deps.infra.allowed = false; h.render(); assert.equal(h.tree, null);
});
test('initialization is explicit, errors remain visible and no automatic demo is created', () => {
  const actions = [];
  const deps = { infra: { allowed: true, data: { configs: [], limits: [], snapshots: [], runs: [] }, act: action => actions.push(action) } };
  const h = harness(panel, deps);
  assert.deepEqual(actions, []);
  nodes(h.tree).find(n => n.type === 'button' && text(n).includes('Preparar ambientes')).props.onClick();
  assert.deepEqual(actions, [{ action: 'initialize' }]);
  deps.infra.error = 'Backend pendente'; h.render(); assert.ok(text(h.tree).includes('Backend pendente'));
});

const overviewFactory = await compile('src/components/infrastructure/InfrastructureOverview.tsx');
test('consumption hides demo values and leaves unavailable usage/percentage empty', () => {
  const config = { id: 'dev', provider: 'supabase', enabled: true, mode: 'demo', version: 1, refresh_minutes: 60 };
  const props = { configs: [config], busy: false, onCollect() {}, snapshots: [{ id: 'snap', config_id: 'dev', config_version: 1,
    metric_key: 'connection.status', observed_value: null, unit: 'count', quota_scope: 'project', scope_id: 'test',
    period_type: 'unknown', period_start: null, period_end: null, observed_at: '2020-01-01T00:00:00Z', source: 'provider_status',
    quality_status: 'unavailable', is_demo: false, usage_percent: null, error_code_sanitized: 'forbidden' },
    { id: 'demo', config_id: 'dev', config_version: 1, metric_key: 'demo.requests', observed_value: 987654,
      is_demo: true, source: 'demo', quality_status: 'estimated' }] };
  const h = harness(overviewFactory, {}, props);
  assert.ok(text(h.tree).includes('Valores demonstrativos estão ocultos')); assert.ok(text(h.tree).includes('Não configurado'));
  assert.equal(text(h.tree).includes('987'), false);
  assert.ok(text(h.tree).includes('—')); assert.equal(nodes(h.tree).some(n => n.type === 'progress'), false);
  assert.ok(nodes(h.tree).find(n => n.type === 'button' && text(n) === 'Atualizar consumo').props.disabled);
});

test('consumption shows resource, usage, configured plan limit, exact percentage and refresh time', () => {
  const calls = [];
  const config = { id: 'dev', provider: 'supabase', enabled: true, mode: 'live', project_ref: 'test', version: 1 };
  const metric = { id: 'db', run_id: 'run', config_id: 'dev', config_version: 1, metric_key: 'database.bytes',
    observed_value: 80, unit: 'bytes', quota_scope: 'project', scope_id: 'test', period_type: 'instant',
    period_start: null, period_end: null, observed_at: '2026-10-16T12:00:00Z', source: 'supabase_database_size', quality_status: 'available', is_demo: false };
  const limit = { ...metric, max_value: 100, source: 'manual', effective_at: '2026-10-01T00:00:00Z' };
  const h = harness(overviewFactory, {}, { configs: [config], snapshots: [metric], limits: [limit],
    runs: [{ id: 'run', config_id: 'dev', config_version: 1, started_at: '2026-10-16T12:00:00Z', finished_at: '2026-10-16T12:01:00Z' }],
    onCollect: id => calls.push(id) });
  assert.ok(text(h.tree).includes('Banco de dados PostgreSQL')); assert.match(text(h.tree), /80\s+bytes/);
  assert.match(text(h.tree), /100\s+bytes/); assert.ok(text(h.tree).includes('Configurado manualmente'));
  assert.equal(nodes(h.tree).find(n => n.type === 'progress').props.value, 80);
  assert.ok(text(h.tree).includes('09:01:00'));
  nodes(h.tree).find(n => n.type === 'button' && text(n) === 'Atualizar consumo').props.onClick();
  assert.deepEqual(calls, ['dev']);
  const incompatible = harness(overviewFactory, {}, { configs: [config], snapshots: [{ ...metric, period_type: 'unknown' }], limits: [limit] });
  assert.equal(nodes(incompatible.tree).some(n => n.type === 'progress'), false);
});

test('Vercel is only the direct ISBN Usage link, regardless of configured data or enabled state', () => {
  const config = { id: 'vercel', provider: 'vercel', enabled: true, mode: 'live', version: 1 };
  const h = harness(overviewFactory, {}, { configs: [config], snapshots: [{ config_id: 'vercel', metric_key: 'vercel.requests.consumption', observed_value: 987654 }],
    runs: [], limits: [], busy: false, onCollect() { throw new Error('must not collect'); } });
  const link = nodes(h.tree).find(n => n.type === 'a');
  assert.equal(link.props.href, 'https://vercel.com/silveira8393-svgs-projects/isbn/usage');
  assert.equal(link.props.target, '_blank'); assert.equal(link.props.rel, 'noopener noreferrer');
  assert.equal(link.props.referrerPolicy, 'no-referrer');
  assert.equal(nodes(h.tree).some(n => ['button', 'table', 'progress'].includes(n.type)), false);
  assert.equal(text(h.tree).includes('987'), false);
});

test('Supabase prioritizes the bank in MB and shows only total requests as secondary activity', () => {
  const base = { config_id: 'dev', config_version: 1, run_id: 'current', quality_status: 'available', is_demo: false,
    source: 'supabase_database_size', observed_at: '2026-10-16T12:00:00Z', quota_scope: 'project', scope_id: 'test', period_type: 'unknown' };
  const h = harness(overviewFactory, {}, { configs: [{ id: 'dev', provider: 'supabase', version: 1, enabled: true, mode: 'live', project_ref: 'test' }],
    snapshots: [{ ...base, id: 'db', metric_key: 'database.bytes', observed_value: 12000000, unit: 'bytes', period_type: 'instant' },
      { ...base, id: 'api', metric_key: 'api.requests', observed_value: 497, unit: 'requests' },
      ...['storage.bytes','transfer.bytes','functions.invocations','api.auth_requests'].map(metric_key => ({ ...base, metric_key, observed_value: 987654, unit: 'bytes' }))],
    runs: [], limits: [], busy: false, onCollect() {} });
  assert.match(text(h.tree), /12 MB/); assert.ok(text(h.tree).includes('Informação secundária'));
  assert.match(text(h.tree), /497 requests/); assert.equal(text(h.tree).includes('987'), false);
  assert.equal(nodes(h.tree).filter(n => n.type === 'tr').length, 3);
  assert.equal(nodes(h.tree).some(n => n.type === 'progress'), false);
});

const serviceFactory = await compile('src/services/infrastructureService.ts');
test('client refuses stale actor and sanitizes function errors without exposing body', async () => {
  let invokes = 0;
  const deps = { supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'actor' } } }, error: null }) },
    functions: { invoke: async () => { invokes++; return { error: { context: new Response(JSON.stringify({ code: 'version_conflict', token: 'secret' })) } }; } } } };
  const service = serviceFactory(deps);
  await assert.rejects(service.infrastructureRequest('store', 'wrong-actor', { action: 'read' }), /sessão expirou/);
  assert.equal(invokes, 0);
  await assert.rejects(service.infrastructureRequest('store', 'actor', { action: 'read' }), /configuração mudou/);
});

const hookFactory = await compile('src/hooks/useInfrastructure.ts', [
  [/\/services\/infrastructureService$/, 'exports.infrastructureRequest=(...args)=>deps.request(...args)'],
]);
test('actual hook aborts obsolete reads and suppresses late action results after identity/role changes', async () => {
  const requests = [];
  const deps = { user: { currentUser: { id: 'actor-a', storeId: 'store-a', role: 'developer' }, canViewDeveloperTools: true },
    request: (...args) => new Promise(resolve => requests.push({ args, resolve })) };
  const h = harness(deps => ({ default: hookFactory(deps).useInfrastructure }), deps);
  assert.equal(requests.length, 1);
  deps.user.currentUser = { id: 'actor-b', storeId: 'store-b', role: 'developer' }; h.render();
  assert.equal(requests[0].args[3].aborted, true);
  requests[0].resolve({ configs: ['private-old-data'] });
  requests[1].resolve({ configs: ['new-data'] });
  await new Promise(setImmediate); h.render();
  assert.deepEqual(h.tree.data.configs, ['new-data']);
  const first = h.tree.act({ action: 'collect', configId: 'config' });
  const second = h.tree.act({ action: 'collect', configId: 'config' });
  assert.equal(requests.length, 3);
  deps.user.currentUser = { id: 'actor-b', storeId: 'store-b', role: 'admin' };
  deps.user.canViewDeveloperTools = false; h.render();
  requests[2].resolve({ status: 'available' });
  await Promise.all([first, second]); h.render();
  assert.equal(h.tree.allowed, false); assert.equal(h.tree.data, undefined); assert.equal(h.tree.notice, null);
});

const settingsFactory = await compile('src/components/infrastructure/InfrastructureSettings.tsx');

test('Vercel has no collection or quota configuration form', () => {
  const h = harness(settingsFactory, {}, { configs: [{ id: 'vercel', provider: 'vercel', enabled: true }],
    limits: [], busy: false, onSave() { throw new Error('must not save'); }, onTest() { throw new Error('must not test'); } });
  assert.equal(nodes(h.tree).some(n => typeof n.type === 'function' || ['form', 'button', 'input'].includes(n.type)), false);
});
test('configuration form submits without credentials and rejects incomplete limits', () => {
  const saved = [];
  const config = { id: 'test', version: 1, enabled: true, mode: 'live', provider: 'supabase', project_ref: 'project',
    account_scope_id: null, plan_label: '', refresh_minutes: 60, retention_days: 90, alert_thresholds_json: { warning: 70, critical: 90 } };
  const props = { configs: [config], limits: [], busy: false, onSave: (...args) => saved.push(args), onTest() {} };
  const h = harness(deps => {
    const outer = settingsFactory(deps).default(props);
    return { default: nodes(outer).find(n => typeof n.type === 'function').type };
  }, {}, { config, limits: [], busy: false, onSave: props.onSave, onTest: props.onTest });
  assert.equal(nodes(h.tree).filter(n => n.type === 'input' && n.props.type === 'password').length, 0);
  assert.equal(text(h.tree).includes('Retenção do histórico'), false);
  assert.equal(text(h.tree).includes('Atenção (%)'), false);
  assert.equal(text(h.tree).includes('Atualização (minutos)'), false);
  nodes(h.tree).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.equal(saved.length, 1); assert.deepEqual(saved[0][2], []);
  nodes(h.tree).find(n => n.type === 'button' && text(n).includes('Adicionar limite')).props.onClick(); h.render();
  nodes(h.tree).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); h.render();
  assert.equal(saved.length, 1); assert.ok(nodes(h.tree).some(n => n.props?.role === 'alert'));
});
