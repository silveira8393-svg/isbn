import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
const built=await build({stdin:{resolveDir:process.cwd(),contents:`export {default} from './src/components/magazord/MagazordPrice';`},bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',plugins:[{name:'price-ui-fixture',setup(b){
  b.onResolve({filter:/^react$/},()=>({path:'react',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'module.exports=deps.react'}));
  b.onResolve({filter:/^react\/jsx-runtime$/},()=>({path:'jsx',namespace:'jsx'}));b.onLoad({filter:/.*/,namespace:'jsx'},()=>({contents:'exports.jsx=exports.jsxs=(type,props)=>({type,props})'}));
  b.onResolve({filter:/\/services\/magazordPrice$/},()=>({path:'service',namespace:'service'}));b.onLoad({filter:/.*/,namespace:'service'},()=>({contents:'exports.prepareMagazordPrice=(...args)=>deps.preview(...args,"prepare");exports.submitMagazordPrice=(...args)=>deps.submit(...args)'}));
}}]});
const user={id:'11111111-1111-4111-8111-111111111111',storeId:'22222222-2222-4222-8222-222222222222',active:true};
const registrationId='33333333-3333-4333-8333-333333333333';
const operationId='44444444-4444-4444-8444-444444444444';
const result={status:'preview',environment:'homologation',writesEnabled:false,parentCode:'FIXTURE-P',childCode:'FIXTURE-C',tableId:1,tableName:'Tabela fixture',cents:3000,eligible:true,state:'ready_for_local_review',payload:[{produto:'FIXTURE-C',tabelaPreco:1,precoVenda:30}]};
function harness(preview,submit,storage=new Map()){
  const slots=[],deps={preview,submit},props={registrationId,parentCode:'FIXTURE-P',childCode:'FIXTURE-C',price:'30,00',user:{...user}};let cursor=0,tree,effects=[];
  deps.react={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],v=>slots[i]=v];},useRef(initial){const i=cursor++;return slots[i]??={current:initial};},useEffect(fn,ds){const i=cursor++;if(!slots[i]||ds.some((d,n)=>d!==slots[i][n])){slots[i]=ds;effects.push(fn);}}};
  const module={exports:{}},sessionStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
  new Function('deps','module','exports','sessionStorage',built.outputFiles[0].text)(deps,module,module.exports,sessionStorage);
  const render=()=>{cursor=0;effects=[];tree=module.exports.default(props);effects.forEach(fn=>fn());};
  const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];
  render();return{props,render,storage,button:text=>nodes(tree).find(n=>n.type==='button'&&String(n.props.children).includes(text)),text:()=>JSON.stringify(tree)};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const released=()=>({...result,writesEnabled:true,operationId});
const confirmed=()=>({status:'verified',stage:'price_verified',operationId,childCode:'FIXTURE-C',tableId:1,cents:3000});

test('verified registration automatically sends original price without manual review or second entry',async()=>{
  const calls=[];
  const h=harness(async(id,price,actor,action)=>{calls.push(action);assert.equal(id,registrationId);assert.equal(price,'30,00');assert.equal(actor.id,user.id);return released();},async(id,price,key,actor,reconcile)=>{calls.push('send');assert.equal(price,'30,00');assert.equal(key,operationId);assert.equal(reconcile,false);return confirmed();});
  await settle();h.render();h.render();assert.deepEqual(calls,['prepare','send']);assert.equal(h.props.price,'30,00');
  assert.ok(h.text().includes('Preço confirmado na Magazord'));assert.equal(h.button('Revisar'),undefined);assert.equal(h.button('Enviar'),undefined);
});

test('missing authorization, existing prices, ambiguous results and wrong identities/tables never send',async()=>{
  for(const changes of [{writesEnabled:false},{eligible:false,state:'existing_price_review_required'},{eligible:false,state:'ambiguous_price_response'},{tableId:2},{childCode:'OTHER'},{parentCode:'OTHER'},{cents:1200}]){
    let sends=0;const h=harness(async()=>({...released(),...changes}),async()=>{sends++;});await settle();h.render();assert.equal(sends,0);assert.equal(h.props.price,'30,00');
  }
});

test('uncertain attempts survive remounts and allow reconciliation only without automatic resend',async()=>{
  let sends=0,reads=0,finish;
  const submit=async(id,price,key,actor,reconcile)=>{assert.equal(price,'30,00');assert.equal(key,operationId);if(reconcile){reads++;return confirmed();}sends++;return new Promise((resolve,reject)=>finish=()=>reject(new Error('Resultado incerto')));};
  const h=harness(async()=>released(),submit);await settle();h.render();h.button('Consultar estado').props.onClick();assert.equal(sends,1);assert.equal(reads,0);
  finish();await settle();h.render();assert.ok(h.text().includes('Resultado incerto'));h.render();assert.equal(sends,1);
  const reload=harness(async()=>{throw Error('Reload must use persisted operation');},submit,h.storage);await settle();reload.render();assert.equal(sends,1);assert.equal(reads,1);assert.ok(reload.text().includes('Preço confirmado'));
  reload.button('Consultar estado').props.onClick();await settle();assert.equal(reads,2);assert.equal(sends,1);
  reload.props.price='40,00';reload.render();await settle();reload.render();assert.equal(sends,1);assert.equal(reads,2);assert.ok(reload.text().includes('dados diferentes'));
});

test('storage failures and changed sessions prevent automatic writes',async()=>{
  let sends=0;const submit=async()=>{sends++;return confirmed();};
  const storage=new Map();storage.set=()=>{throw Error('Storage unavailable');};
  const failed=harness(async()=>released(),submit,storage);await settle();failed.render();assert.equal(sends,0);assert.ok(failed.text().includes('Storage unavailable'));
  let finish;const changed=harness(async()=>new Promise(resolve=>finish=resolve),submit);await settle();changed.props.user={...user,active:false};changed.render();finish(released());await settle();assert.equal(sends,0);
});

test('read-only status never turns a failed safety check into a send',async()=>{
  let sends=0,reads=0;
  const h=harness(async()=>({...released(),eligible:false,state:'existing_price_review_required'}),async(id,price,key,actor,reconcile)=>{if(reconcile)reads++;else sends++;return confirmed();});
  await settle();h.render();h.button('Consultar estado').props.onClick();await settle();assert.equal(sends,0);assert.equal(reads,1);
});

test('price is mounted after verified registration and uses frozen operator value',async()=>{
  const source=await readFile('src/components/magazord/MagazordRealRegistration.tsx','utf8');assert.match(source,/verified && user && operation.current && operation.current.identity === identity && <MagazordPrice/);
  assert.match(source,/registrationId=\{operation.current.id\}/);assert.match(source,/price=\{operation.current.price \?\? ''\}/);assert.match(source,/identity, price: draft.price/);
});

test('client transmits only preview, original price and registration ID with the active session',async()=>{
  const bundle=await build({stdin:{resolveDir:process.cwd(),contents:`export * from './src/services/magazordPrice';`},bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'session-fixture',setup(b){
    b.onResolve({filter:/\/lib\/supabase$/},()=>({path:'session',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`exports.supabase={auth:{getSession:async()=>({data:{session:{user:{id:'${user.id}'},access_token:'fixture-session'}}})}};`}));
  }}]});
  const calls=[],module={exports:{}};
  new Function('module','exports','fetch',bundle.outputFiles[0].text)(module,module.exports,async(url,init)=>{
    calls.push({url,init});const input=JSON.parse(init.body);
    return Response.json(['preview','prepare'].includes(input.action)?result:{status:'verified',stage:'price_verified',operationId:input.operationId,childCode:'FIXTURE-C',tableId:1,cents:3000});
  });
  assert.equal((await module.exports.previewMagazordPrice(registrationId,'30,00',user)).writesEnabled,false);
  assert.deepEqual(JSON.parse(calls[0].init.body),{action:'preview',registrationId,price:'30,00'});assert.equal(calls[0].init.headers['x-isbn-store-id'],user.storeId);
  assert.equal(calls[0].init.headers.Authorization,'Bearer fixture-session');assert.equal(calls[0].init.redirect,'error');
  await assert.rejects(module.exports.previewMagazordPrice(registrationId,'30,',user),{message:'Informe um preço positivo completo, como 30,00 ou 1.234,56.'});assert.equal(calls.length,1);
  await module.exports.prepareMagazordPrice(registrationId,'30,00',user);
  assert.deepEqual(JSON.parse(calls.at(-1).init.body),{action:'prepare',registrationId,price:'30,00'});
  assert.ok(!bundle.outputFiles[0].text.includes('MAGAZORD_HOMOLOGATION_PRICES'));
  const key='44444444-4444-4444-8444-444444444444';
  for(const reconcile of [false,true]){
    assert.equal((await module.exports.submitMagazordPrice(registrationId,'30,00',key,user,reconcile)).stage,'price_verified');
    assert.deepEqual(JSON.parse(calls.at(-1).init.body),{action:reconcile?'reconcile':'send',registrationId,price:'30,00',operationId:key});
  }
});
