// Restricted factual observation, never a raw payload export. Called only after catalog authorization.
const ATTRIBUTES = ['item_name', 'subtitle', 'book_subtitle', 'author', 'authors', 'publisher', 'publisher_name',
  'publication_date', 'street_date', 'book_publication_date', 'edition', 'edition_number', 'book_edition',
  'language', 'binding', 'book_binding', 'number_of_pages', 'print_length', 'pages',
  'item_dimensions', 'item_weight', 'item_package_dimensions', 'item_package_weight'];
const BIBLIOGRAPHIC_NAME = /^(?:book_)?(?:title|subtitle|author|authors|contributor|contributors|publisher|publisher_name|publication_date|edition|edition_number|binding|language|number_of_pages|print_length|pages|item_dimensions|item_weight)$/;
const KEYS = new Set(['value', 'name', 'unit', 'height', 'width', 'length', 'weight', 'type', 'language_tag',
  'marketplace_id', 'role', 'contributors', 'itemName', 'releaseDate', 'item', 'package', 'marketplaceId']);

function observed(value: unknown, depth = 0): unknown {
  if (value === null) return { type: 'null' };
  if (value === undefined) return { type: 'absent' };
  if (typeof value === 'number') return Number.isFinite(value) ? { type: 'number', value } : { type: 'number', omitted: true };
  if (typeof value === 'string') {
    // Do not reflect HTML, control characters or recognizable credential material, even in a factual slot.
    const unsafe = value.length > 512 || /[<>\x00-\x1f\x7f]|(?:Bearer\s|Atz[ar]\||eyJ[A-Za-z0-9_-]+\.)/i.test(value);
    return unsafe ? { type: 'string', omitted: true } : { type: 'string', value };
  }
  if (Array.isArray(value)) return { type: 'array', count: value.length,
    ...(depth < 5 ? { entries: value.slice(0, 4).map(v => observed(v, depth + 1)), truncated: value.length > 4 } : { omitted: true }) };
  if (typeof value === 'object') return { type: 'object',
    ...(depth < 5 ? { fields: Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([key]) => KEYS.has(key)).slice(0, 18).map(([key, v]) => [key, observed(v, depth + 1)])),
      unrecognizedKeys: Object.keys(value).filter(key => !KEYS.has(key)).length } : { omitted: true }) };
  return { type: typeof value, omitted: true };
}

export function catalogDiagnostics(original: any, processed: any, marketplace: string) {
  const summary = Array.isArray(original?.summaries) ? original.summaries.find((v: any) => v?.marketplaceId === marketplace) : undefined;
  const source = original?.attributes && typeof original.attributes === 'object' && !Array.isArray(original.attributes) ? original.attributes : {};
  const names = [...new Set([...ATTRIBUTES, ...Object.keys(source).filter(name => BIBLIOGRAPHIC_NAME.test(name))])].slice(0, 40);
  const attributes = Object.fromEntries(names.map(name => [name, observed(source[name])]));
  const fields = ['title', 'authors', 'publisher', 'publicationDate', 'edition', 'language', 'binding', 'pageCount', 'physical'];
  const result = { asin: /^[A-Z0-9]{10}$/.test(processed.asin || '') ? processed.asin : null,
    summary: observed(summary), attributes, dimensions: observed(original?.dimensions),
    parser: Object.fromEntries(fields.map(name => [name, processed[name] ?? null])),
    note: 'Absent means absent in this response. Present but unselected may mean priority, marketplace, shape or validation; not proof of a parser defect.' };
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 32 * 1024) return { asin: result.asin, omitted: true, reason: 'diagnostic_size_limit' };
  return result;
}
