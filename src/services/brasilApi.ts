/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BookInfo } from '../types';

export interface BrasilApiBookResponse {
  isbn: string;
  title: string;
  subtitle: string | null;
  authors: string[] | null;
  publisher: string | null;
  year: number | null;
  pages: number | null;
  attributes: string[] | null;
  location: string | null;
  dimensions: any;
  weight: any;
  format: string | null;
  subject: string[] | null;
  cover_url: string | null;
  provider: string | null;
  synopsis: string | null;
}

export interface BrasilApiSearchResult {
  book: BookInfo | null;
  diagnostic: {
    endpoint: string;
    status: number | string;
    provider?: string;
    responseTimeMs: number;
    authorsCount: number;
    categoriesCount: number;
    apiErrorMessage?: string;
  };
}

/**
 * Buscas por ISBN usando a BrasilAPI.
 * https://brasilapi.com.br/api/isbn/v1/{ISBN}
 */
export async function searchBookByIsbnBrasilApi(isbn: string): Promise<BrasilApiSearchResult> {
  const sanitizedIsbn = isbn.replace(/[\s-]/g, '').trim();
  const endpoint = `https://brasilapi.com.br/api/isbn/v1/${encodeURIComponent(sanitizedIsbn)}`;
  
  const startTime = performance.now();
  
  if (!sanitizedIsbn) {
    return {
      book: null,
      diagnostic: {
        endpoint,
        status: 'N/A',
        responseTimeMs: 0,
        authorsCount: 0,
        categoriesCount: 0,
        apiErrorMessage: 'ISBN não fornecido.'
      }
    };
  }

  try {
    const response = await fetch(endpoint);
    const endTime = performance.now();
    const responseTimeMs = Math.round(endTime - startTime);

    if (response.status === 404) {
      return {
        book: null,
        diagnostic: {
          endpoint,
          status: 404,
          responseTimeMs,
          authorsCount: 0,
          categoriesCount: 0,
          apiErrorMessage: 'ISBN não encontrado na BrasilAPI.'
        }
      };
    }

    if (response.status === 500) {
      return {
        book: null,
        diagnostic: {
          endpoint,
          status: 500,
          responseTimeMs,
          authorsCount: 0,
          categoriesCount: 0,
          apiErrorMessage: 'Erro temporário na consulta da BrasilAPI.'
        }
      };
    }

    if (!response.ok) {
      return {
        book: null,
        diagnostic: {
          endpoint,
          status: response.status,
          responseTimeMs,
          authorsCount: 0,
          categoriesCount: 0,
          apiErrorMessage: `Erro inesperado na API: HTTP Status ${response.status}`
        }
      };
    }

    const data: BrasilApiBookResponse = await response.json();
    
    // safe metrics calculation
    const authorsCount = data.authors ? data.authors.length : 0;
    const categoriesCount = data.subject ? data.subject.length : 0;
    const provider = data.provider || 'Não informado';

    // Map to BookInfo
    const book: BookInfo = {
      id: `brasilapi-${sanitizedIsbn}`,
      title: data.title || 'Título não cadastrado',
      subtitle: data.subtitle || undefined,
      authors: data.authors || undefined,
      publisher: data.publisher || undefined,
      publishedDate: data.year ? String(data.year) : undefined,
      description: data.synopsis || undefined,
      pageCount: data.pages || undefined,
      categories: data.subject || undefined,
      thumbnailUrl: data.cover_url || undefined,
      language: 'pt',
      isbn13: sanitizedIsbn.length === 13 ? sanitizedIsbn : undefined,
      isbn10: sanitizedIsbn.length === 10 ? sanitizedIsbn : undefined,
      
      // additional fields
      year: data.year || undefined,
      location: data.location || undefined,
      format: data.format || undefined,
      provider: data.provider || undefined,
      coverUrl: data.cover_url || undefined,
      synopsis: data.synopsis || undefined,
    };

    return {
      book,
      diagnostic: {
        endpoint,
        status: response.status,
        provider,
        responseTimeMs,
        authorsCount,
        categoriesCount
      }
    };

  } catch (error: any) {
    const endTime = performance.now();
    const responseTimeMs = Math.round(endTime - startTime);
    console.error('Error fetching from BrasilAPI:', error);
    return {
      book: null,
      diagnostic: {
        endpoint,
        status: 'FALHA_CONEXAO',
        responseTimeMs,
        authorsCount: 0,
        categoriesCount: 0,
        apiErrorMessage: 'Não foi possível conectar ao serviço de consulta.'
      }
    };
  }
}
