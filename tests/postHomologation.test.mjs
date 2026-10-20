import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';

// Real extractors, drafts, snapshots and components; all provider traffic is a local fixture.
const bundle = await build({
  stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
    export * from './src/utils/imageUrls';
    export * from './src/utils/storeTime';
    export * from './src/utils/draft';
    export * from './src/utils/registrationSnapshot';
    export * from './src/utils/magazordPresentation';
    export * from './src/utils/dashboard';
    export { productionPeriodBounds } from './src/services/productionService';
    export { searchBookByIsbnDistribuidoraCuritiba, mergeBookWithDistribuidora } from './src/services/distribuidoraCuritiba';
    export { default as ImagesSection } from './src/components/magazord/ImagesSection';
    export { default as IdentitySection } from './src/components/magazord/ProductIdentitySection';
  ` }, bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
  plugins: [{ name: 'offline-only', setup(builder) {
    const mocks = [[/^react$/, 'module.exports=deps.react'],
      [/^react\/jsx-runtime$/, 'exports.jsx=exports.jsxs=(type,props)=>({type,props})'],
      [/^lucide-react$/, 'module.exports=new Proxy({},{get:(_,key)=>String(key)})'],
      [/\/lib\/supabase$/, 'exports.supabase={}']];
    builder.onResolve({ filter: /.*/ }, args => {
      const mock = mocks.find(([pattern]) => pattern.test(args.path));
      return mock ? { path: args.path, namespace: 'mock', pluginData: mock[1] } : undefined;
    });
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: args.pluginData, loader: 'js' }));
  } }],
});
const code = bundle.outputFiles[0].text;
function api(deps = {}) {
  const module = { exports: {} };
  new Function('deps', 'module', 'exports', code)(deps, module, module.exports);
  return module.exports;
}
const utils = api();
const directory = 'https://conteudo.example.com/images/lv/lv491848/';
const cover = `${directory}lv491848_1.jpg`;
const extra = `${directory}lv491848_2.jpg`;
const book = { isbn13: '9786555113655', title: 'O Atlas da Terra Média', authors: ['Autor'], coverUrl: cover, additionalImages: [extra] };
const at = '2026-10-15T14:21:31.110Z';

function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  return Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
}
function mount(name, initial) {
  let draft = structuredClone(initial), tree, cursor, dirty, effects;
  const slots = [], updates = [];
  const deps = { react: {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], next => { const value = typeof next === 'function' ? next(slots[i]) : next;
        if (!Object.is(value, slots[i])) { slots[i] = value; dirty = true; } }]; },
    useEffect(effect, dependencies) { const i = cursor++;
      if (!slots[i] || dependencies.some((value, j) => !Object.is(value, slots[i][j]))) {
        slots[i] = dependencies; effects.push(effect);
      }
    },
  } };
  const component = api(deps)[name];
  const onChange = change => { updates.push(change); draft = { ...draft, ...change }; dirty = true; };
  function render() {
    let count = 0;
    do {
      assert.ok(++count < 12, 'Effects must settle without repeatedly replacing the cover');
      cursor = 0; effects = []; dirty = false;
      tree = component({ draft, onChange, errors: {} }); effects.forEach(effect => effect());
    } while (dirty);
  }
  render();
  return { render, draft: () => draft, updates, find: predicate => nodes(tree).find(predicate),
    image: url => nodes(tree).find(node => node.type === 'img' && node.props.src === url),
    click(label) { nodes(tree).find(node => node.type === 'button' && nodes(node).some(child => child.props?.children === label)).props.onClick(); render(); } };
}

test('Curitiba rejects directory/HTML cover candidates and uses the existing additional image without extra requests', async t => {
  const previous = globalThis.fetch, requests = [];
  const responses = [{ cdSistema: 50 }, { cdProduto: 491848, dsProduto: book.title },
    { cdProduto: 491848, dsProduto: book.title, urlFoto: directory, urlFotoMiniatura: `${directory}index.html`,
      imagens: [{ urlImagem: cover }, { urlImagem: extra }, { urlImagem: cover }] }];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    assert.ok(requests.length <= 3, 'No image probing or additional bibliographic calls');
    return { ok: true, status: 200, json: async () => responses[requests.length - 1] };
  };
  t.after(() => { globalThis.fetch = previous; });
  const result = await utils.searchBookByIsbnDistribuidoraCuritiba(book.isbn13);
  assert.equal(result.diagnostic.state, 'success');
  assert.equal(result.book.coverUrl, cover); assert.equal(result.book.thumbnailUrl, cover);
  assert.deepEqual(result.book.additionalImages, [extra]);
  assert.equal(requests.length, 3); assert.ok(requests.every(request => request.options.method === 'POST'));
  const existing = utils.mergeBookWithDistribuidora(book, { coverUrl: extra, thumbnailUrl: extra });
  assert.equal(existing.coverUrl, cover, 'A valid existing cover is not replaced by enrichment');
});

test('Reference validation excludes HTML directories, binaries and credentials while retaining image endpoint URLs', () => {
  for (const value of [directory, `${directory}?x=1`, `${directory}index.HTML`, `${directory}page.htm`, 'data:image/png;base64,AAA', 'blob:abc', 'https://user:pass@example.com/a.jpg']) {
    assert.equal(utils.isImageReference(value), false, value);
  }
  assert.equal(utils.isImageReference(cover), true);
  assert.equal(utils.isImageReference('https://example.com/cover?id=123'), true);
  const draft = utils.createRegistrationDraft({ ...book, coverUrl: directory, thumbnailUrl: `${directory}page.html`, additionalImages: [cover, extra] });
  assert.equal(draft.mainImageUrl, cover); assert.deepEqual(draft.additionalImageUrls, [extra]);
});

for (const condition of ['novo', 'usado']) {
  test(`${condition}: a decoded additional image replaces a failed principal in the draft and snapshot`, () => {
    const initial = utils.createRegistrationDraft(book, condition);
    const view = mount('ImagesSection', initial);
    view.image(cover).props.onError(); view.render();
    assert.equal(view.draft().mainImageUrl, cover, 'Wait for a genuinely loadable fallback');
    view.image(extra).props.onLoad(); view.render();
    assert.equal(view.draft().mainImageUrl, extra);
    assert.deepEqual(view.draft().additionalImageUrls, []);
    const snapshot = utils.createRegistrationSnapshot(view.draft(), at);
    assert.equal(snapshot.fields.mainImageUrl, extra);
    assert.equal(utils.readRegistrationSnapshot(snapshot).fields.mainImageUrl, extra);
    assert.equal(initial.mainImageUrl, cover, 'No mutation of the original input');
    assert.equal(view.updates.length, 1);
  });
}

test('A valid principal is retained even when another image loads first; explicit selection remains available', () => {
  const view = mount('ImagesSection', utils.createRegistrationDraft(book));
  view.image(extra).props.onLoad(); view.render();
  assert.equal(view.draft().mainImageUrl, cover); assert.equal(view.updates.length, 0);
  view.image(cover).props.onLoad(); view.render();
  assert.equal(view.draft().mainImageUrl, cover);
  view.find(node => node.props?.title === 'Tornar capa principal').props.onClick(); view.render();
  assert.equal(view.draft().mainImageUrl, extra);
  assert.ok(view.draft().additionalImageUrls.includes(cover));
});

test('Directory cover is never requested by ImagesSection and fallback waits for successful decoding', () => {
  const view = mount('ImagesSection', { ...utils.createRegistrationDraft(book), mainImageUrl: directory, additionalImageUrls: [cover, extra] });
  assert.equal(view.image(directory), undefined);
  view.image(cover).props.onError(); view.render();
  view.image(extra).props.onLoad(); view.render();
  assert.equal(view.draft().mainImageUrl, extra);
  assert.deepEqual(view.draft().additionalImageUrls, [cover]);
});

test('Failed images do not promote another failed URL or cause an update loop', () => {
  const view = mount('ImagesSection', utils.createRegistrationDraft(book));
  view.image(extra).props.onError(); view.render();
  view.image(cover).props.onError(); view.render();
  assert.equal(view.updates.length, 0);
  view.render(); assert.equal(view.updates.length, 0);
});

test('Draft defaults, explicit reuse mode and condition toggles match new/used condition', () => {
  assert.equal(utils.createRegistrationDraft(book).registrationMode, 'new_product');
  assert.equal(utils.createRegistrationDraft(book, 'usado').registrationMode, 'new_used_from_known_edition');
  assert.equal(utils.createRegistrationDraft(book, 'novo', 'reuse_existing_new').registrationMode, 'reuse_existing_new');
  assert.equal(utils.createRegistrationDraft(book, 'usado', 'new_product').registrationMode, 'new_used_from_known_edition');
  const view = mount('IdentitySection', utils.createRegistrationDraft(book));
  view.click('USADO (SEBO)');
  assert.equal(view.draft().condition, 'usado'); assert.equal(view.draft().registrationMode, 'new_used_from_known_edition');
  assert.equal(view.draft().childCode, '');
  view.click('NOVO');
  assert.equal(view.draft().registrationMode, 'new_product'); assert.equal(view.draft().childCode, book.isbn13);
});

test('Reading old snapshots preserves their original mode and image references without repairing persisted data', () => {
  const old = { version: 1, capturedAt: at, fields: { title: book.title, condition: 'usado', registrationMode: 'new_product', mainImageUrl: directory } };
  const before = JSON.stringify(old);
  const result = utils.readRegistrationSnapshot(old);
  assert.equal(result.fields.registrationMode, 'new_product'); assert.equal(result.fields.mainImageUrl, directory);
  assert.equal(JSON.stringify(old), before);
});

test('Today bounds, labels and both daily groupings agree at São Paulo midnight and preserve UTC timestamps', () => {
  const instants = ['2026-10-15T02:59:59.999Z', '2026-10-15T03:00:00.000Z'];
  assert.deepEqual(instants.map(utils.storeDateKey), ['2026-10-14', '2026-10-15']);
  assert.equal(utils.productionPeriodBounds('today', new Date(instants[0])).start, '2026-10-14T03:00:00.000Z');
  assert.equal(utils.productionPeriodBounds('today', new Date(instants[1])).start, instants[1]);
  assert.equal(utils.formatStoreTime(instants[0], true), '23:59:59');
  assert.equal(utils.formatStoreTime(instants[1], true), '00:00:00');
  assert.match(utils.formatStoreDateTime(instants[0]), /14\/10\/2026.*23:59:59/);
  const rows = instants.map((completed_at, index) => ({ id: String(index), completed_at, created_at: '2026-10-01T12:00:00Z',
    operation_type: index ? 'used_copy_created' : 'isbn_search', condition: index ? 'used' : null, status: 'success', metadata: { mock: true } }));
  rows.push({ ...rows[0], completed_at: null, created_at: instants[1] });
  const before = JSON.stringify(rows);
  assert.deepEqual(utils.dailyOperationCounts(rows).map(day => [day.day, day.total]), [['2026-10-14', 1], ['2026-10-15', 2]]);
  assert.deepEqual(utils.dailyActivityCounts(rows).map(day => [day.day, day.searches, day.usedCreated]), [['2026-10-14', 1, 0], ['2026-10-15', 1, 1]]);
  assert.equal(JSON.stringify(rows), before);
});

test('Store dates are independent of remote browser timezone, including historical daylight-saving midnight', () => {
  const results = [];
  for (const TZ of ['UTC', 'Asia/Tokyo', 'America/Los_Angeles', 'America/Sao_Paulo']) {
    const script = `const deps={}; const module={exports:{}}; ${code}\nconst u=module.exports;
      console.log(JSON.stringify({label:u.formatStoreDateTime('${at}'),
        today:u.productionPeriodBounds('today',new Date('2026-10-15T02:59:59.999Z')),
        dst:u.startOfStoreDay(new Date('2018-11-04T12:00:00Z')).toISOString(),
        day:u.storeDateKey('2026-10-15T02:59:59.999Z')}));`;
    const result = spawnSync(process.execPath, ['--input-type=commonjs'], { input: script, encoding: 'utf8', env: { ...process.env, TZ } });
    assert.equal(result.status, 0, result.stderr); results.push(JSON.parse(result.stdout));
  }
  for (const result of results) assert.deepEqual(result, results[0]);
  assert.equal(results[0].dst, '2018-11-04T03:00:00.000Z', 'DST skipped local 00:00: first instant is 01:00');
  assert.match(results[0].label, /11:21:31/);
});

test('Simulation presentation identifies local catalog and stock without changing service behavior or blocking a future real adapter', () => {
  const current = utils.magazordPresentation;
  assert.equal(current.mode, 'simulated');
  assert.match(current.title, /simulada/); assert.match(current.submit, /SIMULADOR/);
  assert.match(current.notice, /Nenhum produto ou estoque é publicado/);
  assert.equal(current.message('Entrada vinculada na Magazord.'), 'Entrada vinculada no catálogo simulado Magazord.');
  assert.equal(current.message('Produto cadastrado no Magazord.'), 'Produto cadastrado no simulador Magazord.');
  const future = utils.getMagazordPresentation('real');
  assert.equal(future.message('Entrada vinculada na Magazord.'), 'Entrada vinculada na Magazord.');
  assert.equal(future.submit, 'CADASTRAR NA MAGAZORD');
});
