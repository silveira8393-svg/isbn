import type { User } from '../types';
import { priceUuid } from '../../shared/magazordPrice';

export type MediaStage='not_started'|'prepared'|'upload_started'|'uploaded'|'link_started'|'linked';
export type MediaResult={
 status:'prepared'|'uploaded'|'linked';stage:MediaStage;operationId:string;
 childCode:string;position:number;
};
export async function magazordMedia(
 action:'prepare'|'upload'|'link'|'status',
 registrationId:string, position:number, reference:string, user:User, operationId?:string
):Promise<MediaResult>{
 if(!priceUuid(registrationId)||!user.active||!priceUuid(user.storeId)||
  !Number.isInteger(position)||position<0||position>19||typeof reference!=='string'||!reference||reference.length>2048)
  throw new Error('Imagem ou operação inválida.');
 const {supabase}=await import('../lib/supabase');
 const {data,error}=await supabase.auth.getSession();
 if(error||data.session?.user.id!==user.id||!data.session.access_token)
  throw new Error('Entre novamente para enviar a imagem.');
 const response=await fetch('/api/magazord/price?media=1',{method:'POST',redirect:'error',
  credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(30000),
  headers:{'Content-Type':'application/json','Authorization':'Bearer '+data.session.access_token,
   'x-isbn-store-id':user.storeId},
  body:JSON.stringify({action,registrationId,position,reference,
   ...(action==='prepare'?{}:{operationId})})
 });
 let result:any;
 try{result=await response.json()}catch{throw new Error('Resposta da imagem desconhecida. Não repita o envio.');}
 if(!response.ok){
  const messages:Record<string,string>={
   homologation_only:'Imagens permitidas somente na homologação.',
   registration_not_verified:'Pai e Filho ainda não foram confirmados.',
   media_payload_changed:'A imagem desta posição já foi reservada com outros dados. Não substitua.',
   media_outcome_uncertain:'Resultado incerto. Não reenvie; verifique o Banco de Mídias antes de reconciliar.',
   previous_media_not_linked:'Associe primeiro as imagens anteriores, na ordem definida.',
   media_source_invalid:'Arquivo inválido ou formato não aceito.',
   media_source_unavailable:'Imagem não pode ser obtida. Preserve a operação para revisão.',
   media_source_denied:'Foto privada não pertence ao cadastro autenticado.',
   media_source_too_large:'Imagem maior que o limite de 5 MiB.',
   media_operation_in_progress:'Operação já iniciada. Não envie novamente.',
   media_persistence_unavailable:'Registro persistente indisponível. Não envie novamente.',
  };
  throw new Error(messages[result?.code]||'Não foi possível confirmar a imagem. Não reenvie sem verificar o estado.');
 }
 if(!priceUuid(result?.operationId)||result.position!==position||typeof result.childCode!=='string'||
  !['prepared','uploaded','linked'].includes(result.status)||
  !['not_started','prepared','upload_started','uploaded','link_started','linked'].includes(result.stage)||
  (action!=='prepare'&&result.operationId!==operationId))
  throw new Error('Confirmação da imagem inválida. Não repita o envio.');
 return result as MediaResult;
}
