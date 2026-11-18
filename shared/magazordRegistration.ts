import type { RegistrationDraft } from '../src/types';
import { buildFinalDescription } from '../src/utils/draft';
import { canonicalBookIsbn } from '../src/utils/isbn';

export interface RegistrationInput {
  parentCode: string; childCode: string; title: string; condition: 'novo' | 'usado';
  categoryId: number; categoryStoreId: string; brandId: number; channelId: number;
  fiscalOrigin: number; unit: string; ncm: string; description: string; ean: string;
}
export function registrationInput(draft: RegistrationDraft, brandId: number, channelId: number): RegistrationInput {
  return { parentCode: draft.parentCode.trim(), childCode: draft.childCode.trim(), title: draft.title.trim(), condition: draft.condition,
    categoryId: draft.magazordCategoryId!, categoryStoreId: draft.magazordCategoryStoreId!, brandId, channelId,
    fiscalOrigin: Number(draft.fiscalOrigin), unit: draft.unit, ncm: draft.ncm,
    description: buildFinalDescription(draft, 'html'), ean: draft.ean || draft.isbn13 || draft.isbn10 || '' };
}
export function registrationPayload(input: RegistrationInput) {
  const code = (v: unknown): v is string => typeof v === 'string' && /^[\p{L}\p{N}][\p{L}\p{N}._ -]{0,24}$/u.test(v) && v.trim() === v;
  const id = (v: unknown) => Number.isSafeInteger(v) && Number(v) > 0;
  if (!input || !code(input.parentCode) || !code(input.childCode) || input.parentCode.toLowerCase() === input.childCode.toLowerCase()
    || typeof input.title !== 'string' || !input.title.trim() || input.title.length > 100 || input.title !== input.title.trim()
    || !['novo', 'usado'].includes(input.condition) || !id(input.categoryId) || !id(input.brandId) || !id(input.channelId)
    || !Number.isInteger(input.fiscalOrigin) || input.fiscalOrigin < 0 || input.fiscalOrigin > 8
    || !['KG', 'L', 'M3', 'MI', 'MT', 'PC', 'PCT', 'RL', 'UN'].includes(input.unit)
    || typeof input.ncm !== 'string' || (input.ncm !== '' && !/^\d{8}$/.test(input.ncm))
    || typeof input.description !== 'string' || input.description.length > 30000
    || typeof input.ean !== 'string' || (input.ean !== '' && !canonicalBookIsbn(input.ean))) throw new Error('invalid_registration');
  // Reconstruct an allowlist, never forward a client-supplied remote payload.
  return {
    parent: { codigo: input.parentCode, nome: input.title, marca: input.brandId, tipo: 1, ativo: false,
      origemFiscal: input.fiscalOrigin, unidadeMedida: input.unit, ...(input.ncm ? { ncm: input.ncm } : {}),
      derivacoes: [] as number[], categorias: [input.categoryId],
      produtoLoja: [{ loja: input.channelId, titulo: input.title,
        // Only the formatting produced by our existing used-book composer is allowed.
        descricao: input.description.replace(/<(?!strong>|\/strong>|br>)/g, '&lt;') }] },
    child: { codigo: input.childCode, nome: input.title, ativo: false, derivacoes: [] as unknown[], lojas: [input.channelId],
      ...(input.ean ? { ean: canonicalBookIsbn(input.ean)! } : {}) },
  };
}
