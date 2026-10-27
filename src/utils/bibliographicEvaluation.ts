// Contrato experimental, usado pelo laboratório e testes. Não altera a consulta operacional.
import type { BookInfo } from '../types.js';
import { normalizeCoverFormat, normalizeLanguage, COVER_FORMATS } from './bibliographicNormalization.js';
import { cleanIsbn } from './isbn.js';
import { sanitizeSynopsis } from './sanitizer.js';
import { imageReferences } from './imageUrls.js';

export const BIBLIOGRAPHIC_FIELDS = ['title', 'authors', 'publisher', 'year', 'edition', 'language', 'format', 'pageCount', 'synopsis'] as const;
export type BibliographicField = typeof BIBLIOGRAPHIC_FIELDS[number];
export interface FieldEvaluation { state: 'valid' | 'missing' | 'inconsistent'; reasons: string[]; source?: string; review: boolean; candidate?: unknown }
export interface BookEvaluation {
  book: BookInfo;
  fields: Record<string, FieldEvaluation>;
  match: 'matches' | 'divergent' | 'inconsistent' | 'unverifiable';
  filled: number;
  valid: number;
}
const key = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const absent = (value: unknown): boolean => value == null || (Array.isArray(value) ? !value.length :
  typeof value === 'string' && ['', '-', 'n/a', 'nao informado', 'nao disponivel', 'indisponivel', 'null', 'none', 'titulo nao cadastrado'].includes(key(value)));

/** Dígito verificador e prefixo de livro; nunca remove caracteres arbitrários. */
export function canonicalBookIsbn(value?: string): string | undefined {
  const isbn = cleanIsbn(value || '');
  if (/^97[89][0-9]{10}$/.test(isbn) && [...isbn].reduce((sum, digit, i) => sum + Number(digit) * (i % 2 ? 3 : 1), 0) % 10 === 0) return isbn;
  if (!/^[0-9]{9}[0-9X]$/.test(isbn) || isbn === '0000000000' ||
    [...isbn].reduce((sum, digit, i) => sum + (digit === 'X' ? 10 : Number(digit)) * (10 - i), 0) % 11 !== 0) return;
  const base = '978' + isbn.slice(0, 9);
  return base + (10 - [...base].reduce((sum, digit, i) => sum + Number(digit) * (i % 2 ? 3 : 1), 0) % 10) % 10;
}

export function synopsisReasons(value?: string): string[] {
  const text = key(sanitizeSynopsis(value));
  if (!text) return [];
  if (text.length < 80 || /\b(?:compre|frete|oferta|desconto|carrinho|mais vendido|best.?seller|imperdivel|obra.prima|milhoes de exemplares)\b|classico contemporaneo|transformando a vida de milhoes|[”"]\s*[–-]/.test(text)) {
    return ['Descrição curta, comercial, depoimento ou conteúdo misto.'];
  }
  return /\b(?:personage\w*|historia|romance|narra\w*|enredo|jovem|aborda|analisa|discute|apresenta|explora|ensina)\b/.test(text)
    ? [] : ['Texto sem indícios suficientes de resumo da obra.'];
}

export function normalizeEdition(value?: string): string | undefined {
  if (absent(value)) return;
  const match = key(value!).match(/^([1-9][0-9]{0,2})\s*(?:[ªaºo°.]\s*)?(?:edicao|edition|ed\.?)?$/);
  return match ? `${Number(match[1])}ª` : value;
}

export function evaluateBook(input: Partial<BookInfo>, source: string, expectedIsbn?: string): BookEvaluation {
  const book: BookInfo = { ...input, id: input.id || `${source}-local`, title: input.title || '', provenance: {} };
  const fields: Record<string, FieldEvaluation> = {};
  for (const [field, value] of Object.entries(book)) {
    if (absent(value) && field !== 'title') delete book[field as keyof BookInfo];
  }
  if (absent(book.title)) book.title = '';
  if (book.authors) book.authors = [...new Set(book.authors.filter(name => !absent(name)).map(name => name.trim()))];
  if (book.categories) book.categories = [...new Set(book.categories.filter(name => !absent(name)).map(name => name.trim()))];
  if (book.format) book.format = normalizeCoverFormat(book.format);
  if (book.language) book.language = normalizeLanguage(book.language);
  if (book.edition) book.edition = normalizeEdition(book.edition);
  if (book.year && /^[12][0-9]{3}$/.test(String(book.year))) book.year = Number(book.year);
  if (book.synopsis || book.description) book.synopsis = sanitizeSynopsis(book.synopsis || book.description);
  if (book.synopsis) book.description = book.synopsis;
  if (book.weight != null && book.weightUnit === 'kg') { book.weight *= 1000; book.weightUnit = 'g'; }
  const covers = imageReferences([book.coverUrl, book.thumbnailUrl]);
  const images = imageReferences(book.additionalImages || []).filter(image => !covers.includes(image));
  delete book.coverUrl; delete book.thumbnailUrl; delete book.additionalImages;
  if (covers.length) { book.coverUrl = covers[0]; book.thumbnailUrl = covers[0]; }
  if (images.length) book.additionalImages = images;

  const report = (field: keyof BookInfo, reasons: string[] = []) => {
    const missing = absent(book[field]);
    fields[field] = { state: missing ? 'missing' : reasons.length ? 'inconsistent' : 'valid', reasons,
      source: missing ? undefined : input.provenance?.[field] || source, review: field === 'synopsis' || reasons.length > 0,
      candidate: missing ? undefined : book[field] };
    if (!missing) book.provenance![field] = fields[field].source!;
  };
  for (const field of BIBLIOGRAPHIC_FIELDS) {
    const value = book[field];
    const reasons: string[] = [];
    if (!absent(value)) {
      if (field === 'format' && !COVER_FORMATS.includes(value as typeof COVER_FORMATS[number])) reasons.push('Formato sem equivalência conhecida.');
      if (field === 'language' && !['Português', 'Inglês', 'Espanhol', 'Francês', 'Alemão', 'Italiano', 'Japonês', 'Chinês', 'Russo', 'Árabe', 'Latim'].includes(String(value))) reasons.push('Idioma desconhecido ou composto.');
      if (field === 'edition' && !/^[1-9][0-9]{0,2}ª$/.test(String(value))) reasons.push('Edição ambígua; não confundir com reimpressão.');
      if (field === 'year' && (!Number.isInteger(value) || Number(value) < 1450 || Number(value) > new Date().getFullYear() + 1)) reasons.push('Ano inválido.');
      if (field === 'pageCount' && (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 20000)) reasons.push('Número de páginas inválido.');
      if (field === 'synopsis') reasons.push(...synopsisReasons(String(value)));
      if (['title', 'publisher', 'authors'].includes(field) && /\b(?:compre|frete|oferta|desconto|carrinho)\b/.test(key(String(value)))) reasons.push('Texto comercial no campo bibliográfico.');
    }
    report(field, reasons);
  }
  for (const field of ['isbn10', 'isbn13'] as const) {
    if (book[field]) book[field] = cleanIsbn(book[field]!);
    report(field, book[field] && (!canonicalBookIsbn(book[field]) || book[field]!.length !== (field === 'isbn10' ? 10 : 13)) ? ['ISBN inválido.'] : []);
  }
  for (const field of ['weight', 'width', 'height', 'depth'] as const) {
    const value = book[field];
    report(field, value != null && (!Number.isFinite(value) || value <= 0 || (field === 'weight' ? book.weightUnit !== 'g' : book.dimensionsUnit !== 'cm'))
      ? ['Medida inválida ou unidade não declarada.'] : []);
  }
  if (book.publishedDate) {
    const text = book.publishedDate;
    const full = /^[12][0-9]{3}-[0-9]{2}-[0-9]{2}$/.test(text) && !Number.isNaN(Date.parse(text)) && new Date(text).toISOString().slice(0, 10) === text;
    report('publishedDate', !full && !/^[12][0-9]{3}$/.test(text) ? ['Data de publicação inválida.'] :
      book.year && String(book.year) !== text.slice(0, 4) ? ['Data e ano divergentes.'] : []);
  }
  for (const field of ['subtitle', 'categories', 'coverUrl', 'thumbnailUrl', 'additionalImages', 'weightUnit', 'dimensionsUnit'] as const) report(field);
  report('description', fields.synopsis.reasons);
  const ids = [book.isbn10, book.isbn13].filter((id): id is string => !!id);
  const canonical = ids.map(canonicalBookIsbn);
  const expected = expectedIsbn ? canonicalBookIsbn(expectedIsbn) : undefined;
  const match = canonical.some(id => !id) || new Set(canonical).size > 1 || ['isbn10', 'isbn13'].some(field => fields[field].state === 'inconsistent') ? 'inconsistent' :
    !canonical.length || (expectedIsbn && !expected) ? 'unverifiable' : expected && canonical[0] !== expected ? 'divergent' : 'matches';
  for (const field of ['isbn10', 'isbn13'] as const) {
    if (fields[field].state === 'inconsistent') { delete book[field]; delete book.provenance![field]; }
  }
  return { book, fields, match, filled: BIBLIOGRAPHIC_FIELDS.filter(field => fields[field].state !== 'missing').length,
    valid: BIBLIOGRAPHIC_FIELDS.filter(field => fields[field].state === 'valid').length };
}

export interface BibliographicConflict { field: string; kept: unknown; incoming: unknown; source?: string; reason: string }
/** Laboratório: a ordem é explícita, a base confiável permanece e todo conflito é registrado. */
export function consolidateBooks(base: BookEvaluation, incoming: BookEvaluation): { book: BookInfo; conflicts: BibliographicConflict[]; blocked: boolean } {
  const conflicts: BibliographicConflict[] = [];
  const baseIds = [base.book.isbn10, base.book.isbn13].filter(Boolean).map(canonicalBookIsbn);
  const incomingIds = [incoming.book.isbn10, incoming.book.isbn13].filter(Boolean).map(canonicalBookIsbn);
  const identity = base.match !== 'matches' || incoming.match !== 'matches' || !baseIds.length || !incomingIds.length || baseIds[0] !== incomingIds[0];
  const edition = base.fields.edition?.state === 'inconsistent' || incoming.fields.edition?.state === 'inconsistent' ||
    (base.book.edition && incoming.book.edition && base.book.edition !== incoming.book.edition);
  if (identity || edition) return { book: structuredClone(base.book), blocked: true, conflicts: [{ field: identity ? 'isbn' : 'edition',
    kept: identity ? baseIds : base.book.edition, incoming: identity ? incomingIds : incoming.book.edition,
    reason: identity ? 'Identidade ISBN divergente ou não verificável; não complementar.' : 'Edições divergentes ou inconsistentes; não complementar.' }] };
  const book = structuredClone(base.book);
  book.provenance = { ...book.provenance };
  for (const [field, quality] of Object.entries(incoming.fields)) {
    if (field === 'weightUnit' || field === 'dimensionsUnit') continue;
    if (quality.state === 'missing') continue;
    const target = field as keyof BookInfo, value = quality.candidate ?? incoming.book[target];
    if (quality.state !== 'valid') {
      conflicts.push({ field, kept: book[target], incoming: value, source: quality.source, reason: quality.reasons.join('; ') });
    } else if (base.fields[field]?.state === 'missing' || absent(book[target])) {
      if ((field === 'year' && book.publishedDate && String(value) !== book.publishedDate.slice(0, 4)) ||
        (field === 'publishedDate' && book.year && String(book.year) !== String(value).slice(0, 4))) {
        conflicts.push({ field, kept: field === 'year' ? book.publishedDate : book.year, incoming: value,
          source: quality.source, reason: 'Ano e data de publicação divergentes entre fontes; base preservada.' });
        continue;
      }
      book[target] = structuredClone(value) as never;
      book.provenance[field] = quality.source!;
    } else if (JSON.stringify(book[target]) !== JSON.stringify(value)) {
      conflicts.push({ field, kept: book[target], incoming: value, source: quality.source, reason: 'Base preservada; divergência requer revisão.' });
    }
  }
  // Unidades acompanham somente a medida escolhida; nunca herdam uma unidade conflitante.
  if (book.weight != null && base.fields.weight?.state === 'missing' && incoming.fields.weight?.state === 'valid') {
    book.weightUnit = incoming.book.weightUnit;
    book.provenance.weightUnit = incoming.fields.weightUnit.source!;
  }
  if (['width', 'height', 'depth'].some(field => book[field as keyof BookInfo] != null &&
    base.fields[field]?.state === 'missing' && incoming.fields[field]?.state === 'valid')) {
    book.dimensionsUnit = 'cm'; book.provenance.dimensionsUnit = incoming.fields.dimensionsUnit.source!;
  }
  return { book, conflicts, blocked: false };
}
