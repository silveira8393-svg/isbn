import { useEffect, useRef, useState } from 'react';
import type { User } from '../../types';
import { imageReferences } from '../../utils/imageUrls';
import { magazordMedia, type MediaResult, type MediaStage } from '../../services/magazordMedia';

/** Manual-only upload. Registration journal supplies verified Pai/Filho; never re-checks Magazord. */
export default function MagazordMedia({ registrationId, childCode, references, user, onBusy }:{
 registrationId:string;childCode:string;references:string[];user:User;onBusy?:(busy:boolean)=>void;
}){
 // Google Books sometimes returns HTTP links for a service that supports HTTPS.
 // Upgrade only this known provider; arbitrary HTTP image sources remain blocked.
 const images=imageReferences(references).slice(0,20).map(ref=>{
  const url=new URL(ref);
  if(url.protocol==='http:'&&url.hostname==='books.google.com'){url.protocol='https:';return url.href;}
  return ref;
 });
 const frozenKey='isbn-magazord-media:v1:'+user.id+':'+user.storeId+':'+registrationId;
 const [frozen,setFrozen]=useState<string[]|null>(()=>{
  try{const saved=JSON.parse(sessionStorage.getItem(frozenKey)||'null');
   return Array.isArray(saved)&&saved.every((v:unknown)=>typeof v==='string')?saved:null;
  }catch{return null}
 });
 const chosen=frozen??images;
 const [position,setPosition]=useState(0);
 const [stage,setStage]=useState<MediaStage>('not_started');
 const [operationId,setOperationId]=useState('');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const locked=useRef(false);
 const key=JSON.stringify([registrationId,childCode,user.id,user.storeId,position,chosen[position]]);
 const current=useRef(key);current.current=key;
 const target=chosen[position];
 async function run(action:'prepare'|'upload'|'link'|'status') {
  if(locked.current||!target||!user.active)return;
  locked.current=true;setBusy(true);onBusy?.(true);setMessage('');
  try{
   if(action==='prepare'&&frozen===null){
    // Once a first operation is prepared, the selection and order cannot change.
    sessionStorage.setItem(frozenKey,JSON.stringify(images));setFrozen(images);
   }
   const result:MediaResult=await magazordMedia(action,registrationId,position,target,user,
     action==='prepare'?undefined:operationId);
   if(current.current!==key)return;
   if(result.childCode!==childCode)throw new Error('Produto Filho divergente. Operação bloqueada.');
   setOperationId(result.operationId);setStage(result.stage);
   if(result.stage==='linked')setMessage('Imagem '+(position+1)+' associada ao Filho, confirmada na Magazord.');
   else if(result.stage==='uploaded')setMessage('Upload confirmado. Clique em Associar imagem ao Filho.');
   else if(result.stage==='upload_started'||result.stage==='link_started')
    setMessage('Operação iniciada com resultado incerto. Não reenviar; solicite reconciliação.');
   else setMessage('Imagem preparada. Nenhuma escrita remota foi realizada.');
  }catch(error){
   if(current.current===key){
    // Never leave the "upload" or "link" button visible after an ambiguous attempt.
    // A status-only read can restore the exact persisted stage later.
    if(action==='upload')setStage('upload_started');
    if(action==='link')setStage('link_started');
    setMessage(error instanceof Error?error.message:'Resultado desconhecido. Não reenviar.');
   }
  }finally{locked.current=false;setBusy(false);onBusy?.(false)}
 }
 // A new position only reads the existing journal; no external calls or automatic writes.
 useEffect(()=>{setStage('not_started');setOperationId('');setMessage('');},[key]);
 const uncertain=stage==='upload_started'||stage==='link_started';
 return <section className="space-y-3 rounded border p-3" aria-label="Imagens em homologação">
  <h4 className="font-bold">Imagens — homologação</h4>
  <p className="text-sm">Produto Filho: {childCode}. Somente envio manual; a primeira imagem é tratada como capa na ordem selecionada.</p>
  {chosen.length===0?<p className="text-sm">Nenhuma imagem selecionada neste cadastro. Selecione uma capa no formulário antes de confirmar a operação.</p>:<>
   <p className="text-sm">Imagem {position+1} de {chosen.length}</p>
   <p className="text-xs break-all">Referência: {target}</p>
   <p className="text-sm" role="status">{busy?'Processando...':message||'Use Preparar imagem para consultar o diário antes de enviar.'}</p>
   <div className="flex flex-wrap gap-2">
    {(!operationId||stage==='not_started')&&<button type="button" disabled={busy||!user.active}
      onClick={()=>void run('prepare')} className="rounded border px-3 py-2 text-sm">Preparar imagem (sem envio)</button>}
    {operationId&&['not_started','prepared'].includes(stage)&&<button type="button" disabled={busy}
      onClick={()=>void run('upload')} className="rounded bg-amber-700 px-3 py-2 text-sm text-white">Confirmar upload desta imagem</button>}
    {operationId&&stage==='uploaded'&&<button type="button" disabled={busy}
      onClick={()=>void run('link')} className="rounded bg-amber-700 px-3 py-2 text-sm text-white">Associar imagem ao Filho</button>}
    {operationId&&<button type="button" disabled={busy} onClick={()=>void run('status')}
      className="rounded border px-3 py-2 text-sm">Consultar estado (sem reenvio)</button>}
    {stage==='linked'&&position+1<chosen.length&&<button type="button" disabled={busy}
      onClick={()=>setPosition(i=>i+1)} className="rounded border px-3 py-2 text-sm">Próxima imagem</button>}
   </div>
   {uncertain&&<p className="text-sm text-amber-700">Resultado incerto: o sistema bloqueou novas tentativas de escrita. Verifique o Banco de Mídias na homologação.</p>}
   {stage==='linked'&&position===chosen.length-1&&<p className="text-sm font-semibold">Todas as imagens selecionadas foram associadas.</p>}
  </>}
 </section>;
}
