import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const output = await build({
  stdin: {
    contents: "export { default as SettingsView } from './src/components/SettingsView'; export { default as MagazordStatusCard } from './src/components/magazord/MagazordStatusCard';",
    resolveDir: process.cwd(), sourcefile: 'magazord-test-entry.ts', loader: 'ts',
  },
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
  plugins: [{ name: 'controlled-component', setup(builder) {
    const mocks = [
      [/^react$/, 'module.exports=deps.react'],
      [/^react\/jsx-runtime$/, 'exports.jsx=exports.jsxs=(type,props)=>({type,props})'],
      [/^lucide-react$/, 'module.exports=new Proxy({},{get:(_,key)=>String(key)})'],
      [/\/contexts\/UserContext$/, 'exports.useUser=()=>deps.user'],
      [/\/users\/UserManagement$/, 'module.exports="UserManagement"'],
    ];
    builder.onResolve({ filter: /.*/ }, args => {
      const mock = mocks.find(([pattern]) => pattern.test(args.path));
      return mock ? { path: args.path, namespace: 'mock', pluginData: mock[1] } : undefined;
    });
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: args.pluginData, loader: 'js' }));
    builder.onLoad({ filter: /useMagazordTestMode\.ts$/ }, async args => {
      const source = await readFile(args.path, 'utf8');
      // Capture real handlers and state only in this in-memory test bundle.
      const marker = '  return {\n    isDeveloper,';
      assert.ok(source.includes(marker));
      return { contents: source.replace(marker,
        '  deps.capture({ selectMode, applyMode, currentMode, selectedMode, hasPendingChange }, magazordMockService);\n' + marker), loader: 'ts' };
    });
  } }],
});

const configKey = 'sebo_magazord_sim_config_v2';
const modes = [
  ['auto', 'Padrão (Auto)', 'Padrão (Auto - Banco Real)'],
  ['force_new_found', 'Novo Encontrado', 'Forçar: Novo Encontrado'],
  ['force_new_not_found', 'Novo Não Encontrado', 'Forçar: Novo Não Encontrado'],
  ['force_used_known', 'Usado / Edição Conhecida', 'Forçar: Usado / Edição Conhecida'],
  ['force_multiple_matches', 'Múltiplos Resultados', 'Forçar: Múltiplos Resultados'],
  ['force_error', 'Simular Erro', 'Simular Erro'],
];
const saved = mode => new Map([[configKey, JSON.stringify({ mode })]]);

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}

function text(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node !== 'object') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  return text(node.props?.children);
}

// Mount real components with separate hook state per instance and one real service.
function setupView(initialView, role, storage = saved('auto')) {
  const previousStorage = globalThis.localStorage;
  const writes = [], configCalls = [], instances = new Map();
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => { writes.push({ key, value }); storage.set(key, value); },
  };
  let view = initialView, activeSlots, cursor, effects, visited, dirty, tree, controls, service, retries = 0;
  const props = { checkResult: null, isChecking: false, checkError: null, book: {},
    onRetryCheck: () => { retries++; }, onOpenRegistration() {}, onResetForNextBook() {} };
  const deps = {
    user: { currentUser: { role, name: 'Conta atual' }, users: [], isDeveloper: role === 'developer' },
    capture(value, mockService) {
      controls = value;
      if (service !== mockService) {
        service = mockService;
        const originalSetConfig = service.setSimulationConfig.bind(service);
        service.setSimulationConfig = config => { configCalls.push({ ...config }); originalSetConfig(config); };
      }
    },
    react: {
      useState(initial) {
        const slots = activeSlots, index = cursor++;
        if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
        return [slots[index], next => {
          const value = typeof next === 'function' ? next(slots[index]) : next;
          if (!Object.is(value, slots[index])) { slots[index] = value; dirty = true; }
        }];
      },
      useEffect(effect, dependencies) {
        const slots = activeSlots, index = cursor++;
        if (!slots[index] || dependencies.some((value, i) => !Object.is(value, slots[index].deps[i]))) {
          slots[index] = { deps: dependencies };
          effects.push(effect);
        }
      },
    },
  };
  const module = { exports: {} };
  new Function('deps', 'module', 'exports', output.outputFiles[0].text)(deps, module, module.exports);
  function resolve(node) {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(resolve);
    if (typeof node.type === 'function') {
      visited.add(node.type);
      if (!instances.has(node.type)) instances.set(node.type, []);
      activeSlots = instances.get(node.type);
      cursor = 0;
      return resolve(node.type(node.props));
    }
    return { ...node, props: { ...node.props, children: resolve(node.props?.children) } };
  }
  function render() {
    let passes = 0;
    do {
      assert.ok(++passes < 10, 'The component must settle without an effect/render loop');
      dirty = false; effects = []; visited = new Set();
      tree = resolve({ type: module.exports[view === 'settings' ? 'SettingsView' : 'MagazordStatusCard'], props });
      for (const type of instances.keys()) if (!visited.has(type)) instances.delete(type);
      effects.forEach(effect => effect());
    } while (dirty);
    return tree;
  }
  const buttons = () => nodes(tree).filter(node => node.type === 'button');
  const button = label => buttons().find(node => text(node).trim() === label);
  const click = label => {
    const target = button(label);
    assert.ok(target, `Missing button: ${label}`);
    assert.ok(!target.props.disabled, `Disabled button: ${label}`);
    target.props.onClick();
    render();
  };
  const open = () => {
    if (view === 'settings') click('Magazord ERP');
    click('Modo Teste');
  };
  render();
  return { render, buttons, button, click, open, storage, writes, configCalls,
    controls: () => controls,
    activeText: () => text(nodes(tree).find(node => node.props?.role === 'status')).trim(),
    mode: () => JSON.parse(storage.get(configKey)).mode,
    serviceMode: () => service.getSimulationConfig().mode,
    selectDirect: mode => { controls.selectMode(mode); render(); },
    applyDirect: () => { controls.applyMode(); render(); },
    retries: () => retries,
    mount: nextView => { view = nextView; render(); },
    refreshCheck: () => { props.checkResult = { exists: false, status: 'NOT_FOUND' }; render(); },
    setRole: nextRole => {
      deps.user = { ...deps.user, currentUser: { ...deps.user.currentUser, role: nextRole }, isDeveloper: nextRole === 'developer' };
      render();
    },
    restore: () => { if (previousStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = previousStorage; },
  };
}

function assertSelection(app, label) {
  const options = app.buttons().filter(node => 'aria-pressed' in node.props);
  assert.equal(options.length, 6);
  const selected = options.filter(node => node.props['aria-pressed'] === true);
  assert.equal(selected.length, 1, 'Exactly one simulation option must be selected');
  assert.equal(text(selected[0]).trim(), label);
  for (const button of options) {
    const classes = new Set(button.props.className.split(/\s+/));
    assert.equal(classes.has('text-white'), button === selected[0], 'Only the selected option has white text');
    assert.equal(classes.has('bg-white'), button !== selected[0], 'Unselected options retain a distinct background');
  }
}

for (const view of ['settings', 'consultar']) {
  const labelFor = row => row[view === 'settings' ? 1 : 2];
  test(`${view}: developer selects locally, confirms Apply, persists and restores Auto with one selected option`, () => {
    const app = setupView(view, 'developer');
    try {
      app.open();
      assert.equal(app.activeText(), 'Modo ativo: Padrão (Auto)');
      assertSelection(app, labelFor(modes[0]));
      assert.equal(app.button('Aplicar').props.disabled, true);
      assert.equal(app.writes.length, 0);
      assert.equal(app.configCalls.length, 0);
      for (const row of [...modes.slice(1), modes[0]]) {
        const [mode, activeLabel] = row;
        const before = { mode: app.serviceMode(), text: app.activeText(), writes: app.writes.length,
          calls: app.configCalls.length, retries: app.retries() };
        app.click(labelFor(row));
        assertSelection(app, labelFor(row));
        assert.equal(app.controls().selectedMode, mode);
        assert.equal(app.controls().currentMode, before.mode);
        assert.equal(app.activeText(), before.text);
        assert.equal(app.mode(), before.mode);
        assert.equal(app.serviceMode(), before.mode);
        assert.equal(app.writes.length, before.writes);
        assert.equal(app.configCalls.length, before.calls);
        assert.equal(app.retries(), before.retries);
        assert.equal(app.button('Aplicar').props.disabled, false);

        app.click('Aplicar');
        assert.equal(app.controls().currentMode, mode);
        assert.equal(app.mode(), mode);
        assert.equal(app.serviceMode(), mode);
        assert.equal(app.activeText(), `Modo ativo: ${activeLabel}`);
        assertSelection(app, labelFor(row));
        assert.equal(app.button('Aplicar').props.disabled, true);
        assert.equal(app.writes.length, before.writes + 1);
        assert.equal(app.writes.at(-1).key, configKey);
        assert.equal(app.configCalls.length, before.calls + 1);
        assert.equal(app.retries(), before.retries + (view === 'consultar' ? 1 : 0));

        app.click(labelFor(row));
        assert.equal(app.button('Aplicar').props.disabled, true);
        app.applyDirect(); // Even calling disabled Apply directly is a no-op.
        assert.equal(app.writes.length, before.writes + 1);
        assert.equal(app.configCalls.length, before.calls + 1);
      }
    } finally { app.restore(); }
  });

  test(`${view}: initial mode is read from the service, including defaults and legacy aliases, without new persistence`, () => {
    const initialModes = [...modes.map(row => [row[0], row]),
      ['force_existing', modes[1]], ['force_not_found', modes[2]], [null, modes[0]]];
    for (const [savedMode, row] of initialModes) {
      const app = setupView(view, 'developer', savedMode === null ? new Map() : saved(savedMode));
      try {
        app.open();
        assert.equal(app.controls().currentMode, savedMode ?? 'auto');
        assert.equal(app.serviceMode(), savedMode ?? 'auto');
        assert.equal(app.activeText(), `Modo ativo: ${row[1]}`);
        assertSelection(app, labelFor(row));
        assert.equal(app.button('Aplicar').props.disabled, true);
        app.click(labelFor(row));
        app.applyDirect();
        assert.equal(app.writes.length, 0);
        assert.equal(app.configCalls.length, 0);
        if (savedMode === null) assert.equal(app.storage.has(configKey), false);
        else assert.equal(app.mode(), savedMode);
      } finally { app.restore(); }
    }
  });

  test(`${view}: only applied selection survives navigation, remount and fresh service reload`, () => {
    const app = setupView(view, 'developer');
    try {
      app.open();
      app.click(labelFor(modes[1]));
      app.click('Aplicar');
      app.click(labelFor(modes[5])); // Leave an unapplied choice behind.
      assert.equal(app.mode(), 'force_new_found');
      const other = view === 'settings' ? 'consultar' : 'settings';
      app.mount(other);
      app.open();
      assert.equal(app.activeText(), 'Modo ativo: Novo Encontrado');
      assertSelection(app, modes[1][other === 'settings' ? 1 : 2]);
      assert.equal(app.button('Aplicar').props.disabled, true);
      app.mount(view);
      app.open();
      assertSelection(app, labelFor(modes[1]));
      assert.equal(app.writes.length, 1);

      const reload = setupView(view, 'developer', app.storage);
      try {
        reload.open();
        assert.equal(reload.serviceMode(), 'force_new_found');
        assert.equal(reload.activeText(), 'Modo ativo: Novo Encontrado');
        assertSelection(reload, labelFor(modes[1]));
        assert.equal(reload.button('Aplicar').props.disabled, true);
        assert.equal(reload.writes.length, 0);
      } finally { reload.restore(); }
    } finally { app.restore(); }
  });

  for (const role of ['admin', 'operator']) {
    test(`${view}: ${role} has no controls, stays Auto and blocks direct selection/application after role changes`, () => {
      const app = setupView(view, role, saved('force_error'));
      try {
        if (view === 'settings') app.click('Magazord ERP');
        const assertBlocked = () => {
          assert.ok(!app.buttons().some(node => node.props?.title === 'Configurar modo de teste da simulação'));
          assert.ok(!app.buttons().some(node => 'aria-pressed' in node.props));
          assert.ok(!app.button('Aplicar'));
          assert.equal(app.mode(), 'auto');
          assert.equal(app.serviceMode(), 'auto');
          assert.equal(app.controls().selectedMode, 'auto');
          assert.equal(app.controls().hasPendingChange, false);
        };
        assertBlocked();
        for (const [mode] of modes) {
          app.selectDirect(mode);
          app.applyDirect();
          assertBlocked();
        }
        assert.ok(app.configCalls.every(call => call.mode === 'auto'));
        assert.equal(app.retries(), 0);
        app.setRole('developer');
        app.click('Modo Teste');
        app.click(labelFor(modes[5]));
        app.click('Aplicar');
        assert.equal(app.mode(), 'force_error');
        app.click(labelFor(modes[1]));
        const retries = app.retries();
        app.setRole(role);
        assertBlocked();
        app.selectDirect('force_new_found');
        app.applyDirect();
        assertBlocked();
        assert.equal(app.retries(), retries);
        app.setRole('developer');
        assert.ok(!app.button('Aplicar'), 'The previously open panel must be closed');
        app.click('Modo Teste');
        assertSelection(app, labelFor(modes[0]));
        assert.equal(app.button('Aplicar').props.disabled, true);
      } finally { app.restore(); }
    });
  }
}

test('consultar: Auto alert shortcut selects and opens the panel without applying or persisting', () => {
  const app = setupView('consultar', 'developer', saved('force_error'));
  try {
    app.click('Selecionar Padrão (Auto)');
    assertSelection(app, modes[0][2]);
    assert.equal(app.activeText(), 'Modo ativo: Simular Erro');
    assert.equal(app.mode(), 'force_error');
    assert.equal(app.serviceMode(), 'force_error');
    assert.equal(app.writes.length, 0);
    assert.equal(app.configCalls.length, 0);
    assert.equal(app.retries(), 0);
    app.click('Aplicar');
    assert.equal(app.activeText(), 'Modo ativo: Padrão (Auto)');
    assert.equal(app.mode(), 'auto');
    assert.equal(app.retries(), 1);
    assert.equal(app.button('Aplicar').props.disabled, true);
    assert.ok(!app.button('Selecionar Padrão (Auto)'));
  } finally { app.restore(); }
});

test('consultar: catalog refresh preserves a pending choice and does not apply it', () => {
  const app = setupView('consultar', 'developer');
  try {
    app.open();
    app.click(modes[1][2]);
    app.refreshCheck();
    assertSelection(app, modes[1][2]);
    assert.equal(app.activeText(), 'Modo ativo: Padrão (Auto)');
    assert.equal(app.mode(), 'auto');
    assert.equal(app.writes.length, 0);
    assert.equal(app.configCalls.length, 0);
    app.click('Aplicar');
    app.refreshCheck();
    assertSelection(app, modes[1][2]);
    assert.equal(app.button('Aplicar').props.disabled, true);
    assert.equal(app.mode(), 'force_new_found');
    assert.equal(app.retries(), 1);
  } finally { app.restore(); }
});
