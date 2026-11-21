import type { RegistrationDraft } from '../src/types.js';
import { buildFinalDescription } from '../src/utils/draft.js';
import { canonicalBookIsbn } from '../src/utils/isbn.js';
import { normalizeNcm } from './ncm.js';

export interface RegistrationInput {
  parentCode: string; childCode: string; title: string; condition: 'novo' | 'usado';
  categoryId: number; categoryStoreId: string; brandId: number; channelId: number;
  fiscalOrigin: number; unit: string; ncm: string; description: string; shortDescription?: string; ean: string;
  weight?: number; height?: number; width?: number; depth?: number;
}
export const registrationValidationMessages = {
  input: 'Os dados do cadastro não foram informados corretamente.',
  parentCode: 'Código Pai inválido: informe de 1 a 25 caracteres permitidos, sem espaços nas extremidades.',
  childCode: 'Código Filho inválido: informe de 1 a 25 caracteres permitidos, sem espaços nas extremidades.',
  codesDistinct: 'Código Pai e Código Filho devem ser diferentes.',
  title: 'Título inválido: informe de 1 a 100 caracteres, sem espaços nas extremidades.',
  condition: 'Selecione a condição NOVO ou USADO.',
  categoryId: 'Informe um ID de categoria inteiro e maior que zero.',
  brandId: 'Informe um ID de Marca inteiro e maior que zero.',
  channelId: 'Informe um ID de loja/canal Magazord inteiro e maior que zero.',
  fiscalOrigin: 'Origem fiscal inválida: selecione um código de 0 a 8.',
  unit: 'Unidade inválida: use KG, L, M3, MI, MT, PC, PCT, RL ou UN.',
  ncm: 'NCM inválido: use oito dígitos ou o formato 4901.99.00, ou deixe vazio.',
  description: 'Descrição inválida: use texto com até 30.000 caracteres.',
  shortDescription: 'Descrição resumida inválida: use texto com até 1.000 caracteres.',
  ean: 'EAN/ISBN inválido: informe um ISBN válido, com dígito verificador correto, ou deixe vazio.',
  dimensions: 'As medidas informadas devem ser números positivos e finitos.',
} as const;
type ValidationField = keyof typeof registrationValidationMessages;
export class RegistrationValidationError extends Error {
  constructor(public fields: ValidationField[]) { super('invalid_registration'); }
}
/** Only known field names select fixed messages; never echo payload values or remote error text. */
export function registrationValidationMessage(fields: unknown): string | undefined {
  if (!Array.isArray(fields)) return;
  const messages = [...new Set(fields.filter((field): field is ValidationField => typeof field === 'string'
    && Object.hasOwn(registrationValidationMessages, field)).map(field => registrationValidationMessages[field]))];
  return messages.length ? messages.join(' ') : undefined;
}
export function registrationInput(draft: RegistrationDraft, brandId: number, channelId: number): RegistrationInput {
  // The existing select stores labels such as "0 - Nacional", not just numeric strings.
  const origin = /^([0-8])\s+-\s+\S.*$/.exec(draft.fiscalOrigin?.trim() || '');
  return { parentCode: draft.parentCode.trim(), childCode: draft.childCode.trim(), title: draft.title.trim(), condition: draft.condition,
    categoryId: draft.magazordCategoryId!, categoryStoreId: draft.magazordCategoryStoreId!, brandId, channelId,
    fiscalOrigin: Number(origin?.[1] ?? draft.fiscalOrigin), unit: draft.unit, ncm: normalizeNcm(draft.ncm) ?? draft.ncm,
    description: buildFinalDescription(draft, 'html'), shortDescription: draft.shortDescription?.trim() || undefined, ean: draft.ean || draft.isbn13 || draft.isbn10 || '',
    ...(draft.weight !== undefined ? { weight: draft.weightUnit === 'kg' ? draft.weight : draft.weight / 1000 } : {}),
    ...(draft.height !== undefined ? { height: draft.height } : {}),
    ...(draft.width !== undefined ? { width: draft.width } : {}),
    ...(draft.depth !== undefined ? { depth: draft.depth } : {}) };
}
export function registrationPayload(input: RegistrationInput) {
  const code = (v: unknown): v is string => typeof v === 'string' && /^[\p{L}\p{N}][\p{L}\p{N}._ -]{0,24}$/u.test(v) && v.trim() === v;
  const id = (v: unknown) => Number.isSafeInteger(v) && Number(v) > 0;
  if (!input) throw new RegistrationValidationError(['input']);
  const ncm = normalizeNcm(input.ncm);
  const fields: ValidationField[] = [];
  const invalid = (field: ValidationField, condition: boolean) => { if (condition) fields.push(field); };
  invalid('parentCode', !code(input.parentCode));
  invalid('childCode', !code(input.childCode));
  invalid('codesDistinct', code(input.parentCode) && code(input.childCode) && input.parentCode.toLowerCase() === input.childCode.toLowerCase());
  invalid('title', typeof input.title !== 'string' || !input.title.trim() || input.title.length > 100 || input.title !== input.title.trim());
  invalid('condition', !['novo', 'usado'].includes(input.condition));
  invalid('categoryId', !id(input.categoryId));
  invalid('brandId', !id(input.brandId));
  invalid('channelId', !id(input.channelId));
  invalid('fiscalOrigin', !Number.isInteger(input.fiscalOrigin) || input.fiscalOrigin < 0 || input.fiscalOrigin > 8);
  invalid('unit', !['KG', 'L', 'M3', 'MI', 'MT', 'PC', 'PCT', 'RL', 'UN'].includes(input.unit));
  invalid('ncm', ncm === undefined);
  invalid('description', typeof input.description !== 'string' || input.description.length > 30000);
  invalid('shortDescription', input.shortDescription !== undefined && (typeof input.shortDescription !== 'string' || input.shortDescription.length > 1000));
  invalid('ean', typeof input.ean !== 'string' || (input.ean !== '' && !canonicalBookIsbn(input.ean)));
  invalid('dimensions', [input.weight, input.height, input.width, input.depth].some(v => v !== undefined && (typeof v !== 'number' || !Number.isFinite(v) || v <= 0)));
  if (fields.length) throw new RegistrationValidationError(fields);
  // Reconstruct an allowlist, never forward a client-supplied remote payload.
  return {
    parent: { codigo: input.parentCode, nome: input.title, marca: input.brandId, tipo: 1, ativo: false,
      origemFiscal: input.fiscalOrigin, unidadeMedida: input.unit, ...(ncm ? { ncm } : {}),
      derivacoes: [] as number[], categorias: [input.categoryId],
      produtoLoja: [{ loja: input.channelId, titulo: input.title,
        // Only the formatting produced by our existing used-book composer is allowed.
        descricao: input.description.replace(/<(?!strong>|\/strong>|br>)/g, '&lt;'),
        ...(input.shortDescription ? { descricaoResumida: input.shortDescription.replace(/[<>]/g, '') } : {}) }] },
    child: { codigo: input.childCode, nome: input.title, ativo: false, derivacoes: [] as unknown[], lojas: [input.channelId],
      ...(input.weight !== undefined ? { peso: input.weight } : {}),
      ...(input.height !== undefined ? { altura: input.height } : {}),
      ...(input.width !== undefined ? { largura: input.width } : {}),
      ...(input.depth !== undefined ? { comprimento: input.depth } : {}),
      ...(input.ean ? { ean: canonicalBookIsbn(input.ean)! } : {}) },
  };
}
