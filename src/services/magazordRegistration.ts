import type { User } from '../types';
import type { RegistrationInput } from '../../shared/magazordRegistration';
import { registrationValidationMessage } from '../../shared/magazordRegistration.js';

export async function submitMagazordRegistration(action: 'preview' | 'create', operationId: string, input: RegistrationInput, user: User) {
  const { supabase } = await import('../lib/supabase');
  const { data, error } = await supabase.auth.getSession();
  if (!user.active || !user.storeId || error || data.session?.user.id !== user.id) throw new Error('Entre novamente na loja para continuar.');
  const response = await fetch('/api/magazord/registration', { method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
    signal: AbortSignal.timeout(55000), headers: { 'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session.access_token}`, 'x-isbn-store-id': user.storeId }, body: JSON.stringify({ action, operationId, input }) });
  const result = await response.json();
  if (!response.ok) {
    const validationMessage = result.code === 'invalid_registration' ? registrationValidationMessage(result.fields) : undefined;
    if (validationMessage) throw new Error(validationMessage);
    const messages: Record<string, string> = {
      homologation_only: 'Cadastro real permitido somente na homologação. Produção bloqueada.',
      commercial_code_conflict: 'Código Pai ou Filho já utilizado. Confira os códigos comerciais; o ISBN pode se repetir.',
      code_reserved: 'Código comercial reservado por outra operação. Reconcilie a operação anterior antes de continuar.',
      operation_payload_changed: 'Os dados desta operação mudaram. Preserve os dados e reconcilie os códigos antes de iniciar outra operação.',
      invalid_registration: 'Confira os códigos (até 25 caracteres), título (até 100), origem fiscal e IDs obrigatórios.',
      invalid_catalog_reference: 'Marca, categoria ou loja/canal não confirmados na homologação.',
      journal_not_configured: 'Diário persistente não configurado no backend. Nenhuma nova criação foi iniciada.',
      journal_unavailable: 'Diário persistente indisponível. O resultado anterior deve ser reconciliado antes de continuar.',
    };
    throw new Error(messages[result.code] || 'Cadastro não confirmado. Mantenha os dados e use “Consultar estado / continuar”; não troque os códigos de uma operação parcial.');
  }
  if (result.environment !== 'homologation' || result.status !== (action === 'preview' ? 'preview' : 'verified')
    || (action === 'create' && (result.parentCode !== input.parentCode || result.childCode !== input.childCode)))
    throw new Error('Resposta sem confirmação válida. Preserve os dados e consulte o estado da operação.');
  return result;
}
