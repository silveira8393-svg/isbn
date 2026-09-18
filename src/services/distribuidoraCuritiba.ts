import { BookInfo } from '../types';

const BASE_URL = 'https://distribuidoracuritiba.com.br/up-server/public/service';
const SEARCH_URL = `${BASE_URL}/produto/findProdutoList/produtoController/findAllByExampleByPages`;
const DETAIL_URL = `${BASE_URL}/query/execute/produtoController/findProdutoByPrimaryKey`;

const EXPECTED_DYNAMIC_FIELDS = [
  'AD_ANOEDICAO',
  'AD_CDISBN',
  'AD_DESCRICAOIDIOMA',
  'AD_DSAUTOR',
  'AD_DSEDITORA',
  'AD_DSFORMATO',
  'AD_DSORIGEM',
  'AD_DSSINOPSE',
  'AD_NRPAGINA',
  'AD_NUEDICAO',
  'AD_QTALTURA',
  'AD_QTCOMPRIMENTO',
  'AD_QTLARGURA',
  'AD_QTPESOLIQUIDO',
] as const;

type JsonRecord = Record<string, any>;

export interface DistribuidoraDiagnostic {
  provider: 'Distribuidora Curitiba';
  status: number | string;
  responseTimeMs: number;
  state: 'success' | 'not_found' | 'unavailable';
  errorMessage?: string;
}

export interface DistribuidoraSearchResult {
  book: Partial<BookInfo> | null;
  diagnostic: DistribuidoraDiagnostic;
}

function walkJson(value: unknown, visitor: (record: JsonRecord) => void): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item) => walkJson(item, visitor));
    return;
  }

  const record = value as JsonRecord;
  visitor(record);
  Object.values(record).forEach((item) => walkJson(item, visitor));
}

function findProduct(value: unknown): JsonRecord | null {
  let product: JsonRecord | null = null;
  walkJson(value, (record) => {
    if (!product && (record.cdProduto || record.dsProduto || record.nuCdBarras)) {
      product = record;
    }
  });
  return product;
}

function getDynamicFields(value: unknown): JsonRecord {
  const fields: JsonRecord = {};
  walkJson(value, (record) => {
    Object.entries(record).forEach(([key, fieldValue]) => {
      if (key.startsWith('AD_')) fields[key] = fieldValue;
    });
  });
  return fields;
}

function asText(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function asNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const number = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(number) ? number : undefined;
}

function firstText(record: JsonRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = asText(record[key]);
    if (value) return value;
  }
  return undefined;
}

function buildHeaders(): HeadersInit {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json;charset=UTF-8',
  };
}

async function postJson(url: string, payload: JsonRecord): Promise<{ response: Response; data: unknown }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(payload),
    credentials: 'omit',
  });

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return { response, data };
}

function unavailableResult(startTime: number, status: number | string, errorMessage: string): DistribuidoraSearchResult {
  return {
    book: null,
    diagnostic: {
      provider: 'Distribuidora Curitiba',
      status,
      responseTimeMs: Math.round(performance.now() - startTime),
      state: 'unavailable',
      errorMessage,
    },
  };
}

export async function searchBookByIsbnDistribuidoraCuritiba(isbn: string): Promise<DistribuidoraSearchResult> {
  const startTime = performance.now();
  const sanitizedIsbn = isbn.replace(/[\s-]/g, '').trim();

  if (!sanitizedIsbn) {
    return unavailableResult(startTime, 'N/A', 'ISBN não fornecido.');
  }

  try {
    const bootstrap = await postJson(`${BASE_URL}/auth/loginAcessoPublico`, {
      host: 'https:',
      usuario: { cdSistema: 50, flAtivo: 'S' },
    });

    if (!bootstrap.response.ok || !bootstrap.data || typeof bootstrap.data !== 'object') {
      return unavailableResult(startTime, bootstrap.response.status, 'Bootstrap público indisponível.');
    }

    const context = bootstrap.data as JsonRecord;
    const session = {
      cdEmpresaPadraoUsuarioAnonimo: context.cdEmpresaPadraoUsuarioAnonimo,
      cdSistema: context.cdSistema,
      isUsuarioAnomimo: true,
      sessionId: context.sessionId,
      usuario: { cdUsuario: context.usuario?.cdUsuario },
    };

    const search = await postJson(SEARCH_URL, {
      cdClienteFilter: context.cliente?.cdCliente,
      cdEmpresa: context.empresa?.cdEmpresa,
      cdEmpresaPadraoUsuarioAnonimo: context.cdEmpresaPadraoUsuarioAnonimo,
      cdGrupoClienteFilter: context.cliente?.cdGrupoCliente,
      clienteEmpresa: {},
      currentPage: 1,
      dsPalavraChave: sanitizedIsbn,
      filtros: {},
      flAtivo: 'S',
      isUsuarioAnomimo: true,
      opcaoFiltro: 4,
      pageLines: 16,
      session,
      sortColumns: '[1,PRODUTO,2]',
    });

    if (!search.response.ok) {
      return unavailableResult(startTime, search.response.status, `Pesquisa indisponível (HTTP ${search.response.status}).`);
    }

    const product = findProduct(search.data);
    if (!product?.cdProduto) {
      return {
        book: null,
        diagnostic: {
          provider: 'Distribuidora Curitiba',
          status: search.response.status,
          responseTimeMs: Math.round(performance.now() - startTime),
          state: 'not_found',
          errorMessage: 'ISBN não encontrado na Distribuidora Curitiba.',
        },
      };
    }

    const detail = await postJson(DETAIL_URL, {
      cdEmpresa: context.empresa?.cdEmpresa,
      cdClienteFilter: context.cliente?.cdCliente,
      cdGrupoClienteFilter: context.cliente?.cdGrupoCliente,
      cdEmpresaPadraoUsuarioAnonimo: context.cdEmpresaPadraoUsuarioAnonimo,
      clienteEmpresa: {},
      cdProduto: product.cdProduto,
      cdCategoria: product.cdCategoria,
      cdDepartamento: product.cdDepartamento,
      flAtivo: 'S',
      isUsuarioAnomimo: true,
      session,
      sortColumns: 'TB.CDCATEGORIA3 DESC, TB.CDCATEGORIA2 DESC, LOCALESTOQUE.NUORDEM, LOCALESTOQUE.DSLOCALESTOQUE',
    });

    if (!detail.response.ok) {
      return unavailableResult(startTime, detail.response.status, `Ficha indisponível (HTTP ${detail.response.status}).`);
    }

    const fields = getDynamicFields(detail.data);
    const detailProduct = findProduct(detail.data) || product;
    const imageUrls = findImageUrls(detail.data);
    const publisher = firstText(fields, ['AD_DSEDITORA']);
    const author = firstText(fields, ['AD_DSAUTOR']);
    const format = firstText(fields, ['AD_DSFORMATO']);
    const edition = firstText(fields, ['AD_NUEDICAO']);
    const origin = firstText(fields, ['AD_DSORIGEM']);
    const isbn10 = firstText(fields, ['AD_CDISBN']);
    const book: Partial<BookInfo> = {
      reference: asText(detailProduct.cdProduto) || asText(product.cdProduto),
      isbn13: asText(detailProduct.nuCdBarras) || asText(product.nuCdBarras) || sanitizedIsbn,
      isbn10,
      title: firstText(fields, ['AD_DSTITULO', 'AD_DSTITULOPRODUTO']) || asText(detailProduct.dsProduto) || undefined,
      subtitle: firstText(fields, ['AD_DSSUBTITULO', 'AD_DSSUBTITULOPRODUTO']),
      publisher,
      authors: author ? [author] : undefined,
      edition,
      year: asText(fields.AD_ANOEDICAO),
      format,
      language: asText(fields.AD_DESCRICAOIDIOMA),
      origin,
      pageCount: asNumber(fields.AD_NRPAGINA),
      weight: asNumber(fields.AD_QTPESOLIQUIDO),
      weightUnit: 'kg',
      width: asNumber(fields.AD_QTLARGURA),
      height: asNumber(fields.AD_QTALTURA),
      depth: asNumber(fields.AD_QTCOMPRIMENTO),
      dimensionsUnit: 'cm',
      synopsis: asText(fields.AD_DSSINOPSE),
      description: asText(fields.AD_DSSINOPSE),
      productCategory: asText(detailProduct.dsCategoria) || asText(product.dsCategoria),
      department: asText(detailProduct.dsDepartamento) || asText(product.dsDepartamento),
      provider: 'Distribuidora Curitiba',
      enrichmentSource: 'distribuidora_curitiba',
      provenance: {
        ...(isbn10 ? { isbn10: 'distribuidora_curitiba' } : {}),
        ...(format ? { format: 'distribuidora_curitiba' } : {}),
        ...(edition ? { edition: 'distribuidora_curitiba' } : {}),
        ...(origin ? { origin: 'distribuidora_curitiba' } : {}),
        ...(publisher ? { publisher: 'distribuidora_curitiba' } : {}),
        ...(author ? { authors: 'distribuidora_curitiba' } : {}),
        ...(fields.AD_QTPESOLIQUIDO !== undefined ? { weight: 'distribuidora_curitiba' } : {}),
        ...(fields.AD_QTLARGURA !== undefined ? { width: 'distribuidora_curitiba' } : {}),
        ...(fields.AD_QTALTURA !== undefined ? { height: 'distribuidora_curitiba' } : {}),
        ...(fields.AD_QTCOMPRIMENTO !== undefined ? { depth: 'distribuidora_curitiba' } : {}),
      },
    };

    if (imageUrls.length > 0) {
      book.coverUrl = imageUrls[0];
      book.thumbnailUrl = imageUrls[0];
      book.additionalImages = imageUrls.slice(1);
    }

    return {
      book,
      diagnostic: {
        provider: 'Distribuidora Curitiba',
        status: detail.response.status,
        responseTimeMs: Math.round(performance.now() - startTime),
        state: 'success',
      },
    };
  } catch {
    return unavailableResult(startTime, 'FALHA_CONEXAO', 'Não foi possível consultar a Distribuidora Curitiba.');
  }
}

function findImageUrls(value: unknown): string[] {
  const imageUrls = new Set<string>();
  walkJson(value, (record) => {
    Object.entries(record).forEach(([key, fieldValue]) => {
      if (/url.*(foto|imagem|image|capa)|^(urlfoto|urlfotominiatura)$/i.test(key) && typeof fieldValue === 'string' && /^https?:\/\//i.test(fieldValue)) {
        imageUrls.add(fieldValue);
      }
    });
  });
  return [...imageUrls];
}

export function mergeBookWithDistribuidora(base: BookInfo, enrichment: Partial<BookInfo>): BookInfo {
  const merged: BookInfo = { ...base };
  const fillableKeys: Array<keyof BookInfo> = [
    'subtitle', 'publisher', 'authors', 'year', 'pageCount', 'language', 'synopsis', 'description', 'coverUrl', 'thumbnailUrl', 'additionalImages', 'title', 'department', 'productCategory',
  ];

  fillableKeys.forEach((key) => {
    const value = enrichment[key];
    if (isMeaningful(value) && !isMeaningful(merged[key])) merged[key] = value as never;
  });

  (['isbn10', 'format', 'edition', 'origin', 'reference', 'weight', 'width', 'height', 'depth', 'weightUnit', 'dimensionsUnit', 'enrichmentSource', 'provenance'] as Array<keyof BookInfo>).forEach((key) => {
    const value = enrichment[key];
    if (isMeaningful(value)) merged[key] = value as never;
  });

  return merged;
}

function isMeaningful(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export { EXPECTED_DYNAMIC_FIELDS };
