import { readLimitedJson } from './amazonAuthorization.js';

const FIELDS = {
  codigo: 'codigo', nome: 'nome', marca: 'marca', categorias: 'categorias', derivacoes: 'derivacoes',
  origemFiscal: 'origem_fiscal', ncm: 'ncm', produtoLoja: 'produto_loja', 'produtoLoja.loja': 'produto_loja_loja',
  unidadeMedida: 'unidade_medida', lojas: 'lojas', ean: 'ean', tipo: 'tipo', ativo: 'ativo',
} as const;
const RULES = { required: 'required', invalid: 'invalid', type: 'type', format: 'format',
  minItems: 'min_items', min_items: 'min_items', not_found: 'not_found', duplicate: 'duplicate', maxLength: 'max_length' } as const;
type Field = typeof FIELDS[keyof typeof FIELDS];
type Rule = typeof RULES[keyof typeof RULES] | 'unspecified';
export type ValidationDiagnosticCode = `remote_validation_${Field}_${Rule}` | 'remote_validation_detail_unavailable';
const UNAVAILABLE: ValidationDiagnosticCode = 'remote_validation_detail_unavailable';
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

function fieldName(value: unknown): Field | undefined {
  // Accept explicit field metadata only, never search prose, descriptions, or echoed values.
  if (Array.isArray(value) && value.length <= 3 && value.every(v => typeof v === 'string' || Number.isSafeInteger(v))) value = value.join('.');
  if (typeof value !== 'string' || value.length > 64) return;
  if (/^produtoLoja(?:\[\d{1,4}\]|\.\d{1,4})\.loja$/.test(value)) return 'produto_loja_loja';
  const item = /^(derivacoes|categorias|lojas)(?:\[\d{1,4}\]|\.\d{1,4})(?:\.(?:derivacao|derivacaoItemId|valor))?$/.exec(value);
  if (item) return FIELDS[item[1] as 'derivacoes' | 'categorias' | 'lojas'];
  return Object.hasOwn(FIELDS, value) ? FIELDS[value as keyof typeof FIELDS] : undefined;
}

/** Supported structures are conservative adapters, NOT a documented Magazord error contract. */
export function validationDiagnosticCodes(body: unknown): ValidationDiagnosticCode[] {
  const codes = new Set<ValidationDiagnosticCode>();
  const add = (rawField: unknown, detail: unknown) => {
    const field = fieldName(rawField);
    if (!field || codes.size >= 20) return;
    const rawRule = object(detail) ? detail.rule ?? detail.code : undefined;
    const rule: Rule = typeof rawRule === 'string' && Object.hasOwn(RULES, rawRule) ? RULES[rawRule as keyof typeof RULES] : 'unspecified';
    codes.add(`remote_validation_${field}_${rule}`);
  };
  if (object(body)) {
    for (const errors of [body.errors, object(body.data) ? body.data.errors : undefined]) {
      if (Array.isArray(errors)) {
        for (const entry of errors.slice(0,32)) if (object(entry)) add(entry.field ?? entry.path ?? entry.property, entry);
      } else if (object(errors)) {
        for (const [field, detail] of Object.entries(errors).slice(0,32)) {
          if (typeof detail === 'string' || Array.isArray(detail) || object(detail)) add(field, detail);
        }
      }
    }
  }
  return codes.size ? [...codes].sort() : [UNAVAILABLE];
}

/** Best effort only: diagnostic failure must never replace the known HTTP rejection or trigger a retry. */
export async function readValidationDiagnosticCodes(response: Response, requestSignal: AbortSignal): Promise<ValidationDiagnosticCode[]> {
  if (!/^application\/json(?:;|$)/i.test(response.headers.get('content-type') || '')) {
    void response.body?.cancel().catch(() => {});
    return [UNAVAILABLE];
  }
  try {
    const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(1000)]);
    return validationDiagnosticCodes(await readLimitedJson(response.body,16*1024,signal));
  } catch { return [UNAVAILABLE]; }
}
