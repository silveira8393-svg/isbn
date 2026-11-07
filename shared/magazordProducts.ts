import { canonicalBookIsbn, cleanIsbn } from '../src/utils/isbn.js';

export type ProductQueryKind = 'child' | 'parent' | 'ean';
export interface ProductQuery { kind: ProductQueryKind; value: string }
export interface CommercialChild { code: string; name: string | null; active: boolean; ean: string | null }
export interface CommercialParent { code: string; name: string | null; active: boolean; children: CommercialChild[] }
export interface ProductLookup {
  source: 'magazord'; query: ProductQuery; status: 'found' | 'not_found' | 'multiple' | 'unavailable';
  match: 'commercial' | 'bibliographic'; parents: CommercialParent[]; truncated: boolean; code?: string;
}

/** Commercial codes retain case and separators; ISBN normalization is bibliographic only. */
export function normalizeProductQuery(kind: string, input: string): ProductQuery | null {
  if (kind !== 'child' && kind !== 'parent' && kind !== 'ean') return null;
  const value = input.trim();
  if (kind !== 'ean') return /^[\p{L}\p{N}][\p{L}\p{N}._ :\-]{0,99}$/u.test(value) && value !== '.' && value !== '..' ? { kind, value } : null;
  const isbn = canonicalBookIsbn(value);
  if (isbn) return { kind, value: isbn };
  const ean = cleanIsbn(value);
  if (!/^(?:\d{8}|\d{12,14})$/.test(ean) || /^0+$/.test(ean)) return null;
  const digits = [...ean].reverse().map(Number);
  return digits.reduce((sum, digit, i) => sum + digit * (i % 2 ? 3 : 1), 0) % 10 === 0 ? { kind, value: ean } : null;
}

export function unavailableProductLookup(query: ProductQuery, code: string): ProductLookup {
  return { source: 'magazord', query, status: 'unavailable', match: query.kind === 'ean' ? 'bibliographic' : 'commercial', parents: [], truncated: false, code };
}
