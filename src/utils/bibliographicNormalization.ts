export const COVER_FORMATS = ['CC — Capa Comum', 'CD — Capa Dura'] as const;

/** Operational g/cm precision. Raw Amazon measurements remain in amazonPhysical. */
export function roundPhysicalMeasurement(value: number): number {
  if (!Number.isFinite(value)) return value;
  const rounded = Number(value.toFixed(2));
  return rounded === 0 && value !== 0 ? Number(value.toPrecision(3)) : rounded;
}

export function formatPhysicalMeasurement(value: number): string {
  return new Intl.NumberFormat('pt-BR', { useGrouping: false, maximumFractionDigits: value !== 0 && Math.abs(value) < .01 ? 6 : 2 })
    .format(roundPhysicalMeasurement(value));
}

function lookupKey(value: string): string {
  return value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
}

const coverFormats = new Map<string, string>([
  ...['cc', 'cc - capa comum', 'cc - capa convencional', 'capa convencional', 'brochura', 'capa comum', 'capa mole',
    'capa flexivel', 'paperback', 'softcover', 'soft cover', 'softback'].map(value => [value, COVER_FORMATS[0]] as [string, string]),
  ...['cd', 'cd - capa dura', 'capa dura', 'hardcover', 'hard cover', 'hardback',
    'encadernacao dura', 'encadernacao rigida'].map(value => [value, COVER_FORMATS[1]] as [string, string]),
]);

const languages = new Map<string, string>();
const languageAliases: [string, string[]][] = [
  ['Português', ['pt', 'por', 'portugues', 'portuguese']],
  ['Inglês', ['en', 'eng', 'ingles', 'english']],
  ['Espanhol', ['es', 'spa', 'espanhol', 'espanol', 'spanish']],
  ['Francês', ['fr', 'fra', 'fre', 'frances', 'francais', 'french']],
  ['Alemão', ['de', 'deu', 'ger', 'alemao', 'deutsch', 'german']],
  ['Italiano', ['it', 'ita', 'italiano', 'italian']],
  ['Japonês', ['ja', 'jpn', 'japones', 'japanese']],
  ['Chinês', ['zh', 'zho', 'chi', 'chines', 'chinese']],
  ['Russo', ['ru', 'rus', 'russo', 'russian']],
  ['Árabe', ['ar', 'ara', 'arabe', 'arabic']],
  ['Latim', ['la', 'lat', 'latim', 'latin']],
];
for (const [name, aliases] of languageAliases) {
  for (const alias of aliases) languages.set(alias, name);
}

/** Normalize only identified bindings; retain other source text for manual review. */
export function normalizeCoverFormat(value?: string | null): string {
  if (!value?.trim()) return '';
  const key = lookupKey(value).replace(/[\u2010-\u2015\u2212]/g, '-').replace(/^(cc|cd)\s*-\s*/, '$1 - ');
  return coverFormats.get(key) ?? value;
}

/** Known language codes may include regional/script subtags; unknown values stay intact. */
export function normalizeLanguage(value?: string | null): string {
  if (!value?.trim()) return '';
  const key = lookupKey(value);
  const languageCode = /^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})+$/.test(key) ? key.split(/[-_]/)[0] : key;
  return languages.get(languageCode) ?? value;
}
