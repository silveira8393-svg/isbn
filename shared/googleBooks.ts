import type { BookInfo } from '../src/types.js';
import { canonicalBookIsbn, cleanIsbn } from '../src/utils/isbn.js';
import { normalizeLanguage } from '../src/utils/bibliographicNormalization.js';
import { normalizePublicationDate } from './publicationDate.js';

export const GOOGLE_BOOKS_SOURCE = 'Google Books';
export type GoogleBooksResult = {
  status: 'success' | 'not_found' | 'unavailable' | 'invalid_query';
  book: BookInfo | null;
  diagnostic: { code: string; httpStatus?: number; durationMs?: number };
};
type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const text = (value: unknown, max = 500): string | undefined => typeof value === 'string' && value.trim()
  && value.length <= max && !/[<>\x00-\x1f]/.test(value) ? value.trim() : undefined;

/** Keep only product-specific URLs returned by the API, bound to the selected volume. */
function volumeUrl(value: unknown, id: string, image = false): string | undefined {
  if (typeof value !== 'string' || /[\x00-\x20\x7f]/.test(value)) return;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port || url.hash
      || !['books.google.com', 'books.google.com.br'].includes(url.hostname) || url.searchParams.get('id') !== id
      || !(image ? ['/books/content'] : ['/books', '/books/edition', '/ebooks']).includes(url.pathname)) return;
    if ([...url.searchParams.keys()].some(key => /^(?:key|token|access_token|auth|authorization|session|sid|callback)$/i.test(key))) return;
    if (image && url.searchParams.get('jscmd') !== 'viewapi' && url.searchParams.get('img') !== '1') return;
    // The API often returns HTTP; use the same resource over HTTPS, without inventing its path.
    url.protocol = 'https:';
    return url.href;
  } catch { return; }
}

/** Choose one exact edition; never union metadata from different volume records. */
export function mapGoogleBooksResponse(payload: unknown, searchedIsbn: string): GoogleBooksResult {
  const expected = canonicalBookIsbn(searchedIsbn), data = object(payload);
  if (!expected) return { status: 'invalid_query', book: null, diagnostic: { code: 'invalid_isbn' } };
  if (data.kind !== 'books#volumes' || !Number.isSafeInteger(data.totalItems) || Number(data.totalItems) < 0
    || (data.items !== undefined && !Array.isArray(data.items))
    || (Number(data.totalItems) > 0 && !Array.isArray(data.items))) {
    return { status: 'unavailable', book: null, diagnostic: { code: 'invalid_response' } };
  }
  for (const item of Array.isArray(data.items) ? data.items : []) {
    const volume = object(item), info = object(volume.volumeInfo), id = text(volume.id, 100);
    if (!id || !/^[\w-]+$/.test(id)) continue;
    const ids = (Array.isArray(info.industryIdentifiers) ? info.industryIdentifiers : []).map(object)
      .filter(identifier => ['ISBN_10', 'ISBN_13'].includes(String(identifier.type)));
    if (!ids.length || ids.some(identifier => typeof identifier.identifier !== 'string'
      || cleanIsbn(identifier.identifier).length !== (identifier.type === 'ISBN_10' ? 10 : 13)
      || canonicalBookIsbn(identifier.identifier) !== expected)) continue;
    const title = text(info.title);
    if (!title) continue;
    const book: BookInfo = { id: `google-books-${id}`, title, isbn13: expected, provider: GOOGLE_BOOKS_SOURCE, provenance: {} };
    const isbn10 = ids.find(identifier => identifier.type === 'ISBN_10');
    if (isbn10) book.isbn10 = cleanIsbn(String(isbn10.identifier));
    const subtitle = text(info.subtitle), publisher = text(info.publisher);
    const authors = [...new Set((Array.isArray(info.authors) ? info.authors : []).map(author => text(author)).filter((v): v is string => !!v))];
    if (subtitle) book.subtitle = subtitle;
    if (publisher) book.publisher = publisher;
    if (authors.length) book.authors = authors;
    const date = normalizePublicationDate(info.publishedDate);
    if (date && +date.slice(0, 4) >= 1450 && +date.slice(0, 4) <= new Date().getFullYear() + 1) {
      book.publishedDate = date; book.year = +date.slice(0, 4);
    }
    if (typeof info.pageCount === 'number' && Number.isSafeInteger(info.pageCount) && info.pageCount > 0 && info.pageCount <= 20000) book.pageCount = info.pageCount;
    const language = text(info.language, 30);
    if (language) book.language = normalizeLanguage(language);
    const infoLink = volumeUrl(info.infoLink, id), previewLink = volumeUrl(info.previewLink, id);
    const images = object(info.imageLinks);
    const coverUrl = ['thumbnail', 'smallThumbnail', 'small', 'medium', 'large', 'extraLarge']
      .map(key => volumeUrl(images[key], id, true)).find(Boolean);
    book.googleBooksReference = { volumeId: id, isbn: expected, infoLink, previewLink, coverUrl,
      descriptionAvailable: typeof info.description === 'string' && !!info.description.trim(), contentReviewRequired: true };
    if (book.googleBooksReference.descriptionAvailable || coverUrl) book.bibliographicWarnings = [
      'Google Books: descrição/capa disponíveis como referência; direitos de uso comercial exigem verificação.'];
    // Descriptions/covers are references for rights review, never automatic commercial content.
    const links: NonNullable<BookInfo['sourceLinks']> = [];
    if (infoLink) links.push({ source: 'google_books', kind: 'info', url: infoLink, isbn: expected });
    if (previewLink) links.push({ source: 'google_books', kind: 'preview', url: previewLink, isbn: expected });
    if (links.length) book.sourceLinks = links;
    for (const field of Object.keys(book)) if (!['id', 'provider', 'provenance'].includes(field)) book.provenance![field] = GOOGLE_BOOKS_SOURCE;
    return { status: 'success', book, diagnostic: { code: 'exact_isbn' } };
  }
  return { status: 'not_found', book: null, diagnostic: { code: Number(data.totalItems) === 0 ? 'no_results' : 'no_exact_isbn' } };
}
