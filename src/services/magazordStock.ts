import type { User } from '../types';
import { priceUuid } from '../../shared/magazordPrice';

export type StockResponse =
  | { status:'prepared'; operationId:string; stage:'not_started'|'prepared'|'stock_started'|'stock_verified'; childCode:string; quantity:number; depositId:number; environment:'homologation' }
  | { status:'verified'; operationId:string; stage:'stock_verified'; childCode:string; quantity:number; depositId:number };

export async function magazordStock(action:'prepare'|'send'|'reconcile', registrationId:string, quantity:number, user:User, operationId?:string):Promise<StockResponse> {
  if (!priceUuid(registrationId) || !user.active || !priceUuid(user.storeId) || !Number.isSafeInteger(quantity) || quantity<=0 || quantity>100000)
    throw new Error('Quantidade ou cadastro inválido.');
  const {supabase}=await import('../lib/supabase');
  const {data,error}=await supabase.auth.getSession();
  if (error || data.session?.user.id!==user.id || !data.session.access_token)
    throw new Error('Entre novamente para processar o estoque.');
  const response=await fetch('/api/magazord/stock',{method:'POST',redirect:'error',credentials:'same-origin',cache:'no-store',
    signal:AbortSignal.timeout(30000),headers:{'Content-Type':'application/json',
      Authorization:'Bearer '+data.session.access_token,'x-isbn-store-id':user.storeId},
    body:JSON.stringify({action,registrationId,quantity,...(action==='prepare'?{}:{operationId})})});
  const result=await response.json();
  if (!response.ok) {
    const messages:Record<string,string>={
      stock_not_configured:'Depósito de estoque não configurado para esta loja.',
      stock_persistence_unavailable:'Diário de estoque indisponível. Não reenviar a operação.',
      stock_payload_changed:'A quantidade da operação está preservada. Não altere nem reenvie.',
      stock_operation_in_progress:'Entrada de estoque já iniciada. Não reenviar.',
      stock_outcome_uncertain:'Resultado do estoque incerto. Verifique no painel Magazord; não faça outra entrada.',
      price_not_verified:'É necessário confirmar o preço antes do estoque.',
      registration_not_verified:'Cadastro do livro ainda não confirmado.',
    };
    throw new Error(messages[result?.code]||'Estoque não confirmado. Não reenviar automaticamente.');
  }
  if (!priceUuid(result?.operationId)||result.childCode===undefined||result.quantity!==quantity
    || !Number.isSafeInteger(result.depositId)||result.depositId<=0
    || (action==='prepare'?(result.status!=='prepared'||result.environment!=='homologation'||!['not_started','prepared','stock_started','stock_verified'].includes(result.stage))
      :(result.status!=='verified'||result.stage!=='stock_verified'||result.operationId!==operationId)))
    throw new Error('Resposta do estoque inesperada. Não reenviar automaticamente.');
  return result as StockResponse;
}
