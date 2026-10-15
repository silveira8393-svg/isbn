import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Compile real navigation and permission helpers in memory, with no network or Auth calls.
async function compile(entry, realPermissions = false) {
  const mocks = [
    [/^react$/, 'module.exports=deps.react'],
    [/^react\/jsx-runtime$/, 'exports.jsx=exports.jsxs=(type,props)=>({type,props})'],
    [/^lucide-react$/, 'module.exports=new Proxy({},{get:(_,key)=>String(key)})'],
    [/\/lib\/supabase$/, 'exports.supabase={}'],
    [/\/services\/magazordMockService$/, 'exports.magazordMockService={getSimulationConfig:()=>({mode:"auto"})}'],
    [/\/utils\/metrics$/, 'exports.CANONICAL_CSV_DATASET=[]'],
  ];
  if (!realPermissions) mocks.push([/\/contexts\/UserContext$/, 'exports.useUser=()=>deps.user']);
  for (const name of ['SearchForm', 'BookDetailsCard', 'SearchHistoryGroup', 'CameraScannerModal',
    'MagazordStatusCard', 'ProductRegistrationForm', 'OwnerDashboard', 'SettingsView', 'UserSwitcher', 'Login', 'ResetPassword']) {
    mocks.push([new RegExp(`(?:^|/)${name}$`), `module.exports=${JSON.stringify(name)}`]);
  }
  if (entry.endsWith('App.tsx')) mocks.push([/(?:^|\/)Header$/, 'module.exports="Header"']);
  const result = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    define: { 'import.meta.env.DEV': 'false' },
    plugins: [{ name: 'isolated-navigation', setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        const mock = mocks.find(([pattern]) => pattern.test(args.path));
        return mock ? { path: args.path, namespace: 'mock', pluginData: mock[1] } : undefined;
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

const permissions = (await compile('src/contexts/UserContext.tsx', true))({ react: { createContext: () => ({}) } });
const app = await compile('src/App.tsx');
const header = await compile('src/components/Header.tsx');
function context(role, active = true) {
  const currentUser = { id: 'synthetic-user', storeId: 'synthetic-store', role, active, name: 'Conta sintética' };
  return { currentUser, canViewProduction: permissions.canViewProduction(currentUser),
    canViewSettings: permissions.canViewSettings(currentUser), isOperator: role === 'operator',
    operationEnvironment: permissions.getOperationEnvironment(currentUser) };
}
function nodes(node) {
  if (node == null || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}
function mount(factory, user, props) {
  const deps = { user };
  const slots = []; let cursor, effects, tree;
  globalThis.localStorage = { getItem: () => '[]', setItem() {} };
  deps.react = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }]; },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useEffect(effect, dependencies) { const index = cursor++; if (!slots[index] || dependencies.some((value, i) => value !== slots[index][i])) {
      slots[index] = dependencies; effects.push(effect);
    } },
  };
  const api = factory(deps);
  function render() { cursor = 0; effects = []; tree = api.default(props); effects.forEach(effect => effect()); }
  render();
  return { deps, render, nodes: () => nodes(tree), find: type => nodes(tree).find(node => node.type === type) };
}

for (const role of ['admin', 'operator', 'developer']) test(`Initial page and retained permissions: ${role}`, () => {
  const view = mount(app, context(role));
  const expected = role === 'admin' ? 'dashboard' : 'consultar';
  assert.equal(view.find('Header').props.activeTab, expected);
  assert.equal(Boolean(view.find('OwnerDashboard')), role === 'admin');
  assert.equal(Boolean(view.find('SearchForm')), role !== 'admin');
  view.find('Header').props.onTabChange('dashboard'); view.render();
  assert.equal(view.find('Header').props.activeTab, role === 'operator' ? 'consultar' : 'dashboard');
  assert.equal(Boolean(view.find('OwnerDashboard')), role !== 'operator');
  assert.equal(view.deps.user.operationEnvironment, role === 'developer' ? 'development' : 'production');
  view.find('Header').props.onTabChange('configuracoes'); view.render();
  assert.equal(Boolean(view.find('SettingsView')), role !== 'operator');
});

test('Losing permission hides the mounted dashboard immediately and redirects to lookup', () => {
  const view = mount(app, context('admin'));
  view.deps.user = context('operator'); view.render();
  assert.equal(Boolean(view.find('OwnerDashboard')), false);
  view.render(); assert.equal(view.find('Header').props.activeTab, 'consultar');
  assert.ok(view.find('SearchForm'));
});

test('Inactive identities have no dashboard permission or privileged initial page', () => {
  for (const role of ['admin', 'developer', 'operator']) {
    const user = context(role, false);
    assert.equal(user.canViewProduction, false);
    const view = mount(app, user); assert.equal(view.find('Header').props.activeTab, 'consultar');
    view.find('Header').props.onTabChange('dashboard'); view.render(); assert.equal(Boolean(view.find('OwnerDashboard')), false);
  }
});

for (const role of ['admin', 'developer', 'operator']) test(`Desktop and mobile Dashboard navigation: ${role}`, () => {
  const chosen = [], view = mount(header, context(role), { activeTab: 'dashboard', onTabChange: tab => chosen.push(tab) });
  const links = view.nodes().filter(node => node.type === 'button' && nodes(node).some(child => child.type === 'span' && child.props.children === 'Dashboard'));
  assert.equal(links.length, role === 'operator' ? 0 : 2);
  for (const link of links) link.props.onClick();
  assert.deepEqual(chosen, role === 'operator' ? [] : ['dashboard', 'dashboard']);
  assert.ok(!view.nodes().some(node => node.type === 'span' && node.props.children === 'Produção'));
});
