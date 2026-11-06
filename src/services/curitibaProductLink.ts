import type { BookInfo, BookSourceLink } from '../types';
import { canonicalBookIsbn } from '../utils/isbn';
import { matchesBookIsbn } from '../utils/researchSources';
import { bookSourceLinks, validSourceLink } from '../utils/bookSourceLinks';

export async function loadCuritibaProductLink(book: Partial<BookInfo>, searchedIsbn: string, signal?: AbortSignal): Promise<BookSourceLink[]> {
  const isbn = canonicalBookIsbn(searchedIsbn), product = book.reference;
  if (!isbn || !matchesBookIsbn(book, isbn) || !product || !/^LV[0-9]{1,10}$/.test(product)) return [];
  const existing = bookSourceLinks(book).filter(link => link.source === 'curitiba');
  if (existing.length) return existing;
  try {
    const timeout = AbortSignal.timeout(4500), combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const response = await fetch(`/api/curitiba/product-link?product=${encodeURIComponent(product)}&isbn=${isbn}`,
      { credentials: 'same-origin', redirect: 'error', cache: 'no-store', signal: combined, headers: { Accept: 'application/json' } });
    if (!response.ok) return [];
    const data = await response.json();
    return !combined.aborted && data.status === 'success' && data.link?.source === 'curitiba' && validSourceLink(data.link, isbn) ? [data.link] : [];
  } catch { return []; }
}

/** Metadata only: preserve every manual field and every image, including intentionally cleared fields. */
export function appendCuritibaProductLinks<T extends Pick<BookInfo, 'isbn13' | 'isbn10' | 'sourceLinks'>>(book: T, links: BookSourceLink[]): T {
  const isbn = canonicalBookIsbn(book.isbn13 || book.isbn10);
  if (!isbn || !matchesBookIsbn(book, isbn)) return book;
  const incoming = links.filter(link => link.source === 'curitiba' && validSourceLink(link, isbn));
  if (!incoming.length) return book;
  return { ...book, sourceLinks: bookSourceLinks({ ...book, sourceLinks: [...(book.sourceLinks || []), ...incoming] }) };
}
