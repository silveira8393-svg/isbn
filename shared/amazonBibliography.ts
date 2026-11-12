import { COVER_FORMATS, normalizeCoverFormat } from '../src/utils/bibliographicNormalization.js';

/** Only attested cover aliases become the existing CC/CD registration values. */
export function amazonCoverFormat(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  const normalized = normalizeCoverFormat(value.trim().replace(/\s+/g, ' '));
  return COVER_FORMATS.some(format => format === normalized) ? normalized : undefined;
}

/** Personal names with one clear surname/given-name separator. Keep ambiguous credits intact. */
export function amazonAuthorName(value: string): string {
  const name = value.trim();
  const parts = name.split(',').map(part => part.trim());
  const personal = (part: string) => /^[\p{L}]+(?:[ '\u2019-][\p{L}]+)*$/u.test(part) && part.length > 1;
  const ambiguous = /\b(?:editora|editorial|universidade|instituto|associa[çc][ãa]o|companhia|company|press|ltda|inc|org|editor|editores|organizador|jr|junior|filho|neto|and|e|outros|et al)\b/i;
  if (parts.length !== 2 || parts.some(part => !personal(part) || ambiguous.test(part))
    || parts.some(part => part.split(/\s+/).length > 4)) return name;
  return `${parts[1]} ${parts[0]}`;
}
