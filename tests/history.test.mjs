import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Exercise App, the registration form, mock catalog and operations service together.
// Only UI leaves, bibliographic requests, Supabase responses and timers are controlled.
const output = await build({
  stdin: {
    contents: `export { default as App } from './src/App';
      export { default as RegistrationForm } from './src/components/magazord/ProductRegistrationForm.tsx';
      export { default as HistoryGroup } from './src/components/SearchHistoryGroup.tsx';
      export { default as StatusCard } from './src/components/magazord/MagazordStatusCard.tsx';
      export { magazordMockService } from './src/services/magazordMockService';
      export { mergeBookWithDistribuidora as realMerge } from './src/services/distribuidoraCuritiba.ts';`,
    resolveDir: process.cwd(), sourcefile: 'history-test-entry.ts', loader: 'ts',
  },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
  define: { 'import.meta.env.DEV': 'false' },
  plugins: [{ name: 'controlled-dependencies', setup(builder) {
    const mocks = [
      [/^react$/, 'module.exports=deps.react'],
      [/^react\/jsx-runtime$/, 'exports.jsx=exports.jsxs=(type,props)=>({type,props})'],
      [/^lucide-react$/, 'module.exports=new Proxy({},{get:(_,key)=>String(key)})'],
      [/\/contexts\/UserContext$/, 'exports.useUser=()=>deps.user'],
      [/\/services\/brasilApi$/, 'exports.searchBookByIsbnBrasilApi=(...args)=>deps.brasil(...args)'],
      [/\/services\/distribuidoraCuritiba$/, 'exports.searchBookByIsbnDistribuidoraCuritiba=(...args)=>deps.curitiba(...args);exports.mergeBookWithDistribuidora=(a,b)=>deps.merge(a,b)'],
      [/\/lib\/supabase$/, 'exports.supabase=deps.supabase'],
    ];
    for (const name of ['Header', 'SearchForm', 'BookDetailsCard', 'SearchHistoryGroup', 'CameraScannerModal',
      'MagazordStatusCard', 'ProductRegistrationForm', 'OwnerDashboard', 'SettingsView', 'ProductIdentitySection',
      'CategoryAndBrandSection', 'CommercialSection', 'BibliographicSection', 'PhysicalAttributesSection',
      'ImagesSection', 'SynopsisSection', 'AdvancedFiscalSection']) {
      mocks.push([new RegExp(`(?:^|/)${name}$`), `module.exports=${JSON.stringify(name)}`]);
    }
    builder.onResolve({ filter: /.*/ }, args => {
      const mock = mocks.find(([pattern]) => pattern.test(args.path));
      return mock ? { path: args.path, namespace: 'mock', pluginData: mock[1] } : undefined;
    });
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: args.pluginData, loader: 'js' }));
  } }],
});

const legacyHistoryKey = 'sebo_isbn_history_v1';
const configKey = 'sebo_magazord_sim_config_v2';
const isbn = '9788535914849';
const otherIsbn = '9788553131303';
const actor = '22222222-3333-4444-5555-666666666666';
const storeId = '11111111-2222-3333-4444-555555555555';
const historyKey = `sebo_isbn_history_v2:${storeId}:${actor}`;
const book = { title: 'Livro de teste', isbn13: isbn, authors: ['Autor'] };
const oldEntry = { timestamp: 1, isbn, title: 'Registro anterior', success: true, userId: actor, storeId,
  operationType: 'pesquisa_isbn', magazordStatus: 'localizado', parentCode: 'ORIGINAL-P', childCode: 'ORIGINAL' };
const forcedModes = [
  ['force_new_found', 'NEW_PRODUCT_FOUND'],
  ['force_new_not_found', 'NOT_FOUND'],
  ['force_used_known', 'USED_EDITION_FOUND'],
  ['force_multiple_matches', 'MULTIPLE_MATCHES'],
  ['force_error', null],
  ['force_used_not_found', 'NOT_FOUND'],
  ['force_existing', 'NEW_PRODUCT_FOUND'],
  ['force_not_found', 'NOT_FOUND'],
];

const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return null;
  if (Array.isArray(tree)) {
    for (const child of tree) { const result = find(child, predicate); if (result) return result; }
    return null;
  }
  return predicate(tree) ? tree : find(tree.props?.children, predicate);
}

function setup(t, mode = 'auto', initialHistory = []) {
  const previousStorage = globalThis.localStorage;
  const storage = new Map([[configKey, JSON.stringify({ mode })]]);
  if (initialHistory !== null) storage.set(historyKey, JSON.stringify(initialHistory));
  const writes = [], rows = [], logs = [], csvBlobs = [], heldTimers = new Map();
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => { writes.push({ key, value }); storage.set(key, value); },
    removeItem: key => storage.delete(key),
  };
  t.after(() => {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  });
  let activeSlots, cursor, effects, dirty;
  const deps = {
    user: { currentUser: { id: actor, storeId, active: true, name: 'Developer', role: 'developer' },
      isDeveloper: true, canViewSettings: true, canViewProduction: true, operationEnvironment: 'development' },
    brasil: async target => ({ book: { ...book, isbn13: target }, diagnostic: { status: 200 } }),
    curitiba: async () => ({ book: null, diagnostic: { status: 404, state: 'not_found' } }),
    supabase: {
      auth: { getSession: async () => ({ data: { session: { user: { id: deps.user.currentUser.id } } }, error: null }) },
      from(table) {
        assert.equal(table, 'operations');
        return { insert: async row => { rows.push(row); return { error: null }; } };
      },
    },
    react: {
      useRef(initial) { const index = cursor++; return activeSlots[index] ??= { current: initial }; },
      useState(initial) {
        const slots = activeSlots, index = cursor++;
        if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
        return [slots[index], next => {
          // Replay updaters as StrictMode does; operations must stay outside these callbacks.
          if (typeof next === 'function') next(slots[index]);
          const value = typeof next === 'function' ? next(slots[index]) : next;
          if (!Object.is(value, slots[index])) { slots[index] = value; dirty = true; }
        }];
      },
      useEffect(effect, dependencies) {
        const index = cursor++;
        if (!activeSlots[index] || dependencies.some((value, i) => !Object.is(value, activeSlots[index][i]))) {
          activeSlots[index] = dependencies;
          effects.push(effect);
        }
      },
    },
  };
  const module = { exports: {} };
  const timer = (callback, delay) => {
    if (heldTimers.has(delay)) heldTimers.get(delay).push(callback);
    else queueMicrotask(callback);
  };
  const document = { querySelector: () => null, body: { appendChild() {} },
    createElement: () => ({ click() {}, remove() {} }) };
  class TestURL extends URL {
    static createObjectURL(blob) { csvBlobs.push(blob); return 'blob:test'; }
    static revokeObjectURL() {}
  }
  new Function('deps', 'module', 'exports', 'setTimeout', 'console', 'document', 'URL', output.outputFiles[0].text)(
    deps, module, module.exports, timer, { error: (...args) => logs.push(args), warn: (...args) => logs.push(args) }, document, TestURL);
  deps.merge = module.exports.realMerge;
  function mount(component, props) {
    const slots = [];
    let tree;
    const render = () => {
      let passes = 0;
      do {
        assert.ok(++passes < 10, 'Render must settle');
        activeSlots = slots; cursor = 0; effects = []; dirty = false;
        tree = component(props);
        effects.forEach(effect => effect());
      } while (dirty);
    };
    render();
    return { render, find: predicate => find(tree, predicate), tree: () => tree };
  }
  const view = mount(module.exports.App);
  const prop = name => view.find(node => node.type === name)?.props;
  const history = () => JSON.parse(storage.get(historyKey) ?? '[]');
  const historyWrites = () => writes.filter(write => write.key === historyKey);
  async function search(target = isbn) { await prop('SearchForm').onSearch(target); await flush(); view.render(); }
  async function tab(name) { prop('Header').onTabChange(name); await flush(); view.render(); }
  async function registration(condition = 'novo') {
    prop('MagazordStatusCard').onOpenRegistration(condition);
    view.render();
    const updates = { parentCode: 'TEST-P', childCode: condition === 'novo' ? isbn : 'TEST-USADO', price: '25', quantity: 2 };
    prop('ProductRegistrationForm').onUpdateDraft(updates);
    view.render();
    const form = mount(module.exports.RegistrationForm, prop('ProductRegistrationForm'));
    const completion = form.find(node => node.props?.id === 'btn-submit-magazord-registration').props.onClick();
    return { form, completion };
  }
  function assertOldEntries() {
    for (const entry of initialHistory ?? []) {
      assert.deepEqual(history().find(item => item.timestamp === entry.timestamp && item.title === entry.title), entry);
    }
  }
  function setRole(role) {
    deps.user.currentUser = { ...deps.user.currentUser, role };
    deps.user.isDeveloper = role === 'developer';
    deps.user.operationEnvironment = role === 'developer' ? 'development' : 'production';
    view.render();
  }
  async function exportCsv() {
    prop('SearchHistoryGroup').onExport();
    return csvBlobs.length ? csvBlobs.at(-1).text() : null;
  }
  return { deps, storage, rows, logs, view, prop, history, historyWrites, search, tab, registration, assertOldEntries,
    setRole, exportCsv, csvBlobs,
    badges: items => module.exports.HistoryGroup({ items, onSelect() {}, onClear() {}, onExport() {} }),
    mountStatusCard: props => mount(module.exports.StatusCard, props),
    mountRegistration: props => mount(module.exports.RegistrationForm, props),
    service: module.exports.magazordMockService,
    hold: delay => heldTimers.set(delay, []),
    release: delay => { const callbacks = heldTimers.get(delay); heldTimers.delete(delay); callbacks.forEach(callback => callback()); },
  };
}

const problemIsbn = '9780440333869';
const fallbackBook = { title: 'Título da Curitiba', authors: ['Autor da Curitiba'], publisher: 'Editora da Curitiba', language: 'en' };
for (const scenario of [
  { name: 'normal result retains BrasilAPI priority and Curitiba enrichment', bStatus: 200, bBook: { title: 'Título da BrasilAPI', language: 'en' }, cStatus: 200, cBook: fallbackBook },
  { name: 'BrasilAPI 404 falls back to Curitiba', bStatus: 404, cStatus: 200, cBook: fallbackBook },
  { name: 'reported HTTP 400 falls back to Curitiba', bStatus: 400, cStatus: 200, cBook: fallbackBook },
  { name: 'neither source finds the ISBN', bStatus: 404, cStatus: 404 },
  { name: 'reported HTTP 400 and no Curitiba result allow manual entry', bStatus: 400, cStatus: 404 },
  { name: 'a rejected first source still permits Curitiba fallback', bThrows: true, cStatus: 200, cBook: fallbackBook },
  { name: 'Curitiba failure preserves BrasilAPI data', bStatus: 200, bBook: { title: 'Título da BrasilAPI', language: 'en' }, cThrows: true },
  { name: 'both source failures allow manual entry', bThrows: true, cThrows: true },
  { name: 'Curitiba HTTP 400 is a technical failure rather than absence', bStatus: 404, cStatus: 400 },
]) {
  test('Search continuation: ' + scenario.name, async t => {
    const app = setup(t), calls = [];
    app.setRole('operator');
    app.deps.brasil = async target => {
      calls.push(['brasil', target]);
      if (scenario.bThrows) throw new Error('Synthetic source failure');
      return { book: scenario.bBook ? { id: 'source-book', ...scenario.bBook, isbn13: 'different-source-identifier' } : null,
        diagnostic: { status: scenario.bStatus } };
    };
    app.deps.curitiba = async target => {
      calls.push(['curitiba', target]);
      if (scenario.cThrows) throw new Error('Synthetic source failure');
      return { book: scenario.cBook ? { ...scenario.cBook, isbn13: 'different-secondary-identifier' } : null,
        diagnostic: { status: scenario.cStatus, state: scenario.cBook ? 'success' : scenario.cStatus === 404 ? 'not_found' : 'unavailable' } };
    };
    await app.search('978-0440333869');
    assert.deepEqual(calls, [['brasil', problemIsbn], ['curitiba', problemIsbn]]);
    const hasBook = Boolean(scenario.bBook || scenario.cBook);
    const technicalFailure = Boolean(scenario.bThrows || scenario.cThrows || scenario.bStatus === 400 || scenario.cStatus === 400);
    const cardProps = app.prop('MagazordStatusCard');
    assert.equal(cardProps.book.isbn13, problemIsbn);
    assert.equal(cardProps.manualEntry, !hasBook);
    assert.equal(cardProps.checkResult.status, 'NOT_FOUND');
    assert.equal(Boolean(app.prop('BookDetailsCard')), hasBook);
    if (technicalFailure || !hasBook) {
      const heading = app.view.find(n => n.type === 'h3' && (typeof n.props.children === 'string')
        && /Consulta bibliográfica parcial|Falha na consulta bibliográfica|Obra não localizada nas fontes consultadas/.test(n.props.children));
      assert.equal(heading.props.children, hasBook ? 'Consulta bibliográfica parcial' : technicalFailure ? 'Falha na consulta bibliográfica' : 'Obra não localizada nas fontes consultadas');
    }
    const card = app.mountStatusCard(cardProps);
    if (!hasBook) assert.ok(card.find(n => n.type === 'span' && n.props.children === 'Continuar com cadastro manual'));
    card.find(n => n.props?.id === 'btn-open-magazord-registration').props.onClick();
    app.view.render();
    const draft = app.prop('ProductRegistrationForm').draft;
    assert.equal(draft.ean, problemIsbn);
    assert.equal(draft.isbn13, problemIsbn);
    assert.equal(draft.childCode, problemIsbn);
    assert.equal(draft.parentCode, '');
    assert.equal(draft.title, scenario.bBook?.title || scenario.cBook?.title || '');
    if (!hasBook) {
      assert.deepEqual(draft.authors, []);
      assert.equal(draft.publisher, '');
      assert.equal(draft.language, '');
      assert.equal(draft.format, '');
      assert.equal(draft.synopsis, '');
      assert.equal(draft.mainImageUrl, undefined);
    } else if (scenario.cBook) assert.deepEqual(draft.authors, fallbackBook.authors);
    assert.equal(app.rows[0].metadata.resultFound, hasBook);
    assert.equal(app.rows[0].metadata.sources.brasilApi.resultFound, Boolean(scenario.bBook));
    assert.equal(app.rows[0].metadata.sources.distribuidoraCuritiba.resultFound, Boolean(scenario.cBook));
    app.prop('ProductRegistrationForm').onUpdateDraft({ title: draft.title || 'Título informado pelo operador', parentCode: 'MANUAL-P', price: '25', quantity: 2 });
    app.view.render();
    const form = app.mountRegistration(app.prop('ProductRegistrationForm'));
    await form.find(n => n.props?.id === 'btn-submit-magazord-registration').props.onClick();
    await flush(); app.view.render();
    assert.equal(app.service.getRecordsForEan(problemIsbn, 'auto')[0].title, draft.title || 'Título informado pelo operador');
    assert.equal(app.rows.filter(row => row.operation_type === 'new_product_created').length, 1);
    await app.tab('consultar');
    await app.search(problemIsbn);
    assert.equal(app.prop('MagazordStatusCard').checkResult.status, 'NEW_PRODUCT_FOUND');
    assert.equal(app.service.getRecordsForEan(problemIsbn, 'auto').length, 1);
  });
}

test('Manual ISBN-10 entry keeps the original identifier and the existing new/used child-code rules', async t => {
  const app = setup(t);
  app.setRole('operator');
  app.deps.brasil = async () => ({ book: null, diagnostic: { status: 404 } });
  await app.search('0440333865');
  app.prop('MagazordStatusCard').onOpenRegistration('usado');
  app.view.render();
  const draft = app.prop('ProductRegistrationForm').draft;
  assert.equal(draft.isbn10, '0440333865');
  assert.equal(draft.isbn13, '');
  assert.equal(draft.ean, '0440333865');
  assert.equal(draft.childCode, '');
  assert.equal(draft.parentCode, '');
  assert.equal(draft.condition, 'usado');
  assert.equal(draft.title, '');
});

test('A bibliography failure still recognizes an existing commercial Novo and permits stock reuse', async t => {
  const app = setup(t);
  app.setRole('operator');
  await app.service.createProduct({ condition: 'novo', ean: problemIsbn, isbn13: problemIsbn, parentCode: 'EXISTING-P',
    childCode: problemIsbn, title: 'Produto já cadastrado', price: '25', quantity: 2 });
  app.deps.brasil = async () => ({ book: null, diagnostic: { status: 400 } });
  await app.search(problemIsbn);
  const props = app.prop('MagazordStatusCard');
  assert.equal(props.checkResult.status, 'NEW_PRODUCT_FOUND');
  assert.equal(props.checkResult.canReuseCommercialRegistration, true);
  const card = app.mountStatusCard(props);
  assert.ok(card.find(n => n.props?.id === 'btn-link-stock'));
  assert.equal(card.find(n => n.props?.id === 'btn-open-magazord-registration'), null);
  await props.onLinkStock(1);
  await flush(); app.view.render();
  assert.equal(app.service.getRecordsForEan(problemIsbn, 'auto')[0].stock, 3);
  assert.equal(app.service.getRecordsForEan(problemIsbn, 'auto').length, 1);
  assert.equal(app.rows.at(-1).operation_type, 'new_product_reused');
});

test('BrasilAPI maps HTTP 400 to a technical diagnostic without inventing a book', async () => {
  const result = await build({ entryPoints: ['src/services/brasilApi.ts'], bundle: true, write: false, platform: 'node', format: 'cjs' });
  const module = { exports: {} }, calls = [];
  new Function('fetch', 'module', 'exports', result.outputFiles[0].text)(async url => {
    calls.push(url); return new Response(null, { status: 400 });
  }, module, module.exports);
  const response = await module.exports.searchBookByIsbnBrasilApi(problemIsbn);
  assert.deepEqual(calls, [`https://brasilapi.com.br/api/isbn/v1/${problemIsbn}`]);
  assert.equal(response.book, null);
  assert.equal(response.diagnostic.status, 400);
  assert.equal(response.diagnostic.apiErrorMessage, 'Erro inesperado na API: HTTP Status 400');
});

test('Developer + Auto persists operational history and its Magazord result in both views', async t => {
  const app = setup(t);
  await app.search();
  assert.equal(app.history().length, 1);
  assert.equal(app.history()[0].historyKind, 'operational');
  assert.equal(app.history()[0].operationType, 'pesquisa_isbn');
  assert.equal(app.history()[0].magazordStatus, 'nao_cadastrado');
  assert.equal(app.history()[0].userRole, 'developer');
  assert.ok(app.historyWrites().length > 0);
  assert.equal(app.rows.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(app.prop('SearchHistoryGroup').items)), app.history());
  await app.tab('historico');
  assert.deepEqual(JSON.parse(JSON.stringify(app.prop('SearchHistoryGroup').items)), app.history());
});

for (const [mode, status] of forcedModes) {
  test('Developer + ' + mode + ' persists test history without reclassifying legacy entries or suppressing operations', async t => {
    const app = setup(t, mode, [oldEntry]);
    await app.search();
    assert.equal(app.history().length, 2);
    assert.equal(app.history()[0].historyKind, 'test');
    app.assertOldEntries();
    const card = app.prop('MagazordStatusCard');
    if (status) assert.equal(card.checkResult.status, status);
    else assert.match(card.checkError, /503 Service Unavailable/);
    assert.equal(app.rows.length, mode === 'force_error' ? 2 : 1);
    assert.equal(app.rows[0].operation_type, 'isbn_search');
    assert.equal(app.deps.user.operationEnvironment, 'development');
    assert.ok(!('environment' in app.rows[0]));
    assert.ok(!('user_id' in app.rows[0]));
    await app.tab('historico');
    assert.deepEqual(JSON.parse(JSON.stringify(app.prop('SearchHistoryGroup').items)), app.history());
  });
}

test('No-result and bibliographic errors retain operational/test classification and independent operations', async t => {
  for (const mode of ['auto', 'force_new_not_found', 'force_error']) {
    for (const status of [404, 500, 'FALHA_CONEXAO']) {
      const app = setup(t, mode, [oldEntry]);
      app.deps.brasil = async () => ({ book: null, diagnostic: { status } });
      await app.search();
      assert.equal(app.history().length, 2);
      assert.equal(app.history()[0].historyKind, mode === 'auto' ? 'operational' : 'test');
      assert.equal(app.history()[0].operationType, 'erro_consulta');
      assert.equal(app.history()[0].success, false);
      app.assertOldEntries();
      assert.equal(app.rows.length, mode === 'force_error' ? 2 : 1);
      assert.equal(app.rows[0].operation_type, status === 404 ? 'isbn_search' : 'operation_error');
    }
  }
});

for (const condition of ['novo', 'usado']) {
  for (const mode of ['auto', 'force_new_not_found', 'force_used_known']) {
    test(condition + ' registration in ' + mode + ' keeps classification, catalog persistence and operations', async t => {
      const app = setup(t, mode, [oldEntry]);
      await app.search();
      const { form, completion } = await app.registration(condition);
      await completion; await flush(); app.view.render(); form.render();
      assert.ok(form.find(node => node.props?.id === 'btn-process-next-book'));
      assert.ok(app.service.getRecordsForEan(isbn).some(record => record.condition === condition));
      assert.deepEqual(app.rows.map(row => row.operation_type), ['isbn_search', condition === 'novo' ? 'new_product_created' : 'used_copy_created']);
      const snapshot = app.rows[1].metadata.registrationSnapshot;
      assert.equal(snapshot.version, 1);
      assert.equal(snapshot.fields.condition, condition);
      assert.equal(snapshot.fields.registrationMode, condition === 'usado' ? 'new_used_from_known_edition' : 'new_product');
      const stored = app.service.getRecordsForEan(isbn).find(record => record.childCode === app.rows[1].child_code);
      assert.equal(snapshot.fields.price, stored.price);
      assert.equal(snapshot.fields.description, stored.description);
      assert.equal(app.rows[0].metadata.registrationSnapshot, undefined);
      assert.equal(app.history().length, 3);
      assert.equal(app.history()[0].historyKind, mode === 'auto' ? 'operational' : 'test');
      assert.equal(app.history()[0].condition, condition);
      assert.equal(app.history()[0].operationType, condition === 'novo' ? 'novo_cadastro' : 'novo_usado_com_edicao_conhecida');
      await app.tab('historico');
      assert.deepEqual(JSON.parse(JSON.stringify(app.prop('SearchHistoryGroup').items)), app.history());
    });
  }
}

for (const mode of ['auto', 'force_new_found', 'force_multiple_matches']) {
  test('Existing Novo stock reuse in ' + mode + ' keeps classification, stock and operations', async t => {
    const app = setup(t, mode, [oldEntry]);
    await app.search();
    const result = await app.prop('MagazordStatusCard').onLinkStock(2);
    await flush(); app.view.render();
    assert.equal(result.success, true);
    const expectedStock = mode === 'force_multiple_matches' ? 6 : 5;
    assert.equal(result.newStock, expectedStock);
    assert.equal(app.service.getRecordsForEan(isbn)[0].stock, expectedStock);
    assert.deepEqual(app.rows.map(row => row.operation_type), ['isbn_search', 'new_product_reused']);
    assert.equal(app.history()[0].operationType, 'reaproveitamento_produto_novo');
    assert.equal(app.history()[0].historyKind, mode === 'auto' ? 'operational' : 'test');
  });
}

test('Forced registration failure keeps the test lookup and the independent operation_error', async t => {
  const app = setup(t, 'force_error', [oldEntry]);
  await app.search();
  const { form, completion } = await app.registration();
  await completion; await flush(); app.view.render(); form.render();
  assert.match(JSON.stringify(form.tree()), /Timeout de resposta/);
  assert.deepEqual(app.rows.map(row => row.operation_type), ['isbn_search', 'operation_error', 'operation_error']);
  assert.deepEqual(app.rows.slice(1).map(row => row.metadata.flow), ['magazord_check', 'registration']);
  assert.equal(app.history()[0].historyKind, 'test');
  app.assertOldEntries();
});

test('Applied Auto resumes operational entries for the same ISBN without deduplicating a test entry', async t => {
  const app = setup(t, 'force_new_found', [oldEntry]);
  await app.search();
  const testEntry = app.history()[0];
  app.service.resetModeToAuto();
  // Storage changed outside the service does not change the applied in-memory mode.
  app.storage.set(configKey, JSON.stringify({ mode: 'force_error' }));
  await app.search();
  assert.equal(app.history().length, 3);
  assert.equal(app.history()[0].historyKind, 'operational');
  assert.deepEqual(app.history()[1], testEntry);
  assert.equal(app.rows.length, 2);
});

test('Catalog retries update only their original classification and do not relabel legacy entries', async t => {
  const testEntry = { ...oldEntry, timestamp: 2, title: 'Test lookup', historyKind: 'test', magazordStatus: 'nao_cadastrado' };
  const app = setup(t, 'auto', [testEntry, oldEntry]);
  await app.search();
  const operational = app.history().filter(item => item.historyKind !== 'test');
  app.service.setSimulationConfig({ mode: 'force_new_found' });
  await app.prop('MagazordStatusCard').onRetryCheck(); await flush(); app.view.render();
  assert.equal(app.prop('MagazordStatusCard').checkResult.status, 'NEW_PRODUCT_FOUND');
  assert.deepEqual(app.history().filter(item => item.historyKind !== 'test'), operational);
  assert.equal(app.history().find(item => item.historyKind === 'test').magazordStatus, 'localizado');
  const classifiedTest = app.history().find(item => item.historyKind === 'test');
  app.service.resetModeToAuto();
  await app.prop('MagazordStatusCard').onRetryCheck(); await flush(); app.view.render();
  assert.deepEqual(app.history().find(item => item.historyKind === 'test'), classifiedTest);
  assert.ok(!('historyKind' in app.history().find(item => item.timestamp === 1)));
  assert.equal(app.rows.length, 1);
});

for (const [origin, finish, kind] of [
  ['force_new_found', 'auto', 'test'],
  ['auto', 'force_new_found', 'operational'],
]) {
  test('Lookup started in ' + origin + ' and finished in ' + finish + ' stays ' + kind, async t => {
    const app = setup(t, origin, [oldEntry]);
    let resolve;
    app.deps.brasil = () => new Promise(done => { resolve = done; });
    const pending = app.search();
    app.service.setSimulationConfig({ mode: finish });
    resolve({ book, diagnostic: { status: 200 } });
    await pending;
    assert.equal(app.history().length, 2);
    assert.equal(app.history()[0].historyKind, kind);
    assert.equal(app.rows.length, 1);
    if (kind === 'test') app.assertOldEntries();
  });
}

test('Forced catalog retry completing after Auto updates test entries without changing their classification', async t => {
  const app = setup(t, 'force_new_found', [oldEntry]);
  await app.search();
  app.hold(380);
  const pending = app.prop('MagazordStatusCard').onRetryCheck();
  app.service.resetModeToAuto();
  app.release(380); await pending; await flush(); app.view.render();
  assert.equal(app.history()[0].historyKind, 'test');
  assert.equal(app.history()[0].magazordStatus, 'localizado');
  app.assertOldEntries();
});

for (const action of ['stock', 'registration']) {
  for (const [origin, finish, kind] of [
    ['force_new_found', 'auto', 'test'],
    ['auto', 'force_new_found', 'operational'],
  ]) {
    test(action + ' started in ' + origin + ' and finished in ' + finish + ' stays ' + kind, async t => {
      const app = setup(t, origin);
      await app.search();
      const delay = action === 'stock' ? 500 : 850;
      app.hold(delay);
      const pending = action === 'stock' ? app.prop('MagazordStatusCard').onLinkStock(2) : (await app.registration()).completion;
      app.service.setSimulationConfig({ mode: finish });
      app.release(delay); await pending; await flush(); app.view.render();
      await app.tab('historico');
      assert.equal(app.history().length, 2);
      assert.equal(app.history()[0].historyKind, kind);
      assert.equal(app.rows.length, 2);
      assert.equal(app.rows[1].operation_type, action === 'stock' ? 'new_product_reused' : 'new_product_created');
    });
  }
}

test('Empty scoped history is never seeded and the legacy shared key is neither read nor migrated', async t => {
  const app = setup(t, 'force_new_found', null);
  const legacy = JSON.stringify([{ ...oldEntry, userId: 'old-owner', title: 'Legacy demo' }]);
  app.storage.set(legacyHistoryKey, legacy);
  app.view.render();
  assert.deepEqual(app.history(), []);
  assert.deepEqual(app.prop('SearchHistoryGroup').items, []);
  assert.equal(app.historyWrites().length, 0);
  await app.search(otherIsbn);
  assert.equal(app.history()[0].historyKind, 'test');
  assert.equal(app.history().length, 1);
  assert.equal(app.storage.get(legacyHistoryKey), legacy);
});

test('Switching authenticated user/store isolates UI, CSV, writes and clearing without touching operations or legacy data', async t => {
  const app = setup(t, 'auto', [oldEntry]);
  const original = { ...app.deps.user.currentUser };
  const other = { ...original, id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', name: 'Outro operador', role: 'operator' };
  const otherStore = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
  const otherKey = `sebo_isbn_history_v2:${storeId}:${other.id}`;
  const otherRow = { ...oldEntry, userId: other.id, title: 'ONLY_OTHER_ACCOUNT' };
  const foreign = { ...oldEntry, title: 'WRONG_ACCOUNT_IN_KEY' };
  app.storage.set(otherKey, JSON.stringify([otherRow, foreign]));
  const legacy = JSON.stringify([foreign]);
  app.storage.set(legacyHistoryKey, legacy);
  app.deps.user.currentUser = other; app.view.render();
  assert.deepEqual(app.prop('SearchHistoryGroup').items, [otherRow]);
  const csv = await app.exportCsv();
  assert.match(csv, /ONLY_OTHER_ACCOUNT/); assert.doesNotMatch(csv, /WRONG_ACCOUNT_IN_KEY|Registro anterior/);
  app.deps.user.currentUser = { ...other, storeId: otherStore }; app.view.render();
  assert.deepEqual(app.prop('SearchHistoryGroup').items, []);
  await app.search();
  const newKey = `sebo_isbn_history_v2:${otherStore}:${other.id}`;
  assert.equal(JSON.parse(app.storage.get(newKey))[0].storeId, otherStore);
  assert.equal(JSON.parse(app.storage.get(newKey))[0].userId, other.id);
  assert.deepEqual(app.history(), [oldEntry]);
  assert.deepEqual(JSON.parse(app.storage.get(otherKey)), [otherRow, foreign], 'Read must not rewrite existing data');
  app.prop('SearchHistoryGroup').onClear(); app.view.render();
  assert.equal(app.storage.has(newKey), false);
  assert.equal(app.rows.length, 1, 'Clear must not create or delete centralized events');
  app.deps.user.currentUser = original; app.view.render();
  assert.deepEqual(app.prop('SearchHistoryGroup').items, [oldEntry]);
  assert.equal(app.storage.get(legacyHistoryKey), legacy);
});

test('A lookup completing after an account switch writes only the original scoped history', async t => {
  const app = setup(t, 'auto');
  let resolve;
  app.deps.brasil = () => new Promise(done => { resolve = done; });
  const pending = app.search();
  app.deps.user.currentUser = { ...app.deps.user.currentUser, id: 'next-account' }; app.view.render();
  assert.deepEqual(app.prop('SearchHistoryGroup').items, []);
  resolve({ book, diagnostic: { status: 200 } }); await pending;
  assert.deepEqual(app.prop('SearchHistoryGroup').items, []);
  assert.equal(app.history().length, 1);
  assert.equal(app.history()[0].userId, actor);
  assert.equal(app.storage.has(`sebo_isbn_history_v2:${storeId}:next-account`), false);
});

test('Unavailable local history storage is visible and does not suppress centralized audit', async t => {
  const app = setup(t);
  globalThis.localStorage.setItem = () => { throw new Error('Quota exceeded'); };
  await app.search();
  assert.ok(app.view.find(node => node.props?.role === 'alert' && /histórico local/.test(node.props?.children)));
  assert.equal(app.prop('SearchHistoryGroup').items.length, 1, 'In-memory history survives');
  assert.equal(app.rows.length, 1);
});

test('Form submission normalizes a stale used draft before simulator and snapshot without mutating the draft', async t => {
  const app = setup(t); await app.search();
  app.prop('MagazordStatusCard').onOpenRegistration('usado'); app.view.render();
  app.prop('ProductRegistrationForm').onUpdateDraft({ registrationMode: 'new_product', parentCode: 'USED-P', childCode: 'USED-1', price: '150', quantity: 1 });
  app.view.render();
  const props = app.prop('ProductRegistrationForm');
  const before = structuredClone(props.draft);
  const form = app.mountRegistration(props);
  const completion = form.find(node => node.props?.id === 'btn-submit-magazord-registration').props.onClick();
  await completion; await flush(); app.view.render();
  assert.deepEqual(props.draft, before);
  assert.equal(app.rows.at(-1).metadata.registrationSnapshot.fields.registrationMode, 'new_used_from_known_edition');
});

test('Simulation notice remains visible throughout all app tabs and registration controls identify the simulator', async t => {
  const app = setup(t);
  app.deps.brasil = async () => ({ book: { ...book, synopsis: 'Sinopse de teste' }, diagnostic: { status: 200 } });
  for (const tab of ['consultar', 'cadastro', 'historico', 'dashboard', 'configuracoes']) {
    await app.tab(tab);
    const notice = app.view.find(node => node.props?.['data-integration-mode'] === 'simulated');
    assert.match(notice.props.children, /Nenhum produto ou estoque é publicado/);
  }
  await app.tab('consultar'); await app.search();
  const { form, completion } = await app.registration('usado');
  assert.match(JSON.stringify(form.tree()), /CONCLUIR CADASTRO NO SIMULADOR/);
  assert.doesNotMatch(JSON.stringify(form.tree()), /CADASTRAR NO MAGAZORD/);
  await completion; await flush(); form.render();
  assert.match(JSON.stringify(form.tree()), /Cadastro simulado concluído/);
  assert.match(JSON.stringify(form.tree()), /Descrição armazenada no simulador/);
});

test('Actual catalog status card labels standard Auto and all results as simulation', async t => {
  const app = setup(t);
  const props = { isChecking: false, checkError: null, book, onRetryCheck() {}, onOpenRegistration() {}, onResetForNextBook() {} };
  for (const checkResult of [
    { exists: false, status: 'NOT_FOUND' },
    { exists: true, status: 'NEW_PRODUCT_FOUND', existingCondition: 'novo', canReuseCommercialRegistration: true, parentCode: 'P', childCode: isbn, currentStock: 3 },
    { exists: true, status: 'USED_EDITION_FOUND', existingCondition: 'usado', canReuseCommercialRegistration: false },
  ]) {
    const card = app.mountStatusCard({ ...props, checkResult });
    const text = JSON.stringify(card.tree());
    assert.match(text, /Magazord — integração simulada/);
    assert.match(text, /Simulador padrão \(Auto\)/);
    assert.doesNotMatch(text, /cadastro compatível na Magazord|Produto não encontrado na Magazord|Edição conhecida no catálogo Magazord|Banco Real/);
  }
});

test('Both classifications retain immediate lookup deduplication and the shared 50-entry limit', async t => {
  for (const mode of ['auto', 'force_new_found']) {
    const entries = Array.from({ length: 50 }, (_, index) => ({ ...oldEntry, isbn: 'old-' + index }));
    const app = setup(t, mode, entries);
    await app.search();
    assert.equal(app.history().length, 50);
    const timestamp = app.history()[0].timestamp;
    await app.search();
    assert.equal(app.history().length, 50);
    assert.equal(app.history()[0].timestamp, timestamp);
    assert.equal(app.history()[0].historyKind, mode === 'auto' ? 'operational' : 'test');
    assert.equal(app.rows.length, 2);
  }
});

test('An immediate legacy Auto search is deduplicated without adding a classification retroactively', async t => {
  const app = setup(t, 'auto', [{ ...oldEntry, timestamp: Date.now() }]);
  await app.search();
  assert.equal(app.history().length, 1);
  assert.ok(!('historyKind' in app.history()[0]));
  assert.equal(app.rows.length, 1);
});

test('Fatal bibliographic and stock errors preserve the existing flow and independent operations', async t => {
  const app = setup(t, 'force_new_found', [oldEntry]);
  app.deps.brasil = async () => { throw new Error('Bibliographic failure'); };
  await app.search(); app.assertOldEntries();
  assert.equal(app.rows[0].operation_type, 'operation_error');
  app.deps.brasil = async () => ({ book, diagnostic: { status: 200 } });
  await app.search();
  app.service.addStockToExistingProduct = async () => { throw new Error('Stock failure'); };
  await assert.rejects(app.prop('MagazordStatusCard').onLinkStock(1), /Stock failure/);
  await flush(); app.view.render(); app.assertOldEntries();
  assert.equal(app.history()[0].historyKind, 'test');
  assert.deepEqual(app.rows.map(row => row.operation_type), ['operation_error', 'isbn_search', 'operation_error']);
});

const mixedHistory = [
  { ...oldEntry, timestamp: 3, title: 'TEST_ONLY_ROW', isbn: otherIsbn, historyKind: 'test' },
  { ...oldEntry, timestamp: 2, title: 'OPERATIONAL_ROW', historyKind: 'operational', operationEnvironment: 'development' },
  { ...oldEntry, title: 'LEGACY_ROW', userRole: 'developer', operationEnvironment: 'development' },
];
function countBadges(tree) {
  if (!tree || typeof tree !== 'object') return 0;
  if (Array.isArray(tree)) return tree.reduce((count, child) => count + countBadges(child), 0);
  return (tree.type === 'span' && tree.props?.children === 'TESTE' ? 1 : 0) + countBadges(tree.props?.children);
}

for (const role of ['developer', 'admin', 'operator']) {
  test(role + ' receives the correct history, count, TESTE badges and unchanged CSV columns in both views', async t => {
    const app = setup(t, 'auto', mixedHistory);
    app.setRole(role);
    const visible = role === 'developer' ? mixedHistory : mixedHistory.slice(1);
    for (const tab of ['consultar', 'historico']) {
      await app.tab(tab);
      assert.deepEqual(app.prop('SearchHistoryGroup').items, visible);
      assert.equal(app.prop('Header').historyCount, visible.length);
      assert.equal(countBadges(app.badges(app.prop('SearchHistoryGroup').items)), role === 'developer' ? 1 : 0);
      const csv = await app.exportCsv();
      assert.ok(csv.includes('OPERATIONAL_ROW'));
      assert.ok(csv.includes('LEGACY_ROW'));
      assert.equal(csv.includes('TEST_ONLY_ROW'), role === 'developer');
      const lines = csv.trimEnd().split('\r\n');
      assert.equal(lines.length, visible.length + 1);
      assert.equal(lines[0].replace(/^\uFEFF/, ''), '"ISBN";"Título";"Autor(es)";"Condição";"Tipo de Operação";"Código Pai";"Código Filho";"Status Magazord";"Usuário";"Perfil";"Ambiente";"Data/Hora";"Status Consulta"');
      assert.ok(!lines[0].includes('historyKind'));
    }
    assert.deepEqual(app.history(), mixedHistory, 'Visibility must not migrate, relabel or delete stored entries');
    assert.equal(app.historyWrites().length, 0);
    assert.deepEqual([...app.storage.keys()].sort(), [historyKey, configKey].sort(), 'No second history storage');
    assert.equal(app.rows.length, 0, 'Rendering/exporting must not produce operations');
  });
}

test('Profile changes filter existing data immediately and restore developer access without deleting tests', async t => {
  const app = setup(t, 'auto', mixedHistory);
  for (const role of ['admin', 'operator', 'developer']) {
    app.setRole(role);
    assert.equal(app.prop('Header').historyCount, role === 'developer' ? 3 : 2);
    assert.equal(app.prop('SearchHistoryGroup').items.some(item => item.historyKind === 'test'), role === 'developer');
    await app.tab('historico');
    assert.equal(app.prop('SearchHistoryGroup').items.some(item => item.historyKind === 'test'), role === 'developer');
    assert.deepEqual(app.history(), mixedHistory);
    await app.tab('consultar');
  }
});

test('An admin/operator dataset containing only tests is empty and cannot export hidden entries', async t => {
  const app = setup(t, 'auto', [mixedHistory[0]]);
  for (const role of ['admin', 'operator']) {
    app.setRole(role);
    for (const tab of ['consultar', 'historico']) {
      await app.tab(tab);
      assert.deepEqual(app.prop('SearchHistoryGroup').items, []);
      assert.equal(app.prop('Header').historyCount, 0);
      assert.equal(await app.exportCsv(), null);
    }
  }
  assert.deepEqual(app.history(), [mixedHistory[0]]);
  assert.equal(app.csvBlobs.length, 0);
});

test('A test lookup completed after switching to admin stays stored as test and is never supplied to history views', async t => {
  const app = setup(t, 'force_new_found', [oldEntry]);
  let resolve;
  app.deps.brasil = () => new Promise(done => { resolve = done; });
  const pending = app.search();
  app.service.resetModeToAuto();
  app.setRole('admin');
  resolve({ book, diagnostic: { status: 200 } });
  await pending;
  assert.equal(app.history()[0].historyKind, 'test');
  assert.deepEqual(app.prop('SearchHistoryGroup').items, [oldEntry]);
  assert.equal(app.prop('Header').historyCount, 1);
  assert.equal(app.prop('MagazordStatusCard').checkResult, null, 'Late sandbox results must not be delivered to admin');
  await app.tab('historico');
  assert.deepEqual(app.prop('SearchHistoryGroup').items, [oldEntry]);
  app.assertOldEntries();
  assert.equal(app.rows.length, 1);
});

test('Manual clearing still clears the single history and does not create operations', async t => {
  const app = setup(t, 'auto', mixedHistory);
  app.setRole('operator');
  app.prop('SearchHistoryGroup').onClear();
  app.view.render();
  assert.equal(app.storage.has(historyKey), false);
  assert.deepEqual(app.prop('SearchHistoryGroup').items, []);
  assert.equal(app.prop('Header').historyCount, 0);
  app.setRole('developer');
  assert.deepEqual(app.prop('SearchHistoryGroup').items, []);
  assert.equal(app.rows.length, 0);
});

test('Developer sandbox stock remains separate when operator queries the same ISBN; history and operations stay classified', async t => {
  const app = setup(t, 'auto');
  app.setRole('operator'); await app.search();
  assert.equal(app.prop('MagazordStatusCard').checkResult.status, 'NOT_FOUND');
  app.setRole('developer'); app.service.setSimulationConfig({ mode: 'force_new_found' });
  await app.search();
  assert.equal(app.prop('MagazordStatusCard').checkResult.currentStock, 3);
  await app.prop('MagazordStatusCard').onLinkStock(2); await flush(); app.view.render();
  await app.search();
  assert.equal(app.prop('MagazordStatusCard').checkResult.currentStock, 5);
  const sandbox = app.storage.get('sebo_magazord_sandbox_db_v1');
  app.setRole('operator');
  assert.equal(app.prop('MagazordStatusCard').checkResult, null, 'Previously displayed test data is hidden immediately');
  assert.equal(app.service.getSimulationConfig().mode, 'auto');
  await app.search();
  assert.equal(app.prop('MagazordStatusCard').checkResult.status, 'NOT_FOUND');
  assert.ok(app.prop('SearchHistoryGroup').items.every(item => item.historyKind === 'operational'));
  assert.ok(app.history().some(item => item.historyKind === 'test'));
  assert.equal(app.storage.get('sebo_magazord_sandbox_db_v1'), sandbox);
  assert.deepEqual(app.service.getRecordsForEan(isbn, 'auto'), []);
  assert.deepEqual(app.rows.map(row => row.operation_type), ['isbn_search', 'isbn_search', 'new_product_reused', 'isbn_search', 'isbn_search']);
  assert.ok(app.rows.every(row => !('environment' in row) && !('user_id' in row)));
});

for (const role of ['admin', 'operator']) {
  test(role + ' queries only Auto even with a previously persisted forced mode and an existing sandbox', async t => {
    const app = setup(t, 'force_new_found');
    await app.service.addStockToExistingProduct(isbn, 2);
    const sandbox = app.storage.get('sebo_magazord_sandbox_db_v1');
    app.setRole(role); await app.search();
    assert.equal(app.prop('MagazordStatusCard').checkResult.status, 'NOT_FOUND');
    assert.equal(app.history()[0].historyKind, 'operational');
    assert.equal(app.service.getSimulationConfig().mode, 'auto');
    assert.equal(app.storage.get('sebo_magazord_sandbox_db_v1'), sandbox);
    const { completion } = await app.registration();
    await completion; await flush(); app.view.render();
    assert.equal(app.service.getRecordsForEan(isbn, 'auto')[0].stock, 2);
    assert.equal(app.storage.get('sebo_magazord_sandbox_db_v1'), sandbox);
    assert.equal(app.history()[0].historyKind, 'operational');
    assert.equal(app.rows.length, 2);
  });
}

test('A late sandbox stock completion cannot replace a newer Auto balance in the operator UI', async t => {
  const app = setup(t, 'auto');
  await app.service.createProduct({ ean: isbn, condition: 'novo', parentCode: 'OP-P', childCode: isbn, title: 'Operacional', quantity: 7 });
  app.service.setSimulationConfig({ mode: 'force_new_found' }); await app.search();
  app.hold(500);
  const pending = app.prop('MagazordStatusCard').onLinkStock(2);
  app.setRole('operator'); await app.search();
  assert.equal(app.prop('MagazordStatusCard').checkResult.currentStock, 7);
  app.release(500); await pending; await flush(); app.view.render();
  assert.equal(app.prop('MagazordStatusCard').checkResult.currentStock, 7);
  assert.equal(app.service.getRecordsForEan(isbn, 'auto')[0].stock, 7);
  assert.equal(app.service.getRecordsForEan(isbn, 'force_new_found')[0].stock, 5);
  assert.equal(app.history()[0].historyKind, 'test');
  assert.ok(app.prop('SearchHistoryGroup').items.every(item => item.historyKind !== 'test'));
  assert.equal(app.rows.at(-1).operation_type, 'new_product_reused');
});

for (const late of [false, true]) {
  test('The real card hides ' + (late ? 'late' : 'previous') + ' sandbox stock confirmation after switching to operator', async t => {
    const app = setup(t, 'force_new_found');
    let resolve;
    const props = { checkResult: { exists: true, status: 'NEW_PRODUCT_FOUND', existingCondition: 'novo',
      canReuseCommercialRegistration: true, parentCode: 'TEST-P', childCode: isbn, currentStock: 3 },
      isChecking: false, checkError: null, book, onRetryCheck() {}, onOpenRegistration() {}, onResetForNextBook() {},
      onLinkStock: () => new Promise(done => { resolve = done; }) };
    const card = app.mountStatusCard(props);
    const pending = card.find(node => node.props?.id === 'btn-link-stock').props.onClick();
    const result = { success: true, newStock: 5, message: 'SANDBOX_ONLY_SUCCESS' };
    if (!late) { resolve(result); await pending; card.render(); assert.match(JSON.stringify(card.tree()), /SANDBOX_ONLY_SUCCESS/); }
    app.setRole('operator');
    props.checkResult = { ...props.checkResult, parentCode: 'OP-P', currentStock: 7 };
    card.render();
    if (late) { resolve(result); await pending; card.render(); }
    assert.ok(!JSON.stringify(card.tree()).includes('SANDBOX_ONLY_SUCCESS'));
    assert.ok(card.find(node => node.props?.id === 'btn-link-stock'), 'Operational stock action remains available');
  });
}
