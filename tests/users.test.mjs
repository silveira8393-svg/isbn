import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

// Compile the real service/component in memory; never connect to Supabase or use credentials.
async function compile(entry, component = false) {
  const mocks = [
    [/\/lib\/supabase$/, 'exports.supabase=deps.supabase'],
    [/^react$/, 'module.exports=deps.react'],
    [/^react\/jsx-runtime$/, 'exports.jsx=exports.jsxs=(type,props)=>({type,props})'],
    [/^lucide-react$/, 'module.exports=new Proxy({},{get:(_,key)=>String(key)})'],
  ];
  if (component) mocks.push([/\/contexts\/UserContext$/, 'exports.useUser=()=>deps.user']);
  const result = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    plugins: [{ name: 'users-read-only', setup(builder) {
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

const service = await compile('src/services/usersService.ts');
const component = await compile('src/components/users/UserManagement.tsx', true);
const permissions = (await compile('src/contexts/UserContext.tsx'))({ react: { createContext: () => ({}) } });
const storeId = '11111111-2222-3333-4444-555555555555';
const otherStore = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const membership = (user_id = 'user-1', overrides = {}) => ({ store_id: storeId, user_id, role: 'operator', active: true, ...overrides });
const profile = (id = 'user-1', overrides = {}) => ({ id, display_name: ' Pessoa da loja ', active: true, ...overrides });

function sdk(memberships = [membership()], profiles = [profile()], options = {}) {
  const calls = [], releases = [], statusCalls = [];
  return { calls, releases, statusCalls, options, supabase: {
    functions: { async invoke(name, args) {
      statusCalls.push({ name, ...args });
      if (options.statusDeferred) await options.statusDeferred;
      if (options.statusThrows) throw new Error('private Auth details');
      return { data: options.statusBody ?? { success: true, users: args.body.userIds.map(id => ({
        id, invitePending: (options.pendingIds ?? []).includes(id),
      })) }, error: options.statusError ? { message: 'private Auth details' } : null };
    } },
    from(table) {
      assert.ok(['store_users', 'profiles'].includes(table), 'Only existing public tables may be read');
      const call = { table, filters: [], orders: [] }; calls.push(call);
      const query = {
        select(columns, selectOptions) { call.columns = columns; call.options = selectOptions; return this; },
        eq(field, value) { call.filters.push([field, value]); return this; },
        order(field, value) { call.orders.push([field, value]); return this; },
        range(start, end) { call.range = [start, end]; return this; },
        in(field, ids) { call.ids = ids; assert.equal(field, 'id'); return this; },
        abortSignal(signal) { call.signal = signal; return this; },
        then(resolve, reject) {
          const respond = () => {
            if (options.throws) throw new Error('private database details');
            if (options.errorTable === table || (table === 'store_users' && options.errorOffset === call.range[0])) {
              return { data: null, count: null, error: { message: 'private database details' } };
            }
            if (table === 'profiles') return { data: profiles.filter(p => call.ids.includes(p.id)), error: null };
            const rows = memberships.filter(row => options.leak || call.filters.every(([field, value]) => row[field] === value))
              .sort((a, b) => a.user_id.localeCompare(b.user_id));
            const [start, end] = call.range;
            return { data: rows.slice(start, Math.min(end + 1, start + (options.cap ?? 500))), count: rows.length, error: null };
          };
          const promise = options.defer && table === 'store_users'
            ? new Promise((ok, fail) => releases.push(() => { try { ok(respond()); } catch (error) { fail(error); } }))
            : Promise.resolve().then(respond);
          return promise.then(resolve, reject);
        },
      };
      return query;
    },
  } };
}

for (const [role, label] of [['admin', 'Proprietário'], ['operator', 'Operador'], ['developer', 'Desenvolvedor']]) {
  test(`Real membership keeps ${role} internally and displays ${label}`, async () => {
    const api = service(sdk([membership('user-1', { role })]));
    const [user] = await api.loadStoreUsers(storeId);
    assert.equal(user.role, role);
    assert.equal(api.storeUserRoleLabel(user.role), label);
    assert.equal(user.name, 'Pessoa da loja');
  });
}

for (const [membershipActive, profileActive, label] of [[true, true, 'Ativo'], [false, true, 'Inativo'], [true, false, 'Inativo'], [false, false, 'Inativo']]) {
  test(`Membership active=${membershipActive}, profile active=${profileActive} => ${label}`, async () => {
    const api = service(sdk([membership('user-1', { active: membershipActive })], [profile('user-1', { active: profileActive })]));
    const [user] = await api.loadStoreUsers(storeId);
    assert.equal(api.storeUserStatusLabel(user.status), label);
  });
}

test('Reads only the supplied store, includes inactive/developer memberships and looks up corresponding profiles', async () => {
  const fake = sdk([membership(), membership('user-2', { role: 'developer', active: false }), membership('outside', { store_id: otherStore })],
    [profile(), profile('user-2', { display_name: 'Desenvolvimento' }), profile('outside')]);
  const users = await service(fake).loadStoreUsers(storeId);
  assert.equal(users.length, 2);
  assert.deepEqual(new Set(users.map(user => user.id)), new Set(['user-1', 'user-2']));
  assert.deepEqual(fake.calls[0].filters, [['store_id', storeId]]);
  assert.equal(fake.calls[0].columns, 'store_id,user_id,role,active');
  assert.equal(fake.calls[1].columns, 'id,display_name,active');
  assert.deepEqual(fake.calls[1].ids, ['user-1', 'user-2']);
  assert.equal(fake.calls.length, 2);
});

test('Unexpected rows from other stores are excluded before profile lookup', async () => {
  const fake = sdk([membership(), membership('outside', { store_id: otherStore })], [profile(), profile('outside')], { leak: true });
  assert.deepEqual((await service(fake).loadStoreUsers(storeId)).map(user => user.id), ['user-1']);
  assert.deepEqual(fake.calls[1].ids, ['user-1']);
});

test('Pagination keeps the real count above 1000 and respects smaller server limits', async () => {
  const rows = Array.from({ length: 1007 }, (_, index) => membership(`user-${String(index).padStart(4, '0')}`));
  const fake = sdk(rows, rows.map(row => profile(row.user_id)), { cap: 137 });
  const users = await service(fake).loadStoreUsers(storeId);
  assert.equal(users.length, 1007);
  assert.equal(new Set(users.map(user => user.id)).size, 1007);
  assert.deepEqual(fake.calls.filter(call => call.table === 'store_users').map(call => call.range[0]), [0, 137, 274, 411, 548, 685, 822, 959]);
  assert.ok(fake.calls.filter(call => call.table === 'profiles').every(call => call.ids.length <= 100));
});

test('Empty memberships return an empty list without consulting profiles', async () => {
  const fake = sdk([]);
  assert.deepEqual(await service(fake).loadStoreUsers(storeId), []);
  assert.equal(fake.calls.length, 1);
});

for (const options of [{ errorTable: 'store_users' }, { errorTable: 'profiles' }, { throws: true }]) {
  test(`Supabase error is sanitized: ${JSON.stringify(options)}`, async () => {
    const api = service(sdk(undefined, undefined, options));
    await assert.rejects(api.loadStoreUsers(storeId), error => error.message === api.USERS_LOAD_ERROR);
  });
}

test('Unreadable profiles and later-page errors fail without a partial directory', async () => {
  await assert.rejects(service(sdk([membership()], [])).loadStoreUsers(storeId), /Não foi possível carregar/);
  const rows = Array.from({ length: 501 }, (_, index) => membership(`user-${index}`));
  await assert.rejects(service(sdk(rows, [], { errorOffset: 500 })).loadStoreUsers(storeId), /Não foi possível carregar/);
});

test('Invalid store and pre-aborted requests do not query Supabase', async () => {
  const fake = sdk(), api = service(fake), controller = new AbortController(); controller.abort();
  await assert.rejects(api.loadStoreUsers(''));
  await assert.rejects(api.loadStoreUsers(storeId, controller.signal));
  assert.equal(fake.calls.length, 0);
});

const flush = async () => { for (let index = 0; index < 100; index++) await Promise.resolve(); };

function mount(fake, role = 'admin') {
  const currentUser = { id: 'current-account', name: 'Conta atual', role, active: true, storeId, storeName: 'Loja de teste' };
  const deps = { ...fake, user: { currentUser, canViewSettings: permissions.canViewSettings(currentUser) } };
  let cursor = 0, slots = [], effects = [], tree, scheduled = false, mounted = true;
  deps.react = {
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], next => {
      const value = typeof next === 'function' ? next(slots[i]) : next;
      if (Object.is(value, slots[i])) return;
      slots[i] = value;
      if (!scheduled) { scheduled = true; queueMicrotask(() => { scheduled = false; if (mounted) render(); }); }
    }]; },
    useEffect(effect, dependencies) { const i = cursor++; if (!slots[i] || dependencies.some((value, index) => !Object.is(value, slots[i].deps[index]))) {
      slots[i]?.cleanup?.(); slots[i] = { deps: dependencies }; effects.push(() => { slots[i].cleanup = effect(); });
    } },
  };
  const api = component(deps);
  function render() { cursor = 0; effects = []; tree = api.default(); effects.forEach(effect => effect()); }
  function nodes(node = tree) { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(child => nodes(child)); return [node, ...nodes(node.props?.children)]; }
  function text(node = tree) { if (node == null || typeof node === 'boolean') return ''; if (typeof node !== 'object') return String(node); if (Array.isArray(node)) return node.map(child => text(child)).join(' '); return text(node.props?.children); }
  render();
  return { deps, render, nodes, text, unmount() { mounted = false; for (const slot of slots) slot?.cleanup?.(); } };
}

for (const role of ['admin', 'developer']) {
  test(`${role} sees the real directory/count, labels and statuses with only the new invitation control`, async () => {
    const fake = sdk([membership('one', { role: 'admin' }), membership('two', { role: 'developer' }), membership('three', { active: false })],
      [profile('one', { display_name: 'Proprietário da loja' }), profile('two', { display_name: 'Desenvolvimento' }), profile('three', { display_name: 'Operação' })]);
    const view = mount(fake, role);
    assert.match(view.text(), /Carregando usuários/);
    await flush();
    assert.match(view.text(), /3\s+usuários/);
    assert.match(view.text(), /Proprietário/); assert.match(view.text(), /Operador/); assert.match(view.text(), /Desenvolvedor/);
    assert.match(view.text(), /Ativo/); assert.match(view.text(), /Inativo/);
    assert.deepEqual(view.nodes().filter(node => node.type === 'th').map(node => node.props.children), ['Nome', 'Perfil', 'Status', 'Ações']);
    assert.equal(view.nodes().filter(node => ['button', 'input', 'select'].includes(node.type)).length, 3);
    assert.deepEqual(view.nodes().filter(node => node.type === 'button' && view.text(node) === 'Editar').map(node => node.props['aria-label']).sort(),
      ['Editar Operação', 'Editar Proprietário da loja']);
    assert.match(view.text(), /\+ Novo Usuário/);
    assert.doesNotMatch(view.text(), /Conta atual|E-mail|current-account/);
    const count = fake.calls.length; view.render(); await flush(); assert.equal(fake.calls.length, count);
    view.unmount();
  });
}

test('Operator retains the real permission denial and never loads or displays the directory', async () => {
  const fake = sdk(), view = mount(fake, 'operator'); await flush();
  assert.equal(view.deps.user.canViewSettings, false);
  assert.equal(fake.calls.length, 0); assert.equal(view.text(), '');
  const app = readFileSync('src/App.tsx', 'utf8');
  assert.match(app, /activeTab === 'configuracoes' && canViewSettings/);
  view.unmount();
});

test('Empty list displays zero users and the empty-state message', async () => {
  const view = mount(sdk([])); await flush();
  assert.match(view.text(), /0\s+usuários/); assert.match(view.text(), /Nenhum usuário vinculado/);
  assert.equal(view.nodes().filter(node => node.type === 'table').length, 0);
  view.unmount();
});

test('Failed read shows only a safe error and retry reloads the directory', async () => {
  const fake = sdk(undefined, undefined, { errorTable: 'store_users' }), view = mount(fake); await flush();
  assert.ok(view.nodes().some(node => node.props?.role === 'alert'));
  assert.match(view.text(), /Não foi possível carregar/); assert.doesNotMatch(view.text(), /private|database|Pessoa da loja|0\s+usuários/);
  fake.options.errorTable = null;
  view.nodes().find(node => node.type === 'button' && view.text(node) === 'Tentar novamente').props.onClick(); await flush();
  assert.match(view.text(), /1\s+usuário/); assert.match(view.text(), /Pessoa da loja/);
  view.unmount();
});

test('Store changes abort stale requests and prevent old-store data from appearing', async () => {
  const fake = sdk(undefined, undefined, { defer: true }), view = mount(fake); await flush();
  view.deps.user.currentUser = { ...view.deps.user.currentUser, storeId: otherStore };
  view.render(); await flush();
  assert.ok(fake.calls[0].signal.aborted);
  fake.releases[1](); await flush();
  assert.match(view.text(), /Nenhum usuário vinculado/);
  fake.releases[0](); await flush();
  assert.doesNotMatch(view.text(), /Pessoa da loja/);
  view.unmount();
});

test('Account/permission changes immediately hide loaded data and cancel pending requests', async () => {
  const fake = sdk(), view = mount(fake); await flush();
  assert.match(view.text(), /Pessoa da loja/);
  fake.options.defer = true;
  view.deps.user.currentUser = { ...view.deps.user.currentUser, id: 'another-account' };
  view.render(); assert.doesNotMatch(view.text(), /Pessoa da loja/); await flush();
  view.deps.user.canViewSettings = false;
  view.render(); await flush();
  assert.equal(view.text(), '');
  const request = fake.calls.findLast(call => call.table === 'store_users');
  assert.ok(request.signal.aborted);
  fake.releases[0](); await flush(); assert.equal(view.text(), '');
  view.unmount();
});

for (const [membershipActive, profileActive, expected] of [
  [true, true, 'Convite pendente'], [false, true, 'Inativo'], [true, false, 'Inativo'], [false, false, 'Inativo'],
]) test(`Invitation pending with profile=${profileActive}, membership=${membershipActive}: ${expected}`, async () => {
  const fake = sdk([membership('pending', { active: membershipActive })], [profile('pending', { active: profileActive })], { pendingIds: ['pending'] });
  const api = service(fake), [user] = await api.loadStoreUsers(storeId);
  assert.equal(api.storeUserStatusLabel(user.status), expected);
  assert.equal(user.active, membershipActive && profileActive);
  assert.equal(fake.statusCalls.length, membershipActive && profileActive ? 1 : 0);
  if (fake.statusCalls.length) assert.deepEqual(fake.statusCalls[0].body, { action: 'get_invitation_status', userIds: ['pending'] });
});

test('Auth status batches preserve all list rows/count and never send store or actor identifiers', async () => {
  const rows = Array.from({ length: 205 }, (_, i) => membership(`user-${i}`));
  const fake = sdk(rows, rows.map(row => profile(row.user_id)), { pendingIds: ['user-101'] });
  const users = await service(fake).loadStoreUsers(storeId);
  assert.equal(users.length, 205);
  assert.equal(users.filter(user => user.status === 'pending_invitation').length, 1);
  assert.deepEqual(fake.statusCalls.map(call => call.body.userIds.length), [100, 100, 5]);
  for (const call of fake.statusCalls) {
    assert.equal(call.name, 'manage-store-users'); assert.equal(call.method, 'POST');
    assert.deepEqual(Object.keys(call.body).sort(), ['action', 'userIds']);
  }
});

for (const options of [
  { statusError: true }, { statusThrows: true }, { statusBody: { success: false } },
  { statusBody: { success: true, users: [] } },
  { statusBody: { success: true, users: [{ id: 'outside', invitePending: false }] } },
  { statusBody: { success: true, users: [{ id: 'user-1', invitePending: 'false' }] } },
]) test(`Unavailable/malformed status never falls back to Active: ${JSON.stringify(options)}`, async () => {
  await assert.rejects(service(sdk(undefined, undefined, options)).loadStoreUsers(storeId), /Não foi possível carregar/);
});

test('Duplicate status rows cannot hide a missing user status', async () => {
  const fake = sdk([membership('one'), membership('two')], [profile('one'), profile('two')], {
    statusBody: { success: true, users: [{ id: 'one', invitePending: false }, { id: 'one', invitePending: false }] },
  });
  await assert.rejects(service(fake).loadStoreUsers(storeId), /Não foi possível carregar/);
});

test('Badges distinguish pending, confirmed and inactive while preserving the count', async () => {
  const fake = sdk([membership('pending'), membership('active'), membership('inactive', { active: false })],
    [profile('pending'), profile('active'), profile('inactive')], { pendingIds: ['pending'] });
  const view = mount(fake); await flush();
  assert.match(view.text(), /3\s+usuários/);
  for (const [label, color] of [['Convite pendente', /bg-amber-50/], ['Ativo', /bg-emerald-50/], ['Inativo', /bg-slate-100/]]) {
    const badge = view.nodes().find(node => node.type === 'span' && view.text(node) === label);
    assert.ok(badge); assert.match(badge.props.className, color);
  }
  view.unmount();
});

test('Reopening the list fetches confirmation again, without resending an invitation', async () => {
  const fake = sdk(undefined, undefined, { pendingIds: ['user-1'] });
  const first = mount(fake); await flush(); assert.match(first.text(), /Convite pendente/); first.unmount();
  fake.options.pendingIds = [];
  const second = mount(fake); await flush(); assert.doesNotMatch(second.text(), /Convite pendente/);
  assert.match(second.text(), /Ativo/); assert.equal(fake.statusCalls.length, 2); second.unmount();
});

test('Aborting an in-flight Auth status request suppresses the stale directory', async () => {
  let release;
  const statusDeferred = new Promise(resolve => { release = resolve; });
  const fake = sdk(undefined, undefined, { statusDeferred }), api = service(fake), controller = new AbortController();
  const request = api.loadStoreUsers(storeId, controller.signal); await flush();
  assert.equal(fake.statusCalls.length, 1); assert.equal(fake.statusCalls[0].signal, controller.signal);
  controller.abort(); release(); await assert.rejects(request, /Não foi possível carregar/);
});
