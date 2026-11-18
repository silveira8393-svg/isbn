const ALLOWED_BASES = new Set([
  'https://livrariasul.painel.magazord.com.br/api',
  'https://homologacaosilveiralab.painel.magazord.com.br/api',
]);

/** Backend configuration only. Exact matching avoids URL parser normalization of unsafe input. */
export function resolveMagazordBaseUrl(value: string | undefined): string | undefined {
  // Preserve the previously accepted optional trailing slash, without normalizing anything else.
  const base = value?.replace(/\/$/, '');
  return base && ALLOWED_BASES.has(base) ? base : undefined;
}
