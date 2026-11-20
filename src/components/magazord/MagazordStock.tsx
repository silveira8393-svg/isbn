import {useEffect,useRef,useState} from 'react';
import type {User} from '../../types';
import {magazordStock} from '../../services/magazordStock';

export default function MagazordStock({registrationId,childCode,quantity,user,onBusy}:{
  registrationId:string;childCode:string;quantity:number;user:User;onBusy?:(value:boolean)=>void;
}) {
  const identity=JSON.stringify([registrationId,childCode,quantity,user.id,user.storeId]);
  const current=useRef(identity);current.current=identity;
  const attempted=useRef<string|null>(null);
  const locked=useRef(false);
  const [busy,setBusy]=useState(false);
  const [view,setView]=useState<{identity:string;message:string;verified:boolean}|null>(null);
  const visible=view?.identity===identity?view:null;
  async function process(reconcileOnly=false) {
    if (locked.current||!user.active||current.current!==identity) return;
    locked.current=true;setBusy(true);onBusy?.(true);
    try {
      const prepared=await magazordStock('prepare',registrationId,quantity,user);
      if (current.current!==identity)return;
      if (prepared.childCode!==childCode)throw new Error('Produto Filho divergente. Estoque bloqueado.');
      // No second POST for any journaled operation, even when the last response was lost.
      const reconcile=reconcileOnly||prepared.stage!=='not_started';
      if (!reconcile && attempted.current===identity)return;
      attempted.current=identity;
      const result=await magazordStock(reconcile?'reconcile':'send',registrationId,quantity,user,prepared.operationId);
      if(result.childCode!==childCode)throw new Error('Produto Filho divergente. Estoque não confirmado.');
      if(current.current===identity)setView({identity,verified:true,message:'Estoque confirmado na Magazord: '+quantity+' unidade(s), depósito '+result.depositId+'.'});
    } catch(error){
      if(current.current===identity)setView({identity,verified:false,message:error instanceof Error?error.message:'Resultado incerto. Não reenvie o estoque.'});
    }finally{locked.current=false;setBusy(false);onBusy?.(false);}
  }
  useEffect(()=>{current.current=identity;void process();return()=>{current.current='';};},[identity]);
  return <section className="space-y-2 rounded border p-3" aria-label="Estoque em homologação">
    <h4 className="font-bold">Estoque inicial</h4>
    <p>Filho: {childCode}. Quantidade: {quantity}.</p>
    <p role="status">{busy?'Processando a entrada de estoque...':visible?.message}</p>
    <button type="button" disabled={busy||!user.active} onClick={()=>void process(true)}
      className="rounded border px-3 py-2">Consultar estado do estoque (sem reenvio)</button>
  </section>;
}
