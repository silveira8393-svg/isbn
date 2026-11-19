import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { mfaToken } from './helpers/mfa.mjs';
const built = await build({ stdin: { resolveDir: process.cwd(), contents: `export * from './server/magazordRegistration';export * from './server/magazordRegistrationStore';export * from './shared/magazordRegistration';export * from './server/magazordPrice';` }, bundle: true, write: false, platform: 'node', format: 'esm' });
const api = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const uid='11111111-1111-4111-8111-111111111111', store='22222222-2222-4222-8222-222222222222';
const base='https://homologacaosilveiralab.painel.magazord.com.br/api';
const env={MAGAZORD_BASE_URL:base,MAGAZORD_API_USER:'fixture-token',MAGAZORD_API_PASSWORD:'fixture-password',MAGAZORD_STORE_ID:store,MAGAZORD_HOMOLOGATION_CHANNELS:JSON.stringify({[store]:1}),MAGAZORD_HOMOLOGATION_DERIVATIONS:JSON.stringify({[store]:{definitionId:3,itemId:8}}),SUPABASE_URL:'https://auth.invalid',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'};
const input={parentCode:'USED-01-P',childCode:'USED-01',title:'Livro fixture',condition:'usado',categoryId:10,categoryStoreId:store,brandId:20,channelId:1,fiscalOrigin:0,unit:'UN',ncm:'49019900',description:'Conservacao fixture',ean:'9788551003664'};
const configuredPayload=()=>{const payload=api.registrationPayload(input);return {...payload,parent:{...payload.parent,derivacoes:[3]},child:{...payload.child,derivacoes:[{derivacao:3,derivacaoItemId:8}]}};};
const id=()=>crypto.randomUUID();
const req=(operationId,changes={},headers={})=>new Request('https://isbn.invalid/api/magazord/registration',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${mfaToken(uid)}`,'x-isbn-store-id':store,...headers},body:JSON.stringify({action:'create',operationId,input,...changes})});
function fixture(flags={}) {
  const calls=[],logs=[],jobs=new Map(),codes=new Set(),parents=new Map(),children=new Map();
  const fixtureStore=flags.store||store;
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
      if(url.pathname==='/rest/v1/store_users')return Response.json(flags.member===false?[]:[{user_id:uid,store_id:fixtureStore,role:'operator',active:true}]);
      if(url.pathname==='/rest/v1/stores')return Response.json([{id:fixtureStore,active:flags.activeStore!==false}]);
      assert.fail('Unexpected Auth path');
    }
    assert.equal(url.origin,new URL(base).origin);assert.equal(init.headers.Authorization,'Basic '+Buffer.from('fixture-token:fixture-password').toString('base64'));
    const intercepted=await flags.remote?.(url,init);if(intercepted)return intercepted;
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
        children.set(body.codigo,{...body,tipoRegistro:Object.hasOwn(flags,'childRecordType')?flags.childRecordType:'filho',agrupador:decodeURIComponent(url.pathname.split('/')[5])});
        if(flags.childLost){flags.childLost=false;throw new Error('synthetic lost response');}
      }
      return Response.json({status:'success',data:[]},{status:201});
    }
    assert.equal(init.method,'GET');
    assert.notEqual(url.pathname,'/api/v2/site/loja','Registration must not query stores');
    if(flags.rejectGet===url.pathname)return new Response('upstream private body fixture-token fixture-password',{status:flags.rejectStatus||403});
    if(flags.remoteRedirect)return new Response(null,{status:302,headers:{location:'https://livrariasul.painel.magazord.com.br/api'}});
    if(url.pathname==='/api/v2/site/marca')return page(flags.noBrand?[]:[{id:20}]);
    if(url.pathname==='/api/v2/site/categoria')return page([{id:10}]);
    if(url.pathname==='/api/v2/site/produtoDerivacoes')return page([...children.values(),
      ...(flags.includeParentsInList?[...parents.values()].map(p=>({...p,tipoRegistro:Object.hasOwn(flags,'parentRecordType')?flags.parentRecordType:'pai'})):[]),
      ...(flags.parentOnlyInList?[{codigo:input.parentCode,tipoRegistro:'pai'}]:[])].filter(c=>c.codigo.toLowerCase()===url.searchParams.get('codigo').toLowerCase()));
    if(url.pathname.endsWith('/derivacao'))return Response.json({status:'success',data:flags.badRelationship?[]:[...children.values()].filter(c=>c.agrupador===decodeURIComponent(url.pathname.split('/')[5]))
      .map(c=>Object.hasOwn(flags,'relationshipRecordType')?{...c,tipoRegistro:flags.relationshipRecordType}:c)});
    const p=parents.get(decodeURIComponent(url.pathname.split('/').at(-1)));
    return p?Response.json({status:'success',data:p}):new Response(null,{status:404});
  };
  return {calls,logs,jobs,parents,children,journal,fetcher,handler:()=>api.createMagazordRegistrationFunction({env,fetcher,journal,logDiagnostic:entry=>logs.push(entry)})};
}
const writes=f=>f.calls.filter(c=>c.init.method==='POST');

test('physical measures are sent only on child POST, with weight in kg and depth as length',async()=>{
  const measures={...input,weight:0.342,height:23,width:16,depth:1.51};
  const payload=api.registrationPayload(measures);
  assert.deepEqual([payload.child.peso,payload.child.altura,payload.child.largura,payload.child.comprimento],[0.342,23,16,1.51]);
  for(const field of ['peso','altura','largura','comprimento'])assert.equal(Object.hasOwn(payload.parent,field),false);
  const f=fixture(),response=await f.handler()(req(id(),{input:measures}));
  assert.equal(response.status,200);
  assert.equal(writes(f).length,2);
  assert.deepEqual(JSON.parse(writes(f)[1].init.body).peso,0.342);
  assert.equal(Object.hasOwn(JSON.parse(writes(f)[0].init.body),'peso'),false);
});
test('registrationInput converts grams to kg, preserves kg, and maps depth to length',()=>{
  const draft={condition:'novo',parentCode:'P-123',childCode:'9788551003664',title:'Livro',
    magazordCategoryId:10,magazordCategoryStoreId:store,fiscalOrigin:'0 - Nacional',unit:'UN',ncm:'49019900',
    ean:'9788551003664',isbn13:'9788551003664',isbn10:'',synopsis:'',weight:342,weightUnit:'g',
    height:23,width:16,depth:1.51};
  const grams=api.registrationInput(draft,20,1);
  assert.deepEqual([grams.weight,grams.height,grams.width,grams.depth],[0.342,23,16,1.51]);
  const kg=api.registrationInput({...draft,weight:0.342,weightUnit:'kg'},20,1);
  assert.equal(kg.weight,0.342);
});
test('invalid physical measures are rejected before any Magazord request, absent remain optional',async()=>{
  for(const field of ['weight','height','width','depth'])for(const value of [0,-1,NaN,Infinity,'23']){
    const f=fixture();
    const response=await f.handler()(req(id(),{input:{...input,[field]:value}}));
    assert.equal(response.status,400);
    assert.deepEqual(await response.json(),{code:'invalid_registration',fields:['dimensions']});
    assert.equal(writes(f).length,0);
  }
  const old=api.registrationPayload(input);
  for(const field of ['peso','altura','largura','comprimento'])assert.equal(Object.hasOwn(old.child,field),false);
});
test('NCM normalization preserves the commercial payload and existing canonical operation fingerprint',async()=>{
  const f=fixture(),key=id();
  assert.equal((await f.handler()(req(key,{input:{...input,ncm:'4901.99.00'}}))).status,200);
  assert.equal(JSON.parse(writes(f)[0].init.body).ncm,'49019900');
  assert.deepEqual(JSON.parse(writes(f)[0].init.body),configuredPayload().parent);
  const before=structuredClone(f.jobs.get(key));
  assert.equal((await f.handler()(req(key))).status,200);assert.deepEqual(f.jobs.get(key),before);assert.equal(writes(f).length,2);
  const invalid=fixture(),r=await invalid.handler()(req(id(),{input:{...input,ncm:'4901.99.A0'}}));
  assert.equal(r.status,400);assert.deepEqual(await r.json(),{code:'invalid_registration',fields:['ncm']});
  assert.equal(invalid.jobs.size,0);assert.equal(writes(invalid).length,0);
});

test('record type capitalization is normalized in parent, child and relationship confirmation without duplicate POSTs',async()=>{
  for(const [parentRecordType,childRecordType] of [['Pai','Filho'],['PAI','FILHO'],['pAi','fIlHo'],['pai','filho']]){
    const f=fixture({includeParentsInList:true,parentRecordType,childRecordType}),key=id();
    assert.equal((await f.handler()(req(key))).status,200);assert.equal(f.jobs.get(key).stage,'verified');
    assert.deepEqual(JSON.parse(writes(f)[0].init.body),configuredPayload().parent);
    assert.deepEqual(JSON.parse(writes(f)[1].init.body),configuredPayload().child);
    assert.equal((await f.handler()(req(key))).status,200);assert.equal(writes(f).length,2);
  }
});

test('missing, non-textual, padded or unknown record types fail closed in every confirmation location',async()=>{
  const invalid=[undefined,null,0,1,true,{},[],['Filho'],'',' Pai','Pai ','Filho\n','agrupador','Parent','Child'];
  for(const location of ['parent','child','relationship'])for(const value of [...invalid,location==='parent'?'Filho':'Pai']){
    const flags={includeParentsInList:true,parentRecordType:'Pai',childRecordType:'Filho',
      [location==='parent'?'parentRecordType':location==='child'?'childRecordType':'relationshipRecordType']:value};
    const f=fixture(flags),key=id(),r=await f.handler()(req(key));assert.equal(r.status,409);
    assert.deepEqual(await r.json(),{code:location==='relationship'?'invalid_relationship':'commercial_code_conflict'});
    assert.equal(f.jobs.get(key).stage,location==='parent'?'parent_started':'child_started');
    assert.equal(writes(f).length,location==='parent'?1:2);
    const count=writes(f).length;assert.equal((await f.handler()(req(key))).status,409);assert.equal(writes(f).length,count);
  }
});

test('capitalized types do not relax strict parent code, name or numeric brand comparisons',async()=>{
  for(const changed of [{codigo:input.parentCode.toLowerCase()},{nome:input.title+' '},{marca:String(input.brandId)}]){
    const f=fixture({includeParentsInList:true,parentRecordType:'Pai',childRecordType:'Filho',remote:async(url,init)=>{
      if(init.method==='GET'&&url.pathname==='/api/v2/site/produto/'+input.parentCode&&f.parents.has(input.parentCode))
        return Response.json({status:'success',data:{...f.parents.get(input.parentCode),...changed}});
    }}),key=id();
    const r=await f.handler()(req(key));assert.equal(r.status,409);assert.deepEqual(await r.json(),{code:'commercial_code_conflict'});
    assert.equal(f.jobs.get(key).stage,'parent_started');assert.equal(writes(f).length,1);
  }
});

test('capitalized types preserve strict child code, name and grouping comparisons',async()=>{
  for(const changed of [{codigo:input.childCode.toLowerCase()},{nome:input.title+' '},{agrupador:input.parentCode.toLowerCase()}]){
    const f=fixture({includeParentsInList:true,parentRecordType:'Pai',childRecordType:'Filho',remote:async(url,init)=>{
      if(init.method==='GET'&&url.pathname==='/api/v2/site/produtoDerivacoes'&&url.searchParams.get('codigo')===input.childCode&&f.children.size){
        const items=[{...f.children.get(input.childCode),...changed}];
        return Response.json({status:'success',data:{items,page:1,limit:100,total:1,total_pages:1,has_more:false}});
      }
    }}),key=id();
    const r=await f.handler()(req(key));assert.equal(r.status,409);assert.deepEqual(await r.json(),{code:'commercial_code_conflict'});
    assert.equal(f.jobs.get(key).stage,'child_started');assert.equal(writes(f).length,2);
  }
});

test('capitalized types preserve global result counts and strict relationship code, grouping and unique match',async()=>{
  for(const location of ['parent_count','child_count','relationship_count','relationship_code','relationship_group']){
    const f=fixture({includeParentsInList:true,parentRecordType:'Pai',childRecordType:'Filho',remote:async(url,init)=>{
      if(init.method!=='GET')return;
      const parent=location==='parent_count',code=parent?input.parentCode:input.childCode;
      const record=parent?f.parents.get(code):f.children.get(code);
      if(location.endsWith('_count')&&!location.startsWith('relationship')&&record&&url.pathname==='/api/v2/site/produtoDerivacoes'&&url.searchParams.get('codigo')===code){
        const item={...record,tipoRegistro:parent?'Pai':'Filho'};
        return Response.json({status:'success',data:{items:[item,item],page:1,limit:100,total:2,total_pages:1,has_more:false}});
      }
      if(location.startsWith('relationship')&&url.pathname.endsWith('/derivacao')&&record){
        const item={...record,...(location==='relationship_code'?{codigo:code.toLowerCase()}:{}),
          ...(location==='relationship_group'?{agrupador:input.parentCode.toLowerCase()}:{})};
        return Response.json({status:'success',data:location==='relationship_count'?[item,item]:[item]});
      }
    }}),key=id();
    const r=await f.handler()(req(key));assert.equal(r.status,409);
    assert.deepEqual(await r.json(),{code:location.startsWith('relationship')?'invalid_relationship':'commercial_code_conflict'});
    assert.equal(f.jobs.get(key).stage,location==='parent_count'?'parent_started':'child_started');
    assert.equal(writes(f).length,location==='parent_count'?1:2);
  }
});

const privateDetails='fixture-token fixture-password private-description private-person@example.invalid';
function assertSafeDiagnostics(logs) {
  assert.ok(logs.length);
  for(const entry of logs){
    assert.deepEqual(Object.keys(entry).sort(),['code','operation','phase','status']);
    assert.match(entry.operation,/^registration_[a-z_]+$/);assert.match(entry.phase,/^[a-z_]+$/);
    assert.ok(entry.status===null||Number.isInteger(entry.status));
  }
  for(const value of [privateDetails,...privateDetails.split(' '),uid,store,input.parentCode,input.childCode,input.title,input.ean])
    assert.ok(!JSON.stringify(logs).includes(value));
}

test('POST diagnostics: parent HTTP 400/401/403/406 preserve parent_started and never replay the POST',async()=>{
  for(const status of [400,401,403,406]){
    const f=fixture({remote:async(_url,init)=>init.method==='POST'?new Response(privateDetails,{status}):undefined}),key=id();
    const r=await f.handler()(req(key));assert.equal(r.status,502);assert.deepEqual(await r.json(),{code:'remote_rejected'});
    assert.equal(f.jobs.get(key).stage,'parent_started');assert.equal(writes(f).length,1);
    assert.deepEqual(f.logs,[{operation:'registration_parent_create',phase:'parent_creation',status:null,code:'remote_started'},
      {operation:'registration_parent_create',phase:'parent_creation',status,code:'remote_rejected'},
      ...(status===400?[{operation:'registration_parent_create',phase:'parent_creation',status,code:'remote_validation_detail_unavailable'}]:[])]);
    assertSafeDiagnostics(f.logs);const retry=await f.handler()(req(key));assert.equal(retry.status,409);
    assert.deepEqual(await retry.json(),{code:'parent_outcome_uncertain'});assert.equal(writes(f).length,1);assert.equal(f.jobs.size,1);
    assert.equal(f.jobs.get(key).stage,'parent_started');
  }
});

test('POST diagnostics: child refusal retains durable child intent and never recreates the parent or retries child',async()=>{
  const f=fixture({remote:async(url,init)=>init.method==='POST'&&url.pathname.endsWith('/derivacao')?new Response(privateDetails,{status:403}):undefined}),key=id();
  const r=await f.handler()(req(key));assert.equal(r.status,502);assert.deepEqual(await r.json(),{code:'remote_rejected'});
  assert.equal(f.jobs.get(key).stage,'child_started');assert.equal(f.parents.size,1);assert.equal(f.children.size,0);
  assert.deepEqual(f.logs.filter(e=>e.operation==='registration_child_create'),[
    {operation:'registration_child_create',phase:'child_creation',status:null,code:'remote_started'},
    {operation:'registration_child_create',phase:'child_creation',status:403,code:'remote_rejected'}]);
  const retry=await f.handler()(req(key));assert.equal(retry.status,409);assert.equal(writes(f).length,2);assertSafeDiagnostics(f.logs);
});

test('validation HTTP 400: parent fields and rules are sanitized without payload changes, releases or POST replay',async()=>{
  const f=fixture({remote:async(_url,init)=>init.method==='POST'?Response.json({status:'error',message:privateDetails,
    errors:[{field:'derivacoes',rule:'minItems',message:privateDetails},{field:'marca',code:'not_found',value:privateDetails},
      {field:'categorias',code:'invalid'},{field:'origemFiscal',rule:'required'},{field:'ncm',code:'format'},
      {path:['produtoLoja',0,'loja'],rule:'required'},{field:privateDetails,rule:'required'}]},{status:400}):undefined}),key=id();
  const r=await f.handler()(req(key));assert.equal(r.status,502);assert.deepEqual(await r.json(),{code:'remote_rejected'});
  assert.deepEqual(f.logs.filter(e=>e.code.startsWith('remote_validation_')).map(e=>e.code),[
    'remote_validation_categorias_invalid','remote_validation_derivacoes_min_items','remote_validation_marca_not_found',
    'remote_validation_ncm_format','remote_validation_origem_fiscal_required','remote_validation_produto_loja_loja_required']);
  assert.deepEqual(JSON.parse(writes(f)[0].init.body),configuredPayload().parent);
  assert.equal(f.jobs.get(key).stage,'parent_started');assertSafeDiagnostics(f.logs);
  assert.equal((await f.handler()(req(key))).status,409);assert.equal(writes(f).length,1);assert.equal(f.jobs.size,1);
});

test('validation HTTP 400: unknown, broken and oversized error bodies preserve the known rejection',async()=>{
  for(const response of [()=>Response.json({message:'marca derivacoes '+privateDetails},{status:400}),
    ()=>new Response('{'+privateDetails,{status:400,headers:{'content-type':'application/json'}}),
    ()=>new Response('x'.repeat(16*1024+1),{status:400,headers:{'content-type':'application/json'}}),
    ()=>new Response(new ReadableStream({start(c){c.error(new Error(privateDetails));}}),{status:400,headers:{'content-type':'application/json'}})]){
    const f=fixture({remote:async(_url,init)=>init.method==='POST'?response():undefined}),key=id();
    const r=await f.handler()(req(key));assert.equal(r.status,502);assert.deepEqual(await r.json(),{code:'remote_rejected'});
    assert.equal(f.logs.at(-1).code,'remote_validation_detail_unavailable');assert.equal(f.logs.at(-1).status,400);
    assert.equal(f.jobs.get(key).stage,'parent_started');assertSafeDiagnostics(f.logs);
  }
});

test('validation HTTP 400: child rejection has child phase and keeps the parent and child intent intact',async()=>{
  const f=fixture({remote:async(url,init)=>init.method==='POST'&&url.pathname.endsWith('/derivacao')
    ?Response.json({errors:{lojas:{rule:'invalid',value:privateDetails}}},{status:400}):undefined}),key=id();
  const r=await f.handler()(req(key));assert.equal(r.status,502);assert.deepEqual(await r.json(),{code:'remote_rejected'});
  assert.deepEqual(f.logs.at(-1),{operation:'registration_child_create',phase:'child_creation',status:400,code:'remote_validation_lojas_invalid'});
  assert.equal(f.parents.size,1);assert.equal(f.jobs.get(key).stage,'child_started');
  assert.equal((await f.handler()(req(key))).status,409);assert.equal(writes(f).length,2);assertSafeDiagnostics(f.logs);
});

test('POST diagnostics: timeout and transport failure are distinct for parent and child, without HTTP status',async()=>{
  for(const child of [false,true])for(const timeout of [false,true]){
    const f=fixture({remote:async(url,init)=>{
      if(init.method==='POST'&&url.pathname.endsWith('/derivacao')===child)throw timeout?new DOMException(privateDetails,'TimeoutError'):new TypeError(privateDetails);
    }}),key=id();
    const r=await f.handler()(req(key));assert.equal(r.status,503);assert.deepEqual(await r.json(),{code:'operation_uncertain_reconcile_before_retry'});
    const operation=child?'registration_child_create':'registration_parent_create';
    assert.deepEqual(f.logs.filter(e=>e.operation===operation).at(-1),{operation,phase:child?'child_creation':'parent_creation',status:null,code:timeout?'remote_timeout':'remote_transport_error'});
    assert.equal(f.jobs.get(key).stage,child?'child_started':'parent_started');
    const before=writes(f).length;assert.equal((await f.handler()(req(key))).status,409);assert.equal(writes(f).length,before);assertSafeDiagnostics(f.logs);
  }
});

test('POST diagnostics: actual shared deadline expiration is classified without changing the production timeout',async t=>{
  const original=AbortSignal.timeout.bind(AbortSignal);t.mock.method(AbortSignal,'timeout',ms=>original(ms===20000?30:ms));
  const f=fixture({remote:async(_url,init)=>{
    if(init.method==='POST')await new Promise((_,reject)=>{if(init.signal.aborted)reject(init.signal.reason);else init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true});});
  }}),key=id();
  const r=await f.handler()(req(key));assert.equal(r.status,503);assert.equal(f.jobs.get(key).stage,'parent_started');
  assert.deepEqual(f.logs.at(-1),{operation:'registration_parent_create',phase:'parent_creation',status:null,code:'remote_timeout'});
  assert.equal(writes(f).length,1);assertSafeDiagnostics(f.logs);
});

test('POST diagnostics: failed confirmation GETs identify parent, child and relationship phases',async()=>{
  for(const phase of ['parent_confirmation','child_confirmation','relationship_confirmation']){
    let parentSent=false,childSent=false;
    const f=fixture({remote:async(url,init)=>{
      if(init.method==='POST'){if(url.pathname.endsWith('/derivacao'))childSent=true;else parentSent=true;return;}
      if((phase==='parent_confirmation'&&parentSent&&!childSent&&url.pathname.endsWith('/'+input.parentCode))
        ||(phase==='child_confirmation'&&childSent&&url.pathname.endsWith('/'+input.parentCode))
        ||(phase==='relationship_confirmation'&&url.pathname.endsWith('/derivacao')))return new Response(privateDetails,{status:503});
    }}),key=id();
    const r=await f.handler()(req(key));assert.equal(r.status,502);assert.deepEqual(await r.json(),{code:'remote_rejected'});
    const rejected=f.logs.filter(e=>e.code==='remote_rejected').at(-1);
    assert.deepEqual(rejected,{operation:phase==='relationship_confirmation'?'registration_relationship_lookup':'registration_product_lookup',phase,status:503,code:'remote_rejected'});
    assert.equal(f.jobs.get(key).stage,phase==='parent_confirmation'?'parent_started':'child_started');
    const before=writes(f).length;await f.handler()(req(key));assert.equal(writes(f).length,before);assertSafeDiagnostics(f.logs);
  }
});

test('POST diagnostics: success HTTP with invalid content, JSON, encoding, size or envelope never confirms or retries',async()=>{
  const cases=[
    [()=>new Response(privateDetails,{status:201}),502,'invalid_remote_response'],
    [()=>new Response('{"private":"'+privateDetails,{status:201,headers:{'content-type':'application/json'}}),503,'invalid_remote_response'],
    [()=>new Response(null,{status:201,headers:{'content-type':'application/json'}}),503,'invalid_remote_response'],
    [()=>new Response(new Uint8Array([0xff]),{status:201,headers:{'content-type':'application/json'}}),503,'invalid_remote_response'],
    [()=>new Response('x'.repeat(512*1024+1),{status:201,headers:{'content-type':'application/json'}}),503,'invalid_remote_response'],
    [()=>Response.json({status:'error',message:privateDetails,data:[]},{status:201}),502,'invalid_remote_response'],
    [()=>Response.json({status:'success'},{status:201}),502,'invalid_remote_response'],
    [()=>Response.json({status:'success',data:[]},{status:200}),502,'remote_rejected'],
  ];
  for(const [response,http,code] of cases){
    const f=fixture({remote:async(_url,init)=>init.method==='POST'?response():undefined}),key=id();
    assert.equal((await f.handler()(req(key))).status,http);assert.equal(f.jobs.get(key).stage,'parent_started');
    assert.equal(f.logs.at(-1).code,code);assert.equal(f.logs.at(-1).status,code==='remote_rejected'?200:201);
    assert.equal((await f.handler()(req(key))).status,409);assert.equal(writes(f).length,1);assertSafeDiagnostics(f.logs);
  }
});

test('POST diagnostics: body stream failure and timeout retain the received HTTP status',async()=>{
  for(const timeout of [false,true]){
    const f=fixture({remote:async(_url,init)=>init.method==='POST'?new Response(new ReadableStream({start(c){c.error(timeout?new DOMException(privateDetails,'TimeoutError'):new Error(privateDetails));}}),{status:201,headers:{'content-type':'application/json'}}):undefined}),key=id();
    assert.equal((await f.handler()(req(key))).status,503);assert.equal(f.jobs.get(key).stage,'parent_started');
    assert.deepEqual(f.logs.at(-1),{operation:'registration_parent_create',phase:'parent_creation',status:201,code:timeout?'remote_timeout':'remote_transport_error'});
    assertSafeDiagnostics(f.logs);
  }
});

test('POST diagnostics: missing parent and invalid relationships log existing confirmation guards without changing them',async()=>{
  for(const [flags,phase,code,stage] of [[{parentInvisible:true},'parent_confirmation','parent_outcome_uncertain','parent_started'],
    [{badRelationship:true},'relationship_confirmation','invalid_relationship','child_started']]){
    const f=fixture(flags),key=id(),r=await f.handler()(req(key));assert.equal(r.status,409);assert.deepEqual(await r.json(),{code});
    assert.deepEqual(f.logs.at(-1),{operation:'registration_confirmation',phase,status:null,code});assert.equal(f.jobs.get(key).stage,stage);
    assertSafeDiagnostics(f.logs);
  }
});

test('POST diagnostics: confirmation timeout, transport and format errors retain their phase and existing responses',async()=>{
  for(const [kind,http,code,status] of [['timeout',503,'remote_timeout',null],['transport',503,'remote_transport_error',null],
    ['content',502,'invalid_remote_response',200],['json',503,'invalid_remote_response',200],['pagination',502,'incomplete_code_lookup',null]]){
    let parentSent=false;
    const f=fixture({remote:async(url,init)=>{
      if(init.method==='POST'){parentSent=true;return;}
      if(!parentSent)return;
      if(kind==='pagination'){
        if(url.pathname.endsWith('/produtoDerivacoes'))return Response.json({status:'success',data:{items:{},page:1,limit:100,has_more:false,total:0}});
        return;
      }
      if(!url.pathname.endsWith('/'+input.parentCode))return;
      if(kind==='timeout')throw new DOMException(privateDetails,'TimeoutError');
      if(kind==='transport')throw new TypeError(privateDetails);
      return new Response(kind==='json'?'{'+privateDetails:privateDetails,{headers:{'content-type':kind==='json'?'application/json':'text/plain'}});
    }}),key=id();
    assert.equal((await f.handler()(req(key))).status,http);assert.equal(f.jobs.get(key).stage,'parent_started');
    assert.deepEqual(f.logs.at(-1),{operation:kind==='pagination'?'registration_confirmation':'registration_product_lookup',phase:'parent_confirmation',status,code});
    await f.handler()(req(key));assert.equal(writes(f).length,1);assertSafeDiagnostics(f.logs);
  }
});

test('POST diagnostics: default logger emits only JSON metadata and logger failures never affect registration',async t=>{
  const printed=[];t.mock.method(console,'warn',value=>printed.push(JSON.parse(value)));
  const f=fixture(),key=id(),handler=api.createMagazordRegistrationFunction({env,fetcher:f.fetcher,journal:f.journal});
  assert.equal((await handler(req(key))).status,200);assertSafeDiagnostics(printed);
  assert.ok(printed.some(e=>e.operation==='registration_parent_create'&&e.status===201&&e.code==='remote_success'));
  assert.ok(printed.some(e=>e.operation==='registration_child_create'&&e.status===201&&e.code==='remote_success'));
  assert.ok(printed.some(e=>e.phase==='parent_confirmation'&&e.code==='remote_success'));
  assert.ok(printed.some(e=>e.phase==='child_confirmation'&&e.code==='remote_success'));
  for(const rejected of [false,true]){
    const f=fixture(rejected?{remote:async(_url,init)=>init.method==='POST'?new Response(privateDetails,{status:403}):undefined}:{}),key=id();
    const handler=api.createMagazordRegistrationFunction({env,fetcher:f.fetcher,journal:f.journal,logDiagnostic(){throw new Error(privateDetails);}});
    assert.equal((await handler(req(key))).status,rejected?502:200);assert.equal(f.jobs.get(key).stage,rejected?'parent_started':'verified');
  }
});

test('homologation binding 1 unblocks preview with brand/category/code GETs and no store lookup or journal',async()=>{
  const f=fixture(),r=await f.handler()(req(id(),{action:'preview'}));
  assert.equal(r.status,200);const body=await r.json();
  assert.equal(body.payload.parent.produtoLoja[0].loja,1);assert.deepEqual(body.payload.child.lojas,[1]);
  const paths=f.calls.filter(c=>c.url.origin===new URL(base).origin).map(c=>c.url.pathname);
  assert.deepEqual(paths,['/api/v2/site/marca','/api/v2/site/categoria','/api/v2/site/produto/'+input.parentCode,
    '/api/v2/site/produto/'+input.childCode,'/api/v2/site/produtoDerivacoes','/api/v2/site/produtoDerivacoes']);
  assert.equal(writes(f).length,0);assert.equal(f.jobs.size,0);
});

test('missing, malformed or unbound channel configuration fails closed in preview and create',async()=>{
  const invalid=[undefined,'','{','null','[]','1','{}',JSON.stringify({[uid]:1}),
    ...[null,0,-1,1.5,'1',Number.MAX_SAFE_INTEGER+1,true,{}].map(v=>JSON.stringify({[store]:v})),
    JSON.stringify({[store]:1,default:1}),JSON.stringify({[store]:1,[uid]:0})];
  for(const action of ['preview','create'])for(const value of invalid){
    const f=fixture();const handler=api.createMagazordRegistrationFunction({env:{...env,MAGAZORD_HOMOLOGATION_CHANNELS:value},fetcher:f.fetcher,journal:f.journal});
    const r=await handler(req(id(),{action}));assert.equal(r.status,503);assert.deepEqual(await r.json(),{code:'channel_not_configured'});
    assert.ok(f.calls.every(c=>c.url.origin==='https://auth.invalid'));assert.equal(f.jobs.size,0);assert.equal(writes(f).length,0);
  }
});

test('browser channel divergence is denied before remote GETs, reservations or creation',async()=>{
  for(const action of ['preview','create']){
    const f=fixture(),r=await f.handler()(req(id(),{action,input:{...input,channelId:99}}));
    assert.equal(r.status,403);assert.deepEqual(await r.json(),{code:'channel_access_denied'});
    assert.ok(f.calls.every(c=>c.url.origin==='https://auth.invalid'));assert.equal(f.jobs.size,0);assert.equal(writes(f).length,0);
  }
});

test('independent ISBN stores select only their own backend channel binding, without a global default',async()=>{
  const other='33333333-3333-4333-8333-333333333333',bindings=JSON.stringify({[store]:1,[other]:2});
  for(const [selected,channel] of [[store,1],[other,2]]){
    const f=fixture({store:selected});const handler=api.createMagazordRegistrationFunction({env:{...env,MAGAZORD_STORE_ID:selected,MAGAZORD_HOMOLOGATION_CHANNELS:bindings,MAGAZORD_HOMOLOGATION_DERIVATIONS:JSON.stringify({[store]:{definitionId:3,itemId:8},[other]:{definitionId:4,itemId:9}})},fetcher:f.fetcher,journal:f.journal});
    const r=await handler(req(id(),{action:'preview',input:{...input,categoryStoreId:selected,channelId:channel}},{'x-isbn-store-id':selected}));
    assert.equal(r.status,200);const body=await r.json();assert.equal(body.payload.parent.produtoLoja[0].loja,channel);assert.deepEqual(body.payload.child.lojas,[channel]);
    assert.deepEqual(body.payload.parent.derivacoes,[selected===store?3:4]);
    assert.deepEqual(body.payload.child.derivacoes,[{derivacao:selected===store?3:4,derivacaoItemId:selected===store?8:9}]);
    const denied=await handler(req(id(),{action:'preview',input:{...input,categoryStoreId:selected,channelId:channel===1?2:1}},{'x-isbn-store-id':selected}));
    assert.equal(denied.status,403);assert.equal(writes(f).length,0);
  }
});

test('tenant derivation bindings fail closed before remote reads or reservations when missing or invalid',async()=>{
  const other='33333333-3333-4333-8333-333333333333';
  const invalid=[undefined,'','invalid','null','[]','{}',JSON.stringify({[other]:{definitionId:3,itemId:8}}),
    ...[{definitionId:0,itemId:8},{definitionId:3,itemId:-1},{definitionId:'3',itemId:8},
      {definitionId:3,itemId:8.5},{definitionId:3},{definitionId:3,itemId:8,extra:1},null,[],
      {definitionId:Number.MAX_SAFE_INTEGER+1,itemId:8}].map(binding=>JSON.stringify({[store]:binding})),
    JSON.stringify({bad:{definitionId:3,itemId:8},[store]:{definitionId:3,itemId:8}})];
  for(const action of ['preview','create'])for(const binding of invalid){
    const f=fixture();const handler=api.createMagazordRegistrationFunction({env:{...env,MAGAZORD_HOMOLOGATION_DERIVATIONS:binding},fetcher:f.fetcher,journal:f.journal});
    const r=await handler(req(id(),{action}));assert.equal(r.status,503);assert.deepEqual(await r.json(),{code:'derivation_not_configured'});
    assert.ok(f.calls.every(c=>c.url.origin==='https://auth.invalid'));assert.equal(f.jobs.size,0);assert.equal(writes(f).length,0);
  }
});

test('only backend tenant derivations enter preview and POSTs; all other payload fields stay identical',async()=>{
  for(const condition of ['novo','usado']){
    const f=fixture(),key=id(),data={...input,condition,derivacoes:[999],definitionId:999,itemId:999};
    const preview=await f.handler()(req(key,{action:'preview',input:data}));assert.equal(preview.status,200);
    assert.deepEqual((await preview.json()).payload,configuredPayload());assert.equal(f.jobs.size,0);
    assert.equal((await f.handler()(req(key,{input:data}))).status,200);
    assert.deepEqual(JSON.parse(writes(f)[0].init.body),configuredPayload().parent);
    assert.deepEqual(JSON.parse(writes(f)[1].init.body),configuredPayload().child);
    assert.equal((await f.handler()(req(key,{input:data}))).status,200);assert.equal(writes(f).length,2);
  }
});

test('derivation configuration changes and legacy empty arrays cannot mutate a frozen operation fingerprint',async()=>{
  for(const legacy of [false,true]){
    const f=fixture({parentInvisible:true}),key=id();
    if(legacy){
      const fingerprint=createHash('sha256').update(JSON.stringify({storeId:store,condition:input.condition,payload:api.registrationPayload(input)})).digest('hex');
      await f.journal.reserve({id:key,store_id:store,actor_id:uid,parent_code:input.parentCode,child_code:input.childCode,fingerprint,stage:'parent_started'});
    }else assert.equal((await f.handler()(req(key))).status,409);
    const before=structuredClone(f.jobs.get(key)),count=writes(f).length;
    const handler=api.createMagazordRegistrationFunction({env:{...env,MAGAZORD_HOMOLOGATION_DERIVATIONS:JSON.stringify({[store]:{definitionId:legacy?3:4,itemId:legacy?8:9}})},fetcher:f.fetcher,journal:f.journal});
    const r=await handler(req(key));assert.equal(r.status,409);assert.deepEqual(await r.json(),{code:'operation_payload_changed'});
    assert.deepEqual(f.jobs.get(key),before);assert.equal(writes(f).length,count);
  }
});

test('derivation binding from another establishment never falls back to the first store',async()=>{
  const other='33333333-3333-4333-8333-333333333333',f=fixture({store:other});
  const handler=api.createMagazordRegistrationFunction({env:{...env,MAGAZORD_STORE_ID:other,MAGAZORD_HOMOLOGATION_CHANNELS:JSON.stringify({[other]:1})},fetcher:f.fetcher,journal:f.journal});
  const r=await handler(req(id(),{action:'preview',input:{...input,categoryStoreId:other}},{'x-isbn-store-id':other}));
  assert.equal(r.status,503);assert.deepEqual(await r.json(),{code:'derivation_not_configured'});assert.equal(f.jobs.size,0);assert.equal(writes(f).length,0);
});

test('channel bindings cannot enable production or other hosts in preview or create',async()=>{
  for(const action of ['preview','create'])for(const target of ['https://livrariasul.painel.magazord.com.br/api',
    'https://livrariasul.painel.magazord.com.br/api/','https://other.invalid/api','http://homologacaosilveiralab.painel.magazord.com.br/api']){
    const f=fixture();const handler=api.createMagazordRegistrationFunction({env:{...env,MAGAZORD_BASE_URL:target},fetcher:f.fetcher,journal:f.journal});
    const r=await handler(req(id(),{action}));assert.equal(r.status,403);assert.deepEqual(await r.json(),{code:'homologation_only'});assert.equal(f.calls.length,0);assert.equal(f.jobs.size,0);
  }
});

test('channel change cannot redirect an already reserved partial operation',async()=>{
  const f=fixture({childLost:true}),key=id();assert.equal((await f.handler()(req(key))).status,503);
  const before=writes(f).length,stage=f.jobs.get(key).stage;
  const handler=api.createMagazordRegistrationFunction({env:{...env,MAGAZORD_HOMOLOGATION_CHANNELS:JSON.stringify({[store]:2})},fetcher:f.fetcher,journal:f.journal});
  const r=await handler(req(key));assert.equal(r.status,403);assert.deepEqual(await r.json(),{code:'channel_access_denied'});
  assert.equal(writes(f).length,before);assert.equal(f.jobs.get(key).stage,stage);
});

test('read rejection diagnostics identify each preview GET without sensitive data or fallback',async()=>{
  for(const [path,operation] of [
    ['/api/v2/site/marca','registration_brand_lookup'],
    ['/api/v2/site/categoria','registration_category_lookup'],
    ['/api/v2/site/produto/'+input.parentCode,'registration_product_lookup'],
    ['/api/v2/site/produto/'+input.childCode,'registration_product_lookup'],
    ['/api/v2/site/produtoDerivacoes','registration_commercial_code_lookup'],
  ]){
    const f=fixture({rejectGet:path});
    const response=await f.handler()(req(id(),{action:'preview'}));
    assert.equal(response.status,502);assert.deepEqual(await response.json(),{code:'remote_rejected'});
    assert.deepEqual(f.logs,[{operation,phase:path.endsWith('/marca')||path.endsWith('/categoria')?'catalog_validation':'code_availability',status:403,code:'remote_rejected'}]);
    const remote=f.calls.filter(c=>c.url.origin===new URL(base).origin);
    assert.equal(remote.at(-1).url.pathname,path);
    assert.equal(remote.filter(c=>c.url.pathname===path).length,1);
    assert.equal(writes(f).length,0);assert.equal(f.jobs.size,0);
    assert.doesNotMatch(JSON.stringify(f.logs),/fixture-token|fixture-password|Authorization|private body|USED-01/);
  }
});

test('read rejection diagnostics preserve HTTP status and successful preview accepts missing codes without logging',async()=>{
  for(const status of [401,403,429,503]){
    const f=fixture({rejectGet:'/api/v2/site/categoria',rejectStatus:status});
    assert.equal((await f.handler()(req(id(),{action:'preview'}))).status,502);
    assert.deepEqual(f.logs,[{operation:'registration_category_lookup',phase:'catalog_validation',status,code:'remote_rejected'}]);
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
  const f=fixture(),r=await f.handler()(req(id(),{action:'preview'}));assert.equal(r.status,200);const b=await r.json();assert.deepEqual(b.payload,configuredPayload());assert.equal(writes(f).length,0);assert.equal(f.jobs.size,0);
  assert.deepEqual(b.payload.parent.derivacoes,[3]);assert.deepEqual(b.payload.child.derivacoes,[{derivacao:3,derivacaoItemId:8}]);assert.equal(b.payload.parent.ativo,false);assert.equal(b.payload.child.ativo,false);
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

test('new ISBN registration and interrupted recovery can price LVP007 once; preexisting products cannot',async()=>{
  const book={...input,parentCode:'LVP007',childCode:'9788535931938',ean:'9788535931938'};
  for(const scenario of ['new','recovered','preexisting']){
    const f=fixture({childLost:scenario==='recovered'}),key=id(),priceId=id();
    if(scenario==='preexisting')f.parents.set(book.parentCode,api.registrationPayload(book).parent);
    let result=await f.handler()(req(key,{input:book}));
    if(scenario==='recovered'){
      assert.equal(result.status,503);assert.equal(f.jobs.get(key).stage,'child_started');assert.equal(writes(f).length,2);
      result=await f.handler()(req(key,{input:book}));
    }
    assert.equal(result.status,scenario==='preexisting'?409:200);
    assert.equal(f.jobs.get(key).stage,scenario==='preexisting'?'prepared':'verified');
    let saved=null,pricePosts=0;const remoteOrder=[];
    const fetcher=async(target,init)=>{
      const url=new URL(target);
      if(url.origin==='https://auth.invalid'){
        if(url.pathname==='/rest/v1/magazord_registration_jobs'){
          assert.equal(init.method,'GET');assert.equal(url.searchParams.get('id'),'eq.'+key);
          return Response.json([{...f.jobs.get(key)}]);
        }
        if(url.pathname==='/rest/v1/magazord_price_jobs'){
          if(init.method==='GET')return Response.json(url.searchParams.get('limit')==='0'?[]:saved?[{...saved}]:[]);
          if(init.method==='POST'){assert.equal(saved,null);saved=JSON.parse(init.body);return Response.json([{...saved}]);}
          assert.equal(init.method,'PATCH');assert.equal(url.searchParams.get('stage'),'eq.'+saved.stage);
          assert.equal(url.searchParams.get('fingerprint'),'eq.'+saved.fingerprint);
          saved={...saved,...JSON.parse(init.body)};return Response.json([{...saved}]);
        }
        return f.fetcher(target,init);
      }
      remoteOrder.push([init.method,url.pathname]);
      if(url.pathname==='/api/v1/preco'){
        assert.equal(init.method,'POST');assert.equal(f.jobs.get(key).stage,'verified');assert.equal(saved.stage,'price_started');
        assert.deepEqual(JSON.parse(init.body),[{produto:book.childCode,tabelaPreco:1,precoVenda:12}]);
        pricePosts++;return Response.json({sucesso:true});
      }
      assert.equal(url.pathname,'/api/v1/listPreco');assert.equal(init.method,'GET');assert.equal(pricePosts,1);
      return Response.json(url.searchParams.get('ativo')==='0'?{total:0,data:[]}:
        {total:1,data:[{produto:book.childCode,tabelaPreco:1,anuncio:null,precoVenda:12,precoAntigo:null}]});
    };
    const handler=api.createMagazordPriceFunction({env:{...env,SUPABASE_SERVICE_ROLE_KEY:'sb_secret_fixture',
      MAGAZORD_HOMOLOGATION_PRICES:JSON.stringify({[store]:{channelId:1,tableId:1}}),MAGAZORD_HOMOLOGATION_PRICE_OPERATION_ID:priceId},fetcher});
    const priceRequest=action=>new Request('https://isbn.invalid/api/magazord/price',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${mfaToken(uid)}`,'x-isbn-store-id':store},
      body:JSON.stringify({action,registrationId:key,price:'12,00',...(action==='prepare'?{}:{operationId:priceId})})});
    assert.equal((await handler(priceRequest('prepare'))).status,scenario==='preexisting'?409:200);assert.equal(remoteOrder.length,0);
    const sent=await handler(priceRequest('send'));assert.equal(sent.status,scenario==='preexisting'?409:200);
    if(scenario==='preexisting'){
      assert.equal(pricePosts,0);assert.equal(writes(f).length,0);assert.equal(remoteOrder.length,0);assert.equal(saved,null);
    }else{
      assert.equal(saved.stage,'price_verified');assert.equal(pricePosts,1);assert.deepEqual(remoteOrder[0],['POST','/api/v1/preco']);
      await handler(priceRequest('send'));await handler(priceRequest('reconcile'));assert.equal(pricePosts,1);assert.equal(writes(f).length,2);
    }
  }
});
