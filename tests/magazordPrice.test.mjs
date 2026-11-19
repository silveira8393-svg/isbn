import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { mfaToken } from './helpers/mfa.mjs';
const built=await build({stdin:{resolveDir:process.cwd(),contents:`export * from './shared/magazordPrice';export * from './server/magazordPrice';export * from './server/magazordPriceStore';export * from './server/magazordPriceOperation';`},bundle:true,write:false,platform:'node',format:'esm'});
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const actor='11111111-1111-4111-8111-111111111111',store='22222222-2222-4222-8222-222222222222',registration='33333333-3333-4333-8333-333333333333';
const base=api.PRICE_HOMOLOGATION,env={MAGAZORD_BASE_URL:base,MAGAZORD_API_USER:'fixture-token',MAGAZORD_API_PASSWORD:'fixture-password',
  MAGAZORD_STORE_ID:store,MAGAZORD_HOMOLOGATION_CHANNELS:JSON.stringify({[store]:1}),MAGAZORD_HOMOLOGATION_PRICES:JSON.stringify({[store]:{channelId:1,tableId:1}}),
  SUPABASE_URL:'https://auth.invalid',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_fixture'};
const row={id:registration,store_id:store,actor_id:actor,parent_code:'FIXTURE-P',child_code:'FIXTURE-C',stage:'verified'};
const priceId='44444444-4444-4444-8444-444444444444';
const request=(changes={},headers={})=>new Request('https://isbn.invalid/api/magazord/price',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+mfaToken(actor),'x-isbn-store-id':store,...headers},body:JSON.stringify({action:'preview',registrationId:registration,price:'30,00',...changes})});
function backend(flags={}){
  const calls=[],configured={...env,...(flags.enable ? {MAGAZORD_HOMOLOGATION_PRICE_OPERATION_ID:priceId} : {}),...flags.env};
  let saved=null,posted=false;
  const fetcher=async(target,init)=>{
    const url=new URL(target);calls.push({url,init});if(!flags.enable)assert.equal(init.method,'GET','Preview must never write to any service');assert.equal(init.redirect,'error');
    if(url.origin==='https://auth.invalid'){
      if(url.pathname==='/rest/v1/magazord_price_jobs'){
        if(flags.missingJournal)return Response.json({message:'private journal error'},{status:404});
        if(init.method==='GET')return Response.json(url.searchParams.get('limit')==='0'?[]:saved?[{...saved}]:[]);
        if(init.method==='POST'){assert.equal(saved,null);saved=JSON.parse(init.body);return Response.json([{...saved}],{status:201});}
        assert.equal(init.method,'PATCH');
        assert.equal(url.searchParams.get('fingerprint'),'eq.'+saved.fingerprint);
        if(url.searchParams.get('stage')!=='eq.'+saved.stage || flags.casFailure)return Response.json([]);
        saved={...saved,...JSON.parse(init.body)};return Response.json([{...saved}]);
      }
      assert.equal(init.method,'GET','Existing registration and authorization are read-only');
      if(url.pathname==='/auth/v1/user')return flags.authRejected?new Response(null,{status:401}):Response.json({id:actor});
      if(url.pathname==='/rest/v1/profiles')return Response.json([{id:actor,active:!flags.inactive}]);
      if(url.pathname==='/rest/v1/store_users')return Response.json(flags.denied?[]:[{user_id:actor,store_id:configured.MAGAZORD_STORE_ID,role:'operator',active:true}]);
      if(url.pathname==='/rest/v1/stores')return Response.json([{id:configured.MAGAZORD_STORE_ID,active:true}]);
      assert.equal(url.pathname,'/rest/v1/magazord_registration_jobs');
      assert.equal(url.searchParams.get('store_id'),'eq.'+configured.MAGAZORD_STORE_ID);assert.equal(url.searchParams.get('actor_id'),'eq.'+actor);
      assert.equal(init.headers.apikey,'sb_secret_fixture');
      return Response.json([flags.job||{...row,store_id:configured.MAGAZORD_STORE_ID}]);
    }
    assert.equal(url.origin,new URL(base).origin);assert.equal(init.headers.Authorization,'Basic '+Buffer.from('fixture-token:fixture-password').toString('base64'));
    if(url.pathname==='/api/v1/preco'){
      assert.equal(init.method,'POST');assert.equal(saved.stage,'price_started');assert.equal(init.headers['Content-Type'],'application/json');
      assert.deepEqual(JSON.parse(init.body),[{produto:'FIXTURE-C',tabelaPreco:1,precoVenda:30}]);
      if(flags.timeout)throw new DOMException('private network details','TimeoutError');
      if(flags.writeReject)return Response.json({mensagem:'private validation data'},{status:400});
      posted=true;
      if(flags.lostResponse)throw Error('private lost response');
      if(flags.invalidSuccess)return Response.json({sucesso:false,mensagem:'private failure'});
      return Response.json({sucesso:true});
    }
    assert.equal(init.method,'GET');
    if(flags.remoteFailurePath===url.pathname && (!flags.remoteFailureActive || flags.remoteFailureActive===url.searchParams.get('ativo')))
      return new Response('private remote body',{status:403,headers:{'Content-Type':'text/html; charset=utf-8'}});
    if(flags.remoteFailure)return new Response('private remote value',{status:403});
    if(flags.redirect)return new Response(null,{status:302,headers:{location:'https://livrariasul.painel.magazord.com.br/api'}});
    if(url.pathname==='/api/v2/site/produto/FIXTURE-P')return Response.json({status:'success',data:{codigo:'FIXTURE-P',produtoLoja:[{loja:flags.channel||1}]}});
    if(url.pathname==='/api/v2/site/produto/FIXTURE-P/derivacao/FIXTURE-C')return Response.json({status:'success',data:{codigo:flags.wrongChild?'other':'FIXTURE-C',agrupador:'FIXTURE-P',tipoRegistro:'Filho',lojas:[flags.channel||1]}});
    if(url.pathname==='/api/v2/site/tabelaPreco'){
      const id=Number(url.searchParams.get('id'));return Response.json({status:'success',data:{items:[{id,nome:'Tabela fixture',ativa:!flags.inactiveTable}],total:1,page:1,limit:100,has_more:false}});
    }
    assert.equal(url.pathname,'/api/v1/listPreco');assert.equal(url.searchParams.get('produto'),'FIXTURE-C');
    assert.equal(url.searchParams.get('tabelaPreco'),String(flags.tableId||1));
    assert.ok(['0','1'].includes(url.searchParams.get('ativo')));
    if(posted && flags.confirmationFailure)return Response.json({private:'hidden'},{status:403});
    return Response.json(posted && url.searchParams.get('ativo')==='1'?{total:1,data:[priceEntry()]}:flags.pricesByActive?.[url.searchParams.get('ativo')]||flags.prices||{total:0,data:[]});
  };
  return {calls,job:()=>saved,handler:api.createMagazordPriceFunction({env:configured,fetcher})};
}
const priceEntry=(changes={})=>({produto:'FIXTURE-C',tabelaPreco:1,anuncio:null,precoVenda:30,precoAntigo:null,...changes});

const sendRequest=(changes={},headers={})=>request({action:'send',operationId:priceId,...changes},headers);
const remotePosts=f=>f.calls.filter(c=>c.url.pathname==='/api/v1/preco');
test('connected send persists intention, posts only the child and verifies by GET without resending',async()=>{
  const f=backend({enable:true});
  const preview=await (await f.handler(request())).json();assert.equal(preview.writesEnabled,true);assert.equal(preview.operationId,priceId);
  const response=await f.handler(sendRequest());assert.equal(response.status,200);assert.equal((await response.json()).stage,'price_verified');
  assert.equal(f.job().stage,'price_verified');assert.equal(remotePosts(f).length,1);
  assert.equal((await f.handler(sendRequest())).status,200);assert.equal(remotePosts(f).length,1);
  assert.equal((await f.handler(sendRequest({action:'reconcile'}))).status,200);assert.equal(remotePosts(f).length,1);
  const changed=await f.handler(sendRequest({price:'40,00'}));assert.equal(changed.status,409);assert.equal((await changed.json()).code,'price_payload_changed');
});
test('connected send requires exact backend operation, journal, CAS, absent price and homologation',async()=>{
  for(const flags of [{missingJournal:true},{casFailure:true},{prices:{total:1,data:[priceEntry()]}},
    {prices:{total:1,data:[priceEntry({precoAntigo:0})]}},{prices:{total:1,data:[priceEntry({anuncio:7})]}},
    {prices:{total:1,data:[]}},{env:{MAGAZORD_BASE_URL:'https://livrariasul.painel.magazord.com.br/api'}},
    {env:{MAGAZORD_HOMOLOGATION_PRICES:'{}'}},{job:{...row,stage:'parent_started'}},{wrongChild:true}]){
    const f=backend({enable:true,...flags}),r=await f.handler(sendRequest());assert.notEqual(r.status,200);assert.equal(remotePosts(f).length,0);
  }
  const f=backend({enable:true});assert.equal((await f.handler(sendRequest({operationId:registration}))).status,423);assert.equal(f.job(),null);
  assert.equal((await f.handler(sendRequest({tableId:2}))).status,400);assert.equal(remotePosts(f).length,0);
  const missing=backend({enable:true,missingJournal:true});assert.equal((await missing.handler(request())).status,503);
});
test('connected rejected, lost, timed out or malformed POST and failed confirmation never repeat',async()=>{
  for(const flags of [{writeReject:true},{timeout:true},{lostResponse:true},{invalidSuccess:true},{confirmationFailure:true}]){
    const f=backend({enable:true,...flags}),r=await f.handler(sendRequest());assert.notEqual(r.status,200);assert.equal(f.job().stage,'price_started');
    const text=await r.text();for(const secret of ['private','fixture-password','fixture-token','sb_secret_fixture'])assert.ok(!text.includes(secret));
    await f.handler(sendRequest());await f.handler(sendRequest({action:'reconcile'}));assert.equal(remotePosts(f).length,1);
    if(flags.lostResponse||flags.invalidSuccess)assert.equal(f.job().stage,'price_verified');else assert.equal(f.job().stage,'price_started');
  }
});
test('connected sends preserve MFA, store and authorization guards; reconciliation never starts a POST',async()=>{
  for(const [flags,headers] of [[{}, {authorization:'Bearer '+mfaToken(actor,'aal1')}],[{denied:true},{}],[{inactive:true},{}],
    [{},{'x-isbn-store-id':registration}],[{},{origin:'https://elsewhere.invalid'}]]){
    const f=backend({enable:true,...flags});assert.notEqual((await f.handler(sendRequest({},headers))).status,200);assert.equal(remotePosts(f).length,0);
  }
  const f=backend({enable:true});const r=await f.handler(sendRequest({action:'reconcile'}));assert.equal((await r.json()).code,'price_not_started');assert.equal(remotePosts(f).length,0);
  const concurrent=backend({enable:true});await Promise.all([concurrent.handler(sendRequest()),concurrent.handler(sendRequest()),concurrent.handler(sendRequest())]);assert.equal(remotePosts(concurrent).length,1);
});
test('money is parsed to exact cents, complete Brazilian or decimal input, never partial coercion',()=>{
  for(const [text,cents]of [['30,00',3000],['1.234,56',123456],['0,01',1],['1234.56',123456],['00030,00',3000]])assert.equal(api.priceCents(text),cents);
  for(const text of [undefined,null,30,{},'', '30','30,','30,0','0,00','-1,00','1e3','Infinity','NaN','R$ 30,00',' 30,00','1.23,45','50,001','900719925474099100,00'])
    assert.throws(()=>api.priceCents(text),{code:'invalid_price'});
  assert.deepEqual(api.salePricePayload('FIXTURE-C',1,3000),[{produto:'FIXTURE-C',tabelaPreco:1,precoVenda:30}]);
});
test('preview uses the verified child, backend table, exact payload and no persistence/remote writes',async()=>{
  const f=backend(),r=await f.handler(request());assert.equal(r.status,200);const data=await r.json();
  assert.equal(data.childCode,'FIXTURE-C');assert.equal(data.tableId,1);assert.equal(data.cents,3000);assert.equal(data.writesEnabled,false);assert.equal(data.eligible,true);
  assert.deepEqual(data.payload,[{produto:'FIXTURE-C',tabelaPreco:1,precoVenda:30}]);assert.equal(f.calls.length,10);
  for(const field of ['anuncio','precoAntigo','preco','estoque'])assert.equal(Object.hasOwn(data.payload[0],field),false);
});
test('without an explicitly authorized operation UUID, legacy flags cannot enable writes or access the price journal',async()=>{
  for(const action of ['create','send','continue','reconcile']){
    const f=backend({env:{MAGAZORD_PRICE_WRITES_ENABLED:'true',MAGAZORD_PRICE_HOMOLOGATED:'true'}}),r=await f.handler(request({action}));
    assert.equal(r.status,423);assert.deepEqual(await r.json(),{code:'price_writes_disabled'});assert.equal(f.calls.length,4);
  }
});
test('existing sale price, old price including zero, ads and ambiguous pages block eligibility',async()=>{
  for(const prices of [{total:1,data:[priceEntry()]},{total:1,data:[priceEntry({precoVenda:0,precoAntigo:40})]},
    {total:1,data:[priceEntry({precoAntigo:0})]},{total:1,data:[priceEntry({anuncio:5})]},
    {total:1,data:[priceEntry({anuncio:undefined})]},{total:1,data:[]},{total:2,data:[priceEntry()]},
    {total:1,data:[priceEntry({produto:'other'})]},{total:1,data:[priceEntry({tabelaPreco:2})]},
    {data:[]},{total:1,data:[priceEntry({precoVenda:30.001})]}]){
    const f=backend({prices}),r=await f.handler(request());assert.equal(r.status,200);
    const data=await r.json();assert.equal(data.eligible,false);assert.equal(data.writesEnabled,false);assert.notEqual(data.state,'ready_for_local_review');
  }
});
test('configuration missing/invalid, free browser IDs and shared table bindings fail closed',async()=>{
  for(const value of [undefined,'','null','[]','{}','bad',JSON.stringify({[store]:{channelId:1,tableId:0}}),
    JSON.stringify({[store]:{channelId:2,tableId:1}}),JSON.stringify({[store]:{channelId:1,tableId:'1'}}),
    JSON.stringify({[store]:{channelId:1,tableId:1,extra:1}})]){
    const f=backend({env:{MAGAZORD_HOMOLOGATION_PRICES:value}}),r=await f.handler(request());assert.equal(r.status,503);assert.equal(f.calls.length,4);
  }
  const f=backend(),r=await f.handler(request({tableId:99,channelId:99,childCode:'other'}));assert.equal(r.status,400);assert.equal(f.calls.length,4);
  const g=backend({env:{MAGAZORD_HOMOLOGATION_CHANNELS:JSON.stringify({[store]:1,[registration]:2}),MAGAZORD_HOMOLOGATION_PRICES:JSON.stringify({[store]:{channelId:1,tableId:1},[registration]:{channelId:2,tableId:1}})}});
  assert.equal((await g.handler(request())).status,503);
});
test('absence requires explicit complete empty reads for both active and inactive prices',async()=>{
  const empty={total:0,data:[]},present={total:1,data:[priceEntry()]};
  for(const active of ['0','1']){
    const f=backend({pricesByActive:{'0':empty,'1':empty,[active]:present}}),r=await f.handler(request());
    assert.equal(r.status,200);assert.equal((await r.json()).eligible,false);
  }
  const f=backend({prices:{sucesso:false,total:0,data:[]}}),r=await f.handler(request());assert.equal((await r.json()).state,'ambiguous_price_response');
});
test('independent stores have explicit channel/table bindings and no default fallback',async()=>{
  const other=registration;
  for(const selected of [store,other]){
    const channel=selected===store?1:2,table=selected===store?1:7;
    const f=backend({channel,tableId:table,env:{MAGAZORD_STORE_ID:selected,MAGAZORD_HOMOLOGATION_CHANNELS:JSON.stringify({[store]:1,[other]:2}),
      MAGAZORD_HOMOLOGATION_PRICES:JSON.stringify({[store]:{channelId:1,tableId:1},[other]:{channelId:2,tableId:7}})}});
    const r=await f.handler(request({},{'x-isbn-store-id':selected}));assert.equal(r.status,200);assert.equal((await r.json()).tableId,table);
  }
});
test('MFA, session, profile, store, origin and production guards prevent access',async()=>{
  for(const [flags,headers,status]of [[{}, {authorization:''},401],[{}, {authorization:'Bearer '+mfaToken(actor,'aal1')},403],
    [{authRejected:true},{},401],[{denied:true},{},403],[{inactive:true},{},403],[{}, {'x-isbn-store-id':registration},403],
    [{}, {origin:'https://other.invalid'},403],[{}, {'sec-fetch-site':'cross-site'},403]]){
    const f=backend(flags),r=await f.handler(request({},headers));assert.equal(r.status,status);assert.ok(f.calls.every(c=>c.url.origin==='https://auth.invalid'));
  }
  for(const target of ['https://livrariasul.painel.magazord.com.br/api','http://homologacaosilveiralab.painel.magazord.com.br/api','https://other.invalid/api']){
    const f=backend({env:{MAGAZORD_BASE_URL:target}});assert.equal((await f.handler(request())).status,403);assert.equal(f.calls.length,0);
  }
});
test('unverified registrations, wrong actor/store/child, inactive tables and unavailable persistence block preview',async()=>{
  for(const flags of [{job:{...row,stage:'parent_started'}},{job:{...row,actor_id:registration}},{job:{...row,store_id:registration}},
    {wrongChild:true},{inactiveTable:true},{env:{SUPABASE_SERVICE_ROLE_KEY:undefined}}]){
    const f=backend(flags),r=await f.handler(request());assert.notEqual(r.status,200);assert.equal(f.calls.filter(c=>c.init.method!=='GET').length,0);
  }
});
test('remote denial/redirect or malformed input never exposes private transport messages',async()=>{
  for(const flags of [{remoteFailure:true},{redirect:true}]){
    const f=backend(flags),r=await f.handler(request());assert.equal(r.status,502);const text=await r.text();
    for(const secret of ['private','fixture-token','fixture-password','sb_secret_fixture'])assert.ok(!text.includes(secret));
  }
  const f=backend();assert.equal((await f.handler(request({price:'1e3'}))).status,400);
  assert.equal((await f.handler(new Request('https://isbn.invalid/api/magazord/price'))).status,405);
});

test('price API identifies each failing external GET with safe metadata and stops without writes',async(t)=>{
  const logs=[];t.mock.method(console,'warn',entry=>logs.push(JSON.parse(entry)));
  for(const [path,active,operation,endpoint] of [
    ['/api/v2/site/produto/FIXTURE-P',undefined,'read_parent','/api/v2/site/produto/{pai}'],
    ['/api/v2/site/produto/FIXTURE-P/derivacao/FIXTURE-C',undefined,'read_child','/api/v2/site/produto/{pai}/derivacao/{filho}'],
    ['/api/v2/site/tabelaPreco',undefined,'read_price_table','/api/v2/site/tabelaPreco'],
    ['/api/v1/listPreco','0','read_prices_inactive','/api/v1/listPreco'],
    ['/api/v1/listPreco','1','read_prices_active','/api/v1/listPreco'],
  ]){
    const f=backend({remoteFailurePath:path,remoteFailureActive:active});
    const response=await f.handler(request({price:'12,00'}));
    assert.equal(response.status,502);
    const body=await response.json(),diagnostic={operation,endpoint,httpStatus:403,contentType:'text/html',reason:'http_error'};
    assert.deepEqual(body,{code:'price_read_unavailable',diagnostic});
    assert.deepEqual(logs.at(-1),{event:'magazord_price_read_failure',...diagnostic});
    assert.equal(f.calls.at(-1).url.pathname,path);
    assert.ok(f.calls.every(c=>c.init.method==='GET'));
    for(const secret of ['private','fixture-token','fixture-password','sb_secret_fixture','FIXTURE-P','FIXTURE-C','tabelaPreco=','produto='])
      assert.ok(!JSON.stringify([body,logs]).includes(secret));
  }
  assert.equal(logs.length,5);
});

function operation(){
  const job=api.priceJob({id:crypto.randomUUID(),registration_id:registration,store_id:store,actor_id:actor,parent_code:'FIXTURE-P',child_code:'FIXTURE-C',channel_id:1,table_id:1,cents:3000});
  const jobs=new Map(),reservations=new Set(),writes=[];let snapshot={kind:'absent'};
  const storePort={async reserve(row){if(jobs.has(row.id))return{...jobs.get(row.id)};const tuple=[row.store_id,row.environment,row.child_code.toLowerCase(),row.table_id,row.ad_scope].join(':');if(reservations.has(tuple))throw new api.PriceError('price_reserved');reservations.add(tuple);jobs.set(row.id,{...row});return{...row};},
    async advance(row,next){if(jobs.get(row.id).stage!==row.stage)return false;jobs.set(row.id,{...row,stage:next});return true;}};
  const ports={baseUrl:base,verifiedRegistration:async()=>true,store:storePort,read:async()=>snapshot,write:async payload=>{writes.push(payload);snapshot={kind:'present',cents:3000};return{status:200,body:{sucesso:true}};}};
  return{job,jobs,writes,ports,setSnapshot:s=>snapshot=s,run:()=>api.exercisePriceOperation(job,ports)};
}
test('independent price intent, fingerprint, reservation and successful GET confirmation are idempotent',async()=>{
  const f=operation();assert.equal(await f.run(),'price_verified');assert.equal(await f.run(),'price_verified');assert.equal(f.writes.length,1);
  assert.deepEqual(f.writes[0],[{produto:'FIXTURE-C',tabelaPreco:1,precoVenda:30}]);
  await assert.rejects(api.exercisePriceOperation(api.priceJob({...f.job,cents:4000}),f.ports),{code:'price_payload_changed'});
  await assert.rejects(api.exercisePriceOperation(api.priceJob({...f.job,id:crypto.randomUUID()}),f.ports),{code:'price_reserved'});assert.equal(f.writes.length,1);
});
test('concurrent fixtures allow at most one POST and require persistent compare-and-set',async()=>{
  const f=operation(),results=await Promise.allSettled([f.run(),f.run(),f.run()]);
  assert.ok(results.some(r=>r.status==='fulfilled'));assert.equal(f.writes.length,1);assert.equal(f.jobs.get(f.job.id).stage,'price_verified');
});
test('lost responses, timeouts, invalid success and failed confirmation never repeat an uncertain POST',async()=>{
  for(const outcome of ['timeout','lost_success','bad_response','confirmation_failure','wrong_status']){
    const f=operation();let attempts=0,reads=0;f.ports.write=async()=>{attempts++;assert.equal(f.jobs.get(f.job.id).stage,'price_started');
      if(outcome==='lost_success'){f.setSnapshot({kind:'present',cents:3000});throw new Error('private lost result');}
      if(outcome==='bad_response')return{status:200,body:{sucesso:false,mensagem:'private'}};
      if(outcome==='wrong_status')return{status:400,body:{sucesso:true}};
      if(outcome==='confirmation_failure')return{status:200,body:{sucesso:true}};throw new DOMException('private','TimeoutError');};
    if(outcome==='confirmation_failure')f.ports.read=async()=>{if(++reads>1)throw new Error('private stream');return{kind:'absent'};};
    await assert.rejects(f.run(),{code:'price_outcome_uncertain'});assert.equal(f.jobs.get(f.job.id).stage,'price_started');
    f.ports.read=async()=>outcome==='lost_success'?{kind:'present',cents:3000}:{kind:'absent'};
    if(outcome==='lost_success')assert.equal(await f.run(),'price_verified');else await assert.rejects(f.run(),{code:'price_outcome_uncertain'});
    assert.equal(attempts,1);
  }
});
test('existing prices, wrong reconciliation amounts, unverified registration and production never write in offline orchestration',async()=>{
  const f=operation();f.setSnapshot({kind:'present',cents:3000});await assert.rejects(f.run(),{code:'existing_price_review_required'});assert.equal(f.writes.length,0);
  const g=operation();g.ports.verifiedRegistration=async()=>false;await assert.rejects(g.run(),{code:'registration_not_verified'});assert.equal(g.jobs.size,0);
  const h=operation();h.ports.baseUrl='https://livrariasul.painel.magazord.com.br/api';await assert.rejects(h.run(),{code:'homologation_only'});assert.equal(h.jobs.size,0);
  const k=operation();await k.run();k.setSnapshot({kind:'present',cents:4000});await assert.rejects(k.run(),{code:'price_outcome_uncertain'});assert.equal(k.writes.length,1);
});
test('independent PostgREST adapter scopes reservations and CAS without writes to registration',async()=>{
  const f=operation(),calls=[];let saved=null;
  const adapter=api.createPriceStore(env,async(target,init)=>{const url=new URL(target);calls.push({url,init});assert.equal(url.pathname,'/rest/v1/magazord_price_jobs');assert.equal(init.headers.apikey,'sb_secret_fixture');assert.equal(init.redirect,'error');
    if(init.method==='GET'){assert.equal(url.searchParams.get('store_id'),'eq.'+store);assert.equal(url.searchParams.get('actor_id'),'eq.'+actor);return Response.json(saved?[saved]:[]);}
    if(init.method==='POST'){saved=JSON.parse(init.body);return Response.json([saved]);}
    assert.equal(init.method,'PATCH');assert.equal(url.searchParams.get('fingerprint'),'eq.'+saved.fingerprint);
    if(url.searchParams.get('stage')!=='eq.'+saved.stage)return Response.json([]);saved={...saved,...JSON.parse(init.body)};return Response.json([saved]);});
  assert.deepEqual(await adapter.reserve(f.job),f.job);assert.equal(await adapter.advance(f.job,'price_started'),true);assert.equal(await adapter.advance(f.job,'price_started'),false);
  assert.equal(calls.filter(c=>c.init.method==='POST').length,1);
});
test('draft SQL restricts RLS/grants and immutable transitions without changing registration tables',async()=>{
  const sql=await readFile('supabase/setup/magazord_price_journal.sql','utf8');
  assert.match(sql,/primary key \(store_id, environment, child_code, table_id, ad_scope\)/);assert.match(sql,/for share/i);
  assert.match(sql,/registration.stage <> 'verified'/);assert.match(sql,/security invoker/);assert.doesNotMatch(sql,/security definer|alter table public\.magazord_registration|update public\.magazord_registration/i);
  assert.match(sql,/revoke all on public.magazord_price_jobs, public.magazord_price_reservations from public, anon, authenticated/);
  assert.match(sql,/old.stage = 'prepared' and new.stage = 'price_started'/);assert.match(sql,/old.stage = 'price_started' and new.stage = 'price_verified'/);
});
