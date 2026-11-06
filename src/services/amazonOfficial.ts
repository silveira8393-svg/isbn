import type { BookInfo, User } from '../types';
import { cleanIsbn } from '../utils/isbn';
import { normalizePublicationDate, publicationYear } from '../../shared/publicationDate';
import { imageIdentity, imageReferences, isImageReference } from '../utils/imageUrls';
import { canonicalBookIsbn, evaluateBook } from '../utils/bibliographicEvaluation';
import { searchAmazonLab, type LabQuality, type LabResult } from './amazonLabClient';
import { roundPhysicalMeasurement } from '../utils/bibliographicNormalization';

export const canUseAmazonOfficial = (user: Pick<User, 'active' | 'role' | 'storeId'>) =>
  user.active === true && ['developer', 'admin', 'operator'].includes(user.role) && !!user.storeId;
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

/** Fail closed: ISBN alone identifies neither a duplicate edition nor a trustworthy winner.
 * Every candidate must independently corroborate title, attribution and an edition fact.
 * No title suffix removal, fuzzy matches or inference from ASIN/image/completeness.
 * Select an existing record containing the union of facts; never splice candidates.
 */
export function selectEquivalentAmazonRecord(items: CatalogItem[], isbn: string): CatalogItem | undefined {
  const canonical = canonicalBookIsbn(isbn);
  const norm = (value: unknown): string => typeof value === 'string'
    ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() : '';
  if (!canonical || !items.length) return undefined;
  for (const item of items) {
    const ids = [item.isbn10, item.isbn13, ...(item.identifiers || [])
      .filter(id => /^ISBN(?:_10|_13)?$/.test(id.type)).map(id => id.identifier)].filter(Boolean);
    if (item.marketplaceId !== 'A2Q3Y263D00KWC' || canonicalBookIsbn(item.isbn) !== canonical
      || !/^[A-Z0-9]{10}$/.test(item.asin) || !ids.length || ids.some(id => canonicalBookIsbn(id!) !== canonical)) return undefined;
    // Other product identifiers cannot silently contradict an edition ISBN.
    if ((item.identifiers || []).some(id => /^(EAN|EAN_13|GTIN|GTIN_13|GTIN_14)$/.test(id.type)
      && canonicalBookIsbn(id.identifier.replace(/^0(?=97[89]\d{10}$)/, '')) !== canonical)) return undefined;
  }
  const facts = items.map(item => ({
    title: norm(item.title), authors: Array.isArray(item.authors) ? item.authors.map(norm).filter(Boolean).sort().join('|') : '',
    publisher: norm(item.publisher), date: normalizePublicationDate(item.publicationDate) || norm(item.publicationDate),
    language: norm(amazonLanguage(item.language)), binding: norm(amazonBinding(item.binding)),
    edition: norm(item.edition), pages: item.pageCount == null ? '' : String(item.pageCount),
    ...Object.fromEntries(Object.entries(amazonPhysicalFields(amazonPhysical(item.physical)))
      .filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])),
    ...Object.fromEntries(['item', 'package'].flatMap(scope => ['height', 'width', 'length', 'weight'].flatMap(axis => {
      const measure = item.physical?.[scope as 'item' | 'package']?.[axis as 'height' | 'width' | 'length' | 'weight'];
      return measure ? [[`${scope}.${axis}`, `${measure.value}:${norm(measure.unit)}`]] : [];
    }))),
  }));
  const keys = [...new Set(facts.flatMap(fact => Object.keys(fact)))];
  const read = (index: number, key: string) => (facts[index] as Record<string, string>)[key] || '';
  // All populated values must agree, even fields not used as identity anchors.
  if (keys.some(key => new Set(facts.map((_, index) => read(index, key)).filter(Boolean)).size > 1)) return undefined;
  const shared = (key: string) => facts.every((_, index) => !!read(index, key));
  const editionAnchor = shared('edition')
    || (shared('date') && items.every(item => !!normalizePublicationDate(item.publicationDate)))
    || (shared('pages') && items.every(item => Number.isInteger(item.pageCount) && item.pageCount! > 0))
    || (shared('binding') && items.every(item => /^(Capa dura|Capa comum|Livro digital|Livro de bolso|Livro cartonado|Espiral|Folhas soltas)$/.test(amazonBinding(item.binding) || '')));
  if (!shared('title') || !['authors', 'publisher'].some(shared)
    || !editionAnchor) return undefined;
  const complete = items.filter((_, index) => keys.every(key => read(index, key) || !facts.some((__, other) => read(other, key))));
  // Bibliography is already proven equivalent. Equal facts use ASIN only as a stable tie-break;
  // prefer a candidate with MAIN only to retain its images, never to establish identity.
  return complete.sort((a, b) => Number(!!b.images?.some(image => image.variant === 'MAIN' && publicAmazonImage(image.link)))
    - Number(!!a.images?.some(image => image.variant === 'MAIN' && publicAmazonImage(image.link))) || a.asin.localeCompare(b.asin))[0];
}
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

/** Complement only validated factual fields. Description, commercial brand and unlabeled axes are excluded. */
function complementLaboratoryFields(base: BookInfo, result: LabResult, isbn: string): BookInfo {
  const current = evaluateBook(base, 'Fonte selecionada', isbn);
  const merged: BookInfo = { ...base, provenance: { ...base.provenance } };
  const warnings = new Set(base.bibliographicWarnings || []);
  const fields = { titulo: 'title', subtitulo: 'subtitle', autores: 'authors', editora: 'publisher', ano: 'year', edicao: 'edition',
    idioma: 'language', formato: 'format', paginas: 'pageCount', data_publicacao: 'publishedDate',
    peso: 'weight', largura: 'width', altura: 'height', profundidade: 'depth' } as const;
  const qualities: Record<string, LabQuality | undefined> = { ...result.campos, ...result.complementares };
  if (qualities.dimensoes?.estado === 'inconsistente' && qualities.dimensoes.valor !== null)
    warnings.add('Dimensões Amazon sem eixos inequívocos ou conflitantes; medidas selecionadas preservadas para revisão.');
  const labEdition = qualities.edicao;
  if (current.fields.edition.state === 'valid' && labEdition?.estado === 'valido' && !labEdition.revisao_humana
    && current.book.edition !== labEdition.valor) {
    warnings.add('Edição divergente no Laboratório Amazon; complemento bibliográfico não incorporado.');
  } else for (const [labField, target] of Object.entries(fields)) {
    let quality = qualities[labField];
    const compound = qualities.dimensoes;
    if (['width', 'height', 'depth'].includes(target) && (!quality || quality.estado === 'ausente')
      && compound?.valor && typeof compound.valor === 'object' && !Array.isArray(compound.valor)
      && result.book_info?.[target as 'width' | 'height' | 'depth'] === compound.valor[target]) {
      quality = { ...compound, valor: compound.valor[target] };
    }
    if (quality?.estado === 'inconsistente' && quality.valor !== null)
      warnings.add(`${labField}: candidato inconsistente no Laboratório Amazon; requer revisão, sem preenchimento automático.`);
    if (!quality || quality.estado !== 'valido' || quality.revisao_humana || !quality.origens?.length) continue;
    const value = quality.valor;
    // Numeric units and axes must already have been explicitly recognized by the extractor.
    if (target === 'weight' && result.book_info?.weightUnit !== 'g') continue;
    if (['width', 'height', 'depth'].includes(target) && result.book_info?.dimensionsUnit !== 'cm') continue;
    const candidate = evaluateBook({ id: base.id, title: '', [target]: value,
      ...(target === 'weight' ? { weightUnit: 'g' } : {}),
      ...(['width', 'height', 'depth'].includes(target) ? { dimensionsUnit: 'cm' } : {}) }, 'Amazon (laboratório)', isbn);
    if (candidate.fields[target]?.state !== 'valid') continue;
    if ((target === 'year' && current.fields.publishedDate?.state === 'valid' && String(value) !== String(base.publishedDate).slice(0, 4))
      || (target === 'publishedDate' && current.fields.year.state === 'valid' && String(value).slice(0, 4) !== String(base.year))) {
      warnings.add(`${labField}: ano e data divergentes no Laboratório Amazon; fonte selecionada preservada.`);
      continue;
    }
    if (current.fields[target]?.state === 'valid') {
      if (JSON.stringify(current.book[target as keyof BookInfo]) !== JSON.stringify(candidate.book[target as keyof BookInfo]))
        warnings.add(`${labField}: divergência no Laboratório Amazon; fonte selecionada preservada.`);
      continue;
    }
    // An unknown binding/language/edition or missing unit is uncertainty, not proof that the selected value is wrong.
    const prior = base[target as keyof BookInfo];
    const numeric = typeof prior === 'number' ? prior : target === 'year' && typeof prior === 'string' && /^\d+$/.test(prior) ? Number(prior) : undefined;
    const invalidNumber = numeric !== undefined && ['pageCount', 'year', 'weight', 'width', 'height', 'depth'].includes(target)
      && (!Number.isFinite(numeric) || numeric <= 0 || (target === 'pageCount' && (!Number.isInteger(numeric) || numeric > 20000))
        || (target === 'year' && (!Number.isInteger(numeric) || numeric < 1450 || numeric > new Date().getFullYear() + 1)));
    if (current.fields[target]?.state === 'inconsistent' && !invalidNumber) {
      warnings.add(`${labField}: valor selecionado ambíguo ou unidade não identificada; preservado para revisão.`);
      continue;
    }
    if (['width', 'height', 'depth'].includes(target) && base.dimensionsUnit !== undefined && base.dimensionsUnit !== 'cm') continue;
    merged[target as keyof BookInfo] = structuredClone(candidate.book[target as keyof BookInfo]) as never;
    merged.provenance![target] = 'amazon_lab_verified: ' + quality.origens.join('; ');
    if (target === 'weight') { merged.weightUnit = 'g'; merged.provenance!.weightUnit = merged.provenance!.weight; }
    if (['width', 'height', 'depth'].includes(target)) merged.dimensionsUnit = 'cm';
  }
  if (warnings.size) merged.bibliographicWarnings = [...warnings];
  return JSON.stringify(merged) === JSON.stringify({ ...base, provenance: { ...base.provenance } }) ? base : merged;
}

/** Reuse one bounded laboratory lookup for factual bibliography and the existing image complement. */
export async function complementAmazonImages(book: BookInfo | null, isbn: string, user: User, signal?: AbortSignal): Promise<BookInfo | null> {
  const existing = imageReferences([book?.coverUrl, book?.thumbnailUrl, ...(book?.additionalImages || [])]);
  const coverIdentities = new Set(imageReferences([book?.coverUrl, book?.thumbnailUrl,
    ...(book?.amazonImages || []).filter(image => image.variant === 'MAIN').map(image => image.link)]).map(imageIdentity));
  const canonical = canonicalBookIsbn(isbn);
  if ([book?.isbn10, book?.isbn13].some(id => id && canonicalBookIsbn(id) !== canonical)) return book;
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
    const base = book || { id: `isbn-${cleanIsbn(isbn)}`, title: '', ...(cleanIsbn(isbn).length === 13 ? { isbn13: cleanIsbn(isbn) } : { isbn10: cleanIsbn(isbn) }) };
    const enriched = complementLaboratoryFields(base, result, isbn);
    // Synopsis, raw HTML and commercial brand never enter the automatic registration flow.
    const candidates = (Array.isArray(result.imagens?.itens) ? result.imagens.itens : [])
      .filter(image => image && ['principal', 'adicional'].includes(image.papel) && publicAmazonImage(image.referencia))
      .sort((a, b) => Number(b.papel === 'principal') - Number(a.papel === 'principal'));
    const laboratoryCovers = candidates.filter(image => image.papel === 'principal');
    for (const url of imageReferences(laboratoryCovers.flatMap(image => [image.referencia, image.miniatura]))) coverIdentities.add(imageIdentity(url));
    const additions = candidates.filter(image => image.papel === 'adicional' && !coverIdentities.has(imageIdentity(image.referencia)));
    const images = imageReferences([...existing, ...(existing.length ? [] : laboratoryCovers.map(image => image.referencia).slice(0, 1)),
      ...additions.map(image => image.referencia)]);
    if (images.length === existing.length) {
      // Review notices alone do not turn an empty search into a bibliographic match.
      if (!book && !Object.values(enriched.provenance || {}).some(source => source.startsWith('amazon_lab_verified:'))) return null;
      return enriched === base ? book : enriched;
    }
    return { ...enriched, coverUrl: existing[0] || images[0], additionalImages: images.slice(1) };
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
      headers: { Authorization: `Bearer ${data.session.access_token}`, 'x-isbn-store-id': user.storeId }, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(55000)]) : AbortSignal.timeout(55000),
    });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) { void response.body?.cancel(); return { book: null, status: 'unavailable' }; }
    const result = await response.json();
    if (result.isbn !== cleanIsbn(isbn) || !Array.isArray(result.items)) return { book: null, status: 'unavailable' };
    const items: CatalogItem[] = result.items.filter((item: CatalogItem) => item?.isbn === cleanIsbn(isbn) && item.marketplaceId === 'A2Q3Y263D00KWC');
    if (!items.length) return { book: null, status: 'not_found' };
    if (result.hasMore === true) return { book: null, status: 'ambiguous' };
    const item = items.length === 1 ? items[0] : selectEquivalentAmazonRecord(items, isbn);
    if (!item) return { book: null, status: 'ambiguous' };
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
  // A physical/digital disagreement does not prove which source is wrong. Retain the
  // priority/manual value and expose the conflict instead of silently converting ebooks.
  const digital = (value?: string) => /^(digital|ebook|e-book|livro digital|kindle(?: edition|_edition)?)$/i.test(value?.trim() || '');
  const physical = (value?: string) => /capa dura|capa comum|paperback|hardcover|hardback/i.test(value || '');
  if ((digital(merged.format) && physical(amazon.format)) || (physical(merged.format) && digital(amazon.format))) {
    merged.bibliographicWarnings = [...new Set([...(merged.bibliographicWarnings || []),
      'Formato físico/digital divergente na Amazon; formato da fonte prioritária preservado para revisão.'])];
  }
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
