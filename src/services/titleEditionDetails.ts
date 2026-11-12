import type { BookInfo, User } from '../types';
import type { TitleSearchCandidate } from '../../shared/googleBooks';
import { canonicalBookIsbn } from '../utils/isbn';
import { normalizeCoverFormat, normalizeLanguage } from '../utils/bibliographicNormalization';
import { searchGoogleBooks } from './googleBooks';
import { searchAmazonOfficial } from './amazonOfficial';
import { searchBookByIsbnDistribuidoraCuritiba } from './distribuidoraCuritiba';

const missing = (value: unknown) => value == null || (typeof value === 'string' && !value.trim())
  || (Array.isArray(value) && !value.length);
const key = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const identifiers = (book: Partial<BookInfo>) => [book.isbn13, book.isbn10,
  ...(book.rawIdentifiers || []).filter(id => /^ISBN_(10|13)$/.test(id.type)).map(id => id.identifier)]
  .filter((id): id is string => !!id);
const limitation = (book: BookInfo, reason: string): BookInfo => ({ ...book,
  bibliographicWarnings: [...new Set([...(book.bibliographicWarnings || []), reason])] });

/** Fill omissions in one selected edition. References, images and commercial fields never move. */
export function mergeTitleEditionDetails(candidate: TitleSearchCandidate, incoming: Partial<BookInfo> | null): BookInfo {
  const original = candidate.book, expected = canonicalBookIsbn(original.isbn13) || canonicalBookIsbn(original.isbn10);
  const reject = () => limitation(original, 'Complemento por ISBN indisponível ou incompatível; edição selecionada preservada.');
  if (!incoming || !expected || !identifiers(incoming).length
    || [...identifiers(original), ...identifiers(incoming)].some(id => canonicalBookIsbn(id) !== expected)) return reject();
  const source = candidate.source;
  if (incoming.provider !== original.provider) return reject();
  if (source === 'amazon') {
    const selected = original.amazonTitleReference, reference = incoming.amazonCatalogReference;
    if (!selected || !reference || selected.asin !== reference.asin || selected.marketplaceId !== reference.marketplaceId
      || canonicalBookIsbn(reference.isbn) !== expected) return reject();
  } else if (source === 'google_books') {
    if (!original.googleBooksReference?.volumeId || original.googleBooksReference.volumeId !== incoming.googleBooksReference?.volumeId) return reject();
  } else if (source === 'curitiba') {
    if (!original.curitibaTitleReference?.productId || original.curitibaTitleReference.productId !== incoming.reference) return reject();
  } else return reject();
  for (const field of ['title', 'subtitle', 'edition', 'format', 'year'] as const) {
    const normalize = field === 'format' ? (value: unknown) => key(normalizeCoverFormat(String(value))) : key;
    if (!missing(original[field]) && !missing(incoming[field]) && normalize(original[field]) !== normalize(incoming[field])) return reject();
  }
  const merged = structuredClone(original);
  for (const field of ['subtitle', 'authors', 'publisher', 'year', 'edition', 'language', 'format', 'pageCount',
    'weight', 'width', 'height', 'depth', 'categories'] as const) {
    const value = incoming[field];
    if (!missing(original[field]) || missing(value) || /manual/i.test(original.provenance?.[field] || '')) continue;
    if (['weight', 'width', 'height', 'depth', 'pageCount'].includes(field)
      && (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)) continue;
    if (field === 'pageCount' && (!Number.isInteger(value) || Number(value) > 20000)) continue;
    if (field === 'year' && (!/^\d{4}$/.test(String(value)) || Number(value) < 1450 || Number(value) > new Date().getFullYear() + 1
      || (original.publishedDate && String(value) !== original.publishedDate.slice(0, 4)))) continue;
    if ((field === 'authors' || field === 'categories') && (!Array.isArray(value) || !value.every(item => typeof item === 'string' && item.trim()))) continue;
    if (field === 'weight' && (!['g', 'kg'].includes(incoming.weightUnit || '')
      || (original.weightUnit && original.weightUnit !== incoming.weightUnit))) continue;
    if (['width', 'height', 'depth'].includes(field) && incoming.dimensionsUnit !== 'cm') continue;
    merged[field] = structuredClone(field === 'format' ? normalizeCoverFormat(String(value))
      : field === 'language' ? normalizeLanguage(String(value)) : value) as never;
    merged.provenance = { ...merged.provenance, [field]: `${original.provider}: ISBN (mesma edição)` };
    if (field === 'weight') merged.weightUnit = incoming.weightUnit;
    if (['width', 'height', 'depth'].includes(field)) merged.dimensionsUnit = 'cm';
  }
  return merged;
}

/** One provider call, bounded even if a transport/session implementation ignores abort. */
export async function completeTitleEdition(candidate: TitleSearchCandidate, user?: User, signal?: AbortSignal,
  timeoutMs = 6500): Promise<BookInfo> {
  const book = structuredClone(candidate.book);
  const isbn = canonicalBookIsbn(book.isbn13) || canonicalBookIsbn(book.isbn10);
  if (!isbn || signal?.aborted) return book;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const lookup = async (): Promise<Partial<BookInfo> | null> => {
      if (candidate.source === 'amazon' && user && book.amazonTitleReference) {
        const result = await searchAmazonOfficial(isbn, user, controller.signal, book.amazonTitleReference);
        return result.status === 'success' ? result.book : null;
      }
      if (candidate.source === 'google_books') return (await searchGoogleBooks(isbn, controller.signal)).book;
      if (candidate.source === 'curitiba') return (await searchBookByIsbnDistribuidoraCuritiba(isbn, controller.signal, book.curitibaTitleReference?.productId)).book;
      return null;
    };
    const incoming = await Promise.race([lookup(), new Promise<null>(resolve => {
      timer = setTimeout(() => { controller.abort(); resolve(null); }, timeoutMs);
    })]);
    if (signal?.aborted) return book;
    return mergeTitleEditionDetails({ ...candidate, book }, incoming);
  } catch { return limitation(book, 'Consulta complementar indisponível; edição selecionada preservada.'); }
  finally { clearTimeout(timer); controller.abort(); signal?.removeEventListener('abort', abort); }
}
