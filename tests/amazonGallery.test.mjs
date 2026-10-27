import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
  export { default as LabGallery } from './src/components/AmazonLabImageGallery';
  export { default as BookDetails } from './src/components/BookDetailsCard';
` }, bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
  plugins: [{ name: 'controlled-react', setup(builder) {
    builder.onResolve({ filter: /^(react|react\/jsx-runtime|lucide-react)$/ }, args => ({ path: args.path, namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ loader: 'js', contents: args.path === 'react'
      ? 'module.exports=globalThis.__galleryHooks'
      : args.path === 'react/jsx-runtime' ? 'exports.jsx=exports.jsxs=(type,props)=>({type,props})'
      : 'module.exports=new Proxy({},{get:(_,key)=>String(key)})' }));
  } }],
});
const module = { exports: {} };
// Exports are compiled once; the hook methods resolve the currently mounted view.
const hooks = { useState() {}, useEffect() {} };
globalThis.__galleryHooks = hooks;
new Function('module', 'exports', bundle.outputFiles[0].text)(module, module.exports);
delete globalThis.__galleryHooks;
const { LabGallery, BookDetails } = module.exports;

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
}
function text(tree) {
  if (tree == null || typeof tree === 'boolean') return '';
  if (typeof tree !== 'object') return String(tree);
  return Array.isArray(tree) ? tree.map(text).join(' ') : text(tree.props?.children);
}
function mount(Component, initialProps) {
  const slots = [], pending = [];
  let index = 0, props = initialProps, tree;
  Object.assign(hooks, {
    useState(initial) { const at = index++; if (!(at in slots)) slots[at] = typeof initial === 'function' ? initial() : initial;
      return [slots[at], value => { slots[at] = typeof value === 'function' ? value(slots[at]) : value; }]; },
    useEffect(callback, deps) { const at = index++;
      if (!slots[at] || deps.some((dep, i) => dep !== slots[at][i])) { slots[at] = deps; pending.push(callback); } },
  });
  function expand(node) {
    if (Array.isArray(node)) return node.map(expand);
    if (!node || typeof node !== 'object') return node;
    if (typeof node.type === 'function') return expand(node.type(node.props));
    return { ...node, props: { ...node.props, children: expand(node.props?.children) } };
  }
  function render(next = props) { props = next; index = 0; tree = expand(Component(props)); return tree; }
  render();
  return { render, find: predicate => nodes(tree).find(predicate), all: predicate => nodes(tree).filter(predicate),
    text: () => text(tree), effects() { pending.splice(0).forEach(callback => callback()); render(); } };
}

const base = 'https://isbn-fixtures.invalid/';
const cover = base + 'capa-autoral.svg', thumb = base + 'capa-miniatura-autoral.svg';
const back = base + 'contracapa-autoral.svg', inside = base + 'miolo-autoral.svg';
const image = (referencia, papel = 'adicional') => ({
  referencia, papel, origem: '#fixture', disponibilidade_tecnica: 'referencia_identificada_nao_verificada',
});
const allowed = () => ({ download_realizado: false,
  itens: [{ ...image(cover, 'principal'), miniatura: thumb }, image(back), image(inside)] });
const featured = view => view.find(node => node.type === 'img' && /^(Capa|Imagem) do livro /.test(node.props.alt));
const select = (view, label) => { view.find(node => node.type === 'button' && (node.props['aria-label'] || node.props.title) === label).props.onClick(); view.render(); };

test('legacy remote flags do not block valid image references', () => {
  for (const flag of [false, undefined, null, 'true', 1]) {
    const images = { ...allowed(), carregamento_remoto_permitido: flag };
    const view = mount(LabGallery, { images, title: 'Livro' });
    assert.equal(featured(view).props.src, cover);
    assert.equal(view.all(node => node.type === 'button').length, 3);
  }
});

test('image display requires no authorization status', () => {
  for (const status of ['nao_comprovada', undefined, '', 'autorizado', 'unknown']) {
    const images = { ...allowed(), itens: [{ ...image(cover, 'principal'), autorizacao_uso: status }] };
    const view = mount(LabGallery, { images, title: 'Livro' });
    assert.equal(featured(view).props.src, cover);
    assert.doesNotMatch(view.text(), /autorização|não autorizado/);
  }
});

test('gallery highlights the cover and selecting a thumbnail changes only the display', () => {
  const images = allowed(), before = structuredClone(images);
  const view = mount(LabGallery, { images, title: 'Livro sintético' });
  assert.equal(featured(view).props.src, cover);
  assert.equal(view.all(node => node.type === 'button').length, 3);
  assert.deepEqual(view.all(node => node.type === 'img').map(node => node.props.src), [cover, thumb, back, inside]);
  select(view, 'Imagem adicional 1');
  assert.equal(featured(view).props.src, back);
  assert.equal(view.find(node => node.props['aria-label'] === 'Imagem adicional 1').props['aria-pressed'], true);
  select(view, 'Capa principal');
  assert.equal(featured(view).props.src, cover);
  assert.deepEqual(images, before, 'Não alterar referências, origem ou contrato recebido');
  assert.ok(view.all(node => node.type === 'img').every(node => node.props.referrerPolicy === 'no-referrer'));
});

test('references and thumbnails render without authorization metadata and are deduplicated', () => {
  const images = allowed();
  images.itens[0].autorizacao_miniatura = 'nao_comprovada';
  images.itens.push(image('https://example.invalid/outra.jpg'), image(back), image(cover));
  const view = mount(LabGallery, { images, title: 'Livro' });
  assert.deepEqual(view.all(node => node.type === 'img').map(node => node.props.src), [cover, thumb, back, inside, 'https://example.invalid/outra.jpg']);
});

test('unsafe, non-HTTPS and parameterized references remain unrendered independently of legacy metadata', () => {
  for (const url of ['javascript:alert(1)', 'data:image/svg+xml,<svg/>', 'http://example.invalid/a.jpg',
    'https://user:password@example.invalid/a.jpg', 'https://example.invalid/a.jpg?token=secret', 'https://example.invalid/a.jpg#token',
    'https://example.invalid/index.html', 'https://example.invalid/images/']) {
    const view = mount(LabGallery, { images: { ...allowed(), itens: [image(url, 'principal')] }, title: 'Livro' });
    assert.equal(view.all(node => ['img', 'a', 'iframe'].includes(node.type)).length, 0, url);
  }
});

test('only removal of an image reference resets a stale selection', () => {
  const images = allowed();
  const view = mount(LabGallery, { images, title: 'Livro' });
  select(view, 'Imagem adicional 2');
  view.render({ images: { ...images, carregamento_remoto_permitido: false,
    itens: images.itens.map(item => ({ ...item, autorizacao_uso: 'nao_comprovada' })) }, title: 'Livro' });
  assert.equal(featured(view).props.src, inside);
  view.render({ images: { ...images, itens: images.itens.filter(item => item.referencia !== inside) }, title: 'Livro' });
  assert.equal(featured(view).props.src, cover);
});

test('failed images fall back safely and are not retried during selection', () => {
  const view = mount(LabGallery, { images: allowed(), title: 'Livro' });
  featured(view).props.onError(); view.render();
  assert.equal(featured(view).props.src, thumb, 'Miniatura autorizada substitui capa indisponível');
  select(view, 'Imagem adicional 1');
  featured(view).props.onError(); view.render();
  assert.equal(featured(view).props.src, thumb);
  assert.ok(view.all(node => node.type === 'img').every(node => node.props.src !== back && node.props.src !== cover));
  featured(view).props.onError(); view.render();
  assert.equal(featured(view), undefined);
  assert.match(view.text(), /Não foi possível exibir/);
});

test('an additional image never becomes the cover automatically when the main image is absent', () => {
  const images = allowed(); images.itens.shift();
  const view = mount(LabGallery, { images, title: 'Livro' });
  assert.equal(featured(view), undefined);
  assert.equal(view.find(node => node.type === 'button' && node.props['aria-label'] === 'Capa principal'), undefined);
  select(view, 'Imagem adicional 1');
  assert.equal(featured(view).props.src, back);
});

test('Curitiba card retains cover priority, thumbnail selection, failures and deduplication after component extraction', () => {
  const book = { id: 'curitiba', title: 'Livro Curitiba', coverUrl: cover, thumbnailUrl: cover, additionalImages: [back, back, inside] };
  const view = mount(BookDetails, { book });
  view.effects();
  assert.equal(featured(view).props.src, cover);
  assert.equal(view.all(node => node.type === 'button' && /^Imagem adicional/.test(node.props['aria-label'] || node.props.title || '')).length, 2);
  select(view, 'Imagem adicional 1');
  assert.equal(featured(view).props.src, back);
  featured(view).props.onError(); view.render(); view.effects();
  assert.equal(featured(view).props.src, cover);
  view.render({ book: { id: 'other', title: 'Outro livro' } }); view.effects();
  assert.equal(featured(view), undefined);
  assert.match(view.text(), /Sem capa digital/);
});
