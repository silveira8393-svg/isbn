import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const output = await build({ entryPoints: ['src/services/magazordMockService.ts'],
  bundle: true, write: false, platform: 'node', format: 'cjs' });
const operationalKey = 'sebo_magazord_simulated_db_v3';
const legacyKey = 'sebo_magazord_simulated_db_v2';
const sandboxKey = 'sebo_magazord_sandbox_db_v1';
const configKey = 'sebo_magazord_sim_config_v2';
const isbn = '9788528617931';
const otherIsbn = '9788553131303';
const draft = (condition = 'novo', overrides = {}) => ({ condition, ean: isbn, isbn13: isbn,
  parentCode: 'SANDBOX-P', childCode: condition === 'novo' ? isbn : 'LV-SANDBOX-99999',
  title: 'Cadastro de teste', price: '25', quantity: 2, description: 'Descrição de teste', ...overrides });
const operationalRecord = { id: 'operational-new', ean: isbn, parentCode: 'OPERATIONAL-P', childCode: isbn,
  condition: 'novo', title: 'Produto operacional', price: '100', stock: 7, registeredAt: 1 };

function setup(t, initial = new Map()) {
  const previous = globalThis.localStorage;
  const storage = new Map(initial), reads = [], writes = [], held = new Map();
  globalThis.localStorage = {
    getItem: key => { reads.push(key); return storage.get(key) ?? null; },
    setItem: (key, value) => { writes.push({ key, value }); storage.set(key, value); },
  };
  t.after(() => {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  });
  function reload() {
    const module = { exports: {} };
    new Function('module', 'exports', 'setTimeout', output.outputFiles[0].text)(module, module.exports, (callback, delay) => {
      if (held.has(delay)) held.get(delay).push(callback);
      else queueMicrotask(callback);
    });
    return module.exports.magazordMockService;
  }
  return { storage, reads, writes, service: reload(), reload,
    hold: delay => held.set(delay, []),
    release: delay => { const callbacks = held.get(delay); held.delete(delay); callbacks.forEach(callback => callback()); },
    assertNoOperationalWrites: () => assert.ok(writes.every(write => write.key !== operationalKey && write.key !== legacyKey)),
  };
}
const seedOperational = () => new Map([
  [operationalKey, JSON.stringify({ [isbn]: [operationalRecord] })],
  [legacyKey, JSON.stringify({ [isbn]: [operationalRecord] })],
]);

test('Required reproduction: Auto missing -> forced Novo 3 -> sandbox stock 5 -> Auto still missing', async t => {
  const app = setup(t), service = app.service;
  assert.equal((await service.checkProductByEan(isbn)).status, 'NOT_FOUND');
  service.setSimulationConfig({ mode: 'force_new_found' });
  const simulated = await service.checkProductByEan(isbn);
  assert.equal(simulated.status, 'NEW_PRODUCT_FOUND');
  assert.equal(simulated.currentStock, 3);
  assert.equal(simulated.parentCode, 'LV26579-P');
  assert.equal(simulated.childCode, isbn);
  assert.ok(simulated.sku.startsWith('SKU-NV-'));
  assert.equal((await service.addStockToExistingProduct(isbn, 2)).newStock, 5);
  assert.equal((await service.checkProductByEan(isbn)).currentStock, 5);
  service.resetModeToAuto();
  assert.equal((await service.checkProductByEan(isbn)).status, 'NOT_FOUND');
  assert.deepEqual(service.getRecordsForEan(isbn), []);
  service.setSimulationConfig({ mode: 'force_new_found' });
  assert.equal((await service.checkProductByEan(isbn)).currentStock, 5);
  app.assertNoOperationalWrites();
  assert.equal(app.storage.has(operationalKey), false);
  assert.equal(app.storage.has(legacyKey), false);
  assert.equal(JSON.parse(app.storage.get(sandboxKey)).force_new_found[isbn][0].stock, 5);
});

test('Sandbox reuse, Novo update and new Usado never modify an existing operational product', async t => {
  const initial = seedOperational(), app = setup(t, initial), service = app.service;
  service.setSimulationConfig({ mode: 'force_new_found' });
  assert.equal((await service.checkProductByEan(isbn)).currentStock, 3, 'Fixture must not copy operational stock 7');
  await service.addStockToExistingProduct(isbn, 2);
  await service.createProduct(draft('novo', { quantity: 9 }));
  await service.createProduct(draft('usado'));
  const sandbox = service.getRecordsForEan(isbn);
  assert.equal(sandbox.find(record => record.condition === 'novo').stock, 9);
  assert.ok(sandbox.some(record => record.condition === 'usado' && record.parentCode === 'SANDBOX-P'));
  for (const key of [operationalKey, legacyKey]) assert.equal(app.storage.get(key), initial.get(key));
  service.resetModeToAuto();
  assert.equal((await service.checkProductByEan(isbn)).currentStock, 7);
  assert.deepEqual(service.getRecordsForEan(isbn), [operationalRecord]);
  app.assertNoOperationalWrites();
});

for (const mode of ['force_new_not_found', 'force_not_found', 'force_used_not_found']) {
  for (const condition of ['novo', 'usado']) {
    test(mode + ': created ' + condition + ', identifiers and stock exist only in that sandbox', async t => {
      const app = setup(t), service = app.service;
      service.setSimulationConfig({ mode });
      assert.equal((await service.checkProductByEan(isbn)).status, 'NOT_FOUND');
      await service.createProduct(draft(condition));
      const record = service.getRecordsForEan(isbn)[0];
      assert.equal(record.condition, condition);
      assert.equal(record.parentCode, 'SANDBOX-P');
      assert.equal(record.childCode, draft(condition).childCode);
      assert.equal(record.stock, 2);
      assert.equal(record.description, 'Descrição de teste');
      assert.equal(service.getRecordsForEan(record.childCode)[0].id, record.id, 'Secondary lookup stays in its namespace');
      service.resetModeToAuto();
      assert.equal((await service.checkProductByEan(isbn)).status, 'NOT_FOUND');
      assert.deepEqual(service.getRecordsForEan(record.childCode), []);
      app.assertNoOperationalWrites();
      service.setSimulationConfig({ mode });
      assert.equal(service.getRecordsForEan(isbn)[0].id, record.id);
    });
  }
}

test('Used edition fixtures and additional physical copies remain isolated and preserve Novo/Usado rules', async t => {
  const app = setup(t, seedOperational()), service = app.service;
  service.setSimulationConfig({ mode: 'force_used_known' });
  const check = await service.checkProductByEan(isbn);
  assert.equal(check.status, 'USED_EDITION_FOUND');
  assert.equal(check.canReuseCommercialRegistration, false);
  assert.equal(check.parentCode, 'LV-EDICAO-P');
  assert.equal(check.childCode, 'LV10100');
  assert.ok(check.sku.startsWith('SKU-US-'));
  await service.createProduct(draft('usado'));
  await service.createProduct(draft('usado', { parentCode: 'SECOND-P', childCode: 'LV-SANDBOX-99998' }));
  const records = service.getRecordsForEan(isbn);
  assert.equal(records.length, 3);
  assert.equal(new Set(records.map(record => record.id)).size, 3);
  assert.ok(records.every(record => record.condition === 'usado'));
  assert.equal((await service.checkProductByEan(isbn)).status, 'USED_EDITION_FOUND');
  service.resetModeToAuto();
  assert.deepEqual(service.getRecordsForEan(isbn), [operationalRecord]);
  app.assertNoOperationalWrites();
});

test('Multiple matches keep their fixture stock and do not share catalogs with other forced scenarios', async t => {
  const app = setup(t), service = app.service;
  service.setSimulationConfig({ mode: 'force_new_found' });
  await service.addStockToExistingProduct(isbn, 2);
  service.setSimulationConfig({ mode: 'force_multiple_matches' });
  const multiple = await service.checkProductByEan(isbn);
  assert.equal(multiple.status, 'MULTIPLE_MATCHES');
  assert.equal(multiple.currentStock, 4);
  assert.equal(multiple.matches.length, 3);
  assert.equal((await service.addStockToExistingProduct(isbn, 2)).newStock, 6);
  const updated = await service.checkProductByEan(isbn);
  assert.equal(updated.currentStock, 6);
  assert.equal(updated.matches.find(record => record.condition === 'novo').stock, 6);
  assert.ok(updated.matches.filter(record => record.condition === 'usado').every(record => record.stock === 1));
  service.setSimulationConfig({ mode: 'force_existing' });
  assert.equal((await service.checkProductByEan(isbn)).currentStock, 5, 'Legacy alias shares its canonical scenario');
  const catalogs = JSON.parse(app.storage.get(sandboxKey));
  assert.deepEqual(Object.keys(catalogs).sort(), ['force_multiple_matches', 'force_new_found']);
  service.resetModeToAuto();
  assert.equal((await service.checkProductByEan(isbn)).status, 'NOT_FOUND');
  app.assertNoOperationalWrites();
});

for (const [origin, finish, expected] of [
  ['force_new_found', 'auto', 'NEW_PRODUCT_FOUND'],
  ['auto', 'force_new_found', 'NOT_FOUND'],
]) {
  test('Async query ' + origin + ' -> ' + finish + ' reads the original context', async t => {
    const app = setup(t), service = app.service;
    service.setSimulationConfig({ mode: origin }); app.hold(380);
    const pending = service.checkProductByEan(isbn);
    service.setSimulationConfig({ mode: finish }); app.release(380);
    assert.equal((await pending).status, expected);
    assert.equal(app.storage.has(sandboxKey), origin !== 'auto');
    app.assertNoOperationalWrites();
  });
}

for (const action of ['stock', 'create']) {
  for (const [origin, finish] of [['force_new_found', 'auto'], ['auto', 'force_new_found']]) {
    test('Async ' + action + ' ' + origin + ' -> ' + finish + ' writes only the original context', async t => {
      const initial = seedOperational(), app = setup(t, initial), service = app.service;
      service.setSimulationConfig({ mode: origin });
      if (origin !== 'auto') await service.checkProductByEan(isbn);
      const beforeSandbox = app.storage.get(sandboxKey);
      const delay = action === 'stock' ? 500 : 850;
      app.hold(delay);
      const pending = action === 'stock' ? service.addStockToExistingProduct(isbn, 2) : service.createProduct(draft('novo', { quantity: 9 }));
      service.setSimulationConfig({ mode: finish }); app.release(delay); await pending;
      const original = service.getRecordsForEan(isbn, origin).find(record => record.condition === 'novo');
      assert.equal(original.stock, action === 'stock' && origin !== 'auto' ? 5 : 9);
      if (origin !== 'auto') {
        for (const key of [operationalKey, legacyKey]) assert.equal(app.storage.get(key), initial.get(key));
        app.assertNoOperationalWrites();
      } else {
        assert.equal(app.storage.get(sandboxKey), beforeSandbox);
        assert.ok(app.writes.filter(write => write.key !== configKey).every(write => [operationalKey, legacyKey].includes(write.key)));
      }
    });
  }
}

test('Explicit caller snapshots override current mode consistently for all asynchronous methods', async t => {
  const app = setup(t), service = app.service;
  const origin = 'force_new_found';
  service.resetModeToAuto();
  assert.equal((await service.checkProductByEan(isbn, undefined, undefined, origin)).currentStock, 3);
  assert.equal((await service.addStockToExistingProduct(isbn, 2, undefined, origin)).newStock, 5);
  await service.createProduct(draft('usado'), origin);
  const complemented = await service.complementExistingProduct(isbn, { title: 'Complemento' }, origin);
  assert.equal(complemented.parentCode, 'LV26579-P');
  assert.equal(service.getRecordsForEan(isbn, origin).length, 2);
  assert.deepEqual(service.getRecordsForEan(isbn, 'auto'), []);
  assert.equal((await service.checkProductByEan(isbn)).status, 'NOT_FOUND');
  app.assertNoOperationalWrites();
});

test('Complement reads only its original namespace and never persists changes', async t => {
  const app = setup(t, seedOperational()), service = app.service;
  service.setSimulationConfig({ mode: 'force_new_not_found' });
  await service.createProduct(draft());
  const sandbox = app.storage.get(sandboxKey), operational = app.storage.get(operationalKey);
  app.hold(500);
  const pending = service.complementExistingProduct(isbn, { title: 'Complemento' });
  service.resetModeToAuto(); app.release(500);
  assert.equal((await pending).parentCode, 'SANDBOX-P');
  assert.equal((await service.complementExistingProduct(isbn, { title: 'Complemento' })).parentCode, 'OPERATIONAL-P');
  assert.equal(app.storage.get(sandboxKey), sandbox);
  assert.equal(app.storage.get(operationalKey), operational);
});

test('Forced errors are decided at the start and never mutate operational catalogs', async t => {
  const app = setup(t, seedOperational()), service = app.service;
  service.setSimulationConfig({ mode: 'force_error' });
  await assert.rejects(service.checkProductByEan(isbn), /503 Service Unavailable/);
  app.hold(850);
  const pending = service.createProduct(draft());
  const rejected = assert.rejects(pending, /Timeout de resposta/);
  service.resetModeToAuto(); app.release(850); await rejected;
  app.assertNoOperationalWrites();
  assert.equal(app.storage.has(sandboxKey), false);
  app.hold(850);
  const automatic = service.createProduct(draft('novo', { quantity: 8 }));
  service.setSimulationConfig({ mode: 'force_error' }); app.release(850); await automatic;
  assert.equal(service.getRecordsForEan(isbn, 'auto')[0].stock, 8);
  assert.equal(app.storage.has(sandboxKey), false);
});

test('F5 reloads both independent catalogs without promoting, resetting or merging sandbox records', async t => {
  const app = setup(t, seedOperational());
  app.service.setSimulationConfig({ mode: 'force_new_found' });
  await app.service.addStockToExistingProduct(isbn, 2);
  await app.service.createProduct(draft('usado', { ean: otherIsbn, isbn13: otherIsbn }));
  const storedOperational = app.storage.get(operationalKey), storedSandbox = app.storage.get(sandboxKey);
  let service = app.reload();
  assert.equal(service.getSimulationConfig().mode, 'force_new_found');
  assert.equal((await service.checkProductByEan(isbn)).currentStock, 5);
  service.resetModeToAuto();
  assert.equal((await service.checkProductByEan(isbn)).currentStock, 7);
  assert.equal((await service.checkProductByEan(otherIsbn)).status, 'NOT_FOUND');
  service = app.reload();
  assert.equal(service.getSimulationConfig().mode, 'auto');
  assert.equal((await service.checkProductByEan(isbn)).currentStock, 7);
  assert.equal(app.storage.get(operationalKey), storedOperational);
  assert.equal(app.storage.get(sandboxKey), storedSandbox);
  service.setSimulationConfig({ mode: 'force_new_found' });
  assert.equal(service.getRecordsForEan(otherIsbn)[0].condition, 'usado');
});

test('Existing V2 single-record data remains operational and unchanged by sandbox activity', async t => {
  const legacy = JSON.stringify({ [isbn]: { ...operationalRecord } });
  const app = setup(t, new Map([[legacyKey, legacy]])), service = app.service;
  assert.equal((await service.checkProductByEan(isbn)).currentStock, 7);
  service.setSimulationConfig({ mode: 'force_new_found' });
  await service.addStockToExistingProduct(isbn, 2);
  assert.equal(app.storage.get(legacyKey), legacy);
  assert.equal(app.storage.has(operationalKey), false);
  service.resetModeToAuto();
  assert.equal((await service.checkProductByEan(isbn)).currentStock, 7);
  await service.addStockToExistingProduct(isbn, 1);
  assert.equal(service.getRecordsForEan(isbn)[0].stock, 8);
  assert.equal(JSON.parse(app.storage.get(operationalKey))[isbn][0].stock, 8);
  assert.equal(JSON.parse(app.storage.get(legacyKey))[isbn][0].stock, 8);
  service.setSimulationConfig({ mode: 'force_new_found' });
  assert.equal((await service.checkProductByEan(isbn)).currentStock, 5);
});

test('Operational reads never access sandbox storage; forced reads/writes never access operational storage', async t => {
  const app = setup(t, seedOperational()), service = app.service;
  service.setSimulationConfig({ mode: 'force_new_found' });
  app.reads.length = 0;
  await service.checkProductByEan(isbn);
  await service.addStockToExistingProduct(isbn, 1);
  await service.createProduct(draft('usado'));
  await service.complementExistingProduct(isbn, { title: 'Complemento' });
  assert.ok(app.reads.every(key => key === sandboxKey));
  service.resetModeToAuto(); app.reads.length = 0;
  await service.checkProductByEan(isbn);
  service.getRecordsForEan(isbn);
  await service.complementExistingProduct(isbn, { title: 'Complemento' });
  assert.ok(app.reads.every(key => [operationalKey, legacyKey].includes(key)));
  app.assertNoOperationalWrites();
});
