import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mfaToken } from './helpers/mfa.mjs';
import { mediaImages } from './helpers/mediaImages.mjs';

const built=await build({stdin:{resolveDir:process.cwd(),contents:"export * from './server/magazordMedia';"},
 bundle:true,write:false,platform:'node',format:'esm'});
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const actor='11111111-1111-4111-8111-111111111111',store='22222222-2222-4222-8222-222222222222';
const registrationId='33333333-3333-4333-8333-333333333333';
const source='https://m.media-amazon.com/images/I/fixture.jpg';
const env={MAGAZORD_BASE_URL:'https://homologacaosilveiralab.painel.magazord.com.br/api',
 MAGAZORD_API_USER:'fixture',MAGAZORD_API_PASSWORD:'fixture',MAGAZORD_STORE_ID:store,
 SUPABASE_URL:'https://jcxdkrpmrfbrhzwbzhph.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',
 SUPABASE_SERVICE_ROLE_KEY:'sb_secret_fixture'};
const request=(action,operationId,changes={})=>new Request('https://isbn.invalid/api/magazord/price?media=1',{
 method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+mfaToken(actor),'x-isbn-store-id':store},
 body:JSON.stringify({action,registrationId,reference:source,position:0,
 ...(operationId?{operationId}:{}),...changes})});
function fixture({lostUpload=false,lostLink=false,format='jpg',bytes=mediaImages[format],remoteStatus=201,
 remoteBody={status:'success',data:{id:'105'}},remoteType='application/json',persistFailure=false,
 reserveFailure=false,sourceFailure=false,timeout=false,clock,logger,hook=()=>{},initialStage,
 authActor=actor,authAal='aal2',registrationStore=store,stallResponse=false}={}){
 let job=null,uploads=0,links=0,queries=[],events=[],signals=[];
 const fetcher=async(target,init)=>{
  const u=new URL(target);queries.push(u.pathname);signals.push(init.signal);await hook(u,init);
  if(u.hostname==='jcxdkrpmrfbrhzwbzhph.supabase.co'){
   if(u.pathname==='/auth/v1/user')return Response.json({id:authActor});
   if(u.pathname==='/rest/v1/profiles')return Response.json([{id:actor,active:true}]);
   if(u.pathname==='/rest/v1/store_users')return Response.json([{user_id:actor,store_id:store,role:'operator',active:true}]);
   if(u.pathname==='/rest/v1/stores')return Response.json([{id:store,active:true}]);
   if(u.pathname==='/rest/v1/magazord_registration_jobs')return Response.json(registrationStore===store?[{id:registrationId,store_id:store,
    actor_id:actor,parent_code:'LVP013',child_code:'9788532530837',stage:'verified'}]:[]);
   if(u.pathname.startsWith('/storage/v1/object/authenticated/isbn-registration-images/')){
    assert.equal(init.method,'GET');assert.equal(init.redirect,'error');
    assert.equal(init.headers.apikey,'sb_secret_fixture');assert.equal(init.headers.Authorization,undefined);
    return new Response(bytes,{status:200,headers:{'content-type':'image/jpeg'}});
   }
   if(u.pathname==='/rest/v1/magazord_media_jobs'){
    if(init.method==='GET')return Response.json(job?[job]:[]);
    if(init.method==='POST'){if(job)return Response.json({code:'conflict'},{status:409});job=JSON.parse(init.body);if(initialStage)job.stage=initialStage;return Response.json([job]);}
    if(init.method==='PATCH'){
      const patch=JSON.parse(init.body);
      if(reserveFailure && patch.stage==='upload_started'){
        if(reserveFailure==='lost_after_commit'){job={...job,...patch};throw Error('lost reservation acknowledgement');}
        return Response.json({code:'fixture'},{status:503});
      }
      if(persistFailure && patch.stage==='uploaded'){
        if(persistFailure==='lost_after_commit'){job={...job,...patch};throw Error('lost db acknowledgement');}
        if(persistFailure==='conflict')return Response.json([]);
        if(persistFailure==='wrong_id')return Response.json([{...job,...patch,media_id:999}]);
        if(persistFailure==='timeout')throw new DOMException('sensitive exception text','TimeoutError');
        return Response.json({code:'fixture'},{status:503});
      }
      if(u.searchParams.get('stage')!=='eq.'+job.stage)return Response.json([]);
      job={...job,...patch};return Response.json([job]);
    }
   }
   throw Error('unexpected Supabase call '+u.pathname);
  }
  if(u.hostname==='m.media-amazon.com'){
    assert.equal(init.method,'GET');
    if(sourceFailure==='timeout')throw new DOMException('sensitive source URL','TimeoutError');
    return new Response(bytes,{status:sourceFailure?403:200,headers:{'content-type':'image/'+(format==='jpg'?'jpeg':format)}});
  }
  assert.equal(u.hostname,'homologacaosilveiralab.painel.magazord.com.br');
  assert.equal(init.method,'POST','No extra Magazord product GETs');
  if(u.pathname==='/api/v2/site/midia/upload'){
    uploads++;
    const data=JSON.parse(init.body);
    assert.equal(data.tipo,6);assert.equal(data.tipoMidia,1);
    assert.deepEqual(Buffer.from(data.midiaFile,'base64'),Buffer.from(bytes));
    if(lostUpload)throw Error('transport lost');
    if(timeout)throw new DOMException('sensitive exception text','TimeoutError');
    return new Response(stallResponse?new ReadableStream({}):typeof remoteBody==='string'?remoteBody:JSON.stringify(remoteBody),{status:remoteStatus,headers:{'content-type':remoteType}});
  }
  if(u.pathname==='/api/v2/site/produto/LVP013/derivacao/9788532530837/midia'){
    links++;assert.deepEqual(JSON.parse(init.body),{midiaId:[105]});
    if(lostLink)throw Error('transport lost');
    return Response.json({status:'success'},{status:201});
  }
  throw Error('unexpected Magazord path '+u.pathname);
 };
 const handler=api.createMagazordMediaFunction({env,fetcher,now:clock,logger:logger||((event)=>events.push(event))});
 return {handler:authAal==='aal2'?handler:req=>{
   const headers=new Headers(req.headers);headers.set('authorization','Bearer '+mfaToken(actor,authAal));
   return handler(new Request(req,{headers}));},uploads:()=>uploads,links:()=>links,
  job:()=>job,queries:()=>queries,events:()=>events,signals:()=>signals};
}
test('faz um upload e um vínculo, sem GET extra na Magazord nem duplicação',async()=>{
 const f=fixture();const prep=await f.handler(request('prepare'));assert.equal(prep.status,200);
 const id=(await prep.json()).operationId;
 assert.equal((await f.handler(request('upload',id))).status,200);
 assert.equal(f.job().stage,'uploaded');
 assert.equal((await f.handler(request('upload',id))).status,200);
 assert.equal(f.uploads(),1);
 assert.equal((await f.handler(request('link',id))).status,200);
 assert.equal((await f.handler(request('link',id))).status,200);
 assert.equal(f.links(),1);assert.equal(f.job().stage,'linked');
 assert.deepEqual(f.queries().filter(x=>x.startsWith('/api/v2/site/produto/')),
  ['/api/v2/site/produto/LVP013/derivacao/9788532530837/midia']);
});
test('resposta perdida no upload bloqueia um segundo POST',async()=>{
 const f=fixture({lostUpload:true}),id=(await(await f.handler(request('prepare'))).json()).operationId;
 assert.equal((await f.handler(request('upload',id))).status,409);
 assert.equal(f.job().stage,'upload_started');
 assert.equal((await f.handler(request('upload',id))).status,409);
 assert.equal(f.uploads(),1);assert.equal(f.links(),0);
});
test('resposta perdida no vínculo bloqueia duplicar associação',async()=>{
 const f=fixture({lostLink:true}),id=(await(await f.handler(request('prepare'))).json()).operationId;
 assert.equal((await f.handler(request('upload',id))).status,200);
 assert.equal((await f.handler(request('link',id))).status,409);
 assert.equal(f.job().stage,'link_started');
 assert.equal((await f.handler(request('link',id))).status,409);
 assert.equal(f.links(),1);
});
test('produção não pode enviar mídias',async()=>{
 let calls=0;
 const handler=api.createMagazordMediaFunction({env:{...env,MAGAZORD_BASE_URL:'https://livrariasul.painel.magazord.com.br/api'},
  fetcher:async()=>{calls++;throw Error('unreachable')}});
 const result=await handler(request('upload','44444444-4444-4444-8444-444444444444'));
 assert.equal(result.status,403);assert.equal(calls,0);
});

test('recupera cadastro homologado por Pai/Filho apenas no diário ISBN',async()=>{
 const f=fixture();
 const req=new Request('https://isbn.invalid/api/magazord/price?media=1',{
  method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+mfaToken(actor),'x-isbn-store-id':store},
  body:JSON.stringify({action:'lookup',parentCode:'LVP013',childCode:'9788532530837'})
 });
 const response=await f.handler(req);
 assert.equal(response.status,200);
 const data=await response.json();
 assert.deepEqual({status:data.status,parentCode:data.parentCode,childCode:data.childCode,registrationId:data.registrationId},
  {status:'found',parentCode:'LVP013',childCode:'9788532530837',registrationId});
 assert.equal(f.uploads(),0);assert.equal(f.links(),0);
 assert.equal(f.queries().filter(path=>path.startsWith('/api/v2/')).length,0);
});

for(const format of ['jpg','png','webp'])test('upload com imagem completa '+format,async()=>{
 const f=fixture({format}),id=(await(await f.handler(request('prepare'))).json()).operationId;
 assert.equal((await f.handler(request('upload',id))).status,200);
 assert.ok(f.events().some(e=>e.phase==='preparation'&&e.imageType===format&&e.imageBytes===mediaImages[format].length));
 assert.ok(f.events().some(e=>e.phase==='response'&&e.outcome==='ok'));
 assert.ok(f.events().some(e=>e.phase==='persistence'&&e.outcome==='ok'));
});

for(const [name,options,phase,outcome] of [
 ['400',{remoteStatus:400,remoteBody:{code:'invalid_image'}},'upload','http_rejected'],
 ['401',{remoteStatus:401},'upload','http_rejected'],
 ['413',{remoteStatus:413},'upload','http_rejected'],
 ['500',{remoteStatus:500},'upload','http_rejected'],
 ['200 inesperado',{remoteStatus:200},'upload','http_rejected'],
 ['MIME incorreto',{remoteType:'text/plain'},'response','invalid_response'],
 ['JSON inválido',{remoteBody:'{'},'response','invalid_response'],
 ['ID ausente',{remoteBody:{status:'success',data:{}}},'response','invalid_response'],
 ['ID inválido',{remoteBody:{status:'success',data:{id:-1}}},'response','invalid_response'],
 ['envelope inválido',{remoteBody:{status:'failed',data:{id:105}}},'response','invalid_response'],
 ['corpo excessivo',{remoteBody:'x'.repeat(65537)},'response','invalid_response'],
 ['transporte',{lostUpload:true},'upload','transport'],
 ['timeout',{timeout:true},'upload','timeout'],
 ['persistência HTTP',{persistFailure:true},'persistence','persistence_failed'],
 ['persistência timeout',{persistFailure:'timeout'},'persistence','timeout'],
 ['persistência CAS',{persistFailure:'conflict'},'persistence','conflict'],
 ['persistência ID divergente',{persistFailure:'wrong_id'},'persistence','persistence_failed'],
 ['resposta de persistência perdida',{persistFailure:'lost_after_commit'},'persistence','persistence_failed'],
])test('diagnóstico e bloqueio após '+name,async()=>{
 const f=fixture(options),id=(await(await f.handler(request('prepare'))).json()).operationId;
 const response=await f.handler(request('upload',id));assert.equal(response.status,409);
 assert.deepEqual(await response.json(),{code:'media_outcome_uncertain'});
 assert.ok(f.events().some(e=>e.phase===phase&&e.outcome===outcome));
 if(options.persistFailure==='lost_after_commit')assert.equal(f.job().stage,'uploaded');
 else {assert.equal(f.job().stage,'upload_started');assert.equal(f.job().media_id,null);}
 await f.handler(request('upload',id));assert.equal(f.uploads(),1);assert.equal(f.links(),0);
});

for(const [name,options] of [
 ['JPEG truncado',{bytes:mediaImages.jpg.slice(0,-2)}],
 ['PNG corrompido',{format:'png',bytes:mediaImages.png.map((v,i)=>i===45?v^1:v)}],
 ['WebP truncado',{format:'webp',bytes:mediaImages.webp.slice(0,-1)}],
 ['fonte rejeitada',{sourceFailure:true}],['fonte timeout',{sourceFailure:'timeout'}],
 ['excesso de bytes',{bytes:new Uint8Array(5*1024*1024+1)}],
])test('preparação falha sem reservar: '+name,async()=>{
 const f=fixture(options),id=(await(await f.handler(request('prepare'))).json()).operationId;
 assert.notEqual((await f.handler(request('upload',id))).status,200);
 assert.equal(f.job().stage,'prepared');assert.equal(f.uploads(),0);
 assert.ok(!f.events().some(e=>e.phase==='reserve'));
});

test('orçamento acumulado impede reserva e preserva prepared',async()=>{
 let time=0;
 const f=fixture({clock:()=>time,hook:u=>{if(u.hostname==='m.media-amazon.com')time+=16000;}});
 const id=(await(await f.handler(request('prepare'))).json()).operationId;
 assert.equal((await f.handler(request('upload',id))).status,409);
 assert.equal(f.job().stage,'prepared');assert.equal(f.uploads(),0);
 assert.ok(f.events().some(e=>e.outcome==='budget_exhausted'));
});

test('duas requisições concorrentes fazem somente um POST remoto',async()=>{
 const f=fixture(),id=(await(await f.handler(request('prepare'))).json()).operationId;
 const results=await Promise.all([f.handler(request('upload',id)),f.handler(request('upload',id))]);
 assert.ok(results.some(r=>r.status===200));assert.equal(f.uploads(),1);assert.equal(f.job().stage,'uploaded');
 await f.handler(request('upload',id));assert.equal(f.uploads(),1);
});

test('registro já em upload_started permanece bloqueado',async()=>{
 const f=fixture({initialStage:'upload_started'}),id=(await(await f.handler(request('prepare'))).json()).operationId;
 assert.equal((await f.handler(request('upload',id))).status,409);
 assert.equal(f.uploads(),0);assert.equal(f.job().stage,'upload_started');
});

test('falha na reserva impede chamada remota',async()=>{
 const f=fixture({reserveFailure:true}),id=(await(await f.handler(request('prepare'))).json()).operationId;
 assert.equal((await f.handler(request('upload',id))).status,503);
 assert.equal(f.job().stage,'prepared');assert.equal(f.uploads(),0);
});

test('logs possuem somente campos aprovados e códigos remotos conhecidos',async()=>{
 const allowed=new Set(['event','requestId','phase','durationMs','outcome','httpStatus','imageType','imageBytes','payloadBytes','remoteCode']);
 for(const code of ['invalid_image','Bearer-secret','person@example.com','https://private.invalid/token','unknown_code']){
   const f=fixture({remoteStatus:400,remoteBody:{code,message:'private response text',token:'private-token'}});
   const id=(await(await f.handler(request('prepare'))).json()).operationId;
   await f.handler(request('upload',id));
   for(const e of f.events()){
     assert.ok(Object.keys(e).every(k=>allowed.has(k)));assert.ok(e.durationMs>=0);
     assert.ok(!JSON.stringify(e).includes('private'));assert.ok(!JSON.stringify(e).includes(source));
   }
   assert.equal(f.events().find(e=>e.outcome==='http_rejected').remoteCode,code==='invalid_image'?code:undefined);
 }
});

test('logger defeituoso não impede persistência nem provoca reenvio',async()=>{
 const f=fixture({logger:()=>{throw Error('logger failed');}}),id=(await(await f.handler(request('prepare'))).json()).operationId;
 assert.equal((await f.handler(request('upload',id))).status,200);assert.equal(f.job().stage,'uploaded');
 await f.handler(request('upload',id));assert.equal(f.uploads(),1);
});

test('MFA e escopo de cadastro continuam obrigatórios',async()=>{
 for(const opts of [{authAal:'aal1'},{registrationStore:'other'}]){
   const f=fixture(opts);assert.notEqual((await f.handler(request('prepare'))).status,200);assert.equal(f.uploads(),0);
 }
});

test('timeout real de leitura do corpo preserva reserva e bloqueia reenvio',async()=>{
 const keepAlive=setTimeout(()=>{},2500);
 try{
   const f=fixture({stallResponse:true}),id=(await(await f.handler(request('prepare'))).json()).operationId;
   const response=await f.handler(request('upload',id));assert.equal(response.status,409);
   assert.ok(f.events().some(e=>e.phase==='response'&&e.outcome==='timeout'));
   assert.equal(f.job().stage,'upload_started');await f.handler(request('upload',id));assert.equal(f.uploads(),1);
 }finally{clearTimeout(keepAlive);}
});

test('confirmação perdida da reserva mantém bloqueio sem enviar imagem',async()=>{
 const f=fixture({reserveFailure:'lost_after_commit'}),id=(await(await f.handler(request('prepare'))).json()).operationId;
 assert.equal((await f.handler(request('upload',id))).status,503);
 assert.equal(f.job().stage,'upload_started');await f.handler(request('upload',id));assert.equal(f.uploads(),0);
});

test('envio lento ainda dispõe de margem para persistir ID',async()=>{
 let time=0,remainingAtPersistence=0;
 const f=fixture({clock:()=>time,hook:(u,init)=>{
   if(u.hostname==='m.media-amazon.com')time+=4000;
   if(u.pathname==='/api/v2/site/midia/upload')time+=12000;
   if(u.pathname==='/rest/v1/magazord_media_jobs'&&init.method==='PATCH'&&JSON.parse(init.body).stage==='uploaded'){
     remainingAtPersistence=28000-time;time+=3900;
   }
 }}),id=(await(await f.handler(request('prepare'))).json()).operationId;
 assert.equal((await f.handler(request('upload',id))).status,200);
 assert.ok(remainingAtPersistence>=5000);assert.equal(f.job().media_id,105);
});

test('download privado usa caminho autorizado e mesmo limite antes de reservar',async()=>{
 const reference='https://jcxdkrpmrfbrhzwbzhph.supabase.co/storage/v1/object/authenticated/isbn-registration-images/'+store+'/'+actor+'/'+'a'.repeat(64)+'.jpg';
 const f=fixture(),id=(await(await f.handler(request('prepare',undefined,{reference}))).json()).operationId;
 assert.equal((await f.handler(request('upload',id,{reference}))).status,200);assert.equal(f.uploads(),1);
 const deniedReference=reference.replace('/'+actor+'/', '/'+registrationId+'/');
 const denied=fixture(),otherId=(await(await denied.handler(request('prepare',undefined,{reference:deniedReference}))).json()).operationId;
 assert.equal((await denied.handler(request('upload',otherId,{reference:deniedReference}))).status,403);
 assert.equal(denied.job().stage,'prepared');assert.equal(denied.uploads(),0);
 assert.ok(!denied.queries().some(p=>p.startsWith('/storage/')));
});

test('concorrência na associação mantém somente um POST ao Filho',async()=>{
 const f=fixture(),id=(await(await f.handler(request('prepare'))).json()).operationId;
 await f.handler(request('upload',id));
 const responses=await Promise.all([f.handler(request('link',id)),f.handler(request('link',id))]);
 assert.ok(responses.some(r=>r.status===200));assert.equal(f.links(),1);assert.equal(f.job().stage,'linked');
});
