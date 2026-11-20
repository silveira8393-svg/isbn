import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mfaToken } from './helpers/mfa.mjs';

const built=await build({stdin:{resolveDir:process.cwd(),contents:"export * from './server/magazordStock';"},bundle:true,write:false,platform:'node',format:'esm'});
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const actor='11111111-1111-4111-8111-111111111111',store='22222222-2222-4222-8222-222222222222',registrationId='33333333-3333-4333-8333-333333333333';
const env={MAGAZORD_BASE_URL:'https://homologacaosilveiralab.painel.magazord.com.br/api',MAGAZORD_API_USER:'fixture',MAGAZORD_API_PASSWORD:'fixture',
 MAGAZORD_STORE_ID:store,MAGAZORD_HOMOLOGATION_STOCK:JSON.stringify({[store]:1}),SUPABASE_URL:'https://auth.invalid',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_fixture',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'};
const req=(action,quantity=1,operationId)=>new Request('https://isbn.invalid/api/magazord/price?stock=1',{
 method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+mfaToken(actor),'x-isbn-store-id':store},
 body:JSON.stringify({action,registrationId,quantity,...(operationId?{operationId}:{})})});
function fixture(lost=false){
 let job,post=0;const fetcher=async(url,init)=>{
  url=new URL(url);
  if(url.hostname==='auth.invalid'){
   if(url.pathname==='/auth/v1/user')return Response.json({id:actor});
   if(url.pathname==='/rest/v1/profiles')return Response.json([{id:actor,active:true}]);
   if(url.pathname==='/rest/v1/store_users')return Response.json([{user_id:actor,store_id:store,role:'operator',active:true}]);
   if(url.pathname==='/rest/v1/stores')return Response.json([{id:store,active:true}]);
   if(url.pathname==='/rest/v1/magazord_registration_jobs')return Response.json([{id:registrationId,store_id:store,actor_id:actor,parent_code:'LVP013',child_code:'9788532530820',stage:'verified'}]);
   if(url.pathname==='/rest/v1/magazord_price_jobs')return Response.json([{registration_id:registrationId,parent_code:'LVP013',child_code:'9788532530820',stage:'price_verified'}]);
   if(url.pathname==='/rest/v1/magazord_stock_jobs'){
    if(init.method==='GET')return Response.json(job?[job]:[]);
    if(init.method==='POST'){job=JSON.parse(init.body);return Response.json([job]);}
    if(init.method==='PATCH'){if(url.searchParams.get('stage')!=='eq.'+job.stage)return Response.json([]);job={...job,...JSON.parse(init.body)};return Response.json([job]);}
   }
   throw Error('unexpected local request');
  }
  assert.equal(url.pathname,'/api/v1/estoque');assert.equal(init.method,'POST');
  assert.deepEqual(JSON.parse(init.body),{produto:'9788532530820',deposito:1,quantidade:1,tipo:1,tipoOperacao:1});
  post++;if(lost)throw Error('response lost');return Response.json({sucesso:true,movimentacao_id:42});
 };
 return {handler:api.createMagazordStockFunction({env,fetcher}),posts:()=>post,job:()=>job};
}
test('one stock POST after confirmed registration and price, no duplicate on repeated send',async()=>{
 const f=fixture(),prep=await f.handler(req('prepare'));assert.equal(prep.status,200);
 const operationId=(await prep.json()).operationId;
 assert.equal((await f.handler(req('send',1,operationId))).status,200);
 assert.equal((await f.handler(req('send',1,operationId))).status,200);
 assert.equal((await f.handler(req('reconcile',1,operationId))).status,200);
 assert.equal(f.posts(),1);assert.equal(f.job().stage,'stock_verified');
});
test('lost POST response never causes second entry',async()=>{
 const f=fixture(true),operationId=(await(await f.handler(req('prepare'))).json()).operationId;
 assert.equal((await f.handler(req('send',1,operationId))).status,409);
 assert.equal(f.job().stage,'stock_started');
 assert.equal((await f.handler(req('send',1,operationId))).status,409);
 assert.equal(f.posts(),1);
});
test('incorrect operation identity cannot write stock',async()=>{
 const f=fixture();
 assert.equal((await f.handler(req('send',1,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))).status,423);
 assert.equal(f.posts(),0);
});
