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
 [/hooks\/useOperationAudit$/,`export const useOperationAudit=()=>({saveOperation:()=>{},pending:[],retry:()=>{},saving:0});`],
 [/hooks\/useLocalHistory$/,`import {useState} from 'react';export const useLocalHistory=()=>{const[history,setHistory]=useState([]);return{history,setHistory,clearHistory:()=>setHistory([])}};`],
 [/services\/brasilApi$/,`const fixture=${fixture.toString()};export const searchBookByIsbnBrasilApi=async isbn=>{await new Promise(r=>setTimeout(r,60));return{book:fixture(isbn),diagnostic:{status:200}}};`],
 [/services\/distribuidoraCuritiba$/,`export const searchBookByIsbnDistribuidoraCuritiba=async()=>{await new Promise(r=>setTimeout(r,150));return{book:null,diagnostic:{status:200,state:'not_found'}}};export const mergeBookWithDistribuidora=(a,b)=>({...a,...b});`],
 [/services\/googleBooks$/,`export {complementWithGoogleBooks} from './src/services/googleBooks.ts';export const searchGoogleBooks=async isbn=>{await new Promise(r=>setTimeout(r,20));return isbn==='9788550303628'?${JSON.stringify(google)}:{status:'not_found',book:null,diagnostic:{code:'no_results',httpStatus:200}}};`],
 [/services\/amazonOfficial$/,`export const searchAmazonOfficial=async isbn=>{await new Promise(r=>setTimeout(r,120));return{status:'success',book:{id:'amazon-fixture',title:'Fixture',isbn13:isbn,...(isbn==='9798276439839'?{amazonCatalogReference:{asin:'B0G4CS2PMG',isbn,marketplaceId:'A2Q3Y263D00KWC'}}:{})}}};export const complementWithAmazon=(a,b)=>a||b;export const complementAmazonImages=async b=>b;`],
 [/services\/magazordMockService$/,`const service={resetModeToAuto:()=>{},getSimulationConfig:()=>({mode:'auto'}),checkProductByEan:async()=>({exists:false,status:'NOT_FOUND',catalogMatch:false,canReuseCommercialRegistration:false,matches:[]})};export const magazordMockService={...service,forStore:()=>service};`],
 [/lib\/supabase$/,`export const supabaseUrl='https://database.invalid';const query={select(){return this},eq(){return this},order(){return this},then(resolve){resolve({data:[],error:null})}};export const supabase={auth:{getSession:async()=>({data:{session:null}})},from:()=>query};`],
 [/(?:^|\/)(OwnerDashboard|SettingsView|CameraScannerModal)$/,`export default ()=>null;`],
];
const out=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import App from './src/App';createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',define:{'import.meta.env':'{}','process.env.NODE_ENV':'"production"'},plugins:[{name:'fixture-only',setup(b){
 b.onResolve({filter:/.*/},args=>{const item=mocks.find(([pattern])=>pattern.test(args.path));return item?{path:args.path,namespace:'mock',pluginData:item[1]}:undefined;});
 b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.pluginData,resolveDir:process.cwd()}));
}}]});
const css=(await import('node:fs/promises')).readdir;
const styleName=(await css('dist/assets')).find(name=>name.endsWith('.css'));const style=await readFile('dist/assets/'+styleName);
const logo=await readFile('public/brand/livraria-sul.svg');
const server=createServer((req,res)=>{if(req.url==='/app.js'){res.setHeader('content-type','text/javascript');res.end(out.outputFiles[0].text);}else if(req.url==='/style.css'){res.setHeader('content-type','text/css');res.end(style);}else if(req.url==='/brand/livraria-sul.svg'){res.setHeader('content-type','image/svg+xml');res.end(logo);}else{res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/app.js"></script></html>');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser,page;const errors=[];
try{
 browser=await playwright.chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext();await context.route('**/*',route=>{
  if(route.request().url().startsWith('http://127.0.0.1:'))return route.continue();
  if(route.request().resourceType()==='image')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="144" height="192"><rect width="144" height="192" fill="#15366c"/><text x="20" y="100" fill="white">Fixture</text></svg>'});
  return route.abort();
 });
 page=await context.newPage();page.setDefaultTimeout(8000);page.on('pageerror',error=>errors.push(error.message));
 await mkdir('dist/qa',{recursive:true});
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await page.goto('http://127.0.0.1:'+server.address().port);
  for(const isbn of ['9788550303628','9798276439839','9786556096674']){
   await page.locator('#isbn-input-field').fill(isbn);await page.locator('#search-submit-button').click();
   await page.waitForFunction(()=>document.querySelectorAll('[data-state="querying"]').length===0&&document.querySelector('[data-source="brasil_api"][data-state="found"]'),null,{timeout:8000});
   await page.waitForSelector('.isbn-book-details');
   assert.equal(await page.locator('[data-source]').count(),4);
   const targets=await page.getByRole('region',{name:'Fontes externas da obra'}).count();
   if(isbn==='9788550303628'||isbn==='9798276439839')assert.equal(targets,1);
   const before=await page.locator('section[aria-label="Fontes externas da obra"] a').evaluateAll(nodes=>nodes.map(node=>node.href));
   await page.getByRole('button',{name:'Cadastro',exact:true}).filter({visible:true}).click();
   await page.waitForSelector('[data-registration-form]');
   const after=await page.locator('section[aria-label="Fontes externas da obra"] a').evaluateAll(nodes=>nodes.map(node=>node.href));assert.deepEqual(after,before);
   await page.getByRole('button',{name:/^Histórico/}).filter({visible:true}).click();
   await page.getByRole('button',{name:'Consultar',exact:true}).filter({visible:true}).click();
   assert.ok(await page.locator('section[aria-label="Fontes da pesquisa"]').isVisible());
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  }
  await page.screenshot({path:`dist/qa/consulta-${width}.png`,fullPage:true});
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({viewports:[1440,390],fixtureSearches:6,externalSourceRequests:0,pageErrors:errors,navigation:'Consulta/Cadastro/Histórico passed',screenshots:'dist/qa'}));
}catch(error){console.error(JSON.stringify({errors,states:await page?.locator('[data-source]').evaluateAll(nodes=>nodes.map(n=>({source:n.dataset.source,state:n.dataset.state}))),text:(await page?.locator('body').innerText())?.slice(-2400)}));throw error;
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
