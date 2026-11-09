// Offline browser smoke: real UI, fixture-only services, no external requests or database writes.
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {homedir} from 'node:os';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const user={id:'11111111-1111-4111-8111-111111111111',storeId:'22222222-2222-4222-8222-222222222222',role:'developer',active:true,name:'Ensaio visual',storeName:'Livraria Sul — fixtures'};
const google=JSON.parse(await readFile('tests/fixtures/google-books-preview-2026-11-05.json','utf8')).results[2].body;
const fixture=target=>({id:'fixture-'+target,title:target==='9786556096674'?'O livro do Bill':target==='9788550303628'?'O diário perdido de Gravity Falls':'O Rei de Amarelo',isbn13:target,
  authors:['Autor da fixture'],publisher:'Editora da fixture',year:2020,pageCount:288,coverUrl:'https://images.invalid/cover.svg',additionalImages:['https://images.invalid/inside.svg']});
const mocks=[
 [/contexts\/UserContext$/,`export const useUser=()=>({currentUser:${JSON.stringify(user)},operationEnvironment:'development',canViewProduction:true,canViewSettings:true,isOperator:false,signOut:async()=>{}});`],
 [/hooks\/useMagazordCategories$/, `export const useMagazordCategories=()=>({loading:false,storeId:'${user.storeId}',reload(){},catalog:{categories:[{id:1,nome:'Livros',pai:null,path:'Livros',depth:0}],invalidCount:0}});`],
 [/hooks\/useOperationAudit$/,`export const useOperationAudit=()=>({saveOperation:()=>{},pending:[],retry:()=>{},saving:0});`],
 [/hooks\/useLocalHistory$/,`import {useState} from 'react';export const useLocalHistory=()=>{const[history,setHistory]=useState([]);return{history,setHistory,clearHistory:()=>setHistory([])}};`],
 [/services\/brasilApi$/,`const fixture=${fixture.toString()};export const searchBookByIsbnBrasilApi=async isbn=>{await new Promise(r=>setTimeout(r,60));return{book:fixture(isbn),diagnostic:{status:200}}};`],
 [/services\/distribuidoraCuritiba$/,`export const searchBookByIsbnDistribuidoraCuritiba=async()=>{await new Promise(r=>setTimeout(r,150));return{book:{id:'curitiba-fixture',title:'Gravity Falls',isbn13:'9788550303628',reference:'LV434083'},diagnostic:{status:200,state:'success'}}};export const mergeBookWithDistribuidora=(a,b)=>({...a,...b});`],
 [/services\/googleBooks$/,`export {complementWithGoogleBooks} from './src/services/googleBooks.ts';export const searchGoogleBooks=async isbn=>{await new Promise(r=>setTimeout(r,20));return isbn==='9788550303628'?${JSON.stringify(google)}:{status:'not_found',book:null,diagnostic:{code:'no_results',httpStatus:200}}};`],
 [/services\/amazonOfficial$/,`export const searchAmazonOfficial=async isbn=>{await new Promise(r=>setTimeout(r,120));return{status:'success',book:{id:'amazon-fixture',title:'Fixture',isbn13:isbn,...(isbn==='9798276439839'?{amazonCatalogReference:{asin:'B0G4CS2PMG',isbn,marketplaceId:'A2Q3Y263D00KWC'}}:{})}}};export const complementWithAmazon=(a,b)=>a||b;export const complementAmazonImages=async b=>b;`],
 [/services\/magazordMockService$/,`const service={resetModeToAuto:()=>{},getSimulationConfig:()=>({mode:'auto'}),checkProductByEan:async()=>({exists:false,status:'NOT_FOUND',catalogMatch:false,canReuseCommercialRegistration:false,matches:[]})};export const magazordMockService={...service,forStore:()=>service};`],
 [/lib\/supabase$/,`export const supabaseUrl='https://database.invalid';const query={select(){return this},eq(){return this},order(){return this},then(resolve){resolve({data:[],error:null})}};export const supabase={auth:{getSession:async()=>({data:{session:null}})},from:()=>query};`],
 [/(?:^|\/)(OwnerDashboard|SettingsView|CameraScannerModal)$/,`export default ()=>null;`],
];
mocks.splice(mocks.findIndex(([pattern])=>pattern.test('./services/magazordMockService')),1);
const photoMock=`export const supabaseUrl='https://jcxdkrpmrfbrhzwbzhph.supabase.co';
 const files=window.__storedUploads||new Map();window.__storedUploads=files;
 const bucket={upload:async(path,file)=>{files.set(path,file);return{error:null}},download:async path=>({data:files.get(path),error:null})};
 const query={select(){return this},eq(){return this},order(){return this},then(resolve){resolve({data:[],error:null})}};
 export const supabase={auth:{getSession:async()=>({data:{session:{user:{id:'11111111-1111-4111-8111-111111111111'}}}})},storage:{from:()=>bucket},from:()=>query};`;
mocks.find(([pattern])=>pattern.test('./lib/supabase'))[1]=photoMock;
for(const item of mocks)if(item[0].test('./services/brasilApi')||item[0].test('./services/amazonOfficial')||item[0].test('./services/googleBooks'))
 item[1]=item[1].replaceAll('async isbn=>{','async isbn=>{window.__bibliographicCalls++;');
const out=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import App from './src/App';import {magazordMockService} from './src/services/magazordMockService';window.__bibliographicCalls=0;window.__submissions=[];const service=magazordMockService.forStore('22222222-2222-4222-8222-222222222222');window.__manualStore=service;const create=service.createProduct.bind(service);service.createProduct=async(...args)=>{window.__submissions.push(structuredClone(args[0]));return create(...args)};createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',define:{'import.meta.env':'{}','process.env.NODE_ENV':'"production"'},plugins:[{name:'fixture-only',setup(b){
 b.onResolve({filter:/.*/},args=>{const item=mocks.find(([pattern])=>pattern.test(args.path));return item?{path:args.path,namespace:'mock',pluginData:item[1]}:undefined;});
 b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.pluginData,resolveDir:process.cwd()}));
}}]});
const css=(await import('node:fs/promises')).readdir;
const styleName=(await css('dist/assets')).find(name=>name.endsWith('.css'));const style=await readFile('dist/assets/'+styleName);
const logo=await readFile('public/brand/livraria-sul.svg');
const server=createServer((req,res)=>{if(req.url.startsWith('/api/curitiba/product-link?')){res.setHeader('content-type','application/json');res.end(JSON.stringify({status:'success',link:{source:'curitiba',kind:'info',isbn:'9788550303628',url:'https://www.livrariascuritiba.com.br/o-diario-perdido-de-gravity-falls-3-lv434083/p'}}));}else if(req.url==='/app.js'){res.setHeader('content-type','text/javascript');res.end(out.outputFiles[0].text);}else if(req.url==='/style.css'){res.setHeader('content-type','text/css');res.end(style);}else if(req.url==='/brand/livraria-sul.svg'){res.setHeader('content-type','image/svg+xml');res.end(logo);}else{res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/app.js"></script></html>');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser,page;const errors=[];
try{
 browser=await playwright.chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext();await context.route('**/*',route=>{
  if(route.request().url().startsWith('http://127.0.0.1:'))return route.continue();
  if(route.request().resourceType()==='image')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="144" height="192"><rect width="144" height="192" fill="#15366c"/></svg>'});
  return route.abort();
 });
 page=await context.newPage();page.setDefaultTimeout(8000);page.on('pageerror',error=>errors.push(error.message));
 await mkdir('dist/qa',{recursive:true});
 let scenarios=0,uploads=0;
 for(const width of [1440,390]) for(const condition of ['novo','usado']) for(const hasIsbn of [false,true]){
  await page.setViewportSize({width,height:1000});await page.goto('http://127.0.0.1:'+server.address().port);
  const navigation=name=>page.getByRole('button',{name,exact:true}).filter({visible:true});
  await navigation('Cadastro').click();
  await page.getByRole('button',{name:'Consultar por ISBN',exact:true}).waitFor();
  await page.getByRole('button',{name:'Iniciar cadastro manual',exact:true}).click();
  const field=name=>page.locator('[data-registration-field="'+name+'"]');
  assert.equal(await field('title').inputValue(),'');assert.equal(await field('price').inputValue(),'');
  assert.equal(await field('quantity').inputValue(),'1');assert.equal(await field('isbn13').inputValue(),'');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.isbn-app-shell')).backgroundColor),'rgb(247, 249, 252)');
  if(condition==='usado')await page.getByRole('button',{name:'USADO (SEBO)',exact:true}).click();
  if(hasIsbn)await field('isbn13').fill(width===1440?'9781234567897':'9788535914849');
  const code='LV'+String(41000+scenarios);
  await field('parentCode').fill(code+'-P');
  if(condition==='usado'||!hasIsbn)await field('childCode').fill(code);
  const actualChild=await field('childCode').inputValue();
  await field('title').fill('Obra manual '+scenarios);await field('price').fill('2490');await field('price').blur();await field('quantity').fill('2');
  await page.locator('textarea[placeholder^="Sinopse ou descrição"]').fill('Descrição digitada pelo operador.');
  await page.locator('#meta-description').fill('SEO editado pelo operador.');
  await navigation('Histórico').click();await navigation('Cadastro').click();
  assert.equal(await field('title').inputValue(),'Obra manual '+scenarios);assert.equal(await field('quantity').inputValue(),'2');
  assert.equal(await page.locator('#meta-description').inputValue(),'SEO editado pelo operador.');
  if(scenarios===0){
   await page.getByRole('button',{name:'Adicionar URL',exact:true}).click();await page.locator('#registration-images input[type="url"]').fill('https://images.invalid/manual.jpg');
   await page.locator('#registration-images').getByRole('button',{name:'Adicionar',exact:true}).click();
   await page.locator('img[alt="Capa principal"]').waitFor();
   const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=8;c.height=8;c.getContext('2d').fillRect(0,0,8,8);return c.toDataURL('image/png').split(',')[1];});
   await page.locator('input[type="file"]').setInputFiles({name:'foto-local.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
   await page.getByRole('button',{name:'Confirmar fotos selecionadas',exact:true}).click();
   await page.waitForFunction(()=>window.__storedUploads.size===1);
   await page.getByRole('button',{name:'Confirmar fotos selecionadas',exact:true}).waitFor({state:'hidden'});uploads++;
   assert.equal(await page.locator('.isbn-image-thumbnails > div').count(),1);
   await page.locator('button[title="Remover foto"]').click();assert.equal(await page.locator('.isbn-image-thumbnails > div').count(),0);
  }
  assert.equal(await page.evaluate(()=>window.__bibliographicCalls),0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  if(!hasIsbn)await page.screenshot({path:'dist/qa/manual-'+condition+'-'+width+'.png',fullPage:true});
  await page.locator('#magazord-category-search').fill('Livros');
  await page.locator('#magazord-category-options button').click();
  await page.locator('#btn-submit-magazord-registration').click();
  const review=page.getByRole('region',{name:'Revisão do cadastro'});await review.waitFor();
  if(!hasIsbn){assert.equal(await field('isbn13').count(),1);}
  await page.locator('#btn-confirm-magazord-registration').evaluate(button=>{button.click();button.click()});
  await page.getByRole('heading',{name:'Cadastro simulado concluído',exact:true}).waitFor();
  const submitted=await page.evaluate(()=>window.__submissions);assert.equal(submitted.length,1);
  assert.equal(submitted[0].condition,condition);assert.equal(submitted[0].quantity,2);assert.equal(submitted[0].price,'24,90');
  assert.equal(submitted[0].metaDescription,'SEO editado pelo operador.');assert.equal(submitted[0].description,'Descrição digitada pelo operador.');
  if(!hasIsbn)for(const key of ['isbn13','isbn10','ean'])assert.equal(submitted[0][key],'');
  const records=await page.evaluate(code=>window.__manualStore.getRecordsForEan(code),actualChild);
  assert.equal(records.filter(record=>record.childCode===actualChild).length,1);
  assert.equal(await page.evaluate(()=>window.__bibliographicCalls),0);scenarios++;
 }
 await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#isbn-input-field').fill('9788550303628');await page.locator('#search-submit-button').click();
 await page.waitForFunction(()=>document.querySelectorAll('[data-state="querying"]').length===0&&document.querySelector('[data-source="brasil_api"][data-state="found"]'));
 assert.ok(await page.evaluate(()=>window.__bibliographicCalls>=3));assert.deepEqual(errors,[]);
 console.log(JSON.stringify({scenarios,uploads,viewports:[1440,390],conditions:['novo','usado'],isbn:['with','without'],manualBibliographicRequests:0,pageErrors:errors,checks:['blank form','light workspace','condition choice','ISBN derivation','quantity 1 editable','price','URL image','local upload and removal','manual description and SEO','navigation persistence','review','double-click lock','simulator persistence','automatic ISBN lookup retained']}));
}catch(error){console.error(JSON.stringify({errors,text:(await page?.locator('body').innerText())?.slice(-4000)}));throw error;
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
