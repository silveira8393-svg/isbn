import type { BookInfo } from '../types';
import { canonicalBookIsbn } from './isbn.js';

export const RESEARCH_SOURCES = ['brasil_api', 'curitiba', 'amazon', 'google_books'] as const;
export type ResearchSource = typeof RESEARCH_SOURCES[number];
export type ResearchState = 'waiting' | 'querying' | 'found' | 'not_found' | 'unavailable' | 'not_consulted';
export type ResearchStates = Record<ResearchSource, ResearchState>;
export const sourceNames: Record<ResearchSource, string> = {
  brasil_api: 'BrasilAPI', curitiba: 'Distribuidora Curitiba', amazon: 'Amazon SP-API', google_books: 'Google Books',
};
export function initialResearchStates(): ResearchStates {
  return { brasil_api: 'waiting', curitiba: 'waiting', amazon: 'waiting', google_books: 'waiting' };
}
export function matchesBookIsbn(book: Partial<BookInfo> | null | undefined, isbn: string): boolean {
  const expected = canonicalBookIsbn(isbn), ids = [book?.isbn13, book?.isbn10].filter((id): id is string => !!id);
  return !!expected && ids.length > 0 && ids.every(id => canonicalBookIsbn(id) === expected);
}
/** Status describes this ISBN request, not general service health or a different source. */
export function researchOutcome(book: Partial<BookInfo> | null | undefined, isbn: string,
  state?: string, http?: number | string, code?: string): ResearchState {
  if (state === 'skipped' || code === 'not_configured') return 'not_consulted';
  if (state === 'unavailable' || state === 'ambiguous' || state === 'invalid_query') return 'unavailable';
  if (http !== undefined && http !== 404 && !(typeof http === 'number' && http >= 200 && http < 300)) return 'unavailable';
  if (state === 'not_found' || http === 404) return 'not_found';
  return matchesBookIsbn(book, isbn) ? 'found' : 'not_found';
}
