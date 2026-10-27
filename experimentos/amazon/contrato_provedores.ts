// Adaptadores puros para homologação OFFLINE. Não usados pelos serviços operacionais.
import type { BrasilApiBookResponse } from '../../src/services/brasilApi';
import type { BookInfo } from '../../src/types';
import { evaluateBook } from '../../src/utils/bibliographicEvaluation';

export function evaluateBrasilApi(data: BrasilApiBookResponse, expectedIsbn: string) {
  const weight = typeof data.weight === 'object' && data.weight ? data.weight : {};
  const dimensions = typeof data.dimensions === 'object' && data.dimensions ? data.dimensions : {};
  // Somente valores explicitamente nomeados e unidades declaradas; nenhuma inferência por posição.
  return evaluateBook({
    id: `brasilapi-lab-${expectedIsbn}`, title: data.title || '', subtitle: data.subtitle || undefined,
    authors: data.authors || undefined, publisher: data.publisher || undefined,
    year: data.year || undefined, publishedDate: data.year ? String(data.year) : undefined,
    pageCount: data.pages || undefined, format: data.format || undefined,
    synopsis: data.synopsis || undefined, categories: data.subject || undefined,
    coverUrl: data.cover_url || undefined, provider: data.provider || undefined,
    isbn10: data.isbn?.replace(/[\s-]/g, '').length === 10 ? data.isbn : undefined,
    isbn13: data.isbn?.replace(/[\s-]/g, '').length === 13 ? data.isbn : undefined,
    weight: typeof weight.value === 'number' ? weight.value : undefined,
    weightUnit: ['g', 'kg'].includes(weight.unit) ? weight.unit : undefined,
    width: dimensions.unit === 'cm' && typeof dimensions.width === 'number' ? dimensions.width : undefined,
    height: dimensions.unit === 'cm' && typeof dimensions.height === 'number' ? dimensions.height : undefined,
    depth: dimensions.unit === 'cm' && typeof dimensions.depth === 'number' ? dimensions.depth : undefined,
    dimensionsUnit: dimensions.unit === 'cm' ? 'cm' : undefined,
  }, 'BrasilAPI', expectedIsbn);
}

export function evaluateCuritiba(book: Partial<BookInfo>, expectedIsbn: string) {
  const evaluation = evaluateBook(book, 'Distribuidora Curitiba', expectedIsbn);
  if (book.depth != null && book.provenance?.depth === 'distribuidora_curitiba') {
    // O serviço atual usa AD_QTCOMPRIMENTO como profundidade. O significado do eixo não está comprovado.
    evaluation.fields.depth = { state: 'inconsistent', candidate: book.depth, source: 'Curitiba: AD_QTCOMPRIMENTO',
      reasons: ['Comprimento não comprova profundidade/espessura; confirmar semântica do provedor.'], review: true };
    delete evaluation.book.depth;
    delete evaluation.book.provenance!.depth;
  }
  return evaluation;
}
