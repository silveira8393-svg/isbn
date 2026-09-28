/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BookInfo, BookCondition, RegistrationDraft, RegistrationMode } from '../types';
import { sanitizeSynopsis } from './sanitizer';
import { cleanIsbn } from './isbn';

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
  if (!Number.isFinite(num) || num <= 0) return undefined;

  if (book.weightUnit === 'kg') {
    return num < 15 ? Math.round(num * 1000) : Math.round(num);
  }
  return Math.round(num);
}

/**
 * Inicializa um rascunho de cadastro Magazord a partir dos dados normalizados do livro.
 */
export function createRegistrationDraft(
  book: BookInfo,
  initialCondition: BookCondition = 'novo',
  registrationMode: RegistrationMode = 'new_product'
): RegistrationDraft {
  const isbn13 = cleanIsbn(book.isbn13 || '');
  const isbn10 = cleanIsbn(book.isbn10 || '');
  const ean = isbn13 || isbn10 || '';

  // Determina Código Filho conforme regra:
  // Se NOVO: pré-preenchido com ISBN-13
  // Se USADO: campo manual VAZIO (Código Filho NÃO é o EAN/ISBN)
  const childCode = initialCondition === 'novo' ? (isbn13 || ean) : '';

  // Lista de imagens sem duplicatas
  const allImages = Array.from(
    new Set(
      [book.coverUrl, book.thumbnailUrl, ...(book.additionalImages || [])].filter(
        (img): img is string => typeof img === 'string' && img.trim().length > 0
      )
    )
  );

  const mainImageUrl =
    book.coverUrl || book.thumbnailUrl || (allImages.length > 0 ? allImages[0] : undefined);
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
    typeof book.width === 'number' && Number.isFinite(book.width) ? book.width : undefined;
  const height =
    typeof book.height === 'number' && Number.isFinite(book.height) ? book.height : undefined;
  const depth =
    typeof book.depth === 'number' && Number.isFinite(book.depth) ? book.depth : undefined;

  return {
    condition: initialCondition,
    registrationMode,
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
    language: book.language ? book.language.trim() : 'Português',
    pageCount: typeof book.pageCount === 'number' && book.pageCount > 0 ? book.pageCount : undefined,
    format: book.format ? book.format.trim() : 'Brochura',

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
