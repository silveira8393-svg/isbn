import type { RegistrationDraft } from '../types';

export const registrationFields = {
  condition: 'Condição', registrationMode: 'Modo de cadastro', parentCode: 'Código Pai', childCode: 'Código Filho',
  ean: 'EAN', isbn13: 'ISBN-13', isbn10: 'ISBN-10', title: 'Título', subtitle: 'Subtítulo', authors: 'Autores',
  publisher: 'Editora', brand: 'Marca', category: 'Categoria', year: 'Ano', edition: 'Edição', language: 'Idioma',
  pageCount: 'Páginas', format: 'Formato', weight: 'Peso', weightUnit: 'Unidade de peso', width: 'Largura (cm)',
  height: 'Altura (cm)', depth: 'Espessura (cm)', synopsis: 'Sinopse', usedBookConditionNotes: 'Observações do exemplar usado',
  description: 'Descrição final', price: 'Preço informado (R$)', quantity: 'Quantidade informada', location: 'Localização',
  mainImageUrl: 'URL da imagem principal', additionalImageUrls: 'URLs das imagens adicionais', ncm: 'NCM',
  fiscalOrigin: 'Origem fiscal', unit: 'Unidade',
} as const;
type SnapshotValue = string | number | string[];
export interface RegistrationSnapshot {
  version: 1;
  capturedAt: string;
  fields: Partial<Record<keyof typeof registrationFields, SnapshotValue>>;
}

function imageUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return;
    // Do not persist signed URL credentials, binary data URLs or fragments.
    if (url.search || url.hash) return;
    return url.href;
  } catch { return; }
}

function allowedFields(source: Record<string, unknown>): RegistrationSnapshot['fields'] {
  const fields: RegistrationSnapshot['fields'] = {};
  for (const key of Object.keys(registrationFields) as (keyof typeof registrationFields)[]) {
    const value = source[key];
    if (key === 'mainImageUrl') { const safe = imageUrl(value); if (safe) fields[key] = safe; }
    else if (key === 'additionalImageUrls') { if (Array.isArray(value)) fields[key] = value.map(imageUrl).filter((url): url is string => !!url); }
    else if (key === 'authors') { if (Array.isArray(value)) fields[key] = value.filter((item): item is string => typeof item === 'string'); }
    else if (typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) fields[key] = value;
  }
  return fields;
}

export function createRegistrationSnapshot(draft: RegistrationDraft, capturedAt: string): RegistrationSnapshot {
  return { version: 1, capturedAt, fields: allowedFields(draft as unknown as Record<string, unknown>) };
}

export function readRegistrationSnapshot(value: unknown): RegistrationSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const snapshot = value as Record<string, unknown>;
  if (snapshot.version !== 1 || typeof snapshot.capturedAt !== 'string' || !Number.isFinite(Date.parse(snapshot.capturedAt))
    || !snapshot.fields || typeof snapshot.fields !== 'object' || Array.isArray(snapshot.fields)) return null;
  const fields = allowedFields(snapshot.fields as Record<string, unknown>);
  if (typeof fields.title !== 'string' || !fields.title || !['novo', 'usado'].includes(String(fields.condition))) return null;
  return { version: 1, capturedAt: snapshot.capturedAt, fields };
}
