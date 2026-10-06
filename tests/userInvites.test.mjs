import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { FunctionsClient } from '@supabase/functions-js';

// Real components/service and HTTP error parsing; all Auth, reads and invitations stay in memory.
const compiled = await build({ stdin: {
  contents: "export * from './src/services/usersService'; export {default as UserManagement} from './src/components/users/UserManagement'; export {default as NewUserForm} from './src/components/users/NewUserForm'; export {default as EditUserForm} from './src/components/users/EditUserForm';",
  resolveDir: process.cwd(), loader: 'ts',
}, bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', plugins: [{
  name: 'invitation-isolation', setup(builder) {
    const mocks = [
      [/\/lib\/supabase$/, 'exports.supabase=deps.supabase'],
      [/\/contexts\/UserContext$/, 'exports.useUser=()=>deps.user'],
      [/^react$/, 'module.exports=deps.react'],
      [/^react\/jsx-runtime$/, 'exports.jsx=exports.jsxs=(type,props,key)=>({type,props,key})'],
    ];
    builder.onResolve({ filter: /.*/ }, args => {
      const found = mocks.find(([pattern]) => pattern.test(args.path));
      return found ? { path: args.path, namespace: 'mock', pluginData: found[1] } : undefined;
    });
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: args.pluginData, loader: 'js' }));
  },
}] });
const load = deps => {
  const module = { exports: {} };
  new Function('deps', 'module', 'exports', 'window', compiled.outputFiles[0].text)(deps, module, module.exports, { location: { reload: () => deps.supabase.reload() } });
  return module.exports;
};
const storeId = '11111111-2222-3333-4444-555555555555';
const context = { expectedUserId: 'caller', isCurrent: () => true };
const input = { displayName: ' Pessoa Convidada ', email: ' PESSOA@EXAMPLE.COM ', role: 'operator' };
const success = { success: true, user: { id: 'private-user-id', role: 'operator' }, message: 'private backend detail' };
const flush = async () => { for (let i = 0; i < 250; i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(ok => { resolve = ok; }); return { promise, resolve }; };

function sdk(options = {}) {
  const calls = [], reads = [], statusCalls = [], updates = [], rows = [{ user_id: options.targetId ?? 'existing', store_id: storeId, role: options.targetRole ?? 'admin', active: options.targetActive !== false }];
  const profiles = [{ id: rows[0].user_id, display_name: 'Pessoa existente', active: options.profileActive !== false }];
  let sessionReads = 0;
  let reloads = 0;
  const supabase = {
    reload() { reloads++; },
    auth: { async getSession() {
      sessionReads++;
      if (options.sessionDeferred) await options.sessionDeferred.promise;
      return { data: { session: options.noSession ? null : { access_token: 'synthetic-session-token', user: { id: options.wrongAccount ? 'other' : options.callerId ?? 'caller' } } },
        error: options.sessionError ? { message: 'private auth details' } : null };
    } },
    functions: new FunctionsClient('https://edge.example.invalid/functions/v1', { customFetch: async (url, init) => {
      const body = JSON.parse(init.body);
      if (body.action === 'get_invitation_status') {
        statusCalls.push(body);
        return Response.json({ success: true, users: body.userIds.map(id => ({
          id, invitePending: (id === 'invited' && options.accepted !== true) || options.pendingIds?.includes(id) === true,
        })) });
      }
      if (body.action === 'update_user') {
        updates.push({ url, init, body });
        if (options.editDeferred) await options.editDeferred.promise;
        if (options.editNetworkError) throw new TypeError('private update transport stack');
        const row = rows.find(row => row.user_id === body.targetUserId);
        if (!options.editStatus || options.editStatus === 200) {
          if (body.role !== undefined) row.role = body.role;
          if (body.active !== undefined) row.active = body.active;
        }
        return Response.json(options.editBody ?? { success: true, user: { id: row.user_id, role: row.role, active: row.active } },
          { status: options.editStatus ?? 200 });
      }
      calls.push({ url, init, body: JSON.parse(init.body) });
      if (options.deferred) await options.deferred.promise;
      if (options.networkError) throw new TypeError('private transport stack with synthetic-session-token');
      if (options.addUser) {
        rows.push({ user_id: 'invited', store_id: storeId, role: calls.at(-1).body.role, active: true });
        profiles.push({ id: 'invited', display_name: calls.at(-1).body.displayName, active: true });
      }
      return Response.json(options.body ?? success, { status: options.status ?? 201 });
    } }),
    from(table) {
      assert.ok(['store_users', 'profiles'].includes(table), 'No Auth directory or table writes');
      const call = { table }; reads.push(call);
      const query = {
        select() { return this; }, eq(field, value) { call[field] = value; return this; }, order() { return this; },
        range(start, end) { call.range = [start, end]; return this; }, in(field, ids) { call.ids = ids; return this; },
        abortSignal(signal) { call.signal = signal; return this; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            if (options.readError) return { data: null, error: { message: 'private query' }, count: null };
            const data = table === 'profiles' ? profiles.filter(p => call.ids.includes(p.id))
              : rows.filter(row => row.store_id === call.store_id).slice(call.range[0], call.range[1] + 1);
            return { data, error: null, count: rows.filter(row => row.store_id === call.store_id).length };
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  return { supabase, calls, reads, statusCalls, rows, profiles, updates, options,
    get reloads() { return reloads; }, get sessionReads() { return sessionReads; } };
}

function mount(fake, role = 'admin', root = 'UserManagement', props = {}) {
  const deps = { supabase: fake.supabase, user: { currentUser: { id: fake.options.callerId ?? 'caller', role, active: true, storeId, storeName: 'Loja atual' },
    canViewSettings: role === 'admin' || role === 'developer' } };
  const instances = new Map(), hosts = new Map();
  let current, scheduled = false, alive = true, tree, focused = null;
  const schedule = () => { if (!scheduled) { scheduled = true; queueMicrotask(() => { scheduled = false; if (alive) render(); }); } };
  deps.react = {
    useState(initial) { const owner = current, i = owner.cursor++; if (!(i in owner.slots)) owner.slots[i] = initial;
      return [owner.slots[i], next => { if (!owner.active) return; const value = typeof next === 'function' ? next(owner.slots[i]) : next;
        if (!Object.is(value, owner.slots[i])) { owner.slots[i] = value; schedule(); } }]; },
    useRef(initial) { const i = current.cursor++; return current.slots[i] ??= { current: initial }; },
    useEffect(effect, deps) { const owner = current, i = owner.cursor++, previous = owner.slots[i];
      if (!previous || deps.some((value, index) => !Object.is(value, previous.deps[index]))) {
        previous?.cleanup?.(); owner.slots[i] = { deps }; owner.effects.push(() => { owner.slots[i].cleanup = effect(); });
      }
    },
  };
  const api = load(deps);
  const cleanup = owner => { owner.active = false; for (const slot of owner.slots) slot?.cleanup?.(); };
  function render() {
    const visited = new Set(), visitedHosts = new Set();
    function visit(node, path = 'root') {
      if (!node || typeof node !== 'object') return node;
      if (Array.isArray(node)) return node.map((child, i) => visit(child, `${path}.${i}`));
      if (typeof node.type === 'function') {
        const key = `${path}:${node.type.name}:${node.key ?? ''}`; visited.add(key);
        let owner = instances.get(key);
        if (!owner) { owner = { slots: [], effects: [], active: true }; instances.set(key, owner); }
        owner.cursor = 0; owner.effects = []; current = owner;
        return visit(node.type(node.props), key);
      }
      if (node.key !== undefined) path += `:${node.key}`;
      if (!hosts.has(path)) hosts.set(path, { focus() { focused = node.props.id ?? text(node); } });
      visitedHosts.add(path);
      if (node.props?.ref) node.props.ref.current = hosts.get(path);
      if (node.props?.autoFocus && !hosts.get(path).autofocused) { hosts.get(path).focus(); hosts.get(path).autofocused = true; }
      return { ...node, props: { ...node.props, children: visit(node.props?.children, path + '.children') } };
    }
    tree = visit({ type: api[root], props });
    for (const [key, owner] of instances) if (!visited.has(key)) { cleanup(owner); instances.delete(key); }
    for (const key of hosts.keys()) if (!visitedHosts.has(key)) hosts.delete(key);
    for (const owner of instances.values()) owner.effects.forEach(effect => effect());
  }
  function nodes(...args) { const node = args.length ? args[0] : tree; if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(child => nodes(child)); return [node, ...nodes(node.props?.children)]; }
  function text(...args) { const node = args.length ? args[0] : tree; if (node == null || typeof node === 'boolean') return ''; if (typeof node !== 'object') return String(node); if (Array.isArray(node)) return node.map(child => text(child)).join(' '); return text(node.props?.children); }
  const byId = id => nodes().find(node => node.props?.id === id);
  const button = label => nodes().find(node => node.type === 'button' && text(node) === label);
  render();
  return { deps, api, render, nodes, text, byId, button, get focused() { return focused; },
    async open() { button('+ Novo Usuário').props.onClick(); await flush(); },
    async fill(values = input) { for (const [id, value] of [['new-user-name', values.displayName], ['new-user-email', values.email], ['new-user-role', values.role]]) {
      byId(id).props.onChange({ target: { value } }); } await flush(); },
    submit() { return nodes().find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }); },
    unmount() { alive = false; for (const owner of instances.values()) cleanup(owner); },
  };
}

for (const role of ['admin', 'operator']) test(`Service normalizes ${role} and sends only the invitation contract with the existing JWT`, async () => {
  const fake = sdk(), api = load(fake);
  assert.deepEqual(await api.inviteStoreUser({ ...input, role, store_id: 'outside', actor_id: 'other' }, context), { email: 'pessoa@example.com' });
  assert.equal(fake.calls.length, 1);
  const call = fake.calls[0];
  assert.equal(call.url, 'https://edge.example.invalid/functions/v1/manage-store-users');
  assert.equal(call.init.method, 'POST'); assert.equal(call.init.headers.Authorization, 'Bearer synthetic-session-token');
  assert.deepEqual(call.body, { action: 'invite_user', displayName: 'Pessoa Convidada', email: 'pessoa@example.com', role });
  assert.equal(fake.reads.length, 0);
});

for (const [changes, message] of [
  [{ displayName: '  ' }, /Informe o nome/], [{ displayName: 'a'.repeat(121) }, /120/], [{ displayName: 'Nome\nOutro' }, /120/],
  [{ email: ' ' }, /Informe o e-mail/], [{ email: 'invalid' }, /e-mail válido/], [{ email: 'a'.repeat(250) + '@x.com' }, /e-mail válido/],
  [{ role: '' }, /Selecione/], [{ role: 'developer' }, /Selecione/],
]) test(`Invalid input ${Object.keys(changes)} is rejected before Auth/HTTP: ${message}`, async () => {
  const fake = sdk(), api = load(fake);
  await assert.rejects(api.inviteStoreUser({ ...input, ...changes }, context), message);
  assert.equal(fake.sessionReads, 0); assert.equal(fake.calls.length, 0);
});

for (const options of [{ noSession: true }, { sessionError: true }, { wrongAccount: true }]) test(`Session failure never invokes: ${JSON.stringify(options)}`, async () => {
  const fake = sdk(options);
  await assert.rejects(load(fake).inviteStoreUser(input, context), /sessão mudou ou expirou/);
  assert.equal(fake.calls.length, 0);
});

for (const [status, body, message, review] of [
  [409, { error: 'private other store details' }, /Já existe uma conta/, false],
  [401, {}, /sessão expirou/, false], [403, {}, /não tem permissão/, false],
  [400, {}, /Confira o nome/, false], [429, {}, /Muitas tentativas/, false],
  [503, { code: 'configuration_error', error: 'private secret configuration' }, /indisponível/, false],
  [502, { partial: true, success: false, error: 'private membership failure' }, /convite foi criado.*vínculo.*revisão/, true],
  [200, { success: true, partial: true }, /convite foi criado/, true],
  [503, {}, /Não foi possível confirmar/, true], [200, { success: false }, /Não foi possível confirmar/, true],
]) test(`Real SDK response ${status}/${JSON.stringify(body)} is sanitized`, async () => {
  const fake = sdk({ status, body }), api = load(fake);
  await assert.rejects(api.inviteStoreUser(input, context), error => {
    assert.ok(error instanceof api.InviteStoreUserError); assert.match(error.message, message);
    assert.doesNotMatch(error.message, /private|secret|stack|synthetic|UUID/);
    assert.equal(error.reviewRequired, review); return true;
  });
  assert.equal(fake.calls.length, 1);
});

test('Network failure is uncertain, safely explained and never automatically retried', async () => {
  const fake = sdk({ networkError: true });
  await assert.rejects(load(fake).inviteStoreUser(input, context), error => error.reviewRequired && /conexão.*revisão/.test(error.message));
  assert.equal(fake.calls.length, 1);
});

for (const role of ['developer', 'admin']) test(`${role} sees New User, preserves the directory and opens/closes a clean accessible form`, async () => {
  const fake = sdk(), view = mount(fake, role); await flush();
  assert.match(view.text(), /1\s+usuário/); assert.ok(view.button('+ Novo Usuário'));
  await view.open(); assert.equal(view.focused, 'new-user-name');
  assert.equal(view.nodes().filter(node => node.type === 'form').length, 1);
  for (const id of ['new-user-name', 'new-user-email', 'new-user-role']) {
    assert.ok(view.nodes().some(node => node.type === 'label' && node.props.htmlFor === id));
  }
  assert.deepEqual(view.nodes().filter(node => node.type === 'option').map(node => [node.props.value, view.text(node)]),
    [['', 'Selecione o perfil'], ['admin', 'Proprietário'], ['operator', 'Operador']]);
  assert.doesNotMatch(view.text(view.nodes().find(node => node.type === 'form')), /developer|Desenvolvedor|UUID|JWT/);
  await view.fill(); view.button('Cancelar').props.onClick(); await flush();
  assert.equal(view.nodes().filter(node => node.type === 'form').length, 0); assert.equal(view.focused, '+ Novo Usuário');
  await view.open(); assert.equal(view.byId('new-user-name').props.value, ''); assert.equal(view.byId('new-user-email').props.value, '');
  assert.equal(fake.calls.length, 0); view.unmount();
});

test('Operator has neither directory/button nor directly rendered form, and causes no reads/invites', async () => {
  const fake = sdk(), view = mount(fake, 'operator'); await flush();
  assert.equal(view.text(), ''); assert.equal(fake.reads.length, 0); assert.equal(fake.calls.length, 0); view.unmount();
  const form = mount(fake, 'operator', 'NewUserForm'); await flush(); assert.equal(form.text(), ''); form.unmount();
});

for (const [changes, field, message] of [
  [{ displayName: ' ' }, 'new-user-name', /Informe o nome/], [{ email: '' }, 'new-user-email', /Informe o e-mail/],
  [{ email: 'invalid' }, 'new-user-email', /e-mail válido/], [{ role: '' }, 'new-user-role', /Selecione/],
]) test(`Form validation focuses ${field} and sends nothing`, async () => {
  const fake = sdk(), view = mount(fake); await flush(); await view.open(); await view.fill({ ...input, ...changes });
  await view.submit(); await flush(); assert.match(view.text(), message); assert.equal(view.focused, field);
  assert.equal(view.byId(field).props['aria-invalid'], true); assert.equal(fake.calls.length, 0); view.unmount();
});

for (const role of ['admin', 'operator']) test(`Form maps ${role}, closes/clears and refreshes the real list and counter after 201`, async () => {
  const fake = sdk({ addUser: true }), view = mount(fake); await flush(); await view.open(); await view.fill({ ...input, role });
  const before = fake.reads.length; await view.submit(); await flush();
  assert.equal(fake.calls[0].body.role, role); assert.equal(fake.calls.length, 1);
  assert.equal(view.nodes().filter(node => node.type === 'form').length, 0);
  assert.match(view.text(), /Convite enviado com sucesso para pessoa@example.com/);
  assert.match(view.text(), /Pessoa Convidada/); assert.match(view.text(), /2\s+usuários/);
  assert.match(view.text(), /Convite pendente/);
  assert.ok(fake.reads.length > before); assert.doesNotMatch(view.text(), /private|synthetic|UUID/);
  await view.open(); assert.equal(view.byId('new-user-name').props.value, ''); assert.equal(view.byId('new-user-role').props.value, ''); view.unmount();
});

test('Two submits before rerender produce one HTTP request; cancel and inputs stay disabled while sending', async () => {
  const gate = deferred(), fake = sdk({ deferred: gate }), view = mount(fake); await flush(); await view.open(); await view.fill();
  const first = view.submit(), second = view.submit(); await flush();
  assert.equal(fake.calls.length, 1); assert.ok(view.button('Enviando...').props.disabled);
  assert.ok(view.button('Cancelar').props.disabled); assert.ok(view.byId('new-user-email').props.disabled);
  view.button('Cancelar').props.onClick(); await flush(); assert.ok(view.byId('new-user-email'));
  gate.resolve(); await first; await second; await flush(); assert.equal(fake.calls.length, 1); view.unmount();
});

for (const options of [
  { status: 409, body: { error: 'private store' } },
  { status: 502, body: { partial: true } }, { networkError: true },
]) test(`Form handles ${JSON.stringify(options)} with no false success or list refresh`, async () => {
  const fake = sdk(options), view = mount(fake); await flush(); await view.open(); await view.fill();
  const before = fake.reads.length; await view.submit(); await flush();
  assert.equal(fake.reads.length, before); assert.doesNotMatch(view.text(), /Convite enviado com sucesso|private|synthetic/);
  assert.ok(view.nodes().some(node => node.props?.role === 'alert')); assert.equal(view.byId('new-user-email').props.value, input.email);
  if (options.status === 409) { assert.match(view.text(), /Já existe uma conta/); assert.equal(view.button('Enviar convite').props.disabled, false); }
  else { assert.match(view.text(), /revisão antes de tentar novamente/); assert.equal(view.button('Enviar convite').props.disabled, true);
    await view.submit(); await flush(); assert.equal(fake.calls.length, 1); }
  view.unmount();
});

test('Refresh failure after a successful invitation keeps success truthful and offers read-only retry', async () => {
  const fake = sdk(), view = mount(fake); await flush(); await view.open(); await view.fill(); fake.options.readError = true;
  await view.submit(); await flush(); assert.match(view.text(), /Convite enviado com sucesso/); assert.match(view.text(), /Não foi possível carregar/);
  fake.options.readError = false; view.button('Tentar novamente').props.onClick(); await flush();
  assert.match(view.text(), /Pessoa existente/); assert.equal(fake.calls.length, 1); view.unmount();
});

test('Changing account while getSession is pending stops dispatch, closes the form and hides prior feedback', async () => {
  const gate = deferred(), fake = sdk({ sessionDeferred: gate }), view = mount(fake); await flush(); await view.open(); await view.fill();
  const attempt = view.submit(); await flush();
  view.deps.user.currentUser = { ...view.deps.user.currentUser, id: 'another-account' }; view.render(); await flush();
  gate.resolve(); await attempt; await flush(); assert.equal(fake.calls.length, 0);
  assert.equal(view.nodes().filter(node => node.type === 'form').length, 0); assert.doesNotMatch(view.text(), /Convite enviado/); view.unmount();
});

test('Permission loss during an in-flight invitation suppresses late success and refresh', async () => {
  const gate = deferred(), fake = sdk({ deferred: gate }), view = mount(fake); await flush(); await view.open(); await view.fill();
  const attempt = view.submit(); await flush(); const reads = fake.reads.length;
  view.deps.user.currentUser = { ...view.deps.user.currentUser, role: 'operator' }; view.deps.user.canViewSettings = false;
  view.render(); await flush(); gate.resolve(); await attempt; await flush();
  assert.equal(view.text(), ''); assert.equal(fake.reads.length, reads); assert.equal(fake.calls.length, 1); view.unmount();
});

test('Unmount during dispatch never publishes late feedback or starts another request', async () => {
  const gate = deferred(), fake = sdk({ deferred: gate }), view = mount(fake); await flush(); await view.open(); await view.fill();
  const attempt = view.submit(); await flush(); const reads = fake.reads.length; view.unmount();
  gate.resolve(); await attempt; await flush(); assert.equal(fake.reads.length, reads); assert.equal(fake.calls.length, 1);
});

test('After an invitation, acceptance and reopening replace Pending with Active without another send', async () => {
  const fake = sdk({ addUser: true }), view = mount(fake); await flush(); await view.open(); await view.fill();
  await view.submit(); await flush(); assert.match(view.text(), /Convite pendente/); view.unmount();
  fake.options.accepted = true;
  const reopened = mount(fake); await flush();
  assert.doesNotMatch(reopened.text(), /Convite pendente/); assert.match(reopened.text(), /2\s+usuários/);
  const row = reopened.nodes().find(node => node.type === 'tr' && reopened.text(node).includes('Pessoa Convidada'));
  assert.match(reopened.text(row), /Ativo/); assert.equal(fake.calls.length, 1); reopened.unmount();
});

const editId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const editInput = { targetUserId: editId, role: 'operator' };
const editingSdk = options => sdk({ targetId: editId, ...options });
const openEdit = async view => {
  const button = view.nodes().find(node => node.type === 'button' && view.text(node) === 'Editar');
  button.props.onClick({ currentTarget: { focus() {} } }); await flush();
};
const changeEdit = async (view, changes) => {
  if (changes.role !== undefined) view.byId('edit-user-role').props.onChange({ target: { value: changes.role } });
  if (changes.active !== undefined) view.byId('edit-user-active').props.onChange({ target: { value: changes.active ? 'active' : 'inactive' } });
  await flush();
};

test('Update service strips arbitrary scope/identity fields and sends only changed fields with the caller JWT', async () => {
  const fake = editingSdk(), api = load(fake);
  const result = await api.updateStoreUser({ ...editInput, store_id: 'outside', actor_id: 'other', email: 'private@example.com' }, context);
  assert.deepEqual(result, { id: editId, role: 'operator', active: true });
  assert.deepEqual(fake.updates[0].body, { action: 'update_user', ...editInput });
  assert.equal(fake.updates[0].init.headers.Authorization, 'Bearer synthetic-session-token');
  assert.equal(fake.calls.length, 0);
});

for (const changes of [{ targetUserId: 'bad' }, { role: 'developer' }, { role: null }, { active: 'false' }, { active: null }]) {
  test(`Update service rejects malformed commercial changes ${JSON.stringify(changes)}`, async () => {
    const fake = editingSdk();
    await assert.rejects(load(fake).updateStoreUser({ ...editInput, ...changes }, context));
    assert.equal(fake.updates.length, 0); assert.equal(fake.sessionReads, 0);
  });
}

for (const options of [{ noSession: true }, { wrongAccount: true }, { sessionError: true }]) test(`Edit session rejects without dispatch: ${JSON.stringify(options)}`, async () => {
  const fake = editingSdk(options);
  await assert.rejects(load(fake).updateStoreUser(editInput, context), /sessão mudou ou expirou/);
  assert.equal(fake.updates.length, 0);
});

for (const [editStatus, code, message, review] of [
  [409, 'last_active_admin', /pelo menos um Proprietário ativo/, false],
  [403, 'developer_not_editable', /Desenvolvedores não podem ser editados/, false],
  [404, 'target_not_found', /não encontrado nesta loja/, false],
  [400, 'invalid_role', /Selecione Proprietário ou Operador/, false],
  [401, 'unauthenticated', /sessão expirou/, false], [403, 'forbidden', /não tem permissão/, false],
  [503, 'update_unavailable', /indisponível.*atualize a lista/, true],
  [409, 'target_changed', /mudou durante a edição/, true],
]) test(`Real SDK edit error ${editStatus}/${code} is friendly and sanitized`, async () => {
  const fake = editingSdk({ editStatus, editBody: { code, error: 'private server stack' } });
  await assert.rejects(load(fake).updateStoreUser(editInput, context), error => {
    assert.match(error.message, message); assert.doesNotMatch(error.message, /private|stack|synthetic/);
    assert.equal(error.reviewRequired, review); return true;
  });
  assert.equal(fake.updates.length, 1);
});

for (const callerRole of ['admin', 'developer']) test(`${callerRole} opens a simple edit panel with readonly name and commercial options`, async () => {
  const fake = editingSdk(), view = mount(fake, callerRole); await flush(); await openEdit(view);
  assert.equal(view.byId('edit-user-name').props.readOnly, true);
  assert.equal(view.byId('edit-user-name').props.value, 'Pessoa existente');
  assert.deepEqual(view.nodes().filter(node => node.type === 'option').map(node => [node.props.value, view.text(node)]),
    [['admin', 'Proprietário'], ['operator', 'Operador'], ['active', 'Ativo'], ['inactive', 'Inativo']]);
  assert.equal(view.focused, 'edit-user-role'); assert.equal(view.button('+ Novo Usuário').props.disabled, true);
  view.button('Cancelar').props.onClick(); await flush();
  assert.equal(view.byId('edit-user-role'), undefined); assert.equal(fake.updates.length, 0); view.unmount();
});

test('Developer target has no edit action, including directly rendered EditUserForm', async () => {
  const fake = editingSdk({ targetRole: 'developer' }), view = mount(fake); await flush();
  assert.equal(view.nodes().filter(node => node.type === 'button' && view.text(node) === 'Editar').length, 0); view.unmount();
  const direct = mount(fake, 'developer', 'EditUserForm', { user: { id: editId, name: 'Developer', role: 'developer', membershipActive: true }, onCancel() {}, onSuccess() {} });
  await flush(); assert.equal(direct.text(), ''); assert.equal(fake.updates.length, 0); direct.unmount();
});

test('Operator cannot display the directory or a directly rendered edit form', async () => {
  const fake = editingSdk(), view = mount(fake, 'operator'); await flush(); assert.equal(view.text(), ''); view.unmount();
  const direct = mount(fake, 'operator', 'EditUserForm', { user: { id: editId, role: 'admin', membershipActive: true } });
  await flush(); assert.equal(direct.text(), ''); assert.equal(fake.reads.length, 0); assert.equal(fake.updates.length, 0); direct.unmount();
});

for (const [options, changes, label] of [
  [{ targetRole: 'operator' }, { role: 'admin' }, /Proprietário/],
  [{}, { role: 'operator' }, /Operador/], [{ targetRole: 'operator' }, { active: false }, /Inativo/],
  [{ targetRole: 'operator', targetActive: false }, { active: true }, /Ativo/],
]) test(`Edit success updates role/status, closes panel and preserves count: ${JSON.stringify(changes)}`, async () => {
  const fake = editingSdk(options), view = mount(fake); await flush(); await openEdit(view); await changeEdit(view, changes);
  const readsBefore = fake.reads.length; await view.submit(); await flush();
  assert.equal(view.byId('edit-user-role'), undefined); assert.match(view.text(), /Usuário (atualizado|desativado) com sucesso/);
  assert.match(view.text(), label); assert.match(view.text(), /1\s+usuário/); assert.ok(fake.reads.length > readsBefore);
  assert.deepEqual(fake.updates[0].body, { action: 'update_user', targetUserId: editId, ...changes });
  assert.equal(fake.calls.length, 0); view.unmount();
});

test('Pending invitation may be disabled and reenabled without cancelling or resending Auth invitation', async () => {
  const fake = editingSdk({ pendingIds: [editId] }), view = mount(fake); await flush(); assert.match(view.text(), /Convite pendente/);
  await openEdit(view); await changeEdit(view, { active: false }); await view.submit(); await flush();
  assert.match(view.text(), /Inativo/); assert.doesNotMatch(view.text(), /Convite pendente/);
  await openEdit(view); await changeEdit(view, { active: true }); await view.submit(); await flush();
  assert.match(view.text(), /Convite pendente/); assert.equal(fake.calls.length, 0); view.unmount();
});

test('Edit status reads the membership flag even when profile is inactive', async () => {
  const fake = editingSdk({ profileActive: false }), view = mount(fake); await flush(); assert.match(view.text(), /Inativo/);
  await openEdit(view); assert.equal(view.byId('edit-user-active').props.value, 'active');
  await changeEdit(view, { role: 'operator' }); await view.submit(); await flush();
  assert.deepEqual(fake.updates[0].body, { action: 'update_user', targetUserId: editId, role: 'operator' });
  assert.match(view.text(), /Inativo/); assert.equal(fake.profiles[0].active, false); view.unmount();
});

test('Two edit submissions before rerender dispatch only once and disable controls', async () => {
  const gate = deferred(), fake = editingSdk({ editDeferred: gate }), view = mount(fake); await flush(); await openEdit(view); await changeEdit(view, { active: false });
  const first = view.submit(), second = view.submit(); await flush();
  assert.equal(fake.updates.length, 1); assert.equal(view.button('Salvando...').props.disabled, true);
  assert.equal(view.button('Cancelar').props.disabled, true); assert.equal(view.byId('edit-user-role').props.disabled, true);
  view.button('Cancelar').props.onClick(); await flush(); assert.ok(view.byId('edit-user-role'));
  gate.resolve(); await first; await second; await flush(); assert.equal(fake.updates.length, 1); view.unmount();
});

test('Last-owner failure keeps the panel open, shows friendly error and does not refresh', async () => {
  const fake = editingSdk({ editStatus: 409, editBody: { code: 'last_active_admin' } }), view = mount(fake);
  await flush(); await openEdit(view); await changeEdit(view, { active: false }); const reads = fake.reads.length;
  await view.submit(); await flush(); assert.match(view.text(), /pelo menos um Proprietário ativo/);
  assert.ok(view.byId('edit-user-active')); assert.equal(fake.reads.length, reads); assert.doesNotMatch(view.text(), /com sucesso/); view.unmount();
});

test('Network uncertainty blocks repeat saves until closing and refreshing the list', async () => {
  const fake = editingSdk({ editNetworkError: true }), view = mount(fake); await flush(); await openEdit(view); await changeEdit(view, { role: 'operator' });
  await view.submit(); await flush(); assert.match(view.text(), /Não foi possível confirmar.*atualize a lista/);
  assert.equal(view.button('Salvar').props.disabled, true); await view.submit(); assert.equal(fake.updates.length, 1);
  const reads = fake.reads.length; view.button('Cancelar').props.onClick(); await flush(); assert.ok(fake.reads.length > reads); view.unmount();
});

test('Read failure after a saved edit retains success and retry only reads', async () => {
  const fake = editingSdk(), view = mount(fake); await flush(); await openEdit(view); await changeEdit(view, { active: false }); fake.options.readError = true;
  await view.submit(); await flush(); assert.match(view.text(), /Usuário desativado com sucesso/); assert.match(view.text(), /Não foi possível carregar/);
  fake.options.readError = false; view.button('Tentar novamente').props.onClick(); await flush();
  assert.match(view.text(), /Inativo/); assert.equal(fake.updates.length, 1); view.unmount();
});

for (const changes of [{ role: 'operator' }, { active: false }]) test(`Changing own access reloads the identity instead of using stale permissions: ${JSON.stringify(changes)}`, async () => {
  const fake = editingSdk({ callerId: editId }), view = mount(fake); await flush(); await openEdit(view); await changeEdit(view, changes);
  await view.submit(); await flush(); assert.equal(fake.reloads, 1); assert.equal(view.byId('edit-user-role'), undefined); view.unmount();
});

test('Account change while edit getSession waits prevents dispatch and discards the old panel', async () => {
  const gate = deferred(), fake = editingSdk({ sessionDeferred: gate }), view = mount(fake); await flush(); await openEdit(view); await changeEdit(view, { role: 'operator' });
  const attempt = view.submit(); await flush(); view.deps.user.currentUser = { ...view.deps.user.currentUser, id: 'other' }; view.render(); await flush();
  gate.resolve(); await attempt; await flush(); assert.equal(fake.updates.length, 0); assert.equal(view.byId('edit-user-role'), undefined); view.unmount();
});

test('Unmount during edit does not show late feedback or refresh', async () => {
  const gate = deferred(), fake = editingSdk({ editDeferred: gate }), view = mount(fake); await flush(); await openEdit(view); await changeEdit(view, { active: false });
  const attempt = view.submit(); await flush(); const reads = fake.reads.length; view.unmount();
  gate.resolve(); await attempt; await flush(); assert.equal(fake.reads.length, reads); assert.equal(fake.updates.length, 1);
});

test('Saving unchanged values closes without writing', async () => {
  const fake = editingSdk(), view = mount(fake); await flush(); await openEdit(view); await view.submit(); await flush();
  assert.equal(fake.updates.length, 0); assert.equal(view.byId('edit-user-role'), undefined); view.unmount();
});

for (const user of [
  { id: 'outside', role: 'operator', active: true }, { id: editId, role: 'developer', active: true },
  { id: editId, role: 'operator', active: 'true' }, { id: editId, role: 'admin', active: true },
]) test(`Malformed/mismatched edit success does not report saved: ${JSON.stringify(user)}`, async () => {
  const fake = editingSdk({ editBody: { success: true, user } });
  await assert.rejects(load(fake).updateStoreUser(editInput, context), error => error.reviewRequired && /Não foi possível confirmar/.test(error.message));
  assert.equal(fake.updates.length, 1);
});

test('Permission loss while edit is in flight suppresses late success and reload', async () => {
  const gate = deferred(), fake = editingSdk({ editDeferred: gate }), view = mount(fake); await flush(); await openEdit(view); await changeEdit(view, { active: false });
  const attempt = view.submit(); await flush(); const reads = fake.reads.length;
  view.deps.user.canViewSettings = false; view.deps.user.currentUser = { ...view.deps.user.currentUser, role: 'operator' }; view.render(); await flush();
  gate.resolve(); await attempt; await flush(); assert.equal(view.text(), ''); assert.equal(fake.reads.length, reads); assert.equal(fake.reloads, 0); view.unmount();
});

test('Editing the role of an already inactive user reports an update, without claiming a new deactivation', async () => {
  const fake = editingSdk({ targetRole: 'operator', targetActive: false }), view = mount(fake);
  await flush(); await openEdit(view); await changeEdit(view, { role: 'admin' }); await view.submit(); await flush();
  assert.match(view.text(), /Usuário atualizado com sucesso/); assert.doesNotMatch(view.text(), /Usuário desativado com sucesso/);
  assert.match(view.text(), /Inativo/); view.unmount();
});
