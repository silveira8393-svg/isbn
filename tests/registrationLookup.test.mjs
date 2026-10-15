import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function compile(entry) {
  const output = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    plugins: [{ name: 'isolated-readonly-view', setup(builder) {
      const mocks = [[/^react$/, 'module.exports=deps.react'], [/^react\/jsx-runtime$/, 'exports.jsx=exports.jsxs=(type,props)=>({type,props})'],
        [/\/contexts\/UserContext$/, 'exports.useUser=()=>deps.user']];
      builder.onResolve({ filter: /.*/ }, args => {
        const mock = mocks.find(([pattern]) => pattern.test(args.path));
        return mock ? { path: args.path, namespace: 'mock', pluginData: mock[1] } : undefined;
      });
      builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: args.pluginData, loader: 'js' }));
    } }],
  });
  return deps => { const module = { exports: {} }; new Function('deps', 'module', 'exports', output.outputFiles[0].text)(deps, module, module.exports); return module.exports; };
}
const factory = await compile('src/components/dashboard/RegistrationLookup.tsx');
const snapshot = (await compile('src/utils/registrationSnapshot.ts'))({});
const storeId = '11111111-2222-3333-4444-555555555555';
const userId = '22222222-3333-4444-5555-666666666666';
const row = (id, overrides = {}) => ({ id, store_id: storeId, user_id: userId, environment: 'production',
  operation_type: 'used_copy_created', status: 'success', condition: 'used', title: 'História da Livraria', isbn: '9788535914849',
  parent_code: `P-${id}`, child_code: `C-${id}`, created_at: '2026-10-14T12:00:00Z', completed_at: '2026-10-14T12:01:00Z', metadata: {}, ...overrides });
const draft = { condition: 'usado', title: 'Título final', authors: ['Autor'], publisher: 'Editora', price: '19,90',
  quantity: 1, usedBookConditionNotes: 'Assinatura na primeira página', synopsis: 'Sinopse', description: 'Descrição',
  mainImageUrl: 'https://example.com/capa.jpg', additionalImageUrls: ['data:image/png;base64,AAAA', 'https://example.com/extra.jpg'] };

function mount(operations, role = 'admin') {
  const deps = { user: { currentUser: { id: userId, storeId, role, active: true }, canViewProduction: role !== 'operator' } };
  const slots = []; let cursor = 0, tree;
  deps.react = { useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial;
    return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; render(); }]; } };
  const api = factory(deps); const props = { operations, names: { [userId]: 'Operador' } };
  function render() { cursor = 0; tree = api.default(props); }
  const nodes = (node = tree) => node == null || typeof node !== 'object' ? [] : Array.isArray(node)
    ? node.flatMap(child => nodes(child ?? null)) : [node, ...nodes(node.props?.children ?? null)];
  const text = (node = tree) => node == null || typeof node === 'boolean' ? '' : typeof node !== 'object' ? String(node)
    : Array.isArray(node) ? node.map(child => text(child ?? null)).join(' ') : text(node.props?.children ?? null);
  render();
  return { deps, props, render, nodes, text, find: predicate => nodes().find(predicate),
    search(value) { nodes().find(n => n.props?.id === 'registration-search').props.onChange({ target: { value } }); },
    open(id) { const tr = nodes().find(n => n.props?.['data-registration-id'] === id); nodes(tr).find(n => n.type === 'button').props.onClick(); } };
}

test('ISBN normalization and partial title search retain individual used copies and exclude movements/errors', () => {
  const api = factory({});
  const rows = [row('A'), row('B'), row('new', { operation_type: 'new_product_created', condition: 'new' }),
    row('reuse', { operation_type: 'new_product_reused', condition: 'new' }), row('error', { status: 'error' }), row('pending', { status: 'pending' }),
    row('inconsistent', { operation_type: 'new_product_created' })];
  for (const query of ['historia', 'LIVRARIA', '978-8535914849', '978853']) assert.equal(api.registrationRows(rows, query).length, 3);
  assert.equal(api.registrationRows(rows, 'absent').length, 0);
});

test('Versioned snapshots allow only product data and public image URLs, excluding binary/signed credentials', () => {
  const before = structuredClone(draft);
  const result = snapshot.createRegistrationSnapshot({ ...draft, access_token: 'secret', email: 'private@example.com',
    mainImageUrl: 'https://user:pass@example.com/a.jpg',
    additionalImageUrls: ['data:image/png;base64,AAAA', 'blob:abc', 'https://example.com/a?token=secret', 'https://example.com/public.jpg'] }, '2026-10-14T12:00:00Z');
  assert.equal(result.version, 1); assert.equal(result.fields.access_token, undefined); assert.equal(result.fields.email, undefined);
  assert.equal(result.fields.mainImageUrl, undefined); assert.deepEqual(result.fields.additionalImageUrls, ['https://example.com/public.jpg']);
  assert.equal(result.fields.usedBookConditionNotes, draft.usedBookConditionNotes); assert.deepEqual(draft, before);
  assert.equal(snapshot.readRegistrationSnapshot({ ...result, version: 2 }), null);
  assert.equal(snapshot.readRegistrationSnapshot({ ...result, fields: {} }), null);
});

test('Read-only fiche renders stored commercial/bibliographic/used notes with no form or external image requests', t => {
  const previous = globalThis.fetch; let calls = 0;
  globalThis.fetch = () => { calls++; throw new Error('Read-only view must not make requests'); };
  t.after(() => { globalThis.fetch = previous; });
  const view = mount([row('A', { metadata: { mock: true, purpose: 'operational_test', operational_test_run_id: 'round',
    registrationSnapshot: snapshot.createRegistrationSnapshot(draft, '2026-10-14T12:00:00Z') } })]);
  view.open('A');
  assert.match(view.text(), /Assinatura na primeira página/); assert.match(view.text(), /19,90/);
  assert.match(view.text(), /Título final/); assert.match(view.text(), /Editora/); assert.match(view.text(), /sem publicação real/);
  assert.equal(view.nodes().filter(n => ['img', 'form', 'textarea'].includes(n.type)).length, 0);
  assert.equal(view.nodes().filter(n => n.type === 'input').length, 1); // Search only.
  assert.equal(view.nodes().filter(n => n.props?.dangerouslySetInnerHTML).length, 0);
  assert.equal(calls, 0);
});

test('Legacy and future-version records show only persisted summaries without reconstructing a full fiche', () => {
  for (const metadata of [{ quantity: 2 }, { registrationSnapshot: { version: 9 } }]) {
    const view = mount([row('legacy', { metadata })]); view.open('legacy');
    assert.match(view.text(), /Ficha completa não armazenada ou versão não suportada/);
    assert.match(view.text(), /P-legacy/); assert.doesNotMatch(view.text(), /Assinatura na primeira página/);
  }
});

test('Owner detailed fiche refuses unrelated stores and development events, allowing only the authorized demo batch', () => {
  const rows = [row('prod'), row('other-store', { store_id: 'other' }), row('technical', { environment: 'development' }),
    row('other-demo', { environment: 'development', metadata: { demo: true, mock: true, demo_batch_id: 'different' } }),
    row('demo', { environment: 'development', metadata: { demo: true, mock: true, demo_batch_id: 'isbn-demo-20261014-realapp-01' } })];
  const view = mount(rows);
  assert.deepEqual(view.nodes().filter(n => n.props?.['data-registration-id']).map(n => n.props['data-registration-id']), ['demo', 'prod']);
  view.open('demo'); assert.match(view.text(), /Histórico demonstrativo/);
  view.deps.user.currentUser.role = 'operator'; view.deps.user.canViewProduction = false; view.render();
  assert.equal(view.nodes().length, 0);
});

test('Developer fiche retains technical scope; selected detail disappears on role, identity, store or data changes', () => {
  const rows = [row('prod'), row('dev', { environment: 'development' })];
  const developer = mount(rows, 'developer');
  assert.deepEqual(developer.nodes().filter(n => n.props?.['data-registration-id']).map(n => n.props['data-registration-id']), ['dev']);
  for (const change of [view => { view.deps.user.currentUser.id = 'different'; },
    view => { view.deps.user.currentUser.storeId = 'different'; },
    view => { view.deps.user.currentUser.role = 'developer'; },
    view => { view.deps.user.currentUser.active = false; },
    view => { view.props.operations = []; }]) {
    const view = mount(rows); view.open('prod');
    assert.ok(view.find(n => n.props?.['aria-label'] === 'Ficha do cadastro em leitura'));
    change(view); view.render();
    assert.equal(view.find(n => n.props?.['aria-label'] === 'Ficha do cadastro em leitura'), undefined);
  }
});

test('Consultation paginates and search changes hide the previous detail', () => {
  const rows = Array.from({ length: 45 }, (_, i) => row(String(i).padStart(2, '0')));
  const view = mount(rows);
  assert.equal(view.nodes().filter(n => n.props?.['data-registration-id']).length, 20);
  view.open('00'); view.search('unmatched');
  assert.match(view.text(), /Nenhum cadastro encontrado/); assert.equal(view.find(n => n.props?.id === 'registration-detail'), undefined);
  view.search('historia');
  view.find(n => n.type === 'button' && n.props.children === 'Próxima').props.onClick();
  assert.equal(view.nodes().filter(n => n.props?.['data-registration-id']).length, 20);
  view.find(n => n.type === 'button' && n.props.children === 'Próxima').props.onClick();
  assert.equal(view.nodes().filter(n => n.props?.['data-registration-id']).length, 5);
});
