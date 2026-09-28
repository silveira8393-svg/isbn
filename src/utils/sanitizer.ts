/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sanitiza descrições e sinopses de livros:
 * - Remove tags HTML indesejadas (script, iframe, etc.)
 * - Converte quebras de bloco (p, br, div) em quebras de linha limpas
 * - Decodifica entidades HTML comuns
 * - Normaliza espaços sem destruir quebras de parágrafo legítimas
 */
export function sanitizeSynopsis(rawHtmlOrText?: string): string {
  if (!rawHtmlOrText) return '';

  let text = rawHtmlOrText;

  // 1. Remover scripts e estilos perigosos com seu conteúdo
  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // 2. Converter tags que representam nova linha em quebras reais
  text = text.replace(/<br\s*[\/]?>/gi, '\n');
  text = text.replace(/<\/(p|div|h[1-6]|li)>/gi, '\n\n');
  text = text.replace(/<(p|div|h[1-6]|ul|ol|li)\b[^>]*>/gi, '');

  // 3. Remover quaisquer outras tags HTML restantes
  text = text.replace(/<[^>]+>/g, '');

  // 4. Decodificar entidades HTML comuns
  const entityMap: Record<string, string> = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&quot;': '"',
    '&apos;': "'",
    '&#39;': "'",
    '&lt;': '<',
    '&gt;': '>',
    '&ndash;': '–',
    '&mdash;': '—',
    '&copy;': '©',
    '&reg;': '®',
  };

  text = text.replace(/&(?:nbsp|amp|quot|apos|#39|lt|gt|ndash|mdash|copy|reg);/g, (match) => {
    return entityMap[match] || match;
  });

  // Decodifica entidades numéricas hex/dec
  text = text.replace(/&#(\d+);/g, (_, dec) => {
    try {
      return String.fromCharCode(parseInt(dec, 10));
    } catch {
      return '';
    }
  });

  // 5. Normalizar quebras de linha e espaçamentos repetidos
  // Converte \r\n para \n
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Limpa espaços no fim de cada linha
  text = text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n');

  // Máximo de duas quebras consecutivas (um parágrafo em branco)
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}
