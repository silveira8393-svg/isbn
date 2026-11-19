import type { User } from '../types';
import { priceCents, priceUuid, type PricePreview } from '../../shared/magazordPrice';

/** Read-only preparation for a new product already verified by the ISBN registration journal. */
export function prepareMagazordPrice(registrationId: string, price: string, user: User): Promise<PricePreview> {
  return previewMagazordPrice(registrationId, price, user, 'prepare');
}

// prepare checks authorization and the journal only; preview is an optional remote diagnostic.
export async function previewMagazordPrice(registrationId: string, price: string, user: User, action: 'preview' | 'prepare' = 'preview'): Promise<PricePreview> {
  let expectedCents: number;
  try { expectedCents = priceCents(price); }
  catch { throw new Error('Informe um preço positivo completo, como 30,00 ou 1.234,56.'); }
  if (!priceUuid(registrationId) || !user.active || !priceUuid(user.storeId)) throw new Error('Sessão ou cadastro inválido.');
  const { supabase } = await import('../lib/supabase');
  const { data, error } = await supabase.auth.getSession();
  if (error || data.session?.user.id !== user.id || !data.session.access_token) throw new Error('Entre novamente para processar o preço.');
  const response = await fetch('/api/magazord/price', { method: 'POST', credentials: 'same-origin', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}`, 'x-isbn-store-id': user.storeId },
    body: JSON.stringify({ action, registrationId, price }) });
  const result = await response.json();
  if (!response.ok) {
    const messages: Record<string, string> = {
      invalid_price: 'Informe um preço positivo completo, como 30,00 ou 1.234,56.',
      price_binding_not_configured: 'Vínculo de canal e tabela de preços não configurado para esta loja.',
      registration_not_verified: 'Cadastro Pai/Filho não confirmado para esta sessão e loja.',
      invalid_relationship: 'Vínculo Pai/Filho ou canal não confirmado.',
      price_persistence_not_configured: 'Leitura do cadastro confirmado não configurada no backend.',
      invalid_price_table: 'Tabela de preços não confirmada como ativa.',
    };
    throw new Error(messages[result?.code] || 'Não foi possível verificar o preço. Nenhuma gravação foi enviada.');
  }
  if (result?.status !== 'preview' || result.environment !== 'homologation' || typeof result.writesEnabled !== 'boolean'
    || (result.writesEnabled && !priceUuid(result.operationId)) || result.cents !== expectedCents
    || typeof result.parentCode !== 'string' || typeof result.childCode !== 'string' || !Number.isSafeInteger(result.tableId) || result.tableId <= 0
    || typeof result.tableName !== 'string' || !['ready_for_local_review','existing_price_review_required','ambiguous_price_response'].includes(result.state)
    || result.eligible !== (result.state === 'ready_for_local_review')) throw new Error('Resposta de revisão de preço inválida.');
  return result;
}

/** Same operation UUID for sending and read-only reconciliation; never retry automatically. */
export async function submitMagazordPrice(registrationId: string, price: string, operationId: string, user: User, reconcile = false) {
  const cents = priceCents(price);
  if (!priceUuid(operationId) || !priceUuid(registrationId) || !priceUuid(user.storeId) || !user.active) throw new Error('Operação de preço inválida.');
  const { supabase } = await import('../lib/supabase');
  const { data, error } = await supabase.auth.getSession();
  if (error || data.session?.user.id !== user.id || !data.session.access_token) throw new Error('Entre novamente para consultar a operação de preço.');
  const response = await fetch('/api/magazord/price', { method: 'POST', credentials: 'same-origin', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}`, 'x-isbn-store-id': user.storeId },
    body: JSON.stringify({ action: reconcile ? 'reconcile' : 'send', registrationId, price, operationId }) });
  const result = await response.json();
  if (!response.ok) {
    const messages: Record<string, string> = {
      price_writes_disabled: 'Envio de preço bloqueado no backend.',
      price_persistence_unavailable: 'Diário de preço indisponível. Não inicie outra operação.',
      price_reserved: 'Código e tabela reservados por outra operação de preço. Revisão necessária.',
      price_payload_changed: 'A operação preservada possui dados diferentes. Não altere a chave ou o preço.',
      existing_price_review_required: 'Preço ou preço antigo existente. Gravação bloqueada para revisão.',
      ambiguous_price_response: 'Resposta de preço ambígua. Consulte a operação sem reenviar.',
      price_not_started: 'Não há intenção de envio confirmada nesta operação.',
    };
    throw new Error(messages[result?.code] || 'Preço não confirmado. Preserve os dados e consulte o estado, sem reenviar.');
  }
  if (result?.status !== 'verified' || result.stage !== 'price_verified' || result.operationId !== operationId
    || result.cents !== cents || typeof result.childCode !== 'string' || !Number.isSafeInteger(result.tableId))
    throw new Error('Preço não confirmado. Consulte o estado, sem reenviar.');
  return result as { status: 'verified'; operationId: string; stage: 'price_verified'; childCode: string; tableId: number; cents: number };
}
