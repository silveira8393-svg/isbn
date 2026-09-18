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
  reference?: string;
  authors?: string[];
  publisher?: string;
  publishedDate?: string;
  description?: string;
  pageCount?: number;
  categories?: string[];
  department?: string;
  productCategory?: string;
  additionalImages?: string[];
  thumbnailUrl?: string;
  language?: string;
  isbn10?: string;
  isbn13?: string;
  rawIdentifiers?: BookIdentifier[];
  
  // Custom BrasilAPI properties
  year?: number | string;
  location?: string;
  format?: string;
  edition?: string;
  origin?: string;
  weight?: number;
  weightUnit?: 'g' | 'kg';
  width?: number;
  height?: number;
  depth?: number;
  dimensionsUnit?: 'cm';
  enrichmentSource?: string;
  provenance?: Record<string, string>;
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
