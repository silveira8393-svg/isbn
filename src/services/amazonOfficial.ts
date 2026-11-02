import type { BookInfo, User } from '../types';
import { cleanIsbn } from '../utils/isbn';
import { normalizePublicationDate, publicationYear } from '../../shared/publicationDate';

const LAB_STORE = '492af2ad-905c-42f8-90f4-aa6c1dc142f3';
export const canUseAmazonOfficial = (user: Pick<User, 'active' | 'role' | 'storeId'>) =>
  user.active === true && user.role === 'developer' && user.storeId === LAB_STORE;
type CatalogItem = { isbn: string; asin: string; title?: string; authors?: string[]; publisher?: string;
  publicationDate?: string; language?: string; binding?: string; edition?: string; pageCount?: number; marketplaceId: string };
export type AmazonOfficialResult = { book: BookInfo | null; status: 'success' | 'not_found' | 'ambiguous' | 'unavailable' | 'skipped' };
export async function searchAmazonOfficial(isbn: string, user: User, signal?: AbortSignal): Promise<AmazonOfficialResult> {
  if (!canUseAmazonOfficial(user)) return { book: null, status: 'skipped' };
  try {
    const { supabase } = await import('../lib/supabase');
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token || data.session.user.id !== user.id) return { book: null, status: 'unavailable' };
    const response = await fetch(`/api/amazon/spapi/catalog?isbn=${encodeURIComponent(cleanIsbn(isbn))}`, {
      headers: { Authorization: `Bearer ${data.session.access_token}` }, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(55000)]) : AbortSignal.timeout(55000),
    });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) { void response.body?.cancel(); return { book: null, status: 'unavailable' }; }
    const result = await response.json();
    if (result.isbn !== cleanIsbn(isbn) || !Array.isArray(result.items)) return { book: null, status: 'unavailable' };
    const items: CatalogItem[] = result.items.filter((item: CatalogItem) => item?.isbn === cleanIsbn(isbn) && item.marketplaceId === 'A2Q3Y263D00KWC');
    if (!items.length) return { book: null, status: 'not_found' };
    if (items.length !== 1 || result.hasMore === true) return { book: null, status: 'ambiguous' };
    const item = items[0];
    const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : undefined;
    const book: BookInfo = { id: `amazon-spapi-${item.asin}`, title: text(item.title) || '',
      ...(cleanIsbn(isbn).length === 13 ? { isbn13: cleanIsbn(isbn) } : { isbn10: cleanIsbn(isbn) }),
      authors: Array.isArray(item.authors) ? item.authors.map(text).filter((v): v is string => Boolean(v)) : undefined,
      publisher: text(item.publisher), publishedDate: normalizePublicationDate(item.publicationDate), year: publicationYear(item.publicationDate), language: text(item.language),
      format: text(item.binding), edition: text(item.edition), pageCount: Number.isInteger(item.pageCount) && item.pageCount! > 0 ? item.pageCount : undefined,
      provider: 'Amazon SP-API',
      // Never import Amazon images, HTML, synopsis, offers or raw attributes into the registration flow.
    };
    if (!book.title && !book.authors?.length && !book.publisher && !book.publishedDate && !book.language && !book.format && !book.edition && !book.pageCount)
      return { book: null, status: 'not_found' };
    return { status: 'success', book };
  } catch { return { book: null, status: 'unavailable' }; }
}
export function complementWithAmazon(base: BookInfo | null, amazon: BookInfo | null): BookInfo | null {
  if (!amazon) return base;
  const merged: BookInfo = base ? { ...base, provenance: { ...base.provenance } } : { id: amazon.id, title: '', isbn10: amazon.isbn10, isbn13: amazon.isbn13, provenance: {} };
  for (const key of ['title', 'authors', 'publisher', 'publishedDate', 'language', 'format', 'edition', 'pageCount'] as const) {
    const current = merged[key], value = amazon[key];
    const missing = current == null || (typeof current === 'string' && !current.trim()) || (Array.isArray(current) && !current.length)
      || (key === 'pageCount' && typeof current === 'number' && current <= 0);
    if (missing && value != null && value !== '' && (!Array.isArray(value) || value.length)) {
      merged[key] = value as never; merged.provenance![key] = 'amazon_spapi_catalog_2022-04-01';
    }
  }
  // Derive an Amazon year only when Amazon supplied the date. A priority source's date/year wins.
  if (!merged.year && merged.provenance?.publishedDate === 'amazon_spapi_catalog_2022-04-01') {
    merged.year = publicationYear(merged.publishedDate);
    if (merged.year) merged.provenance.year = 'amazon_spapi_catalog_2022-04-01';
  }
  return merged;
}
