import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
  export * from './src/services/conditionTemplatesService';
  export * from './src/utils/draft';
  export * from './src/utils/registrationSnapshot';
  export { default as Manager } from './src/components/ConditionTemplateManager';
  export { default as Picker } from './src/components/magazord/UsedConditionTemplatePicker';
  export { default as Synopsis } from './src/components/magazord/SynopsisSection';
` }, bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
  plugins: [{ name: 'offline', setup(builder) {
    const mocks = [[/^react$/, 'exports.useState=(...args)=>deps.react.useState(...args);exports.useRef=(...args)=>deps.react.useRef(...args);exports.useEffect=(...args)=>deps.react.useEffect(...args)'],
      [/^react\/jsx-runtime$/, 'exports.jsx=exports.jsxs=(type,props,key)=>({type,props,key})'],
      [/^lucide-react$/, 'module.exports=new Proxy({},{get:(_,key)=>String(key)})'],
      [/\/lib\/supabase$/, 'exports.supabase=deps.supabase'],
      [/\/contexts\/UserContext$/, 'exports.useUser=()=>deps.user']];
    builder.onResolve({ filter: /.*/ }, args => {
      const mock = mocks.find(([pattern]) => pattern.test(args.path));
      return mock ? { path: args.path, namespace: 'mock', pluginData: mock[1] } : undefined;
    });
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: args.pluginData, loader: 'js' }));
  } }],
});
const storeId = '11111111-2222-3333-4444-555555555555';
const otherStore = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const actor = { id: '22222222-3333-4444-5555-666666666666', storeId, role: 'admin', active: true };
const key = 'used_book_condition_templates';
// Synthetic fixture text is used only in isolated tests and is never seeded in the application.
const model = { id: 'stable-model-id', name: 'Modelo aprovado de teste', text: 'Texto controlado de teste.', active: true };
const config = items => ({ version: 1, items });
const settings = (items = [model]) => ({ unrelated: { nested: ['keep', null, false], number: 7 }, [key]: config(items) });
function canonical(value) {
  return value && typeof value === 'object' ? Array.isArray(value) ? `[${value.map(canonical)}]`
    : `{${Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k]))}}` : JSON.stringify(value);
}

function setup(initial = settings(), options = {}) {
  const rows = new Map(initial === null ? [] : [[storeId, structuredClone(initial)]]);
  rows.set(otherStore, { other: 'foreign config' });
  const calls = [], releases = [];
  const deps = { user: { currentUser: { ...actor } }, supabase: {
    auth: {
      getUser: async () => ({ data: { user: options.noSession ? null : { id: options.actorId ?? actor.id } }, error: null }),
      getSession: async () => ({ data: { session: { user: { id: options.lateActorId ?? actor.id } } }, error: null }),
    },
    from(table) {
      assert.ok(['store_users', 'store_settings'].includes(table));
      const call = { table, action: 'read', filters: [] }; calls.push(call);
      const query = {
        select(columns) { call.columns = columns; return this; },
        eq(field, value) { call.filters.push([field, value]); return this; },
        update(payload) { call.action = 'update'; call.payload = payload; return this; },
        insert(payload) { call.action = 'insert'; call.payload = payload; return this; },
        abortSignal(signal) { call.signal = signal; return this; },
        async maybeSingle() {
          if (options.deferRead && table === 'store_settings' && call.action === 'read') await new Promise(resolve => releases.push(resolve));
          if (call.signal?.aborted) return { data: null, error: { message: 'aborted' } };
          const target = call.filters.find(([f]) => f === 'store_id')?.[1] ?? call.payload?.store_id;
          if (table === 'store_users') {
            const userId = call.filters.find(([f]) => f === 'user_id')?.[1];
            return { data: target === storeId && userId === actor.id && !options.noMembership
              ? { store_id: storeId, user_id: actor.id, role: options.serverRole ?? deps.user.currentUser.role, active: options.active !== false } : null, error: null };
          }
          if (call.action === 'read') return options.readError ? { data: null, error: { message: 'private details' } }
            : { data: rows.has(target) ? { store_id: options.leak ? otherStore : target, settings: structuredClone(rows.get(target)) } : null, error: null };
          assert.equal(target, storeId);
          options.beforeWrite?.(rows);
          if (options.writeError) return { data: null, error: { message: 'private details', code: '42501' } };
          if (call.action === 'insert' && rows.has(target)) return { data: null, error: { code: '23505' } };
          if (call.action === 'update') {
            const old = call.filters.find(([f]) => f === 'settings');
            assert.ok(old, 'Every UPDATE must compare the entire original JSONB');
            if (!rows.has(target) || canonical(JSON.parse(old[1])) !== canonical(rows.get(target))) return { data: null, error: null };
          }
          rows.set(target, structuredClone(call.payload.settings));
          if (options.lostResponse) throw new Error('private transport details');
          return { data: options.noReturn ? null : { store_id: target, settings: options.mismatch ? {} : structuredClone(rows.get(target)) }, error: null };
        },
      };
      return query;
    },
  } };
  const module = { exports: {} };
  new Function('deps', 'module', 'exports', bundle.outputFiles[0].text)(deps, module, module.exports);
  return { api: module.exports, deps, rows, calls, options, releases,
    writes: () => calls.filter(call => call.table === 'store_settings' && call.action !== 'read') };
}

test('Absent settings rows and absent keys are empty configurations without automatic seeding or writes', async () => {
  for (const initial of [null, { other: 'preserved' }]) {
    const app = setup(initial), result = await app.api.loadConditionTemplates(actor);
    assert.deepEqual(result.templates, []); assert.equal(result.exists, initial !== null);
    assert.equal(app.writes().length, 0);
    const saved = await app.api.saveConditionTemplates(actor, result, [model]);
    assert.equal(saved.templates[0].id, model.id);
    assert.equal(app.writes()[0].action, initial === null ? 'insert' : 'update');
    if (initial) assert.equal(saved.settings.other, 'preserved');
  }
});

for (const role of ['admin', 'developer']) {
  test(`${role} can create, edit, deactivate and delete a model, preserving unrelated settings and stable IDs`, async () => {
    const app = setup({ other: { preserve: true } }); app.deps.user.currentUser.role = role;
    const user = { ...actor, role };
    let base = await app.api.loadConditionTemplates(user);
    base = await app.api.saveConditionTemplates(user, base, [model]);
    base = await app.api.saveConditionTemplates(user, base, [{ ...model, name: 'Nome revisto', text: 'Texto revisto.' }]);
    assert.equal(base.templates[0].id, model.id);
    base = await app.api.saveConditionTemplates(user, base, [{ ...base.templates[0], active: false }]);
    assert.equal(base.templates[0].active, false);
    base = await app.api.saveConditionTemplates(user, base, []);
    assert.deepEqual(base.templates, []); assert.deepEqual(base.settings.other, { preserve: true });
    assert.ok(app.writes().every(call => !Object.hasOwn(call.payload, 'default_location') && call.payload.updated_by === actor.id));
    assert.deepEqual(app.rows.get(otherStore), { other: 'foreign config' });
  });
}

test('Operator may read but cannot save; inactive, revoked, forged or changed accounts cannot write', async () => {
  const operator = setup(); operator.deps.user.currentUser.role = 'operator';
  const user = { ...actor, role: 'operator' };
  const base = await operator.api.loadConditionTemplates(user);
  await assert.rejects(operator.api.saveConditionTemplates(user, base, []), { code: 'permission' });
  assert.equal(operator.writes().length, 0);
  for (const options of [{ active: false }, { noSession: true }, { serverRole: 'operator' }, { lateActorId: 'different-account' }]) {
    const app = setup(settings(), options);
    await assert.rejects(app.api.saveConditionTemplates(actor, { storeId, exists: true, settings: settings(), templates: [model] }, []), { code: 'permission' });
    assert.equal(app.writes().length, 0);
  }
});

test('Reads and saves are scoped to the actor store and reject foreign snapshots or leaked rows', async () => {
  const app = setup();
  await assert.rejects(app.api.loadConditionTemplates({ ...actor, storeId: otherStore }), { code: 'permission' });
  const base = await app.api.loadConditionTemplates(actor);
  await assert.rejects(app.api.saveConditionTemplates(actor, { ...base, storeId: otherStore }, []), { code: 'invalid' });
  const leaked = setup(settings(), { leak: true });
  await assert.rejects(leaked.api.loadConditionTemplates(actor), { code: 'invalid' });
  assert.equal(app.writes().length, 0);
});

test('Malformed or future-version configurations are never silently replaced', async () => {
  for (const value of [null, [], { version: 2, items: [] }, config([model, model]), config([{ ...model, text: ' ' }])]) {
    const app = setup({ other: 7, [key]: value });
    await assert.rejects(app.api.loadConditionTemplates(actor), { code: 'invalid' });
    assert.equal(app.writes().length, 0);
  }
});

test('Concurrent template changes and unrelated setting changes cause conflicts instead of overwrites', async () => {
  for (const concurrent of [settings([{ ...model, text: 'Concorrente' }]), { ...settings(), otherSetting: 'concurrent value' }]) {
    const app = setup(), base = await app.api.loadConditionTemplates(actor);
    app.options.beforeWrite = rows => rows.set(storeId, concurrent);
    await assert.rejects(app.api.saveConditionTemplates(actor, base, []), { code: 'conflict' });
    assert.deepEqual(app.rows.get(storeId), concurrent);
    assert.equal(app.writes().length, 1);
  }
  const app = setup(), first = await app.api.loadConditionTemplates(actor), second = await app.api.loadConditionTemplates(actor);
  await app.api.saveConditionTemplates(actor, first, [{ ...model, name: 'Primeiro editor' }]);
  await assert.rejects(app.api.saveConditionTemplates(actor, second, []), { code: 'conflict' });
  assert.equal(app.rows.get(storeId)[key].items[0].name, 'Primeiro editor');
});

test('Concurrent creation uses INSERT and a primary-key conflict, never upsert or destructive retry', async () => {
  const app = setup(null), base = await app.api.loadConditionTemplates(actor);
  app.rows.set(storeId, { concurrent: true });
  await assert.rejects(app.api.saveConditionTemplates(actor, base, [model]), { code: 'conflict' });
  assert.deepEqual(app.rows.get(storeId), { concurrent: true });
  assert.equal(app.writes().length, 1); assert.equal(app.writes()[0].action, 'insert');
});

test('Denied reads, writes, lost responses and missing/mismatched returned rows never report success', async () => {
  const denied = setup(settings(), { readError: true });
  await assert.rejects(denied.api.loadConditionTemplates(actor), error => error.code === 'load' && !error.message.includes('private'));
  for (const options of [{ writeError: true }, { lostResponse: true }, { noReturn: true }, { mismatch: true }]) {
    const app = setup(settings(), options), base = await app.api.loadConditionTemplates(actor);
    await assert.rejects(app.api.saveConditionTemplates(actor, base, []), error => ['save', 'conflict'].includes(error.code) && !error.message.includes('private'));
    assert.equal(app.writes().length, 1);
  }
});

const flush = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
function mount(app, Component, props = {}) {
  const instances = new Map(); let current, cursor, dirty, tree, effects, visited;
  app.deps.react = {
    useState(initial) {
      const instance = current, index = cursor++;
      if (!(index in instance.slots)) instance.slots[index] = typeof initial === 'function' ? initial() : initial;
      return [instance.slots[index], next => {
        if (!instance.mounted) return;
        const value = typeof next === 'function' ? next(instance.slots[index]) : next;
        if (!Object.is(value, instance.slots[index])) { instance.slots[index] = value; dirty = true; }
      }];
    },
    useRef(initial) { const index = cursor++; return current.slots[index] ??= { current: initial }; },
    useEffect(callback, dependencies) {
      const instance = current, index = cursor++, old = instance.slots[index];
      if (!old || dependencies.some((value, i) => !Object.is(value, old.dependencies[i]))) {
        effects.push(() => { old?.cleanup?.(); instance.slots[index] = { dependencies, cleanup: callback() }; });
      }
    },
  };
  function expand(node, path) {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map((child, index) => expand(child, `${path}.${index}`));
    if (typeof node.type === 'function') {
      const id = `${path}:${node.key ?? node.type.name}`;
      let instance = instances.get(id);
      if (!instance) { instance = { slots: [], mounted: true }; instances.set(id, instance); }
      visited.add(id); current = instance; cursor = 0;
      return expand(node.type(node.props), id);
    }
    return { ...node, props: { ...node.props, children: expand(node.props?.children, `${path}.children`) } };
  }
  function render() {
    let passes = 0;
    do {
      assert.ok(++passes < 15); dirty = false; effects = []; visited = new Set();
      tree = expand({ type: Component, props }, 'root');
      for (const [id, instance] of instances) if (!visited.has(id)) {
        instance.mounted = false; instance.slots.forEach(slot => slot?.cleanup?.()); instances.delete(id);
      }
      effects.forEach(effect => effect());
    } while (dirty);
  }
  const nodes = (node = tree) => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(child => nodes(child ?? null))
    : [node, ...nodes(node.props?.children ?? null)];
  const text = (node = tree) => node == null || typeof node === 'boolean' ? '' : typeof node !== 'object' ? String(node)
    : Array.isArray(node) ? node.map(child => text(child ?? null)).join('') : text(node.props?.children ?? null);
  render();
  return { render, props, nodes, text, find: predicate => nodes().find(predicate),
    button: label => nodes().find(node => node.type === 'button' && text(node) === label),
    async settle() { render(); await flush(); render(); },
    change(id, value) { nodes().find(node => node.props?.id === id).props.onChange({ target: { value } }); render(); },
  };
}

test('Administrative UI creates and edits models, toggles active status, and requires confirmation before deletion', async () => {
  const app = setup({ other: 'keep' }), view = mount(app, app.api.Manager);
  await view.settle(); assert.match(view.text(), /Nenhum modelo cadastrado/);
  view.button('Adicionar modelo').props.onClick(); view.render();
  view.change('condition-template-name', 'Nome aprovado de teste');
  view.change('condition-template-text', 'Texto aprovado de teste.');
  const submit = () => view.find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  submit(); submit(); await view.settle();
  assert.equal(app.writes().length, 1); assert.match(view.text(), /Modelos salvos/);
  const id = app.rows.get(storeId)[key].items[0].id;
  view.button('Editar').props.onClick(); view.render();
  view.change('condition-template-text', 'Texto editado.'); submit(); await view.settle();
  assert.equal(app.rows.get(storeId)[key].items[0].id, id);
  assert.equal(app.rows.get(storeId)[key].items[0].text, 'Texto editado.');
  view.button('Desativar').props.onClick(); await view.settle();
  assert.equal(app.rows.get(storeId)[key].items[0].active, false);
  view.button('Ativar').props.onClick(); await view.settle();
  assert.equal(app.rows.get(storeId)[key].items[0].active, true);
  view.button('Excluir').props.onClick(); view.render();
  const before = app.writes().length;
  view.button('Cancelar exclusão').props.onClick(); view.render(); assert.equal(app.writes().length, before);
  view.button('Excluir').props.onClick(); view.render();
  view.button('Confirmar exclusão').props.onClick(); await view.settle();
  assert.deepEqual(app.rows.get(storeId)[key].items, []); assert.equal(app.rows.get(storeId).other, 'keep');
});

test('Administrative UI hides from operators and displays persistence failure without a success notice', async () => {
  const operator = setup(); operator.deps.user.currentUser.role = 'operator';
  const hidden = mount(operator, operator.api.Manager); await hidden.settle();
  assert.equal(hidden.find(node => node.type === 'section'), undefined); assert.equal(operator.calls.length, 0);
  const app = setup(settings(), { writeError: true }), view = mount(app, app.api.Manager); await view.settle();
  view.button('Desativar').props.onClick(); await view.settle();
  assert.match(view.text(), /Não foi possível confirmar/); assert.doesNotMatch(view.text(), /Modelos salvos/);
  assert.match(view.text(), /\(Ativo\)/);
});

test('Picker offers only active store models and never fills notes before explicit selection', async () => {
  const app = setup(settings([model, { ...model, id: 'inactive', name: 'Inativo', active: false }]));
  app.deps.user.currentUser.role = 'operator';
  const selected = [], view = mount(app, app.api.Picker, { onSelect: value => selected.push(value) }); await view.settle();
  assert.equal(view.nodes().filter(node => node.type === 'option').length, 2);
  assert.doesNotMatch(view.text(), /Inativo/); assert.deepEqual(selected, []);
  view.change('used-condition-template', model.id); assert.deepEqual(selected, [model.text]);
  assert.equal(view.find(node => node.type === 'select').props.value, '');
});

test('Selection fills existing used notes, free editing preserves composition, and model deletion leaves historical snapshots intact', async () => {
  const app = setup(), draft = app.api.createRegistrationDraft({ id: 'book', title: 'Livro', synopsis: 'Sinopse original' }, 'usado');
  const props = { draft, onChange: update => Object.assign(draft, update) };
  const view = mount(app, app.api.Synopsis, props); await view.settle();
  assert.equal(draft.usedBookConditionNotes, '');
  view.change('used-condition-template', model.id);
  assert.equal(draft.usedConditionTemplateId, model.id);
  assert.equal(draft.usedBookConditionNotes, model.text); assert.equal(draft.description, model.text + '\n\nSinopse original');
  const notes = view.find(node => node.type === 'textarea' && node.props.placeholder?.includes('Bom estado'));
  notes.props.onChange({ target: { value: 'Texto livre ajustado pelo operador.' } }); view.render();
  const historical = app.api.createRegistrationSnapshot(draft, '2026-10-21T12:00:00Z'), before = JSON.stringify(historical);
  const base = await app.api.loadConditionTemplates(actor);
  await app.api.saveConditionTemplates(actor, base, []);
  const reopened = mount(app, app.api.Synopsis, props); await reopened.settle();
  assert.equal(draft.usedBookConditionNotes, 'Texto livre ajustado pelo operador.');
  assert.equal(draft.usedConditionTemplateId, model.id);
  assert.equal(reopened.find(node => node.type === 'select').props.value, model.id);
  assert.equal(draft.description, 'Texto livre ajustado pelo operador.\n\nSinopse original');
  assert.equal(JSON.stringify(historical), before);
  assert.equal(app.api.readRegistrationSnapshot(historical).fields.usedBookConditionNotes, 'Texto livre ajustado pelo operador.');
  const novo = mount(app, app.api.Synopsis, { ...props, draft: { ...draft, condition: 'novo' } }); await novo.settle();
  assert.equal(novo.find(node => node.props?.id === 'used-condition-template'), undefined);
});

test('A failed read keeps manual notes usable and permits an explicit read retry', async () => {
  const app = setup(settings(), { readError: true });
  const draft = app.api.createRegistrationDraft({ id: 'book', title: 'Livro' }, 'usado');
  const view = mount(app, app.api.Synopsis, { draft, onChange: update => Object.assign(draft, update) }); await view.settle();
  assert.match(view.text(), /Não foi possível carregar/);
  const input = view.find(node => node.type === 'textarea' && node.props.placeholder?.includes('Bom estado'));
  input.props.onChange({ target: { value: 'Observações manuais' } }); view.render(); assert.equal(draft.usedBookConditionNotes, 'Observações manuais');
  app.options.readError = false; view.button('Recarregar modelos').props.onClick(); await view.settle();
  assert.match(view.text(), /Modelo aprovado de teste/); assert.equal(draft.usedBookConditionNotes, 'Observações manuais');
});

test('Store/account changes hide loaded models immediately and discard late requests', async () => {
  const app = setup(settings(), { deferRead: true }), view = mount(app, app.api.Picker, { onSelect() {} });
  await flush(); assert.equal(app.releases.length, 1);
  app.deps.user.currentUser = { ...actor, storeId: otherStore }; view.render();
  assert.doesNotMatch(view.text(), /Modelo aprovado de teste/);
  app.releases.shift()(); await view.settle();
  assert.doesNotMatch(view.text(), /Modelo aprovado de teste/);
  assert.equal(view.find(node => node.type === 'select').props.disabled, true);
});
