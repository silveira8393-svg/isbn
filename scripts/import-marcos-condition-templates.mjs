import { readFileSync } from 'node:fs';

export const storeId = '6058abd1-96e5-465b-a1df-292e5cf76de3';
export const originals = JSON.parse(readFileSync(new URL('./marcos-condition-templates.json', import.meta.url), 'utf8'));
const key = 'used_book_condition_templates';

/** Exact full-text comparison. Existing objects, including inactive models, are preserved. */
export function planImport(settings, makeId = () => crypto.randomUUID()) {
  const config = settings?.[key];
  if (!settings || Array.isArray(settings) || config?.version !== 1 || !Array.isArray(config.items)
    || config.items.some(item => !item || typeof item.id !== 'string' || !item.id.trim()
      || typeof item.name !== 'string' || !item.name.trim() || typeof item.text !== 'string'
      || !item.text.trim() || typeof item.active !== 'boolean')
    || new Set(config.items.map(item => item.id)).size !== config.items.length) throw new Error('Configuração inválida: importação interrompida.');
  const next = structuredClone(settings);
  const texts = new Set(config.items.map(item => item.text));
  const ids = new Set(config.items.map(item => item.id));
  let added = 0;
  for (const original of originals) {
    if (texts.has(original.text)) continue;
    const id = makeId();
    if (!id || ids.has(id)) throw new Error('ID repetido: importação interrompida.');
    next[key].items.push({ id, ...original, active: true });
    texts.add(original.text); ids.add(id); added++;
  }
  return { settings: next, added };
}

/** Same optimistic concurrency predicate used by conditionTemplatesService.
 * A stale snapshot updates zero rows; never retry without rereading.
 * Only settings changes; default_location, updated_by and other columns are preserved.
 */
export function importSql(base) {
  const plan = planImport(base);
  if (!plan.added) return null;
  const literal = value => "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
  return `update public.store_settings set settings = ${literal(plan.settings)}\nwhere store_id = '${storeId}' and settings = ${literal(base)}\nreturning store_id, settings;`;
}
