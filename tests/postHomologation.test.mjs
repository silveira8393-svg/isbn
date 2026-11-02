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
    export { default as CommercialSection } from './src/components/magazord/CommercialSection';
    export { default as PhysicalSection } from './src/components/magazord/PhysicalAttributesSection';
  ` }, bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
  plugins: [{ name: 'offline-only', setup(builder) {
    const mocks = [[/^react$/, 'module.exports=deps.react'],
      [/^react\/jsx-runtime$/, 'exports.jsx=exports.jsxs=(type,props)=>({type,props})'],
      [/^lucide-react$/, 'module.exports=new Proxy({},{get:(_,key)=>String(key)})'],
      [/\/lib\/supabase$/, 'exports.supabase=deps.supabase||{};exports.supabaseUrl=deps.supabaseUrl||"https://jcxdkrpmrfbrhzwbzhph.supabase.co"']];
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
const photoUser = { id: '11111111-1111-4111-8111-111111111111', storeId: '492af2ad-905c-42f8-90f4-aa6c1dc142f3', active: true, role: 'developer' };
const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const photoFile = (name = 'foto.png', tail = '') => new File([pngBytes, tail], name, { type: 'image/png' });
const photoConfig = storage => ({ client: storage.supabase, projectUrl: storage.supabaseUrl || 'https://jcxdkrpmrfbrhzwbzhph.supabase.co' });
function bitmapMock(t) {
  const previous = globalThis.createImageBitmap;
  globalThis.createImageBitmap = async file => {
    if (file.name === 'corrupt.png') throw new Error('decode failed');
    return { width: 1, height: 1, close() {} };
  };
  t.after(() => { if (previous) globalThis.createImageBitmap = previous; else delete globalThis.createImageBitmap; });
}
function photoStorage(options = {}) {
  const files = new Map(), calls = [];
  const bucket = {
    async upload(path, file, config) {
      calls.push({ method: 'upload', path, config });
      if (options.upload) return options.upload(path, file, config);
      if (files.has(path)) return { error: { statusCode: '409' } };
      files.set(path, file); return { data: { path }, error: null };
    },
    async download(path, ...args) { calls.push({ method: 'download', path, args }); return { data: files.get(path) || null, error: files.has(path) ? null : { message: 'unavailable' } }; },
  };
  const supabase = { auth: { getSession: async () => ({ data: { session: { user: { id: options.actor || photoUser.id } } } }) },
    storage: { from(name) { assert.equal(name, 'isbn-registration-images'); return bucket; } } };
  return { files, calls, supabase, ...options };
}

function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  return Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
}
function mount(name, initial, options = {}) {
  let draft = structuredClone(initial), tree, cursor, dirty, effects;
  const slots = [], updates = [];
  const cleanups = [];
  const deps = { ...options, react: {
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
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
      tree = component({ draft, onChange, errors: {}, ...options.props }); effects.forEach(effect => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); });
    } while (dirty);
  }
  render();
  return { render, draft: () => draft, updates, find: predicate => nodes(tree).find(predicate), all: predicate => nodes(tree).filter(predicate),
    unmount: () => cleanups.forEach(cleanup => cleanup()),
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

test('registration validates both ISBN check digits and correspondence without inventing missing identifiers', () => {
  const valid = { ...utils.createRegistrationDraft(book), parentCode: 'P', price: '50,00' };
  for (const ids of [{ isbn13: '9788535914849', isbn10: '8535914846', ean: '978-85-359-1484-9' },
    { isbn13: '', isbn10: '0-8044-2957-X', ean: '' }, { isbn13: '', isbn10: '', ean: '' }]) {
    assert.deepEqual(utils.validateRegistrationDraft({ ...valid, ...ids }).errors, {});
  }
  for (const ids of [{ isbn13: '9788535914848' }, { isbn10: '8535914847' }, { isbn10: '0000000000' },
    { isbn13: '9788535914849', isbn10: '0515154555', ean: '9788535914849' }, { ean: '9780515154559' }]) {
    const result = utils.validateRegistrationDraft({ ...valid, ...ids });
    assert.ok(['isbn13', 'isbn10', 'ean'].some(field => result.errors[field]), JSON.stringify(ids));
  }
});

test('Brazilian prices are parsed entirely and formatted with exactly two decimal places', () => {
  for (const [input, amount, label] of [['50', 50, 'R$ 50,00'], ['50,00', 50, 'R$ 50,00'], ['1.234,56', 1234.56, 'R$ 1.234,56'],
    ['1.234', 1234, 'R$ 1.234,00'], ['50.5', 50.5, 'R$ 50,50'], ['0,01', .01, 'R$ 0,01']]) {
    assert.equal(utils.parseRegistrationPrice(input), amount);
    assert.equal(utils.formatRegistrationPrice(input).replace(/\s/g, ' '), label);
  }
  for (const input of ['', '-10', '1e3', 'Infinity', '1.23,45', '50,001', '1,2,3', '10 reais']) assert.equal(utils.parseRegistrationPrice(input), undefined, input);
});

test('price typing preserves the entered text and formats two Brazilian decimal places only on blur', () => {
  const view = mount('CommercialSection', utils.createRegistrationDraft(book));
  const input = () => view.find(node => node.props['data-registration-field'] === 'price');
  for (const [typed, completed] of [['5', '5,00'], ['50', '50,00'], ['50,00', '50,00'], ['1.234,56', '1.234,56'], ['50,', '50,'], ['-10', '-10']]) {
    input().props.onFocus(); view.render();
    input().props.onChange({ target: { value: typed } }); view.render();
    assert.equal(input().props.value, typed, 'typing cannot move the caret by rewriting the value');
    input().props.onBlur({ target: { value: typed } }); view.render();
    assert.equal(input().props.value, completed);
  }
  assert.ok(utils.validateRegistrationDraft(view.draft()).errors.price, 'invalid negative input remains invalid');
});

test('unfocused price is formatted from the current draft even on mounting, delayed parent updates and returning to the form', () => {
  for (const price of ['50', '50,00', '1.234,56']) {
    const initial = { ...utils.createRegistrationDraft(book), price }, changes = [];
    const view = mount('CommercialSection', initial, { props: { onChange: update => changes.push(update) } });
    const input = () => view.find(node => node.props['data-registration-field'] === 'price');
    const formatted = price === '1.234,56' ? price : '50,00';
    assert.equal(input().props.value, formatted);
    input().props.onFocus(); view.render(); assert.equal(input().props.value, price);
    input().props.onBlur({ target: { value: price } }); view.render();
    assert.equal(input().props.value, formatted, 'rendered price must not depend on a synchronous parent update');
    assert.equal(view.draft().price, price, 'test parent intentionally keeps the original raw value');
    assert.equal(mount('CommercialSection', initial).find(node => node.props['data-registration-field'] === 'price').props.value, formatted);
    assert.ok(view.all(node => node.type === 'span' && node.props.children === 'R$').length, 'visual currency prefix is preserved');
  }
});

test('imported float noise is rounded for g/cm fields, while raw source axes and suspicious weight remain available', () => {
  const source = { id: 'amazon-spapi-fixture', title: 'The Art of the Batman', isbn13: '9781419762109', provider: 'Amazon SP-API',
    weight: 10.000000001, weightUnit: 'g', dimensionsUnit: 'cm', width: 24.2999999752, height: 3.1799999676, depth: 30.4999999689,
    amazonPhysical: { item: { width: { value: 24.2999999752, unit: 'centimeters' }, height: { value: 3.1799999676, unit: 'centimeters' }, length: { value: 30.4999999689, unit: 'centimeters' } } } };
  const before = structuredClone(source), draft = utils.createRegistrationDraft(source), view = mount('PhysicalSection', draft);
  for (const [field, expected] of [['weight', 10], ['width', 24.3], ['height', 3.18], ['depth', 30.5]]) {
    assert.equal(view.find(node => node.props['data-registration-field'] === field).props.value, expected);
  }
  assert.deepEqual(source, before, 'original measurements are not rewritten');
  const report = utils.validateRegistrationDraft(draft, source);
  assert.match(report.warnings.weight, /10 g/);
  assert.equal(report.warnings.height, undefined); assert.equal(report.warnings.depth, undefined);
  const corrected = utils.validateRegistrationDraft({ ...draft, height: 30.5, depth: 3.18 }, source);
  assert.equal(corrected.warnings.height, undefined); assert.equal(corrected.warnings.depth, undefined);
});

test('9781419762109: 10 g is a red-review observation, not a blocker or an invented replacement; declared kg always convert reliably', () => {
  const source = { id: 'fixture', title: 'The Art of the Batman', isbn13: '9781419762109', weight: .01, weightUnit: 'kg' };
  const draft = { ...utils.createRegistrationDraft(source), parentCode: 'BATMAN-P', price: '1.234,56' };
  const result = utils.validateRegistrationDraft(draft, source);
  assert.equal(draft.weight, 10); assert.deepEqual(result.errors, {}); assert.match(result.warnings.weight, /PESO POSSIVELMENTE INCORRETO: 10 g/);
  assert.equal(utils.createRegistrationDraft({ ...source, weight: 20 }).weight, 20000, 'never reinterpret a declared kg value as grams based on magnitude');
  assert.equal(utils.createRegistrationDraft({ ...source, weight: 0 }).weight, 0, 'suspicious values stay visible for review');
});

test('optional metadata and unconfirmed units produce observations, while essential omissions and invalid quantities block', () => {
  const draft = { ...utils.createRegistrationDraft({ id: 'manual', title: 'Título não cadastrado' }), parentCode: '', childCode: '', price: '-10', quantity: 1.5,
    year: '07T00:00:01Z/05/2013', edition: 'Não informado', pageCount: -1, weight: 10, width: -3 };
  const result = utils.validateRegistrationDraft(draft);
  for (const field of ['title', 'parentCode', 'childCode', 'price', 'quantity']) assert.match(result.errors[field], /^Erro obrigatório/);
  for (const field of ['authors', 'publisher', 'year', 'edition', 'language', 'format', 'pageCount', 'weight', 'width']) assert.match(result.warnings[field], /^Observação/);
  assert.equal(draft.language, ''); assert.equal(draft.format, '');
  const imported = { id: 'brasilapi-fixture', title: 'Livro', language: 'pt', weight: 200, width: 20 };
  const unconfirmed = utils.validateRegistrationDraft(utils.createRegistrationDraft(imported), imported);
  assert.match(unconfirmed.warnings.language, /sem confirmação explícita/);
  assert.match(unconfirmed.warnings.weight, /não declarou a unidade/); assert.match(unconfirmed.warnings.width, /não declarou centímetros/);
  assert.deepEqual(utils.validateRegistrationDraft({ ...draft, title: 'Livro', parentCode: 'P', childCode: 'EXEMPLAR', price: '50', quantity: 1, condition: 'usado' }).errors, {});
});

test('image references are validated without availability probes, and placeholder titles cannot be confirmed', t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('validation must not probe image URLs or call providers'));
  const valid = { ...utils.createRegistrationDraft(book), parentCode: 'P', price: '50', mainImageUrl: 'https://example.invalid/temporarily-offline.jpg' };
  assert.deepEqual(utils.validateRegistrationDraft(valid).errors, {});
  for (const title of ['Título não cadastrado.', ' TÍTULO NÃO ENCONTRADO ', 'Não informado', '...', '']) assert.ok(utils.validateRegistrationDraft({ ...valid, title }).errors.title);
  for (const mainImageUrl of ['javascript:bad', 'blob:temporary', 'https://example.invalid/images/', 'https://example.invalid/a.jpg?token=secret'])
    assert.ok(utils.validateRegistrationDraft({ ...valid, mainImageUrl }).errors.mainImageUrl);
  assert.deepEqual(utils.validateRegistrationDraft({ ...valid, mainImageUrl: undefined, additionalImageUrls: [] }).errors, {});
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

test('failed cover and additional images remain removable, including removal of every image', () => {
  const view = mount('ImagesSection', utils.createRegistrationDraft(book));
  view.image(extra).props.onError(); view.image(cover).props.onError(); view.render();
  assert.ok(view.find(node => node.props.title === 'Remover capa principal'));
  view.find(node => node.props.title === 'Remover foto').props.onClick(); view.render();
  assert.deepEqual(view.draft().additionalImageUrls, []);
  view.find(node => node.props.title === 'Remover capa principal').props.onClick(); view.render();
  assert.equal(view.draft().mainImageUrl, undefined);
  assert.deepEqual(utils.createRegistrationSnapshot(view.draft(), at).fields.additionalImageUrls, []);
});

test('a manually selected cover is not automatically replaced after failure or later image loads', () => {
  const inside = 'https://example.invalid/inside.jpg';
  const view = mount('ImagesSection', utils.createRegistrationDraft({ ...book, additionalImages: [extra, inside] }));
  view.find(node => node.props.title === 'Tornar capa principal').props.onClick(); view.render();
  assert.equal(view.draft().mainImageUrl, extra);
  view.image(extra).props.onError(); view.image(cover).props.onLoad(); view.image(inside).props.onLoad(); view.render();
  assert.equal(view.draft().mainImageUrl, extra, 'manual choice survives the automatic fallback');
  view.all(node => node.props.title === 'Remover foto')[0].props.onClick(); view.render();
  assert.deepEqual(view.draft().additionalImageUrls, [inside]);
  view.render(); assert.deepEqual(view.draft().additionalImageUrls, [inside], 'removed image is not reinserted');
});

test('local file validation rejects MIME, size, signature and decode failures before Storage is contacted', async t => {
  bitmapMock(t);
  for (const file of [new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' }), new File([], 'empty.png', { type: 'image/png' }),
    new File([new Uint8Array(utils.BOOK_IMAGE_MAX_BYTES + 1)], 'large.png', { type: 'image/png' }),
    new File(['not an image'], 'fake.png', { type: 'image/png' }), new File([pngBytes], 'fake.jpg', { type: 'image/jpeg' }), photoFile('corrupt.png')]) {
    await assert.rejects(utils.prepareLocalBookImage(file), /JPEG|conteúdo|5 MiB|imagem válido/);
  }
  const a = await utils.prepareLocalBookImage(photoFile('a.png')), b = await utils.prepareLocalBookImage(photoFile('different-name.png'));
  assert.equal(a.hash, b.hash); assert.equal(a.extension, 'png');
});

test('upload validates project/session, scopes files to store/user, deduplicates content without overwriting and opens private files without signed URLs', async t => {
  bitmapMock(t); const storage = photoStorage(), images = api(storage), prepared = await images.prepareLocalBookImage(photoFile());
  const reference = await images.uploadLocalBookImage(prepared, photoUser, photoConfig(storage));
  assert.match(reference, new RegExp(`/authenticated/isbn-registration-images/${photoUser.storeId}/${photoUser.id}/${prepared.hash}\\.png$`));
  assert.equal(images.isStoredBookImage(reference), true);
  assert.equal(await images.uploadLocalBookImage(prepared, photoUser, photoConfig(storage)), reference);
  const legacyDuplicate = photoStorage({ upload: async () => ({ error: { statusCode: '400', message: 'The resource already exists' } }) });
  legacyDuplicate.files.set(storage.calls[0].path, prepared.file);
  assert.equal(await images.uploadLocalBookImage(prepared, photoUser, photoConfig(legacyDuplicate)), reference, 'documented 400 duplicate is verified without overwrite');
  assert.ok(storage.calls.filter(call => call.method === 'upload').every(call => call.config.upsert === false));
  assert.equal(storage.files.size, 1);
  const opened = await images.openStoredBookImage(reference, photoConfig(storage));
  assert.match(opened.url, /^blob:/); opened.release();
  for (const wrong of [reference.replace('jcxdkrpmrfbrhzwbzhph.supabase.co', 'evil.invalid'), reference + '?token=secret']) {
    assert.equal(images.isStoredBookImage(wrong), false); await assert.rejects(images.openStoredBookImage(wrong, photoConfig(storage)), /inválida/);
  }
  const before = storage.calls.length;
  await assert.rejects(images.uploadLocalBookImage(prepared, photoUser, photoConfig({ ...storage, supabaseUrl: 'https://other.supabase.co' })), /projeto ISBN/);
  await assert.rejects(images.uploadLocalBookImage(prepared, photoUser, photoConfig(photoStorage({ actor: 'different-user' }))), /sessão mudou/);
  await assert.rejects(images.uploadLocalBookImage(prepared, { ...photoUser, active: false }, photoConfig(storage)), /Entre novamente/);
  assert.equal(storage.calls.length, before);
  storage.files.set(storage.calls[0].path, new Blob(['wrong content']));
  await assert.rejects(images.uploadLocalBookImage(prepared, photoUser, photoConfig(storage)), /Nenhum arquivo foi substituído/);
});

test('multiple local photos are previewed before upload; duplicate files are ignored and selected references survive snapshots in order', async t => {
  bitmapMock(t); const storage = photoStorage(), busy = [], pending = [];
  const view = mount('ImagesSection', utils.createRegistrationDraft(book), { ...storage,
    props: { user: photoUser, onUploadBusyChange: value => busy.push(value), onPendingPhotosChange: count => pending.push(count) } });
  t.after(view.unmount);
  await view.find(node => node.props.type === 'file').props.onChange({ target: { files: [photoFile('a.png'), photoFile('same.png'), photoFile('b.png', 'different')], value: 'input' } }); view.render();
  assert.equal(view.all(node => node.type === 'img' && /^Prévia/.test(node.props.alt)).length, 2);
  assert.equal(storage.calls.length, 0, 'selection does not upload before confirmation');
  await view.find(node => node.type === 'button' && node.props.children === 'Confirmar fotos selecionadas').props.onClick(); view.render();
  const refs = view.draft().additionalImageUrls;
  assert.equal(view.draft().mainImageUrl, cover); assert.equal(refs[0], extra); assert.equal(refs.length, 3);
  assert.ok(refs.slice(1).every(utils.isStoredBookImage));
  assert.equal(storage.calls.filter(call => call.method === 'upload').length, 2);
  const saved = utils.readRegistrationSnapshot(utils.createRegistrationSnapshot(view.draft(), at));
  assert.equal(saved.fields.mainImageUrl, cover); assert.deepEqual(saved.fields.additionalImageUrls, refs);
  assert.doesNotMatch(JSON.stringify(saved), /blob:|data:|imageSelectionManual|access_token/);
  assert.deepEqual(busy, [true, false, true, false]);
  assert.deepEqual(pending, [1, 2, 1, 0], 'the form knows about each pending preview and its confirmed upload');
  await new Promise(resolve => setImmediate(resolve)); view.render();
  assert.equal(view.all(node => node.type === 'img' && /^Prévia/.test(node.props.alt)).length, 0);
  assert.ok(view.all(node => node.type === 'img').every(node => !node.props.src.includes('/object/authenticated/')), 'private images use authenticated blobs, never naked protected URLs');
});

test('partial upload failure preserves the registration and pending photo, and completion respects manual changes made while upload was pending', async t => {
  bitmapMock(t); let release, count = 0;
  const started = new Promise(resolve => { release = resolve; });
  let finish;
  const waiting = new Promise(resolve => { finish = resolve; });
  const storage = photoStorage({ upload: async () => { count++; if (count === 1) { release(); await waiting; return { error: null }; } return { error: { message: 'private server details' } }; } });
  const view = mount('ImagesSection', utils.createRegistrationDraft(book), { ...storage, props: { user: photoUser } });
  t.after(view.unmount);
  await view.find(node => node.props.type === 'file').props.onChange({ target: { files: [photoFile(), photoFile('b.png', 'different')], value: '' } }); view.render();
  const uploading = view.find(node => node.type === 'button' && node.props.children === 'Confirmar fotos selecionadas').props.onClick(); await started;
  view.find(node => node.props.title === 'Tornar capa principal').props.onClick(); view.render();
  view.find(node => node.props.title === 'Remover foto').props.onClick(); view.render(); // Remove the previous automatic cover.
  finish(); await uploading; view.render();
  assert.equal(view.draft().mainImageUrl, extra);
  assert.equal(view.draft().additionalImageUrls.length, 1); assert.ok(utils.isStoredBookImage(view.draft().additionalImageUrls[0]));
  assert.ok(!view.draft().additionalImageUrls.includes(cover));
  assert.equal(view.all(node => node.type === 'img' && /^Prévia/.test(node.props.alt)).length, 1);
  assert.ok(view.find(node => node.props.role === 'alert')); assert.equal(view.draft().title, book.title);
});

test('prepared Storage change grants private store-scoped reads and owner-path inserts only, without new tables or overwrite/delete access', async () => {
  const { readFile } = await import('node:fs/promises');
  const sql = await readFile('supabase/setup/registration_images.sql', 'utf8');
  assert.match(sql, /false, 5242880/); assert.match(sql, /image\/jpeg.*image\/png.*image\/webp/);
  assert.equal((sql.match(/create policy /g) || []).length, 2);
  assert.match(sql, /for select to authenticated/); assert.match(sql, /for insert to authenticated/);
  assert.equal((sql.match(/su\.store_id::text = \(storage.foldername\(name\)\)\[1\]/g) || []).length, 2);
  assert.match(sql, /\[2\] = \(select auth.uid\(\)\)::text/);
  assert.equal((sql.match(/p\.active/g) || []).length, 2); assert.equal((sql.match(/su\.active/g) || []).length, 2);
  assert.doesNotMatch(sql, /create table|security definer|for (update|delete)|to anon|public = true/i);
});

test('unavailable private photographs remain removable and retry only on request; re-adding a removed reference downloads a fresh blob', async t => {
  bitmapMock(t); const storage = photoStorage({ upload: async () => ({ error: null }) });
  const view = mount('ImagesSection', utils.createRegistrationDraft({ id: 'manual', title: 'Manual' }), { ...storage, props: { user: photoUser } });
  t.after(view.unmount);
  await view.find(node => node.props.type === 'file').props.onChange({ target: { files: [photoFile()], value: '' } }); view.render();
  await view.find(node => node.props.children === 'Confirmar fotos selecionadas').props.onClick(); view.render();
  await new Promise(resolve => setImmediate(resolve)); view.render();
  assert.ok(view.find(node => node.props.title === 'Remover capa principal'));
  const downloadCount = () => storage.calls.filter(call => call.method === 'download').length;
  assert.equal(downloadCount(), 1); view.render(); assert.equal(downloadCount(), 1);
  const reference = view.draft().mainImageUrl, path = storage.calls[0].path;
  storage.files.set(path, photoFile());
  view.find(node => node.props.children === 'Tentar carregar imagens novamente').props.onClick(); view.render();
  await new Promise(resolve => setImmediate(resolve)); view.render();
  const previousBlob = view.find(node => node.type === 'img' && node.props.alt === 'Capa principal').props.src;
  assert.match(previousBlob, /^blob:/); assert.equal(downloadCount(), 2);
  view.find(node => node.props.title === 'Remover capa principal').props.onClick(); view.render();
  view.click('Adicionar URL');
  view.find(node => node.props.type === 'url').props.onChange({ target: { value: reference } }); view.render();
  view.find(node => node.props.type === 'url').props.onKeyDown({ key: 'Enter', preventDefault() {} }); view.render();
  await new Promise(resolve => setImmediate(resolve)); view.render();
  const freshBlob = view.find(node => node.type === 'img' && node.props.alt === 'Capa principal').props.src;
  assert.match(freshBlob, /^blob:/); assert.notEqual(freshBlob, previousBlob); assert.equal(downloadCount(), 3);
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
