import type { BookInfo, User } from '../types';
import { cleanIsbn } from '../utils/isbn';
import { normalizePublicationDate, publicationYear } from '../../shared/publicationDate';
import { imageIdentity, imageReferences, isImageReference } from '../utils/imageUrls';
import { canonicalBookIsbn } from '../utils/bibliographicEvaluation';
import { searchAmazonLab } from './amazonLabClient';
import { roundPhysicalMeasurement } from '../utils/bibliographicNormalization';

export const canUseAmazonOfficial = (user: Pick<User, 'active' | 'role' | 'storeId'>) =>
  user.active === true && user.role === 'developer' && !!user.storeId;
// Image research belongs to the selected operational store, independently of SP-API credentials.
export const canUseAmazonImageSource = (user: Pick<User, 'active' | 'role' | 'storeId'>) =>
  user.active === true && !!user.storeId && ['developer', 'admin', 'operator'].includes(user.role);

type AmazonPhysical = NonNullable<BookInfo['amazonPhysical']>;
function amazonLanguage(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const raw = value.trim(), key = raw.toLowerCase();
  const names: Record<string, string> = { english: 'Inglês', eng: 'Inglês', portuguese: 'Português', por: 'Português',
    spanish: 'Espanhol', spa: 'Espanhol', french: 'Francês', fra: 'Francês', fre: 'Francês', german: 'Alemão', deu: 'Alemão', ger: 'Alemão',
    italian: 'Italiano', ita: 'Italiano', japanese: 'Japonês', jpn: 'Japonês', chinese: 'Chinês', zho: 'Chinês', chi: 'Chinês', latin: 'Latim', lat: 'Latim' };
  if (Object.hasOwn(names, key)) return names[key];
  if (/^[a-z]{2,3}(?:[-_][a-z]{2,4})?$/i.test(raw)) {
    try {
      const name = new Intl.DisplayNames(['pt-BR'], { type: 'language', fallback: 'none' }).of(raw.replace('_', '-'));
      if (name) return name.charAt(0).toUpperCase() + name.slice(1);
    } catch { /* Unknown codes retain the returned value. */ }
  }
  return raw;
}
function amazonBinding(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const raw = value.trim();
  const names: Record<string, string> = { paperback: 'Capa comum', hardcover: 'Capa dura', hardback: 'Capa dura',
    mass_market_paperback: 'Livro de bolso', board_book: 'Livro cartonado', spiral_bound: 'Espiral',
    loose_leaf: 'Folhas soltas', ebook: 'Livro digital', kindle_edition: 'Livro digital' };
  const key = raw.toLowerCase().replace(/[ -]+/g, '_');
  return Object.hasOwn(names, key) ? names[key] : raw;
}
function amazonPhysical(value: unknown): AmazonPhysical | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const physical: AmazonPhysical = {};
  for (const scope of ['item', 'package'] as const) {
    const source = (value as AmazonPhysical)[scope], dimensions: NonNullable<AmazonPhysical['item']> = {};
    for (const axis of ['height', 'width', 'length', 'weight'] as const) {
      const measure = source?.[axis];
      if (measure && typeof measure.value === 'number' && Number.isFinite(measure.value) && measure.value > 0
        && typeof measure.unit === 'string' && /^[a-zA-Z _-]{1,40}$/.test(measure.unit)) dimensions[axis] = { value: measure.value, unit: measure.unit };
    }
    if (Object.keys(dimensions).length) physical[scope] = dimensions;
  }
  return Object.keys(physical).length ? physical : undefined;
}
function amazonPhysicalFields(physical?: AmazonPhysical) {
  const converted = (measure: { value: number; unit: string } | undefined, factors: Record<string, number>) => {
    if (!measure) return undefined;
    const result = measure.value * factors[measure.unit.toLowerCase()];
    return Number.isFinite(result) && result > 0 ? roundPhysicalMeasurement(result) : undefined;
  };
  const mass = { grams: 1, gram: 1, g: 1, kilograms: 1000, kilogram: 1000, kg: 1000, pounds: 453.59237, pound: 453.59237, lb: 453.59237,
    ounces: 28.349523125, ounce: 28.349523125, oz: 28.349523125, milligrams: .001, milligram: .001, mg: .001 };
  const length = { centimeters: 1, centimeter: 1, cm: 1, millimeters: .1, millimeter: .1, mm: .1, meters: 100, meter: 100, m: 100,
    inches: 2.54, inch: 2.54, in: 2.54, feet: 30.48, foot: 30.48, ft: 30.48 };
  const weight = converted(physical?.item?.weight, mass), width = converted(physical?.item?.width, length),
    height = converted(physical?.item?.height, length), depth = converted(physical?.item?.length, length);
  return { weight, ...(weight === undefined ? {} : { weightUnit: 'g' as const }), width, height, depth,
    ...([width, height, depth].some(v => v !== undefined) ? { dimensionsUnit: 'cm' as const } : {}) };
}
type CatalogItem = { isbn: string; asin: string; title?: string; authors?: string[]; publisher?: string;
  publicationDate?: string; language?: string; binding?: string; edition?: string; pageCount?: number; marketplaceId: string;
  isbn10?: string; isbn13?: string; identifiers?: { type: string; identifier: string }[]; physical?: AmazonPhysical;
  images?: { variant: string; link: string; width?: number; height?: number }[] };
function publicAmazonImage(value: unknown): value is string {
  if (!isImageReference(value)) return false;
  const url = new URL(value);
  return url.protocol === 'https:' && !url.port && !url.search && !url.hash && !/[\x00-\x20\x7f]/.test(value);
}
function catalogImages(images: CatalogItem['images']) {
  const pixels = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n > 0 ? n : 0;
  const best = new Map<string, { variant: string; link: string; area: number; width: number }>();
  for (const image of Array.isArray(images) ? images : []) {
    if (!image || !/^(MAIN|PT\d{2}|SWCH)$/.test(image.variant) || !publicAmazonImage(image.link)) continue;
    const url = new URL(image.link);
    const identity = imageIdentity(url.href), width = pixels(image.width), area = width * pixels(image.height), prior = best.get(identity);
    const variant = image.variant === 'MAIN' || prior?.variant === 'MAIN' ? 'MAIN' : prior?.variant || image.variant;
    if (!prior || area > prior.area || (area === prior.area && width > prior.width)) best.set(identity, { variant, link: url.href, area, width });
    else prior.variant = variant;
  }
  const ranked = [...best.values()].sort((a, b) => a.variant.localeCompare(b.variant) || b.area - a.area || b.width - a.width);
  const cover = ranked.find(image => image.variant === 'MAIN')?.link;
  const additional = imageReferences(ranked.filter(image => image.variant !== 'MAIN').map(image => image.link));
  return { coverUrl: cover, additionalImages: additional, amazonImages: ranked.map(({ variant, link }) => ({ variant, link })) };
}

/** Complete even partial source galleries with one bounded laboratory lookup per ISBN search. */
export async function complementAmazonImages(book: BookInfo | null, isbn: string, user: User, signal?: AbortSignal): Promise<BookInfo | null> {
  const existing = imageReferences([book?.coverUrl, book?.thumbnailUrl, ...(book?.additionalImages || [])]);
  const coverIdentities = new Set(imageReferences([book?.coverUrl, book?.thumbnailUrl,
    ...(book?.amazonImages || []).filter(image => image.variant === 'MAIN').map(image => image.link)]).map(imageIdentity));
  const canonical = canonicalBookIsbn(isbn);
  const reference = book?.amazonCatalogReference;
  const asin = reference && /^[A-Z0-9]{10}$/.test(reference.asin) && reference.isbn === canonical
    && reference.marketplaceId === 'A2Q3Y263D00KWC' ? reference.asin : undefined;
  if (!canUseAmazonImageSource(user) || !canonical || (!asin && !canonical.startsWith('978'))) return book;
  try {
    const timeout = AbortSignal.timeout(10000);
    const result = await searchAmazonLab(cleanIsbn(isbn), 'http', signal ? AbortSignal.any([signal, timeout]) : timeout, user.id, user.storeId, asin);
    const identifiers = Object.values(result.isbn_encontrado || {}).filter(id => id?.valido === true);
    if (result.status !== 'concluida' || result.modo !== 'http' || result.correspondencia !== 'corresponde'
      || canonicalBookIsbn(result.isbn_pesquisado) !== canonical
      || (asin && (result.asin_pesquisado !== asin || result.asin_correspondencia !== 'corresponde'))
      || !identifiers.length || identifiers.some(id => typeof id.valor !== 'string' || canonicalBookIsbn(id.valor) !== canonical)) return book;
    // Bibliography, synopsis and raw HTML from the laboratory never enter the registration flow.
    const candidates = (Array.isArray(result.imagens?.itens) ? result.imagens.itens : [])
      .filter(image => image && ['principal', 'adicional'].includes(image.papel) && publicAmazonImage(image.referencia))
      .sort((a, b) => Number(b.papel === 'principal') - Number(a.papel === 'principal'));
    const laboratoryCovers = candidates.filter(image => image.papel === 'principal');
    for (const url of imageReferences(laboratoryCovers.flatMap(image => [image.referencia, image.miniatura]))) coverIdentities.add(imageIdentity(url));
    const additions = candidates.filter(image => image.papel === 'adicional' && !coverIdentities.has(imageIdentity(image.referencia)));
    const images = imageReferences([...existing, ...(existing.length ? [] : laboratoryCovers.map(image => image.referencia).slice(0, 1)),
      ...additions.map(image => image.referencia)]);
    if (images.length === existing.length) return book;
    const base = book || { id: `isbn-${cleanIsbn(isbn)}`, title: '', ...(cleanIsbn(isbn).length === 13 ? { isbn13: cleanIsbn(isbn) } : { isbn10: cleanIsbn(isbn) }) };
    return { ...base, coverUrl: existing[0] || images[0], additionalImages: images.slice(1) };
  } catch { return book; } // No retries or bypass when the existing extractor is unavailable or blocked.
}
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
    const actualIdentifiers = Array.isArray(item.identifiers) ? item.identifiers.filter(id => id && typeof id.identifier === 'string' && (
      (id.type === 'ISBN_10' && /^\d{9}[\dX]$/.test(id.identifier)) || (id.type === 'ISBN_13' && /^97[89]\d{10}$/.test(id.identifier)))) : [];
    // The server already validates edition equivalence. Ignore identifiers inconsistent with the query even in a malformed response.
    const equivalent13 = (id: string) => {
      if (/^97[89]\d{10}$/.test(id)) return [...id].reduce((n, c, i) => n + Number(c) * (i % 2 ? 3 : 1), 0) % 10 === 0 ? id : undefined;
      if (!/^\d{9}[\dX]$/.test(id) || [...id].reduce((n, c, i) => n + (c === 'X' ? 10 : Number(c)) * (10 - i), 0) % 11 !== 0) return undefined;
      const base = '978' + id.slice(0, 9), sum = [...base].reduce((n, c, i) => n + Number(c) * (i % 2 ? 3 : 1), 0);
      return base + ((10 - sum % 10) % 10);
    };
    const identifiers = actualIdentifiers.filter(id => equivalent13(id.identifier) === equivalent13(cleanIsbn(isbn)));
    const canonical = canonicalBookIsbn(isbn);
    const physical = amazonPhysical(item.physical);
    const images = catalogImages(item.images);
    const book: BookInfo = { id: `amazon-spapi-${item.asin}`, title: text(item.title) || '',
      ...(cleanIsbn(isbn).length === 13 ? { isbn13: cleanIsbn(isbn) } : { isbn10: cleanIsbn(isbn) }),
      ...(identifiers.find(id => id.type === 'ISBN_10') ? { isbn10: identifiers.find(id => id.type === 'ISBN_10')!.identifier } : {}),
      ...(identifiers.find(id => id.type === 'ISBN_13') ? { isbn13: identifiers.find(id => id.type === 'ISBN_13')!.identifier } : {}),
      ...(identifiers.length ? { rawIdentifiers: identifiers as BookInfo['rawIdentifiers'] } : {}),
      ...(canonical && identifiers.length && /^[A-Z0-9]{10}$/.test(item.asin)
        ? { amazonCatalogReference: { asin: item.asin, isbn: canonical, marketplaceId: item.marketplaceId } } : {}),
      authors: Array.isArray(item.authors) ? item.authors.map(text).filter((v): v is string => Boolean(v)) : undefined,
      publisher: text(item.publisher), publishedDate: normalizePublicationDate(item.publicationDate), year: publicationYear(item.publicationDate), language: amazonLanguage(item.language),
      format: amazonBinding(item.binding), edition: text(item.edition), pageCount: Number.isInteger(item.pageCount) && item.pageCount! > 0 ? item.pageCount : undefined,
      ...(physical ? { amazonPhysical: physical, ...amazonPhysicalFields(physical) } : {}),
      ...(images.coverUrl ? { coverUrl: images.coverUrl } : {}),
      ...(images.additionalImages.length ? { additionalImages: images.additionalImages } : {}),
      ...(images.amazonImages.length ? { amazonImages: images.amazonImages } : {}),
      provider: 'Amazon SP-API',
      // Only public image references; never import HTML, synopsis, offers or raw attributes.
    };
    if (!book.title && !book.authors?.length && !book.publisher && !book.publishedDate && !book.language && !book.format && !book.edition && !book.pageCount
      && !book.weight && !book.width && !book.height && !book.depth && !book.coverUrl && !book.additionalImages?.length)
      return { book: null, status: 'not_found' };
    return { status: 'success', book };
  } catch { return { book: null, status: 'unavailable' }; }
}
export function complementWithAmazon(base: BookInfo | null, amazon: BookInfo | null): BookInfo | null {
  if (!amazon) return base;
  const merged: BookInfo = base ? { ...base, provenance: { ...base.provenance } } : { id: amazon.id, title: '', isbn10: amazon.isbn10, isbn13: amazon.isbn13, provenance: {} };
  for (const key of ['title', 'authors', 'publisher', 'publishedDate', 'language', 'format', 'edition', 'pageCount', 'isbn10', 'isbn13', 'rawIdentifiers'] as const) {
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
  const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
  const filled = (key: keyof BookInfo, value: unknown) => { merged[key] = value as never; merged.provenance![key] = 'amazon_spapi_catalog_2022-04-01'; };
  // A measurement and its unit are inseparable. Existing values must never be reinterpreted in an Amazon unit.
  if (!positive(merged.weight) && positive(amazon.weight) && amazon.weightUnit === 'g') {
    filled('weight', amazon.weight); filled('weightUnit', 'g');
  }
  if ((merged.dimensionsUnit === undefined || merged.dimensionsUnit === 'cm') && amazon.dimensionsUnit === 'cm') {
    for (const key of ['width', 'height', 'depth'] as const) if (!positive(merged[key]) && positive(amazon[key])) filled(key, amazon[key]);
    if (!merged.dimensionsUnit && ['width', 'height', 'depth'].some(key => merged.provenance?.[key] === 'amazon_spapi_catalog_2022-04-01')) filled('dimensionsUnit', 'cm');
  }
  if (!merged.amazonPhysical && amazon.amazonPhysical) filled('amazonPhysical', amazon.amazonPhysical);
  const reference = amazon.amazonCatalogReference;
  if (reference && /^[A-Z0-9]{10}$/.test(reference.asin) && reference.marketplaceId === 'A2Q3Y263D00KWC'
    && reference.isbn === canonicalBookIsbn(amazon.isbn13 || amazon.isbn10)
    && reference.isbn === canonicalBookIsbn(merged.isbn13 || merged.isbn10)) {
    merged.amazonCatalogReference = { ...reference };
  }
  if (amazon.amazonImages?.length) merged.amazonImages = amazon.amazonImages.map(image => ({ ...image }));
  // Keep a valid primary-source cover; Amazon fills a missing cover and joins the existing gallery.
  const existing = imageReferences([merged.coverUrl, merged.thumbnailUrl, ...(merged.additionalImages || [])]);
  const amazonImages = imageReferences([amazon.coverUrl, ...(amazon.additionalImages || [])]);
  if (amazonImages.length) {
    const existingCover = isImageReference(merged.coverUrl) ? merged.coverUrl : isImageReference(merged.thumbnailUrl) ? merged.thumbnailUrl : undefined;
    const cover = existingCover || (isImageReference(amazon.coverUrl) ? amazon.coverUrl : undefined) || existing[0] || amazonImages[0];
    if (!existingCover && isImageReference(amazon.coverUrl)) filled('coverUrl', amazon.coverUrl);
    const additional = imageReferences([cover, ...existing, ...amazonImages]).slice(1);
    if (additional.length || merged.additionalImages) {
      merged.additionalImages = additional;
      if (additional.some(url => !existing.includes(url))) merged.provenance!.additionalImages = 'amazon_spapi_catalog_2022-04-01';
    }
  }
  return merged;
}
