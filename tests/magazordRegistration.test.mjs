import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { mfaToken } from './helpers/mfa.mjs';
const built = await build({ stdin: { resolveDir: process.cwd(), contents: `export * from './server/magazordRegistration';export * from './server/magazordRegistrationStore';export * from './shared/magazordRegistration';` }, bundle: true, write: false, platform: 'node', format: 'esm' });
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const uid='11111111-1111-4111-8111-111111111111', store='22222222-2222-4222-8222-222222222222';
const base='https://homologacaosilveiralab.painel.magazord.com.br/api';
const env={MAGAZORD_BASE_URL:base,MAGAZORD_API_USER:'fixture-token',MAGAZORD_API_PASSWORD:'fixture-password',MAGAZORD_STORE_ID:store,SUPABASE_URL:'https://auth.invalid',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'};
const input={parentCode:'USED-01-P',childCode:'USED-01',title:'Livro fixture',condition:'usado',categoryId:10,categoryStoreId:store,brandId:20,channelId:30,fiscalOrigin:0,unit:'UN',ncm:'49019900',description:'Conservacao fixture',ean:'9788551003664'};
const id=()=>crypto.randomUUID();
const req=(operationId,changes={},headers={})=>new Request('https://isbn.invalid/api/magazord/registration',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${mfaToken(uid)}`,'x-isbn-store-id':store,...headers},body:JSON.stringify({action:'create',operationId,input,...changes})});
function fixture(flags={}) {
  const calls=[],logs=[],jobs=new Map(),codes=new Set(),parents=new Map(),children=new Map();
  const journal={
    async reserve(row){if(jobs.has(row.id))return {...jobs.get(row.id)};for(const c of [row.parent_code,row.child_code])if(codes.has(c.toLowerCase()))throw new api.JournalError('code_reserved');for(const c of [row.parent_code,row.child_code])codes.add(c.toLowerCase());jobs.set(row.id,{...row});return {...row};},
    async advance(row,next){if(jobs.get(row.id)?.stage!==row.stage)return false;jobs.set(row.id,{...row,stage:next});return true;},
  };
  const page=(items,limit=100)=>Response.json({status:'success',data:{items,page:1,limit,total:items.length,total_pages:items.length?1:0,has_more:false}});
  const fetcher=async(url,init)=>{
    url=new URL(url);calls.push({url,init});assert.equal(init.redirect,'error');
    if(url.origin==='https://auth.invalid'){
      assert.equal(init.method,'GET');assert.match(init.headers.Authorization,/^Bearer /);
      if(url.pathname==='/auth/v1/user')return flags.authRejected?new Response(null,{status:401}):Response.json({id:uid});
      if(url.pathname==='/rest/v1/profiles')return Response.json([{id:uid,active:flags.profile!==false}]);
      if(url.pathname==='/rest/v1/store_users')return Response.json(flags.member===false?[]:[{user_id:uid,store_id:store,role:'operator',active:true}]);
      if(url.pathname==='/rest/v1/stores')return Response.json([{id:store,active:flags.activeStore!==false}]);
      assert.fail('Unexpected Auth path');
    }
    assert.equal(url.origin,new URL(base).origin);assert.equal(init.headers.Authorization,'Basic '+Buffer.from('fixture-token:fixture-password').toString('base64'));
    if(init.method==='POST'){
      assert.ok(['/api/v2/site/produto',...Array.from(parents.keys(),c=>'/api/v2/site/produto/'+encodeURIComponent(c)+'/derivacao')].includes(url.pathname));
      const body=JSON.parse(init.body);
      for(const forbidden of ['preco','estoque','midia','quantidade','price','quantity','mainImageUrl'])assert.ok(!Object.hasOwn(body,forbidden));
      if(url.pathname==='/api/v2/site/produto'){
        assert.ok(!parents.has(body.codigo));if(!flags.parentInvisible)parents.set(body.codigo,body);
        if(flags.parentLost){flags.parentLost=false;throw new Error('synthetic lost response');}
        if(flags.delayParent)await flags.delayParent;
      }else{
        if(flags.childRejected){flags.childRejected=false;return new Response('secret upstream details',{status:503});}
        children.set(body.codigo,{...body,tipoRegistro:'filho',agrupador:decodeURIComponent(url.pathname.split('/')[5])});
        if(flags.childLost){flags.childLost=false;throw new Error('synthetic lost response');}
      }
      return Response.json({status:'success',data:[]},{status:201});
    }
    assert.equal(init.method,'GET');
    if(flags.rejectGet===url.pathname)return new Response('upstream private body fixture-token fixture-password',{status:flags.rejectStatus||403});
    if(flags.remoteRedirect)return new Response(null,{status:302,headers:{location:'https://livrariasul.painel.magazord.com.br/api'}});
    if(url.pathname==='/api/v2/site/marca')return page(flags.noBrand?[]:[{id:20}]);
    if(url.pathname==='/api/v2/site/categoria')return page([{id:10}]);
    if(url.pathname==='/api/v2/site/loja')return page([{id:30,ativo:true}]);
    if(url.pathname==='/api/v2/site/produtoDerivacoes')return page([...children.values(),...(flags.parentOnlyInList?[{codigo:input.parentCode,tipoRegistro:'pai'}]:[])].filter(c=>c.codigo.toLowerCase()===url.searchParams.get('codigo').toLowerCase()));
    if(url.pathname.endsWith('/derivacao'))return Response.json({status:'success',data:flags.badRelationship?[]:[...children.values()].filter(c=>c.agrupador===decodeURIComponent(url.pathname.split('/')[5]))});
    const p=parents.get(decodeURIComponent(url.pathname.split('/').at(-1)));
    return p?Response.json({status:'success',data:p}):new Response(null,{status:404});
  };
  return {calls,logs,jobs,parents,children,journal,fetcher,handler:()=>api.createMagazordRegistrationFunction({env,fetcher,journal,logReadRejection:entry=>logs.push(entry)})};
}
const writes=f=>f.calls.filter(c=>c.init.method==='POST');

test('read rejection diagnostics identify each preview GET without sensitive data or fallback',async()=>{
  for(const [path,operation] of [
    ['/api/v2/site/marca','registration_brand_lookup'],
    ['/api/v2/site/loja','registration_stores_lookup'],
    ['/api/v2/site/categoria','registration_category_lookup'],
    ['/api/v2/site/produto/'+input.parentCode,'registration_product_lookup'],
    ['/api/v2/site/produto/'+input.childCode,'registration_product_lookup'],
    ['/api/v2/site/produtoDerivacoes','registration_commercial_code_lookup'],
  ]){
    const f=fixture({rejectGet:path});
    const response=await f.handler()(req(id(),{action:'preview'}));
    assert.equal(response.status,502);assert.deepEqual(await response.json(),{code:'remote_rejected'});
    assert.deepEqual(f.logs,[{operation,status:403,code:'remote_rejected'}]);
    const remote=f.calls.filter(c=>c.url.origin===new URL(base).origin);
    assert.equal(remote.at(-1).url.pathname,path);
    assert.equal(remote.filter(c=>c.url.pathname===path).length,1);
    assert.equal(writes(f).length,0);assert.equal(f.jobs.size,0);
    assert.doesNotMatch(JSON.stringify(f.logs),/fixture-token|fixture-password|Authorization|private body|USED-01/);
  }
});

test('read rejection diagnostics preserve HTTP status and successful preview accepts missing codes without logging',async()=>{
  for(const status of [401,403,429,503]){
    const f=fixture({rejectGet:'/api/v2/site/loja',rejectStatus:status});
    assert.equal((await f.handler()(req(id(),{action:'preview'}))).status,502);
    assert.deepEqual(f.logs,[{operation:'registration_stores_lookup',status,code:'remote_rejected'}]);
    assert.equal(f.calls.filter(c=>c.url.pathname==='/api/v2/site/loja')[0].url.search,'?ativo=1');
  }
  const f=fixture();assert.equal((await f.handler()(req(id(),{action:'preview'}))).status,200);
  assert.deepEqual(f.logs,[]);assert.equal(writes(f).length,0);assert.equal(f.jobs.size,0);
});

test('creates parent then child, confirms direct relationship, replays across handler instances without another POST',async()=>{
  const f=fixture(),key=id();const response=await f.handler()(req(key));assert.equal(response.status,200);assert.equal((await response.json()).status,'verified');assert.equal(writes(f).length,2);assert.equal(f.jobs.get(key).stage,'verified');
  assert.equal((await f.handler()(req(key))).status,200);assert.equal(writes(f).length,2);
});
test('same ISBN supports separate used copies AND distinct new commercial products',async()=>{
  const f=fixture();for(const condition of ['usado','novo'])for(let n=0;n<2;n++){
    assert.equal((await f.handler()(req(id(),{input:{...input,condition,parentCode:`${condition}-${n}-P`,childCode:`${condition}-${n}`}}))).status,200);
  }assert.equal(f.parents.size,4);assert.equal(f.children.size,4);
});
test('existing parent, child and cross-namespace codes block creation; ISBN alone never queried',async()=>{
  for(const kind of ['parent','child','cross']){const f=fixture();if(kind==='parent')f.parents.set(input.parentCode,api.registrationPayload(input).parent);else f.children.set(kind==='cross'?input.parentCode:input.childCode,{codigo:kind==='cross'?input.parentCode:input.childCode,nome:input.title,tipoRegistro:'filho',agrupador:input.parentCode});
    assert.equal((await f.handler()(req(id()))).status,409);assert.equal(writes(f).length,0);}
});
test('lost parent response resumes with GET and creates only the child, never recreates confirmed parent',async()=>{
  const f=fixture({parentLost:true}),key=id();assert.equal((await f.handler()(req(key))).status,503);assert.equal(f.jobs.get(key).stage,'parent_started');
  assert.equal((await f.handler()(req(key))).status,200);assert.equal(writes(f).length,2);
});
test('a code visible in the global list is not considered absent when its parent detail is missing',async()=>{
  const f=fixture({parentOnlyInList:true});assert.equal((await f.handler()(req(id()))).status,409);assert.equal(writes(f).length,0);
});
test('child rejection leaves durable intent; absence is uncertain and never automatically retried',async()=>{
  const f=fixture({childRejected:true}),key=id();assert.equal((await f.handler()(req(key))).status,502);
  const r=await f.handler()(req(key));assert.equal(r.status,409);assert.equal((await r.json()).code,'child_outcome_uncertain');assert.equal(writes(f).length,2);
});
test('lost child response reconciles to verified without repeating writes',async()=>{
  const f=fixture({childLost:true}),key=id();assert.equal((await f.handler()(req(key))).status,503);assert.equal((await f.handler()(req(key))).status,200);assert.equal(writes(f).length,2);
});
test('unconfirmed parent never permits child creation or parent recreation, even after a 201 response',async()=>{
  const f=fixture({parentInvisible:true}),key=id();for(let n=0;n<2;n++){
    const r=await f.handler()(req(key));assert.equal(r.status,409);assert.equal((await r.json()).code,'parent_outcome_uncertain');
  }assert.equal(writes(f).length,1);
});
test('different operation ID cannot reuse reserved codes or mutate a frozen operation payload',async()=>{
  const f=fixture(),key=id();await f.handler()(req(key));assert.equal((await f.handler()(req(id()))).status,409);
  assert.equal((await f.handler()(req(key,{input:{...input,title:'Changed'}}))).status,409);assert.equal(writes(f).length,2);
});
test('concurrent requests share durable CAS; at most one parent and child POST',async()=>{
  const f=fixture(),key=id();const results=await Promise.all([f.handler()(req(key)),f.handler()(req(key)),f.handler()(req(key))]);
  assert.ok(results.some(r=>r.status===200));assert.ok(results.every(r=>[200,409].includes(r.status)));assert.equal(writes(f).length,2);
});
test('preview only reads and exposes exact allowlisted payload, no price/stock/images',async()=>{
  const f=fixture(),r=await f.handler()(req(id(),{action:'preview'}));assert.equal(r.status,200);const b=await r.json();assert.deepEqual(b.payload,api.registrationPayload(input));assert.equal(writes(f).length,0);assert.equal(f.jobs.size,0);
  assert.deepEqual(b.payload.parent.derivacoes,[]);assert.equal(b.payload.parent.ativo,false);assert.equal(b.payload.child.ativo,false);
});
test('production, invalid configuration, missing journal configuration, redirects and invalid relationship fail closed',async()=>{
  for(const baseUrl of ['https://livrariasul.painel.magazord.com.br/api','https://evil.invalid/api',undefined]){const f=fixture();assert.equal((await api.createMagazordRegistrationFunction({env:{...env,MAGAZORD_BASE_URL:baseUrl},fetcher:f.fetcher,journal:f.journal})(req(id()))).status,403);assert.equal(f.calls.length,0);}
  const f=fixture();const r=await api.createMagazordRegistrationFunction({env,fetcher:f.fetcher})(req(id()));assert.equal(r.status,503);assert.equal(writes(f).length,0);
  const redirect=fixture({remoteRedirect:true});assert.equal((await redirect.handler()(req(id()))).status,502);assert.equal(writes(redirect).length,0);
  const wrong=fixture({badRelationship:true});assert.equal((await wrong.handler()(req(id()))).status,409);assert.notEqual([...wrong.jobs.values()][0].stage,'verified');
});
test('Auth/MFA/store/active membership/origin cannot be bypassed and deny before journal or remote writes',async()=>{
  for(const headers of [{authorization:''},{authorization:`Bearer ${mfaToken(uid,'aal1')}`},{authorization:`Bearer ${mfaToken(store)}`},{'x-isbn-store-id':uid},{origin:'https://other.invalid'},{'sec-fetch-site':'cross-site'}]){
    const f=fixture(),r=await f.handler()(req(id(),{},headers));assert.ok([401,403].includes(r.status));assert.equal(f.jobs.size,0);assert.equal(writes(f).length,0);
  }
  for(const flags of [{authRejected:true},{member:false},{profile:false},{activeStore:false}]){const f=fixture(flags);assert.ok([401,403].includes((await f.handler()(req(id()))).status));assert.equal(f.jobs.size,0);}
});
test('invalid input and unrelated fields cannot alter the write payload',async()=>{
  for(const changed of [{parentCode:'x'.repeat(26)},{title:'x'.repeat(101)},{brandId:0},{categoryStoreId:uid},{fiscalOrigin:9},{childCode:input.parentCode},{unit:'bad'},{ean:'invalid'}]){const f=fixture();assert.ok([400,403].includes((await f.handler()(req(id(),{input:{...input,...changed}}))).status));assert.equal(writes(f).length,0);}
  const p=api.registrationPayload({...input,price:99,images:['https://bad.invalid'],quantity:3});assert.ok(!JSON.stringify(p).includes('bad.invalid'));assert.ok(!Object.hasOwn(p.parent,'price'));
});
test('SQL journal closes public access and reserves both namespaces transactionally; UI persists operation before create',async()=>{
  const sql=await readFile('supabase/setup/magazord_registration_journal.sql','utf8');assert.match(sql,/primary key \(store_id, code\)/);assert.match(sql,/enable row level security/);assert.match(sql,/from public, anon, authenticated/);assert.doesNotMatch(sql,/security definer/i);assert.match(sql,/after insert/);
  const ui=await readFile('src/components/magazord/MagazordRealRegistration.tsx','utf8');assert.ok(ui.indexOf('sessionStorage.setItem')<ui.indexOf('await submitMagazordRegistration'));assert.match(ui,/if \(lock.current/);
});
test('durable PostgREST adapter scopes actor/store, atomically advances and handles concurrent reserve',async()=>{
  const row={id:id(),store_id:store,actor_id:uid,parent_code:input.parentCode,child_code:input.childCode,fingerprint:'a'.repeat(64),stage:'prepared'};
  let stored=null, race=true;
  const calls=[];
  const journal=api.createRegistrationStore({...env,SUPABASE_SERVICE_ROLE_KEY:'sb_secret_fixture'},async(url,init)=>{
    url=new URL(url);calls.push({url,init});assert.equal(url.origin,'https://auth.invalid');assert.equal(url.pathname,'/rest/v1/magazord_registration_jobs');
    assert.equal(init.headers.apikey,'sb_secret_fixture');assert.equal(init.headers.Authorization,undefined);assert.equal(init.redirect,'error');
    if(init.method==='GET'){assert.equal(url.searchParams.get('actor_id'),'eq.'+uid);assert.equal(url.searchParams.get('store_id'),'eq.'+store);return Response.json(stored?[stored]:[]);}
    if(init.method==='POST'){stored={...row};if(race){race=false;return new Response(null,{status:409});}return Response.json([stored]);}
    assert.equal(init.method,'PATCH');assert.equal(url.searchParams.get('fingerprint'),'eq.'+row.fingerprint);
    if(url.searchParams.get('stage')!=='eq.'+stored.stage)return Response.json([]);
    stored={...stored,...JSON.parse(init.body)};return Response.json([stored]);
  });
  assert.deepEqual(await journal.reserve(row),row);assert.equal(await journal.advance(row,'parent_started'),true);assert.equal(await journal.advance(row,'parent_started'),false);
  assert.equal(calls.filter(c=>c.init.method==='POST').length,1);
});
test('malformed/oversized JSON, unknown query keys and unsupported methods never reach remote writing',async()=>{
  const f=fixture(),h=f.handler();for(const method of ['GET','PUT','PATCH','DELETE'])assert.equal((await h(new Request('https://isbn.invalid/api/magazord/registration',{method}))).status,405);
  const original=req(id());assert.equal((await h(new Request(original.url+'?environment=production',original))).status,400);
  const invalid=req(id());assert.equal((await h(new Request(invalid.url,{method:'POST',headers:invalid.headers,body:'{'}))).status,400);
  const large=req(id());assert.equal((await h(new Request(large.url,{method:'POST',headers:large.headers,body:'x'.repeat(70000)}))).status,400);
  assert.equal(writes(f).length,0);
});
test('description permits only composer formatting and does not forward arbitrary HTML',()=>{
  const p=api.registrationPayload({...input,description:'<strong>Estado</strong><br><img src=x onerror=alert(1)><script>alert(1)</script>'});
  assert.ok(p.parent.produtoLoja[0].descricao.includes('<strong>Estado</strong><br>'));assert.ok(!p.parent.produtoLoja[0].descricao.includes('<img'));assert.ok(!p.parent.produtoLoja[0].descricao.includes('<script'));
});
test('invalid catalog references are rejected before permanent reservation',async()=>{
  const f=fixture({noBrand:true});assert.equal((await f.handler()(req(id()))).status,400);assert.equal(f.jobs.size,0);assert.equal(writes(f).length,0);
});
