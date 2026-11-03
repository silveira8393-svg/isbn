import test from 'node:test';
import assert from 'node:assert/strict';
import { originals, planImport, importSql, storeId } from '../scripts/import-marcos-condition-templates.mjs';

const key = 'used_book_condition_templates';
test('17 verbatim texts are unique; append only missing originals and preserve every existing value', () => {
  assert.equal(originals.length, 17);
  assert.equal(new Set(originals.map(item => item.text)).size, 17);
  const existing = { id: 'existing', name: 'Nome personalizado', text: originals[0].text, active: false };
  const custom = { id: 'custom', name: 'Modelo próprio', text: 'Texto da loja.', active: true };
  const base = { other: { nested: [null, false, 7] }, [key]: { version: 1, items: [existing, custom] } };
  const before = structuredClone(base);
  let index = 0;
  const first = planImport(base, () => `new-${++index}`);
  assert.equal(first.added, 16); assert.equal(first.settings[key].items.length, 18);
  assert.deepEqual(base, before); assert.deepEqual(first.settings.other, base.other);
  assert.deepEqual(first.settings[key].items.slice(0, 2), [existing, custom]);
  for (const original of originals) assert.equal(first.settings[key].items.filter(item => item.text === original.text).length, 1);
  const second = planImport(first.settings, () => { throw new Error('No new ID should be requested'); });
  assert.equal(second.added, 0); assert.deepEqual(second.settings, first.settings);
  assert.equal(importSql(second.settings), null);
});

test('Import rejects unsupported configurations and guards SQL by full previous JSONB and the specific store', () => {
  for (const config of [null, {}, { version: 2, items: [] }, { version: 1, items: [null] }]) {
    assert.throws(() => planImport({ [key]: config }));
  }
  const base = { custom: "Owner's setting", [key]: { version: 1, items: [] } };
  const sql = importSql(base);
  assert.ok(sql.includes(`where store_id = '${storeId}' and settings = `));
  assert.ok(sql.includes("Owner''s setting"));
  assert.match(sql, /returning store_id, settings/);
  assert.doesNotMatch(sql, /truncate|delete|alter|create table|upsert|updated_by/i);
});
