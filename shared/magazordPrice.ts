export const PRICE_HOMOLOGATION = 'https://homologacaosilveiralab.painel.magazord.com.br/api';
export interface PriceReadDiagnostic {
  operation: 'read_parent' | 'read_child' | 'read_price_table' | 'read_prices_inactive' | 'read_prices_active';
  endpoint: string;
  httpStatus: number | null;
  contentType: string;
  reason: 'http_error' | 'unexpected_content_type' | 'invalid_response' | 'timeout' | 'network_error';
}
export class PriceError extends Error {
  constructor(public code: string, public status = 409, public diagnostic?: PriceReadDiagnostic) { super(code); }
}
export const priceFail = (code: string, status = 409): never => { throw new PriceError(code, status); };
export const priceUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** Complete decimal reais only. BigInt parsing avoids floating-point rounding of the input. */
export function priceCents(value: unknown): number {
  if (typeof value !== 'string' || value.length > 32
    || !/^(?:\d+[,\.]\d{2}|\d{1,3}(?:\.\d{3})+,\d{2})$/.test(value)) return priceFail('invalid_price', 400);
  const decimal = value.includes(',') ? value.replace(/\./g, '').replace(',', '.') : value;
  const cents = BigInt(decimal.replace('.', ''));
  if (cents <= 0n || cents > BigInt(Number.MAX_SAFE_INTEGER)) return priceFail('invalid_price', 400);
  const number = Number(cents), reais = number / 100;
  if (BigInt(reais.toFixed(2).replace('.', '')) !== cents) return priceFail('invalid_price', 400);
  return number;
}

export function salePricePayload(childCode: string, tableId: number, cents: number) {
  if (typeof childCode !== 'string' || !/^[\p{L}\p{N}][\p{L}\p{N}._ -]{0,24}$/u.test(childCode) || childCode.trim() !== childCode
    || !Number.isSafeInteger(tableId) || tableId <= 0 || !Number.isSafeInteger(cents) || cents <= 0
    || priceCents((cents / 100).toFixed(2)) !== cents) return priceFail('invalid_price', 400);
  return [{ produto: childCode, tabelaPreco: tableId, precoVenda: cents / 100 }];
}

export type PriceSnapshot = { kind: 'absent' } | { kind: 'present'; cents: number };
/** Fail closed: only a complete empty result proves absence. Never ignore other ads or old prices. */
export function priceSnapshot(body: any, childCode: string, tableId: number): PriceSnapshot {
  if (!body || body.sucesso === false || (body.status !== undefined && body.status !== 'success')
    || !Array.isArray(body.data) || !Number.isSafeInteger(body.total) || body.total < 0
    || body.total !== body.data.length || body.data.length > 100) return priceFail('ambiguous_price_response', 502);
  if (body.total === 0) return { kind: 'absent' };
  if (body.data.length !== 1) return priceFail('existing_price_review_required');
  const item = body.data[0];
  if (!item || item.produto !== childCode || item.tabelaPreco !== tableId || item.anuncio !== null)
    return priceFail('ambiguous_price_response', 502);
  // No old-price policy is authorized. Even zero or an unexpected representation requires review.
  if (Object.hasOwn(item, 'precoAntigo') && item.precoAntigo !== null) return priceFail('existing_price_review_required');
  if (typeof item.precoVenda !== 'number' || !Number.isFinite(item.precoVenda) || item.precoVenda <= 0)
    return priceFail('existing_price_review_required');
  const cents = priceCents(item.precoVenda.toFixed(2));
  if (cents / 100 !== item.precoVenda) return priceFail('ambiguous_price_response', 502);
  return { kind: 'present', cents };
}

export interface PricePreview {
  status: 'preview'; environment: 'homologation'; writesEnabled: boolean; operationId?: string;
  parentCode: string; childCode: string; tableId: number; tableName: string; cents: number;
  eligible: boolean; state: 'ready_for_local_review' | 'existing_price_review_required' | 'ambiguous_price_response';
  payload: ReturnType<typeof salePricePayload>;
}
