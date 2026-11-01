import { type Config, MARKETPLACE, fail, jsonRequest } from './core.js';

export function normalizeIsbn(input: string) {
  if (input.length > 32 || !/^[0-9Xx\s-]+$/.test(input)) return fail(422, 'invalid_isbn');
  const isbn = input.replace(/[\s-]/g, '').toUpperCase();
  if (/^\d{9}[\dX]$/.test(isbn)) {
    if ([...isbn].reduce((sum, c, i) => sum + (c === 'X' ? 10 : Number(c)) * (10 - i), 0) % 11 === 0) return isbn;
  } else if (/^97[89]\d{10}$/.test(isbn) && [...isbn].reduce((sum, c, i) => sum + Number(c) * (i % 2 ? 3 : 1), 0) % 10 === 0) return isbn;
  return fail(422, 'invalid_isbn');
}
export async function lwa(config: Config, fetcher: typeof fetch, grant: Record<string, string>) {
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
// Strict projection: never return raw attributes, seller information, offers, prices or inventory.
export async function searchCatalog(config: Config, fetcher: typeof fetch, isbn: string, access: string) {
  const url = new URL('https://sellingpartnerapi-na.amazon.com/catalog/2022-04-01/items');
  url.search = new URLSearchParams({ identifiers: isbn, identifiersType: 'ISBN', marketplaceIds: MARKETPLACE,
    includedData: 'summaries,attributes,identifiers,images', pageSize: '20' }).toString();
  const data = await jsonRequest(fetcher, url, { method: 'GET', headers: { 'x-amz-access-token': access,
    'x-amz-date': new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''), 'User-Agent': 'ISBN/1.0 (Language=TypeScript)', Accept: 'application/json' } });
  if (!data || !Array.isArray(data.items) || data.items.length > 20 || !Number.isInteger(data.numberOfResults) || data.numberOfResults < 0) fail(502, 'invalid_catalog_response');
  const text = (value: unknown): string | null => typeof value === 'string' && value.length <= 10000 ? value : null;
  const items = data.items.filter((item: any) => Array.isArray(item?.identifiers) && item.identifiers.some((group: any) => group.marketplaceId === MARKETPLACE
    && Array.isArray(group.identifiers) && group.identifiers.some((id: any) => ['ISBN', 'EAN', 'GTIN'].includes(id.identifierType)
      && typeof id.identifier === 'string' && equivalent(id.identifier) === equivalent(isbn)))).map((item: any) => {
    const summary = Array.isArray(item.summaries) ? item.summaries.find((s: any) => s.marketplaceId === MARKETPLACE) : null;
    const attr = (name: string) => Array.isArray(item.attributes?.[name]) ? item.attributes[name].filter((a: any) => a.marketplace_id === MARKETPLACE) : [];
    const value = (name: string) => text(attr(name)[0]?.value);
    const images = Array.isArray(item.images) ? item.images.find((g: any) => g.marketplaceId === MARKETPLACE)?.images : [];
    return { asin: text(item.asin), isbn, title: text(summary?.itemName) || value('item_name'),
      authors: attr('author').map((a: any) => text(a.value)).filter(Boolean), publisher: value('publisher'),
      publicationDate: value('publication_date'), language: value('language'), binding: value('binding'),
      pageCount: typeof attr('number_of_pages')[0]?.value === 'number' ? attr('number_of_pages')[0].value : null,
      synopsis: value('product_description'), images: Array.isArray(images) ? images.slice(0, 20).flatMap((image: any) => {
        try { const url = new URL(image.link); return url.protocol === 'https:' && !url.username && !url.password ? [{ url: url.href, variant: text(image.variant) }] : []; } catch { return []; }
      }) : [], source: 'amazon_spapi_catalog_2022-04-01', marketplaceId: MARKETPLACE };
  });
  return { isbn, items, hasMore: Boolean(data.pagination?.nextToken), requiresReview: true };
}
