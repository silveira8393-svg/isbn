// Cliente exclusivo do laboratório: sessão enviada apenas à Function do próprio aplicativo.
import type { BookInfo } from '../types.js';
import { evaluateBook } from '../utils/bibliographicEvaluation.js';
export const AMAZON_LAB_FIELDS = [
  ['titulo', 'Título'], ['autores', 'Autores'], ['editora', 'Editora'], ['ano', 'Ano'],
  ['edicao', 'Edição'], ['idioma', 'Idioma'], ['formato', 'Formato'], ['paginas', 'Número de páginas'], ['sinopse', 'Sinopse'],
] as const;
export type LabField = typeof AMAZON_LAB_FIELDS[number][0];
export type LabMode = 'fixture' | 'http';
export interface LabQuality {
  valor: string | number | string[] | Record<string, number> | null;
  estado: 'valido' | 'ausente' | 'inconsistente';
  motivos: string[];
  origens: string[];
  revisao_humana: boolean;
}
export interface LabResult {
  status: 'concluida' | 'interrompida';
  modo: LabMode;
  isbn_pesquisado: string;
  duracao_ms: number;
  status_http: number | null;
  mensagem?: string;
  correspondencia?: string;
  preenchidos?: number;
  validos_locais?: number;
  percentual_preenchimento?: number;
  percentual_validos_locais?: number;
  isbn_encontrado?: Record<string, { valor: string | null; valido: boolean }>;
  campos?: Record<LabField, LabQuality>;
  alertas?: string[];
  complementares?: Record<string, LabQuality>;
  book_info?: BookInfo;
  edicao_verificacao?: string;
  diagnostico?: { id: string; duracao_ms: number; status_function: number; status_http: number | null; codigo: string };
  imagens?: { itens: Array<{
    referencia: string; papel: 'principal' | 'adicional'; origem: string;
    disponibilidade_tecnica: string;
    miniatura?: string; origem_miniatura?: string;
  }>; download_realizado: false };
}
export function evaluateAmazonLab(result: LabResult) {
  const evaluation = evaluateBook(result.book_info || {}, 'Amazon (laboratório)', result.isbn_pesquisado);
  const fields = { titulo: 'title', autores: 'authors', editora: 'publisher', ano: 'year', edicao: 'edition',
    idioma: 'language', formato: 'format', paginas: 'pageCount', sinopse: 'synopsis' } as const;
  // A projeção omite candidatos inválidos, mas seus conflitos continuam bloqueando consolidação.
  for (const [labField, bookField] of Object.entries(fields)) {
    const quality = result.campos?.[labField as LabField];
    if (quality?.estado === 'inconsistente') evaluation.fields[bookField] = {
      state: 'inconsistent', reasons: quality.motivos, source: quality.origens.join('; '), review: true,
      candidate: quality.valor,
    };
  }
  if (result.correspondencia !== 'corresponde') evaluation.match = result.correspondencia === 'divergente' ? 'divergent' :
    result.correspondencia === 'inconsistente' ? 'inconsistent' : 'unverifiable';
  return evaluation;
}
export interface LabHealth { http_habilitado: boolean; fixtures: string[]; persistencia: false }

export const isAmazonLabAvailable = (role: string, active: boolean) => role === 'developer' && active;

async function request<T>(path: string, signal: AbortSignal, body?: object): Promise<T> {
  const local = import.meta.env.DEV;
  const headers: Record<string, string> = body ? { 'Content-Type': 'application/json' } : {};
  if (local) headers['X-ISBN-Lab'] = 'local-development';
  else {
    const { supabase } = await import('../lib/supabase.js');
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) throw new Error('Entre novamente para acessar o Laboratório Amazon.');
    headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(40000)]);
  let response: Response;
  try {
    response = await fetch(local ? `/__amazon_lab/${path}` : `/api/amazon?acao=${path}`, {
      // A proteção do Preview usa cookie próprio; o Bearer continua obrigatório na Function.
      method: body ? 'POST' : 'GET', signal: requestSignal, credentials: local ? 'omit' : 'same-origin', cache: 'no-store', redirect: 'error',
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (failure) {
    if (signal.aborted) throw failure;
    if (requestSignal.aborted) throw new Error('Tempo de conexão com o Laboratório Amazon excedido.');
    throw new Error(local ? 'Serviço local indisponível. Inicie npm run lab:amazon em outro terminal.'
      : 'Não foi possível acessar a Function Amazon. Verifique a conexão e a autenticação deste Preview na Vercel.');
  }
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error(local ? 'Serviço local indisponível. Inicie npm run lab:amazon em outro terminal.' : 'Function Amazon indisponível ou resposta inesperada.');
  }
  const payload = await response.json();
  if (!response.ok) throw new Error(`${payload.mensagem || 'Falha no Laboratório Amazon.'}${payload.diagnostico?.id ? ` Referência: ${payload.diagnostico.id}` : ''}`);
  return payload as T;
}

export const getAmazonLabHealth = (signal: AbortSignal) => request<LabHealth>('health', signal);
export const searchAmazonLab = (isbn: string, modo: LabMode, signal: AbortSignal) =>
  request<LabResult>('search', signal, { isbn, modo });
