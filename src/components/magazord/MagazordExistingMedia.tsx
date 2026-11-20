import { Fragment, useEffect, useState } from 'react';
import type { User } from '../../types';
import { imageReferences, prepareLocalBookImage, uploadLocalBookImage, type LocalBookImage } from '../../utils/imageUrls';
import { supabase, supabaseUrl } from '../../lib/supabase';
import { lookupMagazordMedia } from '../../services/magazordMedia';
import MagazordMedia from './MagazordMedia';

/** Recovery across Preview URLs: only ISBN journal reads; never recatalog a Magazord product. */
export default function MagazordExistingMedia({user,references,onBusy}:{
 user:User;references:string[];onBusy?:(busy:boolean)=>void;
}){
 const [parent,setParent]=useState('');
 const [child,setChild]=useState('');
 const [found,setFound]=useState<{registrationId:string;parentCode:string;childCode:string}|null>(null);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [extraUrl,setExtraUrl]=useState('');
 const [selected,setSelected]=useState<string[]>([]);
 const [pending,setPending]=useState<(LocalBookImage & { preview:string })|null>(null);
 const [localBusy,setLocalBusy]=useState(false);
 const [localMessage,setLocalMessage]=useState('');
 useEffect(()=>()=>{if(pending)URL.revokeObjectURL(pending.preview);},[pending]);
 const clearPending=()=>{setPending(null);setLocalMessage('');};
 async function chooseLocal(file:File|undefined){
  if(!file||localBusy||!found)return;
  setLocalMessage('');
  try{
   if(file.type!=='image/jpeg')throw new Error('Para este teste, selecione uma imagem JPEG (.jpg).');
   const prepared=await prepareLocalBookImage(file);
   setPending({...prepared,preview:URL.createObjectURL(file)});
  }catch(error){setLocalMessage(error instanceof Error?error.message:'Imagem inválida.');}
 }
 async function confirmLocal(){
  if(!pending||!found||localBusy||!user.active)return;
  const source=pending,registration=found.registrationId,identity=user.id+':'+user.storeId;
  setLocalBusy(true);onBusy?.(true);setLocalMessage('');
  try{
   const url=await uploadLocalBookImage(source,user,{client:supabase,projectUrl:supabaseUrl});
   // Never assign a private file to a different account or registration after a navigation.
   if(found.registrationId!==registration||user.id+':'+user.storeId!==identity)return;
   setSelected(current=>imageReferences([...current,url]).slice(0,20));
   clearPending();
   setLocalMessage('JPEG armazenado no Supabase privado. Nenhum upload foi feito à Magazord.');
  }catch(error){setLocalMessage(error instanceof Error?error.message:'Falha ao armazenar a imagem.');}
  finally{setLocalBusy(false);onBusy?.(false)}
 }
 const images=imageReferences([...references,...selected]).slice(0,20);
 async function lookup(){
  if(busy||!user.active)return;
  setBusy(true);onBusy?.(true);setMessage('');setFound(null);
  setSelected([]);setExtraUrl('');clearPending();
  try{
   const result=await lookupMagazordMedia(parent,child,user);
   setFound(result);setMessage('Cadastro confirmado no diário ISBN. Selecione e prepare as imagens abaixo.');
  }catch(error){setMessage(error instanceof Error?error.message:'Cadastro não localizado.');}
  finally{setBusy(false);onBusy?.(false)}
 }
 function addImage(){
  try{
   const url=new URL(extraUrl);
   if(url.protocol!=='https:'&&!(url.protocol==='http:'&&url.hostname==='books.google.com'))
    throw new Error('Use uma URL HTTPS de imagem.');
   if(url.username||url.password||url.hash)throw new Error('URL inválida.');
   setSelected(current=>imageReferences([...current,url.href]).slice(0,20));setExtraUrl('');
  }catch{setMessage('Informe uma URL válida de capa ou foto. Algumas fontes externas exigirão upload local.');}
 }
 return <section className="space-y-3 rounded border border-slate-300 p-3" aria-label="Retomar imagens de produto existente">
  <h4 className="font-bold">Retomar imagens de livro já homologado</h4>
  <p className="text-sm">Utilize os códigos Pai e Filho confirmados anteriormente. Esta consulta acessa apenas o diário ISBN, sem criar outro produto e sem consultar a Magazord.</p>
  <div className="flex flex-wrap gap-2">
   <label className="text-sm">Código Pai
    <input className="block rounded border p-2" value={parent} disabled={busy||!!found}
      onChange={e=>setParent(e.target.value)} placeholder="Ex.: LVP013"/>
   </label>
   <label className="text-sm">Código Filho
    <input className="block rounded border p-2" value={child} disabled={busy||!!found}
      onChange={e=>setChild(e.target.value)} placeholder="Ex.: 9788532530837"/>
   </label>
  </div>
  {!found?<button type="button" className="rounded border px-3 py-2 text-sm"
    disabled={busy||!parent.trim()||!child.trim()} onClick={()=>void lookup()}>
    {busy?'Consultando o diário...':'Localizar cadastro homologado'}
   </button>:<button type="button" disabled={busy} className="rounded border px-3 py-2 text-sm"
    onClick={()=>{setFound(null);setSelected([]);setExtraUrl('');clearPending();setMessage('');}}>Selecionar outro cadastro</button>}
  {message&&<p className="text-sm" role="status">{message}</p>}
  {found&&<Fragment key={found.registrationId}>
   <p className="text-sm">Imagens disponíveis no formulário: {images.length}</p>
   <div className="flex flex-wrap gap-2">
    <input className="min-w-64 flex-1 rounded border p-2 text-sm" value={extraUrl} onChange={e=>setExtraUrl(e.target.value)}
      placeholder="URL HTTPS de capa (opcional)" aria-label="URL de imagem para homologação"/>
    <button className="rounded border px-3 py-2 text-sm" type="button" onClick={addImage} disabled={!extraUrl.trim()}>
      Incluir URL
    </button>
   </div>
   <div className="space-y-2 rounded border border-slate-200 bg-white p-3">
    <p className="text-sm font-semibold">Imagem do computador — teste JPEG</p>
    <p className="text-xs text-slate-600">Selecione um JPG de até 5 MiB. A confirmação abaixo guarda a foto no Supabase privado; não envia para a Magazord.</p>
    <label className="inline-flex cursor-pointer items-center rounded border border-slate-300 px-3 py-2 text-sm">
     Selecionar imagem JPG
     <input type="file" accept=".jpg,.jpeg,image/jpeg" className="sr-only" disabled={localBusy||!user.active}
      aria-label="Selecionar imagem JPG do computador"
      onChange={event=>{const file=event.target.files?.[0];event.target.value='';void chooseLocal(file);}}/>
    </label>
    {pending&&<div className="space-y-2">
     <img src={pending.preview} alt="Prévia do JPEG selecionado" className="max-h-48 max-w-40 rounded border object-contain"/>
     <p className="break-all text-xs">{pending.file.name}</p>
     <div className="flex flex-wrap gap-2">
      <button type="button" disabled={localBusy} className="rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50" onClick={()=>void confirmLocal()}>
       {localBusy?'Armazenando...':'Confirmar imagem no Supabase (sem Magazord)'}
      </button>
      <button type="button" disabled={localBusy} className="rounded border px-3 py-2 text-sm" onClick={clearPending}>Cancelar</button>
     </div>
    </div>}
    {localMessage&&<p role="status" className="text-sm">{localMessage}</p>}
    {found.parentCode==='LVP013'&&found.childCode==='9788532530837'&&
     <p className="text-xs text-amber-800">Atenção: a primeira imagem de LVP013 já possui uma operação incerta e não pode ser reenviada, mesmo com outro arquivo.</p>}
   </div>
   <MagazordMedia registrationId={found.registrationId}
     childCode={found.childCode} references={images} user={user} onBusy={onBusy}/>
  </Fragment>}
 </section>;
}
