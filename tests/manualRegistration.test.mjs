import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const uid='11111111-1111-4111-8111-111111111111',isbn='9781234567897';
const user={id:uid,storeId:'22222222-2222-4222-8222-222222222222',role:'developer',active:true};
const utilityBuild=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`export * from './src/utils/draft';export * from './src/utils/registrationSnapshot';export {magazordMockService} from './src/services/magazordMockService';`},bundle:true,write:false,platform:'node',format:'cjs'});
const utilityModule={exports:{}};
new Function('module','exports','setTimeout',utilityBuild.outputFiles[0].text)(utilityModule,utilityModule.exports,fn=>queueMicrotask(fn));
const api=utilityModule.exports;
const appMocks = [
  [/^react$/, 'module.exports=deps.react'], [/^react\/jsx-runtime$/, 'exports.jsx=exports.jsxs=(type,props)=>({type,props})'],
  [/^lucide-react$/, 'module.exports=new Proxy({},{get:(_,key)=>String(key)})'],
  [/\/contexts\/UserContext$/, 'exports.useUser=()=>deps.user'],
  [/\/hooks\/useOperationAudit$/, 'exports.useOperationAudit=()=>({saveOperation:deps.audit,pending:[],retry:()=>{}})'],
  [/\/hooks\/useLocalHistory$/, 'exports.useLocalHistory=()=>({history:[],setHistory:()=>{},clearHistory:()=>{}})'],
  [/\/services\/brasilApi$/, 'exports.searchBookByIsbnBrasilApi=async()=>deps.brasil'],
  [/\/services\/curitibaProductLink$/, 'exports.loadCuritibaProductLink=async(...args)=>deps.productLink?deps.productLink(...args):[];exports.appendCuritibaProductLinks=(book,links)=>deps.appendProductLinks?deps.appendProductLinks(book,links):book'],
  [/\/services\/googleBooks$/, 'exports.searchGoogleBooks=async()=>deps.googleBooks||({status:"not_found",book:null,diagnostic:{code:"offline"}});exports.complementWithGoogleBooks=deps.googleMerge||((base)=>base)'],
  [/\/services\/distribuidoraCuritiba$/, 'exports.searchBookByIsbnDistribuidoraCuritiba=async()=>deps.curitiba;exports.mergeBookWithDistribuidora=(a,b)=>({...a,...b})'],
  [/\/lib\/supabase(?:\.js)?$/, 'exports.supabase={auth:{getSession:async()=>({data:{session:{user:{id:deps.user.currentUser.id},access_token:"synthetic-session"}}})}}'],
  [/(?:^|\/)amazonLabClient$/, 'exports.searchAmazonLab=(...args)=>deps.lab(...args)'],
  [/\/services\/magazordMockService$/, 'exports.magazordMockService={getSimulationConfig:()=>({mode:"auto"}),checkProductByEan:async()=>({matches:[]})}'],
];
for (const name of ['Header', 'SearchForm', 'BookDetailsCard', 'SearchHistoryGroup', 'CameraScannerModal', 'MagazordStatusCard', 'ProductRegistrationForm', 'OwnerDashboard', 'SettingsView'])
  appMocks.push([new RegExp(`(?:^|/)${name}$`), `module.exports=${JSON.stringify(name)}`]);
const appBundle = await build({ entryPoints: ['src/App.tsx'], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
  plugins: [{ name: 'app-offline', setup(b) {
    b.onResolve({ filter: /.*/ }, args => { const mock = appMocks.find(([pattern]) => pattern.test(args.path)); return mock ? { path: args.path, namespace: 'mock', pluginData: mock[1] } : undefined; });
    b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: args.pluginData }));
  } }] });
function mountApp(options = {}) {
  const deps = { user: { currentUser: { ...user, name: 'Synthetic Developer' }, operationEnvironment: 'development' },
    brasil: { book: { id: 'base', title: 'Existing title', isbn13: isbn, authors: ['Existing author'] }, diagnostic: { status: 200 } },
    curitiba: { book: null, diagnostic: { status: 404 } }, lab: async () => ({ status: 'interrompida' }), audit() {}, ...options };
  const slots = []; let cursor = 0, effects = [], tree;
  deps.react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useEffect(fn, dependencies) { const i = cursor++; if (!slots[i] || dependencies.some((v, n) => v !== slots[i][n])) { slots[i] = dependencies; effects.push(fn); } },
  };
  const module = { exports: {} }; new Function('deps', 'module', 'exports', appBundle.outputFiles[0].text)(deps, module, module.exports);
  function render() { cursor = 0; effects = []; tree = module.exports.default(); effects.forEach(fn => fn()); }
  function nodes(node) { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(n => nodes(n)); return [node, ...nodes(node.props?.children)]; }
  const find = type => nodes(tree).find(n => n.type === type || (typeof n.type === 'function' && n.type.name === type)); render();
  return { deps, render, find, all:()=>nodes(tree), search: (value = isbn) => find('SearchForm').props.onSearch(value) };
}

const registrationBuild = await build({ stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
  export { default as Form } from './src/components/magazord/ProductRegistrationForm';
  export { default as Images } from './src/components/magazord/ImagesSection';` },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', plugins: [{ name: 'registration-images', setup(b) {
    const mocks = [[/^react$/, 'module.exports=deps.react'], [/^react\/jsx-runtime$/, 'exports.jsx=exports.jsxs=(type,props)=>({type,props})'],
      [/^lucide-react$/, 'module.exports=new Proxy({},{get:(_,key)=>String(key)})'],
      [/\/lib\/supabase$/, 'exports.supabase={};exports.supabaseUrl="https://jcxdkrpmrfbrhzwbzhph.supabase.co"'],
      [/\/services\/magazordMockService$/, 'exports.magazordMockService=deps.service']];
    mocks.push([/\/hooks\/useMagazordCategories$/, 'exports.useMagazordCategories=()=>({loading:false,storeId:"22222222-2222-4222-8222-222222222222",catalog:{categories:[{id:20}],invalidCount:0},reload(){}})']);
    for (const name of ['ProductIdentitySection', 'CategoryAndBrandSection', 'CommercialSection', 'BibliographicSection', 'PhysicalAttributesSection', 'SynopsisSection', 'AdvancedFiscalSection'])
      mocks.push([new RegExp(`(?:^|/)${name}$`), `module.exports=${JSON.stringify(name)}`]);
    b.onResolve({ filter: /.*/ }, args => { const mock = mocks.find(([pattern]) => pattern.test(args.path)); return mock ? { path: args.path, namespace: 'mock', pluginData: mock[1] } : undefined; });
    b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: args.pluginData }));
  } }] });
const imageNodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(imageNodes) : [node, ...imageNodes(node.props?.children)];
const imageText = node => node == null || typeof node === 'boolean' ? '' : typeof node !== 'object' ? String(node) : Array.isArray(node) ? node.map(imageText).join('') : imageText(node.props?.children);
function mountRegistration(component, initialProps, service) {
  let props = initialProps, cursor = 0, effects = [], tree; const slots = [], deps = { service };
  deps.react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useEffect(fn, dependencies) { const i = cursor++; if (!slots[i] || dependencies.some((v, n) => !Object.is(v, slots[i][n]))) { slots[i] = dependencies; effects.push(fn); } },
  };
  const module = { exports: {} }; new Function('deps', 'module', 'exports', 'document', registrationBuild.outputFiles[0].text)(deps, module, module.exports, { querySelector: () => null });
  function render(updates = {}) { props = { ...props, ...updates }; cursor = 0; effects = []; tree = module.exports[component](props); effects.forEach(fn => fn()); }
  render(); return { render, all: predicate => imageNodes(tree).filter(predicate), find: predicate => imageNodes(tree).find(predicate), text: () => imageText(tree) };
}

const selectedCategory={category:'Livros > Literatura',magazordCategoryId:20,magazordCategoryStoreId:user.storeId,categorySource:'magazord'};
const emptyBook = { id: 'manual-entry', title: '' };
const initial = (condition = 'novo') => api.createRegistrationDraft(emptyBook, condition);
function setupStore(t) {
  const old = globalThis.localStorage, values = new Map();
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  t.after(() => { if (old === undefined) delete globalThis.localStorage; else globalThis.localStorage = old; });
  return api.magazordMockService.forStore(user.storeId);
}
function form(draft, service, events = []) {
  return mountRegistration('Form', { draft, imageUser:user, originalBook: emptyBook, onUpdateDraft() {}, onBackToSearch() {},
    onProcessNextBook() {}, onSuccessRegistration: (...args) => events.push(args) }, service);
}
function openReview(view) { view.find(node => node.props.id === 'btn-submit-magazord-registration').props.onClick(); view.render(); }

for (const role of ['developer', 'admin', 'operator']) test(`${role}: direct manual entry opens the existing empty form without any API lookup`, t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('Manual entry must not fetch'));
  const view = mountApp({ user: { currentUser: { ...user, role }, operationEnvironment: role === 'developer' ? 'development' : 'production' } });
  view.find('Header').props.onTabChange('cadastro'); view.render();
  const start = view.all().find(node => node.type === 'button' && imageText(node).includes('Iniciar cadastro manual'));
  assert.ok(start); assert.ok(view.all().some(node => imageText(node) === 'Consultar por ISBN'));
  start.props.onClick(); view.render();
  const props = view.find('ProductRegistrationForm').props;
  assert.equal(props.originalBook.id, 'manual-entry');
  assert.deepEqual(Object.values(view.find('ResearchSourcesPanel').props.states), ['waiting', 'waiting', 'waiting', 'waiting']);
  for (const key of ['title', 'publisher', 'brand', 'price', 'isbn10', 'isbn13', 'ean', 'parentCode', 'childCode', 'language', 'format', 'synopsis']) assert.ok(!props.draft[key], key);
  assert.equal(props.draft.quantity, 1); assert.deepEqual(props.draft.authors, []); assert.equal(props.draft.condition, 'novo');
});

for (const condition of ['novo', 'usado']) for (const withIsbn of [false, true])
test(`direct manual ${condition}, ${withIsbn ? 'with' : 'without'} ISBN: real validation, review, one simulator record and no invented ISBN`, async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('Manual registration must not fetch'));
  const service = setupStore(t); let draft = initial(condition);
  if (withIsbn) draft = { ...draft, ...api.registrationIdentifierUpdates(draft, 'isbn13', '978-1-23456-789-7') };
  draft = { ...draft, ...selectedCategory, title: 'Obra digitada manualmente', parentCode: 'LV12345-P', childCode: condition === 'novo' && withIsbn ? draft.childCode : 'LV12345', price: '29,90' };
  assert.deepEqual(api.validateRegistrationDraft(draft).errors, {}); assert.equal(draft.quantity, 1);
  const payloads = [], original = service.createProduct.bind(service);
  t.mock.method(service, 'createProduct', async (...args) => { payloads.push(structuredClone(args[0])); return original(...args); });
  const events = [], view = form(draft, service, events); openReview(view);
  assert.ok(view.find(node => node.props['aria-label'] === 'Revisão do cadastro'));
  const confirm = view.find(node => node.props.id === 'btn-confirm-magazord-registration').props.onClick;
  await Promise.all([confirm(), confirm()]); view.render(); await confirm();
  assert.equal(payloads.length, 1); assert.equal(events.length, 1);
  const payload = payloads[0]; assert.equal(payload.quantity, 1); assert.equal(payload.condition, condition); assert.equal(payload.price, '29,90');
  assert.equal(payload.isbn13, withIsbn ? isbn : ''); assert.equal(payload.ean, withIsbn ? isbn : ''); assert.equal(payload.isbn10, '');
  const records = service.getRecordsForEan(withIsbn ? isbn : draft.childCode, 'auto');
  assert.equal(records.length, 1); assert.equal(records[0].childCode, draft.childCode);
});

test('valid ISBN-10 is normalized and equivalent ISBN-13 remains valid without a bibliography request', () => {
  let draft = initial(); draft = { ...draft, ...api.registrationIdentifierUpdates(draft, 'isbn10', '1-23456-789-x') };
  assert.equal(draft.isbn10, '123456789X'); assert.equal(draft.ean, '123456789X'); assert.equal(draft.childCode, '123456789X');
  draft = { ...draft, ...selectedCategory, ...api.registrationIdentifierUpdates(draft, 'isbn13', isbn), title: 'Título', parentCode: 'LV12345-P', price: '10' };
  assert.deepEqual(api.validateRegistrationDraft(draft).errors, {}); assert.equal(draft.ean, isbn); assert.equal(draft.childCode, isbn);
});

for (const field of ['isbn10', 'isbn13', 'ean']) test(`invalid ${field} and an internal code cannot masquerade as a bibliographic identifier`, () => {
  for (const value of ['LV12345', field === 'isbn10' ? '1234567890' : '9781234567898']) {
    const draft = { ...initial(), title: 'Título', parentCode: 'LV12345-P', childCode: 'LV12345', price: '10', [field]: value };
    assert.ok(api.validateRegistrationDraft(draft).errors[field]);
  }
  const updated = api.registrationIdentifierUpdates(initial(), field, 'LV12345');
  if (field !== 'ean') { assert.equal(updated.childCode, undefined); assert.equal(updated.ean, undefined); }
});

test('switching NOVO/USADO retains edited metadata, manual codes, photos, SEO, price and quantity', () => {
  let draft = { ...initial(), title: 'Título manual', subtitle: 'Subtítulo', authors: ['Organizador'], publisher: 'Editora',
    parentCode: 'LV12345-P', childCode: 'LV12345', price: '19,90', quantity: 3, synopsis: 'Sinopse manual',
    metaDescription: 'SEO manual', metaDescriptionEdited: true, mainImageUrl: 'https://images.invalid/cover.jpg', additionalImageUrls: ['https://images.invalid/back.jpg'] };
  const before = structuredClone(draft);
  draft = { ...draft, ...api.registrationConditionUpdates(draft, 'usado') };
  draft = { ...draft, childCode: 'LV12346' };
  draft = { ...draft, ...api.registrationConditionUpdates(draft, 'novo') };
  assert.equal(draft.childCode, 'LV12345');
  for (const key of Object.keys(before).filter(key => !['registrationMode', 'condition', 'category', 'childCode'].includes(key))) assert.deepEqual(draft[key], before[key], key);
  draft = { ...draft, ...api.registrationConditionUpdates(draft, 'usado') }; assert.equal(draft.childCode, 'LV12346');
  assert.equal(api.createRegistrationSnapshot(draft, '2026-11-06T12:00:00Z').fields.conditionChildCodes, undefined);
});

test('changing an ISBN keeps explicit commercial overrides and updates an automatically derived code after condition toggling', () => {
  let draft = { ...initial(), ...api.registrationIdentifierUpdates(initial(), 'isbn13', isbn) };
  draft = { ...draft, ...api.registrationConditionUpdates(draft, 'usado') };
  draft = { ...draft, ...api.registrationIdentifierUpdates(draft, 'isbn13', '9788535914849') };
  draft = { ...draft, ...api.registrationConditionUpdates(draft, 'novo') }; assert.equal(draft.childCode, '9788535914849');
  const custom = { ...draft, childCode: 'LV54321' };
  assert.equal(api.registrationIdentifierUpdates(custom, 'isbn13', isbn).childCode, undefined);
});

test('manual form data survives leaving Cadastro, navigating to history, and reopening the form', () => {
  const view = mountApp(); view.find('Header').props.onTabChange('cadastro'); view.render();
  view.all().find(node => node.type === 'button' && imageText(node).includes('Iniciar cadastro manual')).props.onClick(); view.render();
  const edits = { title: 'Título persistente', isbn13: isbn, childCode: 'LV12345', parentCode: 'LV12345-P', price: '12,00', quantity: 4, metaDescription: 'SEO digitado' };
  view.find('ProductRegistrationForm').props.onUpdateDraft(edits); view.render();
  view.find('Header').props.onTabChange('historico'); view.render();
  view.find('Header').props.onTabChange('cadastro'); view.render();
  const draft = view.find('ProductRegistrationForm').props.draft;
  for (const key of Object.keys(edits)) assert.equal(draft[key], edits[key]);
  view.find('ProductRegistrationForm').props.onBackToSearch(); view.render();
  view.find('MagazordStatusCard').props.onOpenRegistration(); view.render();
  assert.equal(view.find('ProductRegistrationForm').props.draft.title, edits.title);
});

test('required title, commercial codes, positive price and quantity still block confirmation', () => {
  const draft = initial(); const errors = api.validateRegistrationDraft(draft).errors;
  for (const field of ['title', 'parentCode', 'childCode', 'price']) assert.ok(errors[field]);
  assert.equal(errors.isbn13, undefined); assert.equal(errors.isbn10, undefined); assert.equal(errors.ean, undefined);
  for (const price of ['0', '-1', '10abc']) assert.ok(api.validateRegistrationDraft({ ...draft, price }).errors.price);
  for (const quantity of [0, -1, 1.5]) assert.ok(api.validateRegistrationDraft({ ...draft, quantity }).errors.quantity);
});

test('an already used commercial code is rejected without overwriting the existing simulator record', async t => {
  const service = setupStore(t), draft = { ...initial(), ...selectedCategory, title: 'Primeira obra', parentCode: 'LV12345-P', childCode: 'LV12345', price: '10' };
  await service.createProduct(draft, 'auto'); const before = structuredClone(service.getRecordsForEan(draft.childCode));
  const events = [], view = form({ ...draft, title: 'Outra obra' }, service, events); openReview(view);
  await view.find(node => node.props.id === 'btn-confirm-magazord-registration').props.onClick(); view.render();
  assert.match(view.text(), /Código Filho já utilizado/); assert.deepEqual(service.getRecordsForEan(draft.childCode), before); assert.equal(events.length, 0);
});

test('a valid lookup with no provider results still opens manual NEW/USED with its searched ISBN', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ isbn, items: [] }));
  const view = mountApp({ brasil: { book: null, diagnostic: { status: 404 } }, curitiba: { book: null, diagnostic: { status: 404 } } });
  await view.search(isbn); view.render(); assert.equal(view.find('MagazordStatusCard').props.manualEntry, true);
  for (const condition of ['novo', 'usado']) {
    view.find('MagazordStatusCard').props.onOpenRegistration(condition); view.render();
    const draft = view.find('ProductRegistrationForm').props.draft;
    assert.equal(draft.isbn13, isbn); assert.equal(draft.condition, condition); assert.equal(draft.quantity, 1);
    view.find('ProductRegistrationForm').props.onBackToSearch(); view.render();
  }
});

