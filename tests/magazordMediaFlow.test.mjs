import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mfaToken } from './helpers/mfa.mjs';

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
function fixture({lostUpload=false,lostLink=false}={}){
 let job=null,uploads=0,links=0,queries=[];
 const bytes=Buffer.from([255,216,255,224,0,16,74,70,73,70,0,1]);
 const fetcher=async(target,init)=>{
  const u=new URL(target);queries.push(u.pathname);
  if(u.hostname==='jcxdkrpmrfbrhzwbzhph.supabase.co'){
   if(u.pathname==='/auth/v1/user')return Response.json({id:actor});
   if(u.pathname==='/rest/v1/profiles')return Response.json([{id:actor,active:true}]);
   if(u.pathname==='/rest/v1/store_users')return Response.json([{user_id:actor,store_id:store,role:'operator',active:true}]);
   if(u.pathname==='/rest/v1/stores')return Response.json([{id:store,active:true}]);
   if(u.pathname==='/rest/v1/magazord_registration_jobs')return Response.json([{id:registrationId,store_id:store,
    actor_id:actor,parent_code:'LVP013',child_code:'9788532530837',stage:'verified'}]);
   if(u.pathname==='/rest/v1/magazord_media_jobs'){
    if(init.method==='GET')return Response.json(job?[job]:[]);
    if(init.method==='POST'){assert.equal(job,null);job=JSON.parse(init.body);return Response.json([job]);}
    if(init.method==='PATCH'){
      if(u.searchParams.get('stage')!=='eq.'+job.stage)return Response.json([]);
      job={...job,...JSON.parse(init.body)};return Response.json([job]);
    }
   }
   throw Error('unexpected Supabase call '+u.pathname);
  }
  if(u.hostname==='m.media-amazon.com'){
    assert.equal(init.method,'GET');return new Response(bytes,{status:200,headers:{'content-type':'image/jpeg'}});
  }
  assert.equal(u.hostname,'homologacaosilveiralab.painel.magazord.com.br');
  assert.equal(init.method,'POST','No extra Magazord product GETs');
  if(u.pathname==='/api/v2/site/midia/upload'){
    uploads++;
    const data=JSON.parse(init.body);
    assert.equal(data.tipo,6);assert.equal(data.tipoMidia,1);
    assert.deepEqual(Buffer.from(data.midiaFile,'base64'),bytes);
    if(lostUpload)throw Error('transport lost');
    return Response.json({status:'success',data:{id:'105'}},{status:201});
  }
  if(u.pathname==='/api/v2/site/produto/LVP013/derivacao/9788532530837/midia'){
    links++;assert.deepEqual(JSON.parse(init.body),{midiaId:[105]});
    if(lostLink)throw Error('transport lost');
    return Response.json({status:'success'},{status:201});
  }
  throw Error('unexpected Magazord path '+u.pathname);
 };
 return {handler:api.createMagazordMediaFunction({env,fetcher}),uploads:()=>uploads,links:()=>links,
  job:()=>job,queries:()=>queries};
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
