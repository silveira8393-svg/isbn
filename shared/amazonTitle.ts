import type { BookInfo, User } from '../src/types.js';
import type { TitleSearchCandidate } from './googleBooks.js';
import { canonicalBookIsbn, cleanIsbn } from '../src/utils/isbn.js';
import { normalizeLanguage } from '../src/utils/bibliographicNormalization.js';
import { normalizePublicationDate } from './publicationDate.js';

export type AmazonTitleResult = {
  status: 'success' | 'not_found' | 'unavailable' | 'invalid_query' | 'unauthorized' | 'rate_limited';
  candidates: TitleSearchCandidate[];
  diagnostic: { code: string; httpStatus?: number };
  hasMore?: boolean;
};
export function canSearchAmazonTitle(user?: User, environment?: string) {
  return user?.active === true && user.role === 'developer' && Boolean(user.storeId) && environment === 'development';
}
const text = (v: unknown): string | undefined => typeof v === 'string' && v.trim() && v.length <= 10000
  && !/[<>\x00-\x1f]/.test(v) ? v.trim() : undefined;

/** Receives only the strict projection of the official catalog route. Never joins products. */
export function mapAmazonTitleResponse(payload: unknown): AmazonTitleResult {
  const data = payload as { items?: unknown[]; query?: string; hasMore?: boolean };
  if (!data || typeof data.query !== 'string' || !Array.isArray(data.items) || data.items.length > 20)
    return { status: 'unavailable', candidates: [], diagnostic: { code: 'invalid_response' } };
  const candidates: TitleSearchCandidate[] = [], seen = new Set<string>();
  for (const raw of data.items) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, any>;
    if (item.source !== 'amazon_spapi_catalog_2022-04-01' || item.marketplaceId !== 'A2Q3Y263D00KWC'
      || !/^[A-Z0-9]{10}$/.test(item.asin) || !text(item.title)) continue;
    const key = `${item.marketplaceId}:${item.asin}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const book: BookInfo = { id: `amazon:${key}`, title: text(item.title)!, provider: 'Amazon SP-API',
      amazonTitleReference: { asin: item.asin, marketplaceId: item.marketplaceId }, provenance: {} };
    for (const [field, value] of Object.entries({ subtitle: text(item.subtitle), publisher: text(item.publisher),
      edition: text(item.edition), language: normalizeLanguage(text(item.language)), format: text(item.binding),
      publishedDate: normalizePublicationDate(item.publicationDate) || undefined,
      pageCount: Number.isSafeInteger(item.pageCount) && item.pageCount > 0 ? item.pageCount : undefined,
      authors: Array.isArray(item.authors) ? [...new Set(item.authors.map(text).filter(Boolean))] : undefined })) {
      if (value !== undefined && value !== '' && (!Array.isArray(value) || value.length)) {
        (book as any)[field] = value; book.provenance![field] = 'Amazon SP-API';
      }
    }
    if (book.publishedDate) { book.year = Number(book.publishedDate.slice(0, 4)); book.provenance!.year = 'Amazon SP-API'; }
    const ids = [...new Set<unknown>([item.isbn10, item.isbn13,
      ...(Array.isArray(item.identifiers) ? item.identifiers.map((id: any) => id?.identifier) : [])])]
      .filter((id): id is string => typeof id === 'string' && Boolean(canonicalBookIsbn(id)));
    if (ids.length) book.rawIdentifiers = ids.map(id => ({ type: cleanIsbn(id).length === 10 ? 'ISBN_10' : 'ISBN_13', identifier: cleanIsbn(id) }));
    if (new Set(ids.map(canonicalBookIsbn)).size <= 1) {
      for (const id of ids) { const field = cleanIsbn(id).length === 10 ? 'isbn10' : 'isbn13'; book[field] = cleanIsbn(id); book.provenance![field] = 'Amazon SP-API'; }
    } else book.bibliographicWarnings = ['ISBNs divergentes no produto Amazon; confira manualmente.'];
    if (!book.isbn10 && !book.isbn13) (book.bibliographicWarnings ||= []).push('ISBN não informado ou inválido; confira manualmente.');
    const cover = Array.isArray(item.images) ? item.images.find((image: any) => image?.variant === 'MAIN')?.link : undefined;
    if (typeof cover === 'string') {
      try { const url = new URL(cover); if (url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash) book.amazonTitleReference!.coverUrl = url.href; } catch { /* absent reference */ }
    }
    candidates.push({ source: 'amazon', key, book });
  }
  return { status: candidates.length ? 'success' : 'not_found', candidates, hasMore: data.hasMore === true,
    diagnostic: { code: candidates.length ? 'catalog_candidates' : 'no_usable_results' } };
}
