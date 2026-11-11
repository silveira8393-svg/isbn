import type { BookInfo } from '../types';
import { canonicalBookIsbn } from '../utils/isbn';
import { GOOGLE_BOOKS_SOURCE, normalizeTitleQuery, type GoogleBooksTitleResult, type GoogleBooksResult } from '../../shared/googleBooks';

export async function searchGoogleBooksByTitle(title: string, signal?: AbortSignal): Promise<GoogleBooksTitleResult> {
  const query = normalizeTitleQuery(title);
  if (!query) return { status: 'invalid_query', candidates: [], diagnostic: { code: 'invalid_title' } };
  try {
    const timeout = AbortSignal.timeout(5000);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const response = await fetch('/api/google-books?title=' + encodeURIComponent(query), { method: 'GET', signal: combined,
      credentials: 'same-origin', redirect: 'error', cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('http');
    const result = await response.json() as GoogleBooksTitleResult;
    if (combined.aborted || !result?.diagnostic || typeof result.diagnostic.code !== 'string'
      || !['success', 'not_found', 'unavailable', 'invalid_query'].includes(result.status)
      || !Array.isArray(result.candidates) || result.candidates.length > 20
      || (result.status === 'success' ? !result.candidates.length : result.candidates.length !== 0)
      || result.candidates.some(candidate => candidate.source !== 'google_books' || typeof candidate.key !== 'string'
        || !/^[\w-]+$/.test(candidate.key) || candidate.book?.provider !== GOOGLE_BOOKS_SOURCE
        || typeof candidate.book.title !== 'string' || !candidate.book.title.trim()
        || candidate.book.googleBooksReference?.volumeId !== candidate.key)) throw new Error('invalid_response');
    return result;
  } catch { return { status: 'unavailable', candidates: [], diagnostic: { code: 'transport_or_response' } }; }
}

export async function searchGoogleBooks(isbn: string, signal?: AbortSignal): Promise<GoogleBooksResult> {
  const canonical = canonicalBookIsbn(isbn);
  if (!canonical) return { status: 'invalid_query', book: null, diagnostic: { code: 'invalid_isbn' } };
  try {
    const timeout = AbortSignal.timeout(5000);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const response = await fetch('/api/google-books?isbn=' + canonical, { method: 'GET', signal: combined,
      credentials: 'same-origin', redirect: 'error', cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!response.ok) return { status: 'unavailable', book: null, diagnostic: { code: 'function_http', httpStatus: response.status } };
    const result = await response.json() as GoogleBooksResult;
    if (combined.aborted || !result?.diagnostic || typeof result.diagnostic.code !== 'string'
      || !['success', 'not_found', 'unavailable', 'invalid_query'].includes(result?.status)
      || (result.status !== 'success' && result.book !== null)
      || (result.status === 'success' && (!result.book || !exactIdentity(result.book, canonical)
        || result.book.googleBooksReference?.isbn !== canonical))) throw new Error('invalid_response');
    return result;
  } catch { return { status: 'unavailable', book: null, diagnostic: { code: 'transport_or_timeout' } }; }
}
const absent = (value: unknown) => value == null || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && !value.length);
function exactIdentity(book: BookInfo, expected: string): boolean {
  const ids = [book.isbn10, book.isbn13].filter((id): id is string => !!id);
  return ids.length > 0 && ids.every(id => canonicalBookIsbn(id) === expected);
}

/** Fourth source: fill omissions only, retaining prior source/manual values and all galleries. */
export function complementWithGoogleBooks(base: BookInfo | null, incoming: BookInfo | null, isbn: string): BookInfo | null {
  const expected = canonicalBookIsbn(isbn);
  if (!expected || !incoming || !exactIdentity(incoming, expected) || incoming.googleBooksReference?.isbn !== expected
    || (base && !exactIdentity(base, expected))) return base;
  const merged: BookInfo = base ? { ...base, provenance: { ...base.provenance } } : {
    id: incoming.id, title: '', isbn13: expected, provider: GOOGLE_BOOKS_SOURCE, provenance: {} };
  for (const field of ['title', 'subtitle', 'authors', 'publisher', 'year', 'publishedDate', 'language', 'pageCount', 'isbn10', 'isbn13'] as const) {
    const current = merged[field], value = incoming[field];
    const missing = absent(current) || (field === 'title' && current === 'Título não cadastrado');
    if (!missing || absent(value) || /manual/i.test(merged.provenance?.[field] || '')) continue;
    if (field === 'year' && merged.publishedDate && String(value) !== merged.publishedDate.slice(0, 4)) continue;
    if (field === 'publishedDate' && merged.year && String(merged.year) !== String(value).slice(0, 4)) continue;
    merged[field] = structuredClone(value) as never; merged.provenance![field] = GOOGLE_BOOKS_SOURCE;
  }
  if (!merged.googleBooksReference) {
    merged.googleBooksReference = structuredClone(incoming.googleBooksReference);
    merged.provenance!.googleBooksReference = GOOGLE_BOOKS_SOURCE;
  }
  const links = [...(merged.sourceLinks || [])];
  for (const link of incoming.sourceLinks || []) if (!links.some(prior => prior.source === link.source && prior.kind === link.kind && prior.url === link.url)) links.push({ ...link });
  if (links.length) { merged.sourceLinks = links; merged.provenance!.sourceLinks ||= GOOGLE_BOOKS_SOURCE; }
  const warnings = [...new Set([...(merged.bibliographicWarnings || []), ...(incoming.bibliographicWarnings || [])])];
  if (warnings.length) merged.bibliographicWarnings = warnings;
  return merged;
}
