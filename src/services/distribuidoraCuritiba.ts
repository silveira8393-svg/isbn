import { BookInfo } from '../types';
import { curitibaProductLinks } from '../utils/bookSourceLinks';
import { imageReferences, isImageReference } from '../utils/imageUrls';
import { galleryLocation, galleryImage, type CuritibaGalleryRequest, type GalleryDiagnostic } from '../utils/curitibaGallery';
import { normalizeTitleQuery, type TitleSearchCandidate } from '../../shared/googleBooks';
import { canonicalBookIsbn, cleanIsbn } from '../utils/isbn';
import { loadCuritibaProductLink } from './curitibaProductLink';

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
  gallery?: GalleryDiagnostic;
}

export interface DistribuidoraSearchResult {
  book: Partial<BookInfo> | null;
  diagnostic: DistribuidoraDiagnostic;
  gallery?: CuritibaGalleryRequest;
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

async function postJson(url: string, payload: JsonRecord, signal?: AbortSignal): Promise<{ response: Response; data: unknown }> {
  const response = await fetch(url, {
    method: 'POST',
    ...(signal ? { signal } : {}),
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

export async function searchBookByIsbnDistribuidoraCuritiba(isbn: string, signal?: AbortSignal, selectedProduct?: string): Promise<DistribuidoraSearchResult> {
  const startTime = performance.now();
  const sanitizedIsbn = isbn.replace(/[\s-]/g, '').trim();

  if (!sanitizedIsbn) {
    return unavailableResult(startTime, 'N/A', 'ISBN não fornecido.');
  }

  try {
    const bootstrap = await postJson(`${BASE_URL}/auth/loginAcessoPublico`, {
      host: 'https:',
      usuario: { cdSistema: 50, flAtivo: 'S' },
    }, signal);

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
    }, signal);

    if (!search.response.ok) {
      return unavailableResult(startTime, search.response.status, `Pesquisa indisponível (HTTP ${search.response.status}).`);
    }

    let product = findProduct(search.data);
    if (selectedProduct) {
      product = null;
      walkJson(search.data, record => { if (String(record.cdProduto) === selectedProduct) product = record; });
    }
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
    }, signal);

    if (!detail.response.ok) {
      return unavailableResult(startTime, detail.response.status, `Ficha indisponível (HTTP ${detail.response.status}).`);
    }

    if (selectedProduct) {
      const actual = findProduct(detail.data), fields = getDynamicFields(detail.data);
      const ids = [actual?.nuCdBarras, fields.AD_CDISBN].filter(Boolean).map(String);
      if (String(actual?.cdProduto) !== selectedProduct || !ids.length
        || ids.some(id => canonicalBookIsbn(id) !== canonicalBookIsbn(isbn)))
        return unavailableResult(startTime, 'EDICAO_DIVERGENTE', 'Ficha sem correspondência segura com a edição selecionada.');
    }
    return mapProductDetail(detail, product, sanitizedIsbn, startTime);
  } catch {
    return unavailableResult(startTime, 'FALHA_CONEXAO', 'Não foi possível consultar a Distribuidora Curitiba.');
  }
}

function mapProductDetail(detail: { data: unknown; response: Response }, product: JsonRecord, sanitizedIsbn: string, startTime: number): DistribuidoraSearchResult {
    const fields = getDynamicFields(detail.data);
    const detailProduct = findProduct(detail.data) || product;
    const directory = galleryLocation(detailProduct, product);
    const preferredCover = directory && typeof detailProduct.urlFotoMiniatura === 'string'
      ? galleryImage(detailProduct.urlFotoMiniatura, directory) : undefined;
    const imageUrls = imageReferences([preferredCover, ...findImageUrls(detail.data)]);
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

    const sourceLinks = curitibaProductLinks(detailProduct,
      [detailProduct.nuCdBarras, product.nuCdBarras, fields.AD_CDISBN].filter((id): id is string => typeof id === 'string' && !!id.trim()), sanitizedIsbn);
    if (sourceLinks.length) book.sourceLinks = sourceLinks;

    return {
      book,
      ...(directory ? { gallery: { product: String(detailProduct.cdProduto), index: directory.href } } : {}),
      diagnostic: {
        provider: 'Distribuidora Curitiba',
        status: detail.response.status,
        responseTimeMs: Math.round(performance.now() - startTime),
        state: 'success',
      },
    };
}

function findImageUrls(value: unknown): string[] {
  const imageUrls = new Set<string>();
  walkJson(value, (record) => {
    Object.entries(record).forEach(([key, fieldValue]) => {
      if (/url.*(foto|imagem|image|capa)|^(urlfoto|urlfotominiatura)$/i.test(key) && isImageReference(fieldValue)) {
        imageUrls.add(fieldValue);
      }
    });
  });
  return [...imageUrls];
}

export function mergeBookWithDistribuidora(base: BookInfo, enrichment: Partial<BookInfo>): BookInfo {
  const merged: BookInfo = { ...base };
  const fillableKeys: Array<keyof BookInfo> = [
    'subtitle', 'publisher', 'authors', 'year', 'pageCount', 'language', 'synopsis', 'description', 'title', 'department', 'productCategory',
  ];

  fillableKeys.forEach((key) => {
    const value = enrichment[key];
    if (isMeaningful(value) && !isMeaningful(merged[key])) merged[key] = value as never;
  });

  const existing = imageReferences([base.coverUrl, base.thumbnailUrl, ...(base.additionalImages || [])]);
  const incoming = imageReferences([enrichment.coverUrl, enrichment.thumbnailUrl, ...(enrichment.additionalImages || [])]);
  const cover = isImageReference(base.coverUrl) ? base.coverUrl : isImageReference(base.thumbnailUrl) ? base.thumbnailUrl : incoming[0] || existing[0];
  if (cover) {
    merged.coverUrl = cover;
    merged.thumbnailUrl = isImageReference(base.thumbnailUrl) && cover === base.coverUrl ? base.thumbnailUrl : cover;
    const covers = new Set(imageReferences([merged.coverUrl, merged.thumbnailUrl]));
    merged.additionalImages = imageReferences([...existing, ...incoming]).filter(url => !covers.has(url));
  }

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

export interface CuritibaTitleResult {
  status: 'success' | 'not_found' | 'unavailable' | 'invalid_query';
  candidates: TitleSearchCandidate[];
  diagnostic: { code: string; httpStatus?: number };
  loadDetail?: (key: string, signal?: AbortSignal) => Promise<TitleSearchCandidate | null>;
}

/** Public catalog: filter 1 is Código ou Descrição, attested by site configuration 41. */
export async function searchCuritibaByTitle(title: string, signal?: AbortSignal): Promise<CuritibaTitleResult> {
  const query = normalizeTitleQuery(title), start = performance.now();
  const failed = (status: CuritibaTitleResult['status'], code: string, httpStatus?: number): CuritibaTitleResult => ({ status, candidates: [], diagnostic: { code, httpStatus } });
  if (!query) return failed('invalid_query', 'invalid_title');
  const request = (url: string, payload: JsonRecord, parentSignal = signal) => postJson(url, payload,
    AbortSignal.any([AbortSignal.timeout(12000), ...(parentSignal ? [parentSignal] : [])]));
  try {
    const bootstrap = await request(`${BASE_URL}/auth/loginAcessoPublico`, { host: 'https:', usuario: { cdSistema: 50, flAtivo: 'S' } });
    const context = bootstrap.data as JsonRecord;
    if (!bootstrap.response.ok || !context?.sessionId || context?.empresa?.cdEmpresa == null) return failed('unavailable', 'public_auth_unavailable', bootstrap.response.status);
    // Context belongs to this search only. It never enters a candidate, history or persistent storage.
    const common = { cdClienteFilter: context.cliente?.cdCliente, cdEmpresa: context.empresa.cdEmpresa,
      cdEmpresaPadraoUsuarioAnonimo: context.cdEmpresaPadraoUsuarioAnonimo, cdGrupoClienteFilter: context.cliente?.cdGrupoCliente,
      clienteEmpresa: {}, flAtivo: 'S', isUsuarioAnomimo: true,
      session: { cdEmpresaPadraoUsuarioAnonimo: context.cdEmpresaPadraoUsuarioAnonimo, cdSistema: context.cdSistema,
        isUsuarioAnomimo: true, sessionId: context.sessionId, usuario: { cdUsuario: context.usuario?.cdUsuario } } };
    const search = await request(SEARCH_URL, { ...common, currentPage: 1, dsPalavraChave: query, filtros: {},
      opcaoFiltro: 1, pageLines: 20, sortColumns: '[1,PRODUTO,2]' });
    if (!search.response.ok || !search.data || typeof search.data !== 'object' || !(search.data as JsonRecord).collections
      || typeof (search.data as JsonRecord).collections !== 'object')
      return failed('unavailable', 'invalid_search_response', search.response.status);
    const products = new Map<string, JsonRecord>();
    walkJson(search.data, record => {
      if (/^LV\d{1,10}$/.test(record.cdProduto) && typeof record.dsProduto === 'string' && record.dsProduto.trim()
        && !products.has(record.cdProduto) && products.size < 20) products.set(record.cdProduto, record);
    });
    function candidate(product: JsonRecord, detail: unknown, response: Response): TitleSearchCandidate {
      const mapped = mapProductDetail({ data: detail, response }, product, '', start).book!;
      const ids = [mapped.isbn10, mapped.isbn13].filter((id): id is string => typeof id === 'string' && !!canonicalBookIsbn(id));
      const isbn10 = ids.map(cleanIsbn).find(id => id.length === 10), isbn13 = ids.map(cleanIsbn).find(id => id.length === 13);
      const consistent = new Set(ids.map(canonicalBookIsbn)).size <= 1;
      const book: BookInfo = { ...mapped, id: `curitiba:${product.cdProduto}`, title: mapped.title || product.dsProduto,
        isbn10: consistent ? isbn10 : undefined, isbn13: consistent ? isbn13 : undefined,
        curitibaTitleReference: { productId: product.cdProduto }, provider: 'Distribuidora Curitiba' };
      if (consistent && (isbn13 || isbn10)) book.sourceLinks = curitibaProductLinks(findProduct(detail) || product, ids, isbn13 || isbn10!);
      return { source: 'curitiba', key: product.cdProduto, book };
    }
    const candidates = [...products.values()].map(product => candidate(product, product, search.response));
    const details = new Map<string, TitleSearchCandidate>();
    return { status: candidates.length ? 'success' : 'not_found', candidates, diagnostic: { code: 'public_title_search', httpStatus: search.response.status },
      async loadDetail(key, detailSignal) {
        const product = products.get(key);
        if (!product || detailSignal?.aborted) return null;
        if (details.has(key)) return structuredClone(details.get(key)!);
        try {
          const detail = await request(DETAIL_URL, { ...common, cdProduto: key, cdCategoria: product.cdCategoria,
            cdDepartamento: product.cdDepartamento, sortColumns: 'TB.CDCATEGORIA3 DESC, TB.CDCATEGORIA2 DESC, LOCALESTOQUE.NUORDEM, LOCALESTOQUE.DSLOCALESTOQUE' }, detailSignal);
          const detailProduct = findProduct(detail.data);
          if (!detail.response.ok || !detailProduct || detailProduct.cdProduto !== key || !detailProduct.dsProduto || detailSignal?.aborted) return null;
          const selected = candidate(product, detail.data, detail.response);
          const isbn = selected.book.isbn13 || selected.book.isbn10;
          if (isbn && !selected.book.sourceLinks?.length) selected.book.sourceLinks = await loadCuritibaProductLink(selected.book, isbn, detailSignal);
          if (detailSignal?.aborted) return null;
          details.set(key, selected); return structuredClone(selected);
        } catch { return null; }
      } };
  } catch { return failed('unavailable', 'transport_or_timeout'); }
}
