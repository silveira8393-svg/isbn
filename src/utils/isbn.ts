/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Removes spaces, hyphens and converts string to uppercase.
 */
export function cleanIsbn(isbn: string): string {
  if (!isbn) return '';
  return isbn.replace(/[\s-]/g, '').toUpperCase();
}

/** Check digits and book prefix; ISBN-10 is compared through its ISBN-13 equivalent. */
export function canonicalBookIsbn(value?: string): string | undefined {
  const isbn = cleanIsbn(value || '');
  if (/^97[89][0-9]{10}$/.test(isbn) && [...isbn].reduce((sum, digit, i) => sum + Number(digit) * (i % 2 ? 3 : 1), 0) % 10 === 0) return isbn;
  if (!/^[0-9]{9}[0-9X]$/.test(isbn) || isbn === '0000000000' ||
    [...isbn].reduce((sum, digit, i) => sum + (digit === 'X' ? 10 : Number(digit)) * (10 - i), 0) % 11 !== 0) return;
  const base = '978' + isbn.slice(0, 9);
  return base + (10 - [...base].reduce((sum, digit, i) => sum + Number(digit) * (i % 2 ? 3 : 1), 0) % 10) % 10;
}

/**
 * Basic check if string is at least standard structure of ISBN-10 or ISBN-13.
 */
export function isValidIsbnFormat(isbn: string): boolean {
  const cleaned = cleanIsbn(isbn);
  // ISBN-10 has 10 characters (can be digits or end with 'X')
  // ISBN-13 has 13 digits
  const isbn10Pattern = /^[0-9]{9}[0-9X]$/;
  const isbn13Pattern = /^[0-9]{13}$/;
  return isbn10Pattern.test(cleaned) || isbn13Pattern.test(cleaned);
}

/**
 * Marketplaces search URL builders.
 * If mode is 'title', search by Title + Publisher.
 * If mode is 'isbn', search by ISBN-13 or ISBN-10.
 */
export function getMarketplaceLinks(
  book: { isbn13?: string; isbn10?: string; title: string; authors?: string[]; publisher?: string },
  mode: 'isbn' | 'title' = 'isbn'
) {
  let queryTerm = '';
  
  if (mode === 'title') {
    // Search using Title + Publisher as requested (e.g. "Blue Lock Panini")
    const publisherPart = book.publisher ? ` ${book.publisher}` : '';
    queryTerm = `${book.title}${publisherPart}`.trim();
  } else {
    // Search using ISBN (or title as fallback if no ISBN is present)
    queryTerm = book.isbn13 || book.isbn10 || book.title;
  }

  const encodedQuery = encodeURIComponent(queryTerm);
  const encodedTitleQuery = encodeURIComponent(`${book.title}${book.publisher ? ' ' + book.publisher : ''}`.trim());

  return {
    amazon: {
      name: 'Amazon',
      url: `https://www.amazon.com.br/s?k=${encodedQuery}`,
      fallbackUrl: `https://www.amazon.com.br/s?k=${encodedTitleQuery}`,
    },
    mercadoLivre: {
      name: 'Mercado Livre',
      url: `https://lista.mercadolivre.com.br/${encodedQuery}#D[A:${encodedQuery}]`,
      fallbackUrl: `https://lista.mercadolivre.com.br/${encodedTitleQuery}`,
    },
    estanteVirtual: {
      name: 'Estante Virtual',
      url: `https://www.estantevirtual.com.br/busca?q=${encodedQuery}`,
      fallbackUrl: `https://www.estantevirtual.com.br/busca?q=${encodedTitleQuery}`,
    },
    cbl: {
      name: 'Portal ISBN/CBL',
      url: `https://cblservicos.org.br/isbn/pesquisa/?q=${encodedQuery}`,
      fallbackUrl: `https://cblservicos.org.br/isbn/pesquisa/?q=${encodedQuery}`,
    }
  };
}
