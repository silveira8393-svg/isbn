/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BookInfo, BookCondition, RegistrationDraft, RegistrationMode } from '../types';
import { generateMetaDescription } from './metaDescription';
import { sanitizeSynopsis } from './sanitizer';
import { canonicalBookIsbn, cleanIsbn } from './isbn';
import { imageReferences, isImageReference } from './imageUrls';
import { formatPhysicalMeasurement, normalizeLanguage, roundPhysicalMeasurement } from './bibliographicNormalization';

export function registrationModeForCondition(condition: BookCondition, mode?: RegistrationMode): RegistrationMode {
  if (condition === 'usado') return 'new_used_from_known_edition';
  return mode === 'reuse_existing_new' ? mode : 'new_product';
}

export const CATEGORIES_BY_CONDITION: Record<BookCondition, string[]> = {
  novo: [
    'Novo > Literatura & Ficção',
    'Novo > Religioso & Espiritualidade',
    'Novo > Aventura & Ação',
    'Novo > Infantil & Juvenil',
    'Novo > Didático & Escolar',
    'Novo > História & Biografias',
    'Novo > Filosofia & Humanidades',
    'Novo > Autoajuda & Desenvolvimento',
    'Novo > Quadrinhos & HQs',
    'Novo > Ciências & Tecnologia',
  ],
  usado: [
    'Usado > Literatura & Ficção',
    'Usado > Religioso & Espiritualidade',
    'Usado > Aventura & Ação',
    'Usado > Infantil & Juvenil',
    'Usado > Didático & Escolar',
    'Usado > História & Biografias',
    'Usado > Filosofia & Humanidades',
    'Usado > Autoajuda & Desenvolvimento',
    'Usado > Quadrinhos & HQs',
    'Usado > Ciências & Tecnologia',
  ],
};

/**
 * Converte o peso da fonte em gramas numérico limpo.
 */
function normalizeWeightToGrams(book: BookInfo): number | undefined {
  if (book.weight === undefined || book.weight === null) return undefined;
  const num =
    typeof book.weight === 'number'
      ? book.weight
      : Number(String(book.weight).replace(',', '.'));
  if (!Number.isFinite(num)) return undefined;
  return roundPhysicalMeasurement(book.weightUnit === 'kg' ? num * 1000 : num);
}

/**
 * Inicializa um rascunho de cadastro Magazord a partir dos dados normalizados do livro.
 */
export function createRegistrationDraft(
  book: BookInfo,
  initialCondition: BookCondition = 'novo',
  registrationMode?: RegistrationMode
): RegistrationDraft {
  const isbn13 = cleanIsbn(book.isbn13 || '');
  const isbn10 = cleanIsbn(book.isbn10 || '');
  const ean = isbn13 || isbn10 || '';

  // Determina Código Filho conforme regra:
  // Se NOVO: pré-preenchido com ISBN-13
  // Se USADO: campo manual VAZIO (Código Filho NÃO é o EAN/ISBN)
  const childCode = initialCondition === 'novo' ? (isbn13 || ean) : '';

  // Lista de imagens sem duplicatas
  const allImages = imageReferences([book.coverUrl, book.thumbnailUrl, ...(book.additionalImages || [])]);
  const mainImageUrl = allImages[0];
  const additionalImageUrls = allImages.filter((img) => img !== mainImageUrl);

  // Ano de publicação
  let year = '';
  if (book.year !== undefined && book.year !== null) {
    year = String(book.year);
  } else if (book.publishedDate) {
    const match = book.publishedDate.match(/\b(19\d\d|20\d\d)\b/);
    if (match) year = match[1];
  }

  // Categoria inicial conforme a condição
  const availableCategories = CATEGORIES_BY_CONDITION[initialCondition];
  const initialCategory = availableCategories[0];

  // Marca sugerida a partir da editora
  const publisher = book.publisher ? book.publisher.trim() : '';
  const brand = publisher;

  // Dimensões exatas (NÃO acrescentar 1 cm!)
  const width =
    typeof book.width === 'number' && Number.isFinite(book.width) ? roundPhysicalMeasurement(book.width) : undefined;
  const height =
    typeof book.height === 'number' && Number.isFinite(book.height) ? roundPhysicalMeasurement(book.height) : undefined;
  const depth =
    typeof book.depth === 'number' && Number.isFinite(book.depth) ? roundPhysicalMeasurement(book.depth) : undefined;

  const draft: RegistrationDraft = {
    condition: initialCondition,
    registrationMode: registrationModeForCondition(initialCondition, registrationMode),
    parentCode: '', // Sempre manual (etiqueta física da loja, ex: LV26579-P)
    childCode, // Vazio se usado, ISBN-13 se novo
    ean, // Preservado
    isbn13, // Preservado
    isbn10, // Preservado

    category: initialCategory,
    brand,
    publisher,

    title: book.title ? book.title.trim() : '',
    subtitle: book.subtitle ? book.subtitle.trim() : undefined,
    authors: Array.isArray(book.authors) ? book.authors.map((a) => a.trim()).filter(Boolean) : [],
    year,
    edition: book.edition ? book.edition.trim() : undefined,
    language: normalizeLanguage(book.language),
    pageCount: typeof book.pageCount === 'number' && book.pageCount > 0 ? book.pageCount : undefined,
    format: book.format ? book.format.trim() : '',

    weight: normalizeWeightToGrams(book),
    weightUnit: 'g',
    width,
    height,
    depth,

    synopsis: sanitizeSynopsis(book.synopsis || book.description || ''),
    usedBookConditionNotes: '', // Sempre vazio no início
    description: sanitizeSynopsis(book.synopsis || book.description || ''),

    price: '', // Sempre começa vazio
    quantity: 1, // Padrão 1
    location: 'Sebo Livraria Sul', // Fixo da loja

    mainImageUrl,
    additionalImageUrls,

    ncm: '4901.99.00', // Padrão fiscal para livros no Brasil
    fiscalOrigin: '0 - Nacional',
    unit: 'UN',
  };
  draft.metaDescription = generateMetaDescription(draft);
  draft.metaDescriptionEdited = false;
  return draft;
}

/** Decimal reais, with Brazilian grouping; never accept partial parses or exponent notation. */
export function parseRegistrationPrice(value: string): number | undefined {
  const text = value.trim();
  if (!/^(?:\d+(?:[,.]\d{1,2})?|\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?)$/.test(text)) return;
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.')
    : /^\d{1,3}(?:\.\d{3})+$/.test(text) ? text.replace(/\./g, '') : text;
  const amount = Number(normalized);
  return Number.isFinite(amount) && Number.isSafeInteger(Math.round(amount * 100)) ? amount : undefined;
}

export function formatRegistrationPrice(value: string): string {
  const amount = parseRegistrationPrice(value);
  return amount === undefined ? 'Preço não informado ou inválido' : new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(amount);
}

/** Format only a completed, valid edit; preserve incomplete/invalid input for correction. */
export function formatRegistrationPriceInput(value: string): string {
  const amount = parseRegistrationPrice(value);
  return amount === undefined ? value : new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

export type RegistrationValidation = { errors: Record<string, string>; warnings: Record<string, string> };
const absentText = (value?: string) => !value?.trim() || /^(?:(?:titulo|autores?|editora|idioma|formato)\s+)?(?:-|n\/a|null|none|indisponivel|desconhecid[oa]|nao\s+(?:cadastrad[oa]|informad[oa]|disponivel|encontrad[oa])|sem\s+(?:titulo|informacao))$/i
  .test(value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.!:;]+$/, '').trim());

/** Pure consistency checks. Optional omissions and unproven suspicions never block registration. */
export function validateRegistrationDraft(draft: RegistrationDraft, source?: BookInfo): RegistrationValidation {
  const errors: Record<string, string> = {}, warnings: Record<string, string> = {};
  const required = (field: keyof RegistrationDraft, invalid: boolean, message: string) => { if (invalid) errors[field] = `Erro obrigatório — ${message}`; };
  const warn = (field: keyof RegistrationDraft, message: string) => { warnings[field] = `Observação — ${message} Você pode corrigir ou manter na revisão.`; };
  required('condition', !['novo', 'usado'].includes(draft.condition), 'Selecione NOVO ou USADO.');
  required('parentCode', !draft.parentCode?.trim(), 'Informe o Código Pai da etiqueta física.');
  required('childCode', !draft.childCode?.trim(), draft.condition === 'usado' ? 'Informe o Código Filho manual deste exemplar usado.' : 'Informe o Código Filho do produto.');
  required('title', absentText(draft.title) || !/[\p{L}\p{N}]/u.test(draft.title || ''), 'Informe o título real da obra; mensagens de ausência não são um título.');
  required('category', !draft.category?.trim(), 'Selecione a categoria do produto.');
  const amount = parseRegistrationPrice(draft.price || '');
  required('price', amount === undefined || amount <= 0, 'Informe um preço maior que zero, como 50,00 ou 1.234,56.');
  required('quantity', !Number.isSafeInteger(draft.quantity) || draft.quantity < 1, 'Informe uma quantidade inteira de pelo menos 1 exemplar.');

  const identifiers = (['isbn13', 'isbn10', 'ean'] as const).filter(field => !!draft[field]?.trim());
  for (const field of identifiers) {
    const value = cleanIsbn(draft[field]), canonical = canonicalBookIsbn(value);
    required(field, !canonical || (field !== 'ean' && value.length !== (field === 'isbn13' ? 13 : 10)), `Corrija ${field === 'ean' ? 'o EAN/ISBN' : field === 'isbn10' ? 'o ISBN-10' : 'o ISBN-13'}: formato ou dígito verificador inválido.`);
    if (field === 'ean' && canonical && value.length === 10) warn(field, 'O identificador comercial está em ISBN-10. Confira se há ISBN-13 disponível; nenhum será inventado.');
  }
  const canonicalIds = identifiers.filter(field => !errors[field]).map(field => canonicalBookIsbn(draft[field]));
  if (new Set(canonicalIds).size > 1) for (const field of identifiers) required(field, !errors[field], 'ISBN e EAN informados identificam obras diferentes. Corrija os identificadores.');
  if (draft.condition === 'usado' && canonicalBookIsbn(draft.childCode) && canonicalIds.includes(canonicalBookIsbn(draft.childCode)))
    warn('childCode', 'O Código Filho coincide com o ISBN. Confira o código individual do exemplar usado.');

  if (!draft.authors?.length || draft.authors.some(author => absentText(author) || !/\p{L}/u.test(author))) warn('authors', 'Autor ausente ou com texto que não identifica uma pessoa/organização. Campo opcional.');
  if (absentText(draft.publisher) || !/\p{L}/u.test(draft.publisher)) warn('publisher', 'Editora ausente ou não identificada. Campo opcional.');
  if (draft.year && (!/^\d{4}$/.test(draft.year.trim()) || Number(draft.year) < 1000 || Number(draft.year) > new Date().getFullYear() + 1)) warn('year', 'Confira o ano com quatro dígitos; o valor parece inválido ou futuro.');
  if (draft.edition && (absentText(draft.edition) || /^[-0]/.test(draft.edition.trim()))) warn('edition', 'Confira a edição informada; não confunda edição com reimpressão.');
  if (absentText(draft.language)) warn('language', 'Idioma não informado. Campo opcional; não presumimos Português.');
  else if (!/\p{L}/u.test(draft.language!)) warn('language', 'O idioma informado não parece um nome ou código de idioma.');
  else if (source?.id?.startsWith('brasilapi-') && source.language === 'pt' && !source.provenance?.language && normalizeLanguage(draft.language) === 'Português')
    warn('language', 'Português foi sugerido pelo importador, sem confirmação explícita da fonte. Confira o idioma da obra.');
  if (absentText(draft.format)) warn('format', 'Formato não informado. Campo opcional; não presumimos Brochura.');
  else if (!/\p{L}/u.test(draft.format!)) warn('format', 'Confira o formato/encadernação informado.');
  if (draft.pageCount != null && (!Number.isInteger(draft.pageCount) || draft.pageCount <= 0 || draft.pageCount > 20000)) warn('pageCount', 'Número de páginas possivelmente incorreto; informe um inteiro positivo quando conhecido.');

  if (draft.weight != null) {
    const grams = draft.weight * (draft.weightUnit === 'kg' ? 1000 : 1);
    if (!['g', 'kg'].includes(draft.weightUnit)) warn('weight', 'A unidade de peso não é reconhecida. Confira o valor em g ou kg.');
    else if (!Number.isFinite(grams) || grams < 30 || grams > 30000) warn('weight', `ATENÇÃO — PESO POSSIVELMENTE INCORRETO: ${formatPhysicalMeasurement(draft.weight)} ${draft.weightUnit}. Confira a informação antes de confirmar o cadastro.`);
    else if (source?.weight != null && !source.weightUnit && roundPhysicalMeasurement(draft.weight) === roundPhysicalMeasurement(source.weight)) warn('weight', 'A fonte não declarou a unidade de peso; este campo está em gramas. Confira antes de utilizar.');
  }
  for (const field of ['width', 'height', 'depth'] as const) {
    const value = draft[field];
    if (value == null) continue;
    if (!Number.isFinite(value) || value <= 0 || value > 100) warn(field, 'Dimensão possivelmente incorreta. Confira o valor em centímetros.');
    else if (source?.[field] != null && roundPhysicalMeasurement(source[field]) === roundPhysicalMeasurement(value) && source.dimensionsUnit !== 'cm') warn(field, 'A fonte não declarou centímetros; confirme a unidade antes de utilizar.');
  }
  for (const field of ['mainImageUrl', 'additionalImageUrls'] as const) {
    const references = field === 'mainImageUrl' ? [draft.mainImageUrl].filter(Boolean) as string[] : draft.additionalImageUrls || [];
    required(field, references.some(url => !isImageReference(url) || !!new URL(url).search || !!new URL(url).hash), 'Remova ou substitua a referência de imagem inválida ou com parâmetros que não podem ser preservados com segurança. Não é necessário testar a disponibilidade da URL.');
  }
  return { errors, warnings };
}

/**
 * Compõe o texto final do campo único de descrição para a Magazord:
 *
 * LIVRO NOVO:
 * - Apenas a sinopse / resumo da obra.
 *
 * LIVRO USADO:
 * - Se houver estado do exemplar: [estado do exemplar] + \n\n + [sinopse]
 * - Se o estado do exemplar estiver vazio: apenas a [sinopse] (sem quebras inúteis).
 */
export function buildFinalDescription(draft: {
  condition: BookCondition;
  usedBookConditionNotes?: string;
  synopsis?: string;
}): string {
  const synopsis = (draft.synopsis || '').trim();

  if (draft.condition === 'novo') {
    return synopsis;
  }

  const conditionNotes = (draft.usedBookConditionNotes || '').trim();

  if (conditionNotes && synopsis) {
    return `${conditionNotes}\n\n${synopsis}`;
  }

  if (conditionNotes) {
    return conditionNotes;
  }

  return synopsis;
}
