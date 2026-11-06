import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
const out=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`export * from './server/curitibaProductLinkFunction';export * from './src/services/curitibaProductLink';export {createRegistrationDraft} from './src/utils/draft';export {bookSourceLinks} from './src/utils/bookSourceLinks';`},bundle:true,write:false,format:'esm',platform:'node'});
const api=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
const fixture=JSON.parse(await readFile(new URL('./fixtures/curitiba/gravity-falls-product-link.json',import.meta.url),'utf8'));
const isbn='9788550303628',product='LV434083',expected={source:'curitiba',kind:'info',isbn,url:fixture.items[0].link};
const request=()=>new Request(`https://preview.invalid/api/curitiba/product-link?product=${product}&isbn=${isbn}`);
test('real returned product URL requires matching productReference and EAN/RefId on the same SKU',()=>{
 assert.deepEqual(api.selectCuritibaProductLink(fixture.items,product,isbn),expected);
 assert.deepEqual(api.selectCuritibaProductLink(fixture.items,product,'8550303623'),expected);
 for(const items of [[],[...fixture.items,...fixture.items],[{...fixture.items[0],productReference:'LV1'}],
  [{...fixture.items[0],items:[{ean:isbn,referenceId:[{Key:'RefId',Value:'LV1'}]},{ean:'9798276439839',referenceId:[{Key:'RefId',Value:product}]}]}]])
  assert.equal(api.selectCuritibaProductLink(items,product,isbn),null);
 for(const link of ['http://www.livrariascuritiba.com.br/item/p','https://attacker.invalid/item/p','https://www.livrariascuritiba.com.br/busca/p',expected.url+'?token=secret'])
  assert.equal(api.selectCuritibaProductLink([{...fixture.items[0],link}],product,isbn),null);
});
test('one fixed-host JSON request returns only the validated URL, without caller cookies or commercial fields',async()=>{
 let calls=0;const handler=api.createCuritibaProductLinkFunction({fetcher:async(url,init)=>{
  calls++;assert.equal(url.origin,'https://www.livrariascuritiba.com.br');assert.equal(url.searchParams.get('fq'),'alternateIds_RefId:'+product);
  assert.deepEqual(init.headers,{Accept:'application/json'});assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');
  return Response.json(fixture.items.map(item=>({...item,price:'never-return',stock:'never-return'})));
 }});
 const response=await handler(new Request(request(),{headers:{cookie:'private',authorization:'private'}}));
 assert.deepEqual(await response.json(),{status:'success',link:expected});assert.equal(calls,1);
});
test('invalid product/query/origin cannot select an arbitrary target',async()=>{
 const handler=api.createCuritibaProductLinkFunction({fetcher:()=>{assert.fail('No source request');}});
 for(const query of ['product=https://attacker.invalid&isbn='+isbn,'product=LV434083&isbn=bad','product=LV434083&isbn='+isbn+'&url=https://attacker.invalid'])
  assert.equal((await handler(new Request('https://preview.invalid/api/curitiba/product-link?'+query))).status,400);
 assert.equal((await handler(new Request(request(),{headers:{origin:'https://other.invalid'}}))).status,403);
});
for(const status of [403,404,429,503])test(`catalog HTTP ${status} stays nonfatal and is never retried`,async()=>{
 let calls=0;const handler=api.createCuritibaProductLinkFunction({fetcher:async()=>{calls++;return new Response('not saved',{status});}});
 assert.deepEqual(await(await handler(request())).json(),{status:'unavailable',link:null});assert.equal(calls,1);
});
test('deadline and oversized JSON stop link lookup without fallback',async()=>{
 for(const fetcher of [async(_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('timeout')),{once:true})),
  async()=>new Response('x'.repeat(256*1024+1),{headers:{'content-type':'application/json'}})]){
  const handler=api.createCuritibaProductLinkFunction({fetcher,timeoutMs:5});assert.equal((await(await handler(request())).json()).status,'unavailable');
 }
});
test('same-origin client makes one lookup only for a verified existing Curitiba product',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async(url,init)=>{
  calls++;assert.equal(url,`/api/curitiba/product-link?product=${product}&isbn=${isbn}`);assert.equal(init.credentials,'same-origin');
  return Response.json({status:'success',link:expected});
 });
 const book={id:'known',title:'Gravity Falls',reference:product,isbn13:isbn};
 assert.deepEqual(await api.loadCuritibaProductLink(book,isbn),[expected]);assert.equal(calls,1);
 for(const invalid of [{...book,reference:undefined},{...book,isbn13:'9798276439839'}])assert.deepEqual(await api.loadCuritibaProductLink(invalid,isbn),[]);
 assert.deepEqual(await api.loadCuritibaProductLink({...book,sourceLinks:[expected]},isbn),[expected]);assert.equal(calls,1);
 const controller=new AbortController();controller.abort();assert.deepEqual(await api.loadCuritibaProductLink(book,isbn,controller.signal),[]);
});
test('late links reach both book and NOVO/USADO without changing fields, images or manual revisions',()=>{
 const book={id:'known',title:'Título manual',reference:product,isbn13:isbn,publisher:'Editora escolhida',year:2020,
  coverUrl:'https://images.invalid/cover.jpg',additionalImages:['https://images.invalid/inside.jpg'],provenance:{publisher:'manual'}};
 const before=structuredClone(book),linked=api.appendCuritibaProductLinks(book,[expected]);assert.deepEqual(book,before);
 for(const key of Object.keys(book))assert.deepEqual(linked[key],book[key]);
 for(const condition of ['novo','usado']){
  const original=api.createRegistrationDraft(book,condition),manual={...original,title:'Título editado',price:'12,00',synopsis:''};
  const updated=api.appendCuritibaProductLinks(manual,[expected]);for(const key of Object.keys(manual))assert.deepEqual(updated[key],manual[key]);
  assert.deepEqual(api.bookSourceLinks(updated),api.bookSourceLinks(linked));
 }
 assert.equal(api.appendCuritibaProductLinks(book,[{...expected,isbn:'9798276439839'}]),book);
 assert.equal(api.appendCuritibaProductLinks(linked,[expected]).sourceLinks.length,1);
});
