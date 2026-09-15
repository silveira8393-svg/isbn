/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface BookIdentifier {
  type: 'ISBN_10' | 'ISBN_13' | 'ISSN' | 'OTHER';
  identifier: string;
}

export interface BookInfo {
  id: string;
  title: string;
  subtitle?: string;
  authors?: string[];
  publisher?: string;
  publishedDate?: string;
  description?: string;
  pageCount?: number;
  categories?: string[];
  thumbnailUrl?: string;
  language?: string;
  isbn10?: string;
  isbn13?: string;
  rawIdentifiers?: BookIdentifier[];
  
  // Custom BrasilAPI properties
  year?: number | string;
  location?: string;
  format?: string;
  provider?: string;
  coverUrl?: string;
  synopsis?: string;
}

export interface SearchHistoryItem {
  timestamp: number;
  isbn: string;
  title: string;
  authors?: string[];
  success: boolean;
}

export interface PriceComparisonItem {
  storeName: string;
  price: number;
  currency: string;
  url: string;
  available: boolean;
}
