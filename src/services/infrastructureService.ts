import { supabase } from '../lib/supabase';
import type { InfrastructureData, MetricLimit, MetricStatus } from '../types/infrastructure';
import type { ConfigDraft } from '../utils/infrastructure';

export type InfraAction = { action: 'read' | 'initialize' }
  | { action: 'collect' | 'test_connection'; configId: string }
  | { action: 'save'; configId: string; version: number; config: ConfigDraft; limits: MetricLimit[] };
const messages: Record<string, string> = {
  unauthenticated: 'Sua sessão expirou. Entre novamente.', forbidden: 'Acesso exclusivo de Desenvolvimento ativo nesta loja.',
  version_conflict: 'A configuração mudou. Recarregue o painel antes de salvar novamente.',
  invalid_payload: 'Confira os campos da configuração e dos limites.',
  module_unavailable: 'Infraestrutura indisponível. Verifique se o backend e a migração deste módulo foram preparados.',
};

export async function infrastructureRequest<T = InfrastructureData>(storeId: string, actorId: string, action: InfraAction, signal?: AbortSignal): Promise<T> {
  const { data: session, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session.session || session.session.user.id !== actorId) throw new Error(messages.unauthenticated);
  const { data, error } = await supabase.functions.invoke('infrastructure-control', { body: { ...action, storeId }, signal });
  if (error) {
    let code = 'module_unavailable';
    try {
      const response = (error as { context?: Response }).context;
      if (response instanceof Response) code = (await response.json())?.code ?? code;
    } catch { /* Never display a raw function/network response. */ }
    throw new Error(messages[code] ?? messages.module_unavailable);
  }
  if (!data || typeof data !== 'object') throw new Error(messages.module_unavailable);
  return data as T;
}

export type CollectionResult = { status: MetricStatus; code: string | null; collected: boolean };
