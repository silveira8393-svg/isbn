import { type Config, MARKETPLACE, fail, jsonRequest } from './core.js';
import { normalizePublicationDate } from '../../shared/publicationDate.js';
import { amazonBrowseNode, amazonBrowseNodes } from '../../shared/amazonCategories.js';

export function normalizeIsbn(input: string) {
  if (input.length > 32 || !/^[0-9Xx\s-]+$/.test(input)) return fail(422, 'invalid_isbn');
  const isbn = input.replace(/[\s-]/g, '').toUpperCase();
  if (/^\d{9}[\dX]$/.test(isbn)) {
    if ([...isbn].reduce((sum, c, i) => sum + (c === 'X' ? 10 : Number(c)) * (10 - i), 0) % 11 === 0) return isbn;
  } else if (/^97[89]\d{10}$/.test(isbn) && [...isbn].reduce((sum, c, i) => sum + Number(c) * (i % 2 ? 3 : 1), 0) % 10 === 0) return isbn;
  return fail(422, 'invalid_isbn');
}
export async function lwa(config: Pick<Config, 'client' | 'secret'>, fetcher: typeof fetch, grant: Record<string, string>) {
  const data = await jsonRequest(fetcher, 'https://api.amazon.com/auth/o2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...grant, client_id: config.client, client_secret: config.secret }),
  }, 16384);
  if (!data || typeof data.access_token !== 'string' || !data.access_token || data.access_token.length > 2048
    || /[\r\n]/.test(data.access_token) || data.token_type?.toLowerCase() !== 'bearer'
    || !Number.isFinite(data.expires_in) || data.expires_in <= 0) fail(502, 'invalid_lwa_response');
  if (grant.grant_type === 'authorization_code' && (typeof data.refresh_token !== 'string' || !data.refresh_token || data.refresh_token.length > 2048)) fail(502, 'invalid_lwa_response');
  return data as { access_token: string; refresh_token?: string };
}
function equivalent(value: string) {
  if (value.length !== 10) return value;
  const base = '978' + value.slice(0, 9);
  const sum = [...base].reduce((n, c, i) => n + Number(c) * (i % 2 ? 3 : 1), 0);
  return base + ((10 - sum % 10) % 10);
}
function matchesIsbn(value: unknown, isbn: string) {
  try { return typeof value === 'string' && equivalent(normalizeIsbn(value)) === equivalent(isbn); }
  catch { return false; }
}
type Measurement = { value: number; unit: string };
type PhysicalDimensions = Partial<Record<'height' | 'width' | 'length' | 'weight', Measurement>>;
function physicalDimensions(value: any): PhysicalDimensions {
  const result: PhysicalDimensions = {};
  for (const key of ['height', 'width', 'length', 'weight'] as const) {
    const measure = value?.[key];
    if (typeof measure?.value === 'number' && Number.isFinite(measure.value) && measure.value > 0
      && typeof measure.unit === 'string' && /^[a-zA-Z _-]{1,40}$/.test(measure.unit)) result[key] = { value: measure.value, unit: measure.unit };
  }
  return result;
}
// Strict projection: never return raw attributes, seller information, offers, prices or inventory.
export async function searchCatalog(config: Pick<Config, 'client' | 'secret'>, fetcher: typeof fetch, isbn: string, access: string, keywords?: string) {
  const url = new URL('https://sellingpartnerapi-na.amazon.com/catalog/2022-04-01/items');
  url.search = new URLSearchParams({ ...(keywords ? { keywords } : { identifiers: isbn, identifiersType: 'ISBN' }), marketplaceIds: MARKETPLACE,
    includedData: keywords ? 'summaries,attributes,identifiers,images,productTypes' : 'summaries,attributes,identifiers,dimensions,images,classifications', pageSize: '20' }).toString();
  const data = await jsonRequest(fetcher, url, { method: 'GET', headers: { 'x-amz-access-token': access,
    'x-amz-date': new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''), 'User-Agent': 'ISBN/1.0 (Language=TypeScript)', Accept: 'application/json' } });
  if (!data || !Array.isArray(data.items) || data.items.length > 20 || !Number.isInteger(data.numberOfResults) || data.numberOfResults < 0) fail(502, 'invalid_catalog_response');
  const text = (value: unknown): string | null => typeof value === 'string' && value.trim() && value.length <= 10000 ? value.trim() : null;
  const matching = data.items.filter((item: any) => keywords ? /^[A-Z0-9]{10}$/.test(item?.asin) : Array.isArray(item?.identifiers) && item.identifiers.some((group: any) => group?.marketplaceId === MARKETPLACE
    && Array.isArray(group.identifiers) && group.identifiers.some((id: any) => ['ISBN', 'EAN', 'GTIN'].includes(id?.identifierType)
      && matchesIsbn(id.identifier, isbn))));
  const items = matching.map((item: any) => {
    const summary = Array.isArray(item.summaries) ? item.summaries.find((s: any) => s?.marketplaceId === MARKETPLACE) : null;
    const browseClassification = amazonBrowseNode(summary?.browseClassification);
    const classifications = amazonBrowseNodes((Array.isArray(item.classifications) ? item.classifications : [])
      .filter((group: any) => group?.marketplaceId === MARKETPLACE)
      .flatMap((group: any) => Array.isArray(group.classifications) ? group.classifications : []));
    const attr = (name: string) => {
      const values = Array.isArray(item.attributes?.[name]) ? item.attributes[name] : [];
      return [...values.filter((a: any) => a?.marketplace_id === MARKETPLACE), ...values.filter((a: any) => a && a.marketplace_id === undefined)];
    };
    const value = (name: string) => attr(name).map((a: any) => text(a.value) || text(a.name)).find(Boolean) || null;
    const positiveInteger = (v: unknown) => (typeof v === 'number' || (typeof v === 'string' && /^\d+$/.test(v)))
      && Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : null;
    const authors = attr('author').map((a: any) => text(a.name) || text(a.value)).filter(Boolean);
    if (!authors.length && Array.isArray(summary?.contributors)) authors.push(...summary.contributors
      .filter((c: any) => c?.role?.value === 'author').map((c: any) => text(c.value)).filter(Boolean));
    const reportedIdentifiers = (Array.isArray(item.identifiers) ? item.identifiers : []).filter((g: any) => g?.marketplaceId === MARKETPLACE && Array.isArray(g.identifiers)).flatMap((g: any) => g.identifiers)
      .filter((id: any) => ['ISBN', 'EAN', 'GTIN'].includes(id?.identifierType)).map((id: any) => id.identifier);
    reportedIdentifiers.push(...attr('externally_assigned_product_identifier').filter((id: any) => typeof id.type === 'string' && ['isbn', 'ean', 'gtin'].includes(id.type.toLowerCase())).map((id: any) => id.value));
    for (const key of ['isbn', 'isbn_10', 'isbn_13']) reportedIdentifiers.push(...attr(key).map((id: any) => id.value));
    const identifiers = reportedIdentifiers.filter((id: unknown) => {
      if (!keywords) return matchesIsbn(id, isbn);
      try { return typeof id === 'string' && Boolean(normalizeIsbn(id)); } catch { return false; }
    }).map((id: string) => {
      const identifier = normalizeIsbn(id);
      return { type: identifier.length === 10 ? 'ISBN_10' : 'ISBN_13', identifier };
    });
    const physicalGroup = Array.isArray(item.dimensions) ? item.dimensions.find((g: any) => g?.marketplaceId === MARKETPLACE) : undefined;
    const physical: { item?: PhysicalDimensions; package?: PhysicalDimensions } = {};
    for (const [scope, dimensionName, weightName] of [['item', 'item_dimensions', 'item_weight'], ['package', 'item_package_dimensions', 'item_package_weight']]) {
      const selected = physicalDimensions(physicalGroup?.[scope]);
      const fallback = Object.assign({}, ...attr(dimensionName).reverse().map(physicalDimensions));
      const weight = attr(weightName).map((v: unknown) => physicalDimensions({ weight: v }).weight).find(Boolean);
      if (weight) fallback.weight = weight;
      const dimensions = { ...fallback, ...selected };
      if (Object.keys(dimensions).length) physical[scope as 'item' | 'package'] = dimensions;
    }
    const languages = attr('language');
    const language = languages.find((v: any) => v.type === 'original' && text(v.value)) || languages.find((v: any) => v.type === 'published' && text(v.value)) || languages.find((v: any) => text(v.value));
    const images = (Array.isArray(item.images) ? item.images : []).filter((g: any) => g?.marketplaceId === MARKETPLACE)
      .flatMap((g: any) => Array.isArray(g.images) ? g.images : []);
    const pixels = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n > 0 ? n : null;
    const imageUrl = (value: unknown): string | null => {
      if (typeof value !== 'string' || value.length > 2048 || /[\x00-\x20\x7f]/.test(value)) return null;
      try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.search && !url.hash
          && !url.pathname.endsWith('/') && !/\.html?$/i.test(url.pathname) ? url.href : null;
      } catch { return null; }
    };
    return { asin: text(item.asin), isbn, title: text(summary?.itemName) || value('item_name'),
      ...(keywords ? { subtitle: value('subtitle') } : {}),
      ...(browseClassification ? { browseClassification } : {}), ...(classifications.length ? { classifications } : {}),
      authors: [...new Set(authors)], publisher: value('publisher') || value('publisher_name'),
      publicationDate: normalizePublicationDate(value('publication_date')) || normalizePublicationDate(value('street_date')) || null,
      language: text(language?.value), binding: value('binding'),
      edition: value('edition') || (positiveInteger(attr('edition')[0]?.value)?.toString() ?? null),
      pageCount: ['number_of_pages', 'pages'].flatMap(name => attr(name))
        .map((a: any) => positiveInteger(a.value)).find((n: number | null) => n !== null) ?? null,
      identifiers: [...new Map(identifiers.map(id => [id.identifier, id])).values()],
      isbn10: identifiers.find(id => id.type === 'ISBN_10')?.identifier || null,
      isbn13: identifiers.find(id => id.type === 'ISBN_13')?.identifier || null,
      physical: Object.keys(physical).length ? physical : null,
      imageMetadata: { datasetReturned: Array.isArray(item.images), count: images.length,
        entries: images.map((image: any) => ({ variant: /^(MAIN|PT\d{2}|SWCH)$/.test(image?.variant) ? image.variant : 'other',
          width: pixels(image?.width), height: pixels(image?.height), hasUrl: typeof image?.link === 'string' && Boolean(image.link) })) },
      // Image use was authorized by the project owner. Return public references only, without fetching files.
      // Synopsis/HTML and all other raw attributes remain outside the registration flow.
      synopsis: null, images: images.filter((image: any) => /^(MAIN|PT\d{2}|SWCH)$/.test(image?.variant))
        .map((image: any) => ({ variant: image.variant, link: imageUrl(image.link), width: pixels(image.width), height: pixels(image.height) }))
        .filter((image: any) => image.link), source: 'amazon_spapi_catalog_2022-04-01', marketplaceId: MARKETPLACE };
  });
  return { ...(keywords ? { query: keywords } : { isbn }), items, hasMore: Boolean(data.pagination?.nextToken), requiresReview: true };
}
