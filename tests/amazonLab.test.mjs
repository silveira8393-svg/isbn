import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const baseline = JSON.parse(await readFile('experimentos/amazon/relatorios/reais/02_9788584390670.json', 'utf8'));
const result = { ...baseline, status: 'concluida', modo: 'fixture', duracao_ms: 12, status_http: null };
const health = { http_habilitado: false, fixtures: ['9788584390670'], persistencia: false };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

async function compile(entry, development = true) {
  const output = await build({ entryPoints: [entry], bundle: true, write: false, metafile: true,
    platform: 'node', format: 'cjs', jsx: 'automatic', minifySyntax: true,
    define: { 'import.meta.env.DEV': String(development) },
    plugins: [{ name: 'isolated-ui', setup(builder) {
      builder.onResolve({ filter: /^(react|react\/jsx-runtime|lucide-react)$|lib\/supabase|UserContext|MagazordTestMode|UserManagement|ConditionTemplateManager|InfrastructureEntry/ }, args => ({ path: args.path, namespace: 'mock' }));
      builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ loader: 'js', contents:
        args.path === 'react' ? 'module.exports=globalThis.__amazonLabHooks' :
        args.path === 'react/jsx-runtime' ? 'exports.jsx=exports.jsxs=(type,props)=>({type,props})' :
        args.path === 'lucide-react' ? 'module.exports=new Proxy({},{get:(_,key)=>String(key)})' :
        args.path.includes('lib/supabase') ? 'exports.supabase={auth:{getSession:async()=>globalThis.__amazonLabSession}}' :
        args.path.includes('UserContext') ? 'exports.useUser=()=>globalThis.__amazonLabActor' :
        'module.exports=()=>null',
      }));
    } }],
  });
  const module = { exports: {} };
  new Function('module', 'exports', output.outputFiles[0].text)(module, module.exports);
  return { exports: module.exports, output };
}

function hooks(t) {
  let index = 0;
  const slots = [], effects = [], cleanups = [];
  const runtime = {
    useState(initial) { const at = index++; if (!(at in slots)) slots[at] = initial; return [slots[at], value => { slots[at] = typeof value === 'function' ? value(slots[at]) : value; }]; },
    useRef(initial) { const at = index++; return slots[at] ??= { current: initial }; },
    useEffect(callback, dependencies) {
      const at = index++;
      if (!slots[at] || dependencies.some((d, i) => d !== slots[at][i])) {
        slots[at] = dependencies; effects.push(callback);
      }
    },
    lazy: factory => ({ lazyFactory: factory }), Suspense: 'Suspense',
  };
  runtime.default = runtime;
  globalThis.__amazonLabHooks = runtime;
  t.after(() => { cleanups.forEach(cleanup => cleanup?.()); delete globalThis.__amazonLabHooks; delete globalThis.__amazonLabActor; });
  return { slots, render: component => { index = 0; return component(); },
    effects: async () => { effects.splice(0).forEach(effect => cleanups.push(effect())); await new Promise(resolve => setImmediate(resolve)); },
    unmount: () => cleanups.splice(0).forEach(cleanup => cleanup?.()),
  };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
const text = tree => {
  if (tree == null || typeof tree === 'boolean') return '';
  if (typeof tree !== 'object') return String(tree);
  return Array.isArray(tree) ? tree.map(text).join(' ') : text(tree.props?.children);
};
const find = (tree, predicate) => nodes(tree).find(predicate);

test('gate excludes Proprietario, Operador and inactive users in local and published builds', async t => {
  hooks(t);
  const { exports: client } = await compile('src/services/amazonLabClient.ts');
  for (const role of ['admin', 'operator']) assert.equal(client.isAmazonLabAvailable(role, true), false);
  assert.equal(client.isAmazonLabAvailable('developer', false), false);
  assert.equal(client.isAmazonLabAvailable('developer', true), true);
});

test('Settings keeps Marketplace and guards navigation and mounted panel on profile change', async t => {
  const ui = hooks(t);
  const { exports: { default: Settings } } = await compile('src/components/SettingsView.tsx');
  for (const role of ['developer', 'admin', 'operator']) {
    globalThis.__amazonLabActor = { currentUser: { id: role, role, name: 'Teste', active: true }, canViewDeveloperTools: role === 'developer' };
    ui.slots[0] = 'amazon-lab';
    const tree = ui.render(Settings);
    assert.equal(text(tree).includes('Amazon Marketplace'), true);
    assert.equal(text(tree).includes('Laboratório Amazon'), role === 'developer');
    assert.equal(nodes(tree).some(node => node.type?.lazyFactory), role === 'developer');
  }
});

test('published compilation includes the authenticated Function client and no loopback route', async t => {
  hooks(t);
  const { output } = await compile('src/components/SettingsView.tsx', false);
  assert.doesNotMatch(output.outputFiles[0].text, /__amazon_lab\//);
  assert.match(output.outputFiles[0].text, /\/api\/amazon\?acao=/);
});

test('published client sends only the current session token to the same-origin Function', async t => {
  hooks(t);
  t.after(() => { delete globalThis.__amazonLabSession; });
  globalThis.__amazonLabSession = { data: { session: { access_token: 'synthetic-session' } }, error: null };
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => { calls.push({url, init}); return json(url.endsWith('health') ? health : result); });
  const { exports: client } = await compile('src/services/amazonLabClient.ts', false);
  const controller = new AbortController();
  await client.getAmazonLabHealth(controller.signal);
  await client.searchAmazonLab('9788501014863', 'http', controller.signal);
  assert.deepEqual(calls.map(call => call.url), ['/api/amazon?acao=health', '/api/amazon?acao=search']);
  assert.ok(calls.every(call => call.init.headers.Authorization === 'Bearer synthetic-session' && call.init.credentials === 'omit' && call.init.redirect === 'error'));
  assert.deepEqual(JSON.parse(calls[1].init.body), {isbn: '9788501014863', modo: 'http'});
  globalThis.__amazonLabSession = { data: { session: null }, error: null };
  await assert.rejects(client.getAmazonLabHealth(controller.signal), /Entre novamente/);
  assert.equal(calls.length, 2);
});

test('fixture search renders nine fields, provenance, ISBN, duration and synopsis review', async t => {
  const ui = hooks(t), calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => { calls.push({ url, init }); return json(url.endsWith('health') ? health : result); });
  const { exports: { default: Panel }, output } = await compile('src/components/AmazonLab.tsx');
  ui.render(Panel); await ui.effects();
  let tree = ui.render(Panel);
  assert.match(text(tree), /AMBIENTE EXPERIMENTAL — NÃO INTEGRADO AO CADASTRO/);
  assert.match(text(tree), /Serviço local conectado/);
  find(tree, node => node.type === 'select').props.onChange({ target: { value: 'fixture' } });
  tree = ui.render(Panel);
  await find(tree, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  tree = ui.render(Panel);
  assert.equal(nodes(tree).filter(node => node.type === 'dt').length, 9);
  assert.match(text(tree), /Paulo Coelho/);
  assert.match(text(tree), /Paralela/);
  assert.match(text(tree), /8\s*\/9 válidos locais/);
  assert.match(text(tree), /Exige revisão humana/);
  assert.match(text(tree), /ISBN corresponde ao produto/);
  assert.match(text(tree), /12 ms/);
  assert.match(text(tree), /#productTitle/);
  assert.ok(calls.every(({ url, init }) => url.startsWith('/__amazon_lab/') && init.credentials === 'omit' && !init.headers.Authorization));
  assert.ok(Object.keys(output.metafile.inputs).every(path => !/supabase|magazord|distribuidora|brasilapi|operations|history/i.test(path)));
});

test('busy UI and ref prevent duplicate searches; errors never retry', async t => {
  const ui = hooks(t);
  let finish, count = 0;
  t.mock.method(globalThis, 'fetch', async url => url.endsWith('health') ? json(health) : (count++, new Promise(resolve => { finish = resolve; })));
  const { exports: { default: Panel } } = await compile('src/components/AmazonLab.tsx');
  ui.render(Panel); await ui.effects();
  const submit = find(ui.render(Panel), node => node.type === 'form').props.onSubmit;
  const pending = submit({ preventDefault() {} });
  await submit({ preventDefault() {} });
  assert.equal(count, 1);
  assert.equal(find(ui.render(Panel), node => node.type === 'button').props.disabled, true);
  finish(json({ mensagem: 'Há uma pesquisa em andamento.' }, 409));
  await pending;
  assert.match(text(ui.render(Panel)), /Há uma pesquisa em andamento/);
  assert.equal(count, 1);
});

test('absent fields and interrupted queries remain visible without stale results', async t => {
  const ui = hooks(t);
  const incomplete = structuredClone(result);
  incomplete.campos.sinopse = { valor: null, estado: 'ausente', motivos: [], origens: [], revisao_humana: true };
  let response = incomplete;
  t.mock.method(globalThis, 'fetch', async url => json(url.endsWith('health') ? health : response));
  const { exports: { default: Panel } } = await compile('src/components/AmazonLab.tsx');
  ui.render(Panel); await ui.effects();
  await find(ui.render(Panel), node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.match(text(ui.render(Panel)), /Não informado.*Ausente/);
  response = { status: 'interrompida', modo: 'http', duracao_ms: 10, status_http: 403, mensagem: 'Bloqueio detectado.' };
  await find(ui.render(Panel), node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  const tree = ui.render(Panel);
  assert.match(text(tree), /Consulta interrompida/);
  assert.match(text(tree), /Bloqueio detectado/);
  assert.equal(nodes(tree).filter(node => node.type === 'dt').length, 0);
});

test('HTTP is the default and repeated searches require no flags or confirmation', async t => {
  const ui = hooks(t), requests = [];
  // Even an obsolete health flag must not gate searches.
  t.mock.method(globalThis, 'fetch', async (url, init) => { requests.push({ url, init }); return json(url.endsWith('health') ? health : result); });
  const { exports: { default: Panel } } = await compile('src/components/AmazonLab.tsx');
  ui.render(Panel); await ui.effects();
  for (let i = 0; i < 2; i++) {
    const tree = ui.render(Panel);
    assert.equal(find(tree, node => node.type === 'select').props.value, 'http');
    assert.equal(find(tree, node => node.type === 'option' && node.props.value === 'http').props.disabled, undefined);
    assert.equal(find(tree, node => node.type === 'button').props.disabled, false);
    assert.equal(find(tree, node => node.type === 'input' && node.props.type === 'checkbox'), undefined);
    await find(tree, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  }
  assert.equal(requests.length, 3);
  for (const request of requests.slice(1)) assert.deepEqual(JSON.parse(request.init.body), {isbn: '9788584390670', modo: 'http'});
});

test('unmount aborts an in-flight local request and does not schedule another', async t => {
  const ui = hooks(t);
  let pendingSignal, finish;
  t.mock.method(globalThis, 'fetch', async (url, init) => url.endsWith('health') ? json(health) : new Promise(resolve => { pendingSignal = init.signal; finish = resolve; }));
  const { exports: { default: Panel } } = await compile('src/components/AmazonLab.tsx');
  ui.render(Panel); await ui.effects();
  const pending = find(ui.render(Panel), node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  ui.unmount();
  assert.equal(pendingSignal.aborted, true);
  finish(json(result));
  await pending;
  assert.equal(ui.slots[4], null, 'Late result must not be written to state after leaving the lab');
});

test('complementary sections preserve nine fields and image URLs and origins', async t => {
  const ui = hooks(t);
  const extended = { ...result,
    complementares: {
      peso: { valor: 502, estado: 'valido', motivos: [], origens: ['#detalhes / Peso'], revisao_humana: false },
      dimensoes: { valor: '14 x 21 x 2 cm', estado: 'inconsistente', motivos: ['Ordem não identificada'], origens: ['#detalhes'], revisao_humana: true },
    },
    imagens: { itens: [{ referencia: 'https://images.example.invalid/capa.jpg', papel: 'principal',
      disponibilidade_tecnica: 'referencia_identificada_nao_verificada', autorizacao_uso: 'nao_comprovada', origem: '#landingImage' }],
      download_realizado: false, carregamento_remoto_permitido: false },
    book_info: { id: 'amazon-lab', title: 'O alquimista', isbn13: result.isbn_pesquisado, weight: 502, weightUnit: 'g', provenance: { weight: 'Amazon: #detalhes / Peso' } },
    edicao_verificacao: 'declarada_no_produto_sem_confirmacao_independente',
  };
  const requests = [];
  t.mock.method(globalThis, 'fetch', async url => { requests.push(url); return json(url.endsWith('health') ? health : extended); });
  const { exports: { default: Panel } } = await compile('src/components/AmazonLab.tsx');
  ui.render(Panel); await ui.effects();
  await find(ui.render(Panel), node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  const tree = ui.render(Panel);
  assert.equal(nodes(tree).filter(node => node.type === 'dt').length, 9);
  for (const label of ['Informações físicas e logísticas', 'Capa e imagens adicionais', 'Origem e qualidade dos dados', 'Campos ausentes ou divergentes']) assert.ok(find(tree, node => node.props?.['aria-label'] === label));
  assert.match(text(tree), /Peso \(g\).*502/);
  assert.match(text(tree), /Ordem não identificada/);
  assert.doesNotMatch(text(tree), /Autorização|uso pendente|não autorizado/);
  assert.match(text(tree), /sem confirmação independente/);
  const diagnostic = find(tree, node => node.type === 'details');
  assert.ok(diagnostic);
  assert.equal(diagnostic.props.open, undefined, 'Diagnóstico recolhido por padrão');
  assert.match(text(diagnostic), /https:\/\/images.example.invalid\/capa.jpg/);
  assert.match(text(diagnostic), /Origem:.*#landingImage/);
  const gallery = find(tree, node => typeof node.type === 'function' && node.props.images);
  assert.deepEqual(gallery.props.images.itens, extended.imagens.itens);
  assert.ok(requests.every(url => url.startsWith('/__amazon_lab/')));
});
