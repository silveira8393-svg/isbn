import type { BookInfo, BookSourceLink } from '../types';
import { canonicalBookIsbn } from './isbn.js';
import { matchesBookIsbn } from './researchSources.js';

type LinkBook = Pick<BookInfo, 'isbn13' | 'isbn10' | 'sourceLinks' | 'amazonCatalogReference' | 'googleBooksReference' | 'amazonCandidates' | 'amazonReviewRequired'>;
const curitibaHosts = ['www.livrariascuritiba.com.br', 'livrariascuritiba.com.br', 'www.distribuidoracuritiba.com.br', 'distribuidoracuritiba.com.br'];
export function validSourceLink(link: BookSourceLink, isbn: string): boolean {
  const expected = canonicalBookIsbn(isbn);
  if (!expected || !link || !['info', 'preview'].includes(link.kind) || canonicalBookIsbn(link.isbn) !== expected) return false;
  try {
    const url = new URL(link.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || /[\x00-\x20\x7f]/.test(link.url)) return false;
    if ([...url.searchParams.keys()].some(key => !['id', 'dq', 'q', 'hl', 'as_pt', 'source', 'cd', 'printsec', 'pg', 'jscmd'].includes(key))) return false;
    if (link.source === 'amazon') return url.hostname === 'www.amazon.com.br' && /^\/dp\/[A-Z0-9]{10}\/?$/.test(url.pathname) && !url.search;
    if (link.source === 'google_books') return ['books.google.com', 'books.google.com.br'].includes(url.hostname)
      && ['/books', '/ebooks', '/books/edition'].includes(url.pathname) && /^[\w-]+$/.test(url.searchParams.get('id') || '');
    if (link.source === 'curitiba') return curitibaHosts.includes(url.hostname) && !url.search
      && /^\/(?!busca(?:\/|$)|search(?:\/|$))[^?#]+\/p\/?$/i.test(url.pathname);
    // BrasilAPI currently supplies no attested product-page URL in the existing mapping.
    return false;
  } catch { return false; }
}

/** No requests. Only existing edition references and explicitly supplied product URLs. */
export function bookSourceLinks(book: LinkBook): BookSourceLink[] {
  const isbn = canonicalBookIsbn(book.isbn13 || book.isbn10);
  if (!isbn || !matchesBookIsbn(book, isbn)) return [];
  const candidates = [...(book.sourceLinks || [])];
  const amazon = book.amazonCatalogReference;
  if (book.amazonReviewRequired) for (const candidate of book.amazonCandidates || []) {
    if (candidate.marketplaceId === 'A2Q3Y263D00KWC' && /^[A-Z0-9]{10}$/.test(candidate.asin))
      candidates.push({ source: 'amazon', kind: 'info', isbn, url: `https://www.amazon.com.br/dp/${candidate.asin}`, reviewRequired: true });
  }
  if (amazon && amazon.isbn === isbn && amazon.marketplaceId === 'A2Q3Y263D00KWC' && /^[A-Z0-9]{10}$/.test(amazon.asin))
    candidates.push({ source: 'amazon', kind: 'info', isbn, url: `https://www.amazon.com.br/dp/${amazon.asin}` });
  const google = book.googleBooksReference;
  if (google?.isbn === isbn && /^[\w-]+$/.test(google.volumeId)) for (const [kind, url] of [['info', google.infoLink], ['preview', google.previewLink]] as const) {
    if (url) { try { if (new URL(url).searchParams.get('id') === google.volumeId) candidates.push({ source: 'google_books', kind, isbn, url }); } catch { /* Invalid reference stays hidden. */ } }
  }
  const seen = new Set<string>();
  return candidates.filter(link => validSourceLink(link, isbn)).filter(link => {
    if (link.source === 'google_books' && google && new URL(link.url).searchParams.get('id') !== google.volumeId) return false;
    if (link.source === 'amazon' && amazon && new URL(link.url).pathname.replace(/\/$/, '') !== '/dp/' + amazon.asin) return false;
    const identity = `${link.source}:${link.kind}:${link.url}`;
    if (seen.has(identity)) return false; seen.add(identity); return true;
  }).map(link => ({ ...link }));
}

export function attachBookSourceLinks(book: BookInfo, isbn: string, sources: (Partial<BookInfo> | null)[]): BookInfo {
  if (!matchesBookIsbn(book, isbn)) return book;
  const links = bookSourceLinks(book);
  for (const source of sources) if (source && matchesBookIsbn(source, isbn)) links.push(...bookSourceLinks(source));
  const sourceLinks = bookSourceLinks({ ...book, sourceLinks: links });
  return sourceLinks.length ? { ...book, sourceLinks } : book;
}

export function curitibaProductLinks(product: Record<string, unknown>, ids: string[], searchedIsbn: string): BookSourceLink[] {
  const isbn = canonicalBookIsbn(searchedIsbn);
  if (!isbn || !ids.length || ids.some(id => canonicalBookIsbn(id) !== isbn)) return [];
  return ['urlProduto', 'urlPaginaProduto', 'urlDetalheProduto', 'linkProduto'].flatMap(key => {
    const url = product[key]; if (typeof url !== 'string') return [];
    const link: BookSourceLink = { source: 'curitiba', kind: 'info', isbn, url };
    return validSourceLink(link, isbn) ? [link] : [];
  });
}
