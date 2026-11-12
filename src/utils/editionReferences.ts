import type { BookInfo, EditionReference } from '../types';
import { bookSourceLinks, validSourceLink } from './bookSourceLinks';
import { canonicalBookIsbn } from './isbn';

export function validEditionReference(reference: EditionReference): boolean {
  if (!reference || typeof reference.url !== 'string' || typeof reference.id !== 'string') return false;
  try {
    const url = new URL(reference.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || /[\x00-\x20\x7f]/.test(reference.url)) return false;
    if (reference.source === 'amazon') return reference.marketplaceId === 'A2Q3Y263D00KWC' && /^[A-Z0-9]{10}$/.test(reference.id)
      && url.hostname === 'www.amazon.com.br' && url.pathname.replace(/\/$/, '') === `/dp/${reference.id}` && !url.search;
    if (reference.source === 'google_books') return /^[\w-]+$/.test(reference.id)
      && ['books.google.com', 'books.google.com.br'].includes(url.hostname) && ['/books', '/ebooks', '/books/edition'].includes(url.pathname)
      && url.searchParams.get('id') === reference.id
      && [...url.searchParams.keys()].every(key => ['id', 'dq', 'q', 'hl', 'as_pt', 'source', 'cd', 'printsec', 'pg', 'jscmd'].includes(key));
    return reference.source === 'curitiba' && /^LV\d{1,10}$/.test(reference.id) && !!reference.isbn
      && validSourceLink({ source: 'curitiba', kind: 'info', isbn: reference.isbn, url: reference.url }, reference.isbn);
  } catch { return false; }
}

/** No requests: references stay bound to source identities, even when there is no ISBN. */
export function editionReferences(book: Partial<BookInfo>): EditionReference[] {
  const saved = Array.isArray(book.editionReferences) ? book.editionReferences.filter(validEditionReference) : [];
  const candidates: EditionReference[] = [...saved];
  const isbn = canonicalBookIsbn(book.isbn13 || book.isbn10);
  const selectedAmazon = book.amazonTitleReference || book.amazonCatalogReference;
  if (selectedAmazon && (book.amazonTitleReference || (isbn && canonicalBookIsbn(book.amazonCatalogReference?.isbn) === isbn))) candidates.push({ source: 'amazon', id: selectedAmazon.asin, marketplaceId: selectedAmazon.marketplaceId,
    url: `https://www.amazon.com.br/dp/${selectedAmazon.asin}` });
  const google = book.googleBooksReference;
  if (google && (!isbn || canonicalBookIsbn(google.isbn) === isbn)) for (const url of [google.infoLink, google.previewLink]) {
    if (url) candidates.push({ source: 'google_books', id: google.volumeId, url });
  }
  if (isbn && book.reference && /^LV\d{1,10}$/.test(book.reference)) {
    for (const link of bookSourceLinks(book).filter(link => link.source === 'curitiba')) candidates.push({ source: 'curitiba',
      id: book.reference, isbn, url: link.url });
  }
  const selectedSource = book.amazonTitleReference ? 'amazon' : book.curitibaTitleReference ? 'curitiba'
    : book.provider === 'Google Books' ? 'google_books' : undefined;
  const seen = new Set<string>();
  return candidates.filter(validEditionReference).filter(reference => {
    if (selectedSource && reference.source !== selectedSource) return false;
    if (reference.source === 'amazon' && selectedAmazon && reference.id !== selectedAmazon.asin) return false;
    if (reference.source === 'google_books' && google && reference.id !== google.volumeId) return false;
    if (reference.source === 'curitiba' && book.reference && reference.id !== book.reference) return false;
    const key = `${reference.source}:${reference.id}`;
    if (seen.has(key)) return false; seen.add(key); return true;
  }).map(reference => ({ ...reference }));
}
