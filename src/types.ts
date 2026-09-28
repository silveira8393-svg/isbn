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

export type BookCondition = 'novo' | 'usado';

export type RegistrationMode =
  | 'new_product'
  | 'reuse_existing_new'
  | 'new_used_from_known_edition';

export interface RegistrationDraft {
  // Identificação e códigos
  condition: BookCondition;
  registrationMode?: RegistrationMode;
  parentCode: string; // Código Pai (ex.: LV26579-P), obrigatório no cadastro
  childCode: string; // Código Filho (automático com ISBN-13 se novo, manual se usado)
  ean: string; // EAN = ISBN-13
  isbn13: string;
  isbn10: string;

  // Categorização e Marcas
  category: string;
  brand: string; // Marca (ex.: Pão Diário)
  publisher: string; // Editora (ex.: Publicações Pão Diário)

  // Dados Bibliográficos
  title: string;
  subtitle?: string;
  authors: string[];
  year?: string;
  edition?: string;
  language?: string;
  pageCount?: number;
  format?: string;

  // Medidas e Peso
  weight?: number; // em gramas
  weightUnit: 'g' | 'kg';
  width?: number; // em cm
  height?: number; // em cm
  depth?: number; // em cm (espessura)

  // Conteúdo
  synopsis: string;
  usedBookConditionNotes?: string; // Observações físicas do exemplar quando Usado
  description?: string; // Descrição final composta (para envio à Magazord)

  // Comercial e Estoque
  price: string; // Preço de venda em R$ (começa vazio)
  quantity: number; // Estoque inicial (default 1)
  location: string; // Localização fixa: "Sebo Livraria Sul"

  // Imagens
  mainImageUrl?: string;
  additionalImageUrls: string[];

  // Configurações Fiscais e Avançadas
  ncm: string;
  fiscalOrigin: string;
  unit: string;
}

export type MagazordMatchStatus =
  | 'NOT_FOUND'
  | 'NEW_PRODUCT_FOUND'
  | 'USED_EDITION_FOUND'
  | 'NEW_AND_USED_FOUND'
  | 'MULTIPLE_MATCHES'
  | 'ERROR';

export interface MagazordMatchItem {
  id: string;
  parentCode: string;
  childCode: string;
  condition: BookCondition;
  title: string;
  sku?: string;
  stock?: number;
  price?: string;
}

export interface MagazordProductCheck {
  exists: boolean;
  status: MagazordMatchStatus;
  catalogMatch: boolean; // Se a edição ou ISBN consta no catálogo Magazord
  canReuseCommercialRegistration: boolean; // Se pode reaproveitar o cadastro comercial existente (apenas para Novo)
  parentCode?: string;
  childCode?: string;
  title?: string;
  statusMessage?: string;
  sku?: string;
  existingCondition?: BookCondition;
  currentStock?: number;
  matches?: MagazordMatchItem[];
}

export interface MagazordRegistrationResult {
  success: boolean;
  parentCode: string;
  childCode: string;
  message: string;
  registeredAt: number;
}

export interface SearchHistoryItem {
  timestamp: number;
  isbn: string;
  title: string;
  authors?: string[];
  success: boolean;
  thumbnailUrl?: string;
  magazordStatus?: 'localizado' | 'cadastrado_simulado' | 'nao_cadastrado';
  parentCode?: string;
  childCode?: string;
  condition?: BookCondition;
  operationType?:
    | 'novo_cadastro'
    | 'reaproveitamento_produto_novo'
    | 'novo_usado_com_edicao_conhecida'
    | 'consulta_apenas';
}

export interface PriceComparisonItem {
  storeName: string;
  price: number;
  currency: string;
  url: string;
  available: boolean;
}
