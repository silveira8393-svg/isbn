import { useState } from 'react';
import type { User } from '../../types';
import { imageReferences } from '../../utils/imageUrls';
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
 const images=imageReferences([...references,...selected]).slice(0,20);
 async function lookup(){
  if(busy||!user.active)return;
  setBusy(true);onBusy?.(true);setMessage('');setFound(null);
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
    onClick={()=>{setFound(null);setSelected([]);setMessage('');}}>Selecionar outro cadastro</button>}
  {message&&<p className="text-sm" role="status">{message}</p>}
  {found&&<>
   <p className="text-sm">Imagens disponíveis no formulário: {images.length}</p>
   <div className="flex flex-wrap gap-2">
    <input className="min-w-64 flex-1 rounded border p-2 text-sm" value={extraUrl} onChange={e=>setExtraUrl(e.target.value)}
      placeholder="URL HTTPS de capa (opcional)" aria-label="URL de imagem para homologação"/>
    <button className="rounded border px-3 py-2 text-sm" type="button" onClick={addImage} disabled={!extraUrl.trim()}>
      Incluir URL
    </button>
   </div>
   <MagazordMedia key={found.registrationId} registrationId={found.registrationId}
     childCode={found.childCode} references={images} user={user} onBusy={onBusy}/>
  </>}
 </section>;
}
