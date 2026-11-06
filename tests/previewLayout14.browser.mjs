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
 [/services\/distribuidoraCuritiba$/,`export const searchBookByIsbnDistribuidoraCuritiba=async()=>{await new Promise(r=>setTimeout(r,150));return{book:{id:'curitiba-fixture',title:'Gravity Falls',isbn13:'9788550303628',reference:'LV434083'},diagnostic:{status:200,state:'success'}}};export const mergeBookWithDistribuidora=(a,b)=>({...a,...b});`],
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
const server=createServer((req,res)=>{if(req.url.startsWith('/api/curitiba/product-link?')){res.setHeader('content-type','application/json');res.end(JSON.stringify({status:'success',link:{source:'curitiba',kind:'info',isbn:'9788550303628',url:'https://www.livrariascuritiba.com.br/o-diario-perdido-de-gravity-falls-3-lv434083/p'}}));}else if(req.url==='/app.js'){res.setHeader('content-type','text/javascript');res.end(out.outputFiles[0].text);}else if(req.url==='/style.css'){res.setHeader('content-type','text/css');res.end(style);}else if(req.url==='/brand/livraria-sul.svg'){res.setHeader('content-type','image/svg+xml');res.end(logo);}else{res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/app.js"></script></html>');}});
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
 for(const width of [1440,900,390]){
  await page.setViewportSize({width,height:1000});await page.goto('http://127.0.0.1:'+server.address().port);
  for(const condition of ['Novo','Usado']){
   await page.locator('#isbn-input-field').fill('9788550303628');await page.locator('#search-submit-button').click();
   await page.waitForFunction(()=>document.querySelectorAll('[data-state="querying"]').length===0&&document.querySelector('[data-source="curitiba"][data-state="found"]'));
   await page.getByRole('link',{name:/^Curitiba /}).waitFor();
   assert.equal(await page.locator('[data-source]').count(),4);
   assert.equal(await page.getByRole('link',{name:/^Curitiba /}).getAttribute('href'),'https://www.livrariascuritiba.com.br/o-diario-perdido-de-gravity-falls-3-lv434083/p');
   assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.isbn-app-shell')).backgroundColor),'rgb(4, 17, 30)');
   const queryLinks=await page.locator('section[aria-label="Fontes externas da obra"] a').evaluateAll(nodes=>nodes.map(n=>n.href));
   if(condition==='Novo') await page.screenshot({path:`dist/qa/v14-consulta-${width}.png`,fullPage:true});
   await page.getByRole('button',{name:condition,exact:true}).click();await page.waitForSelector('[data-registration-form]');
   const links=await page.locator('section[aria-label="Fontes externas da obra"] a').evaluateAll(nodes=>nodes.map(n=>n.href));assert.deepEqual(links,queryLinks);
   assert.equal(await page.locator('[data-registration-field="quantity"]').inputValue(),'1');
   if(width===1440 && condition==='Novo'){
    await page.getByRole('button',{name:'Adicionar URL',exact:true}).click();
    await page.locator('#registration-images input[type="url"]').fill('https://images.invalid/manual.jpg');
    await page.locator('#registration-images').getByRole('button',{name:'Adicionar',exact:true}).click();
    assert.equal(await page.locator('.isbn-image-thumbnails > div').count(),2);
    await page.locator('.isbn-image-thumbnails button[title="Tornar capa principal"]').last().click();
    assert.equal(await page.locator('img[alt="Capa principal"]').getAttribute('src'),'https://images.invalid/manual.jpg');
    const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=8;c.height=8;c.getContext('2d').fillRect(0,0,8,8);return c.toDataURL('image/png').split(',')[1];});
    await page.locator('input[type="file"]').setInputFiles({name:'foto-local.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
    await page.getByRole('button',{name:'Remover prévia',exact:true}).waitFor();
    assert.ok(await page.getByRole('button',{name:'Confirmar fotos selecionadas',exact:true}).isVisible());
    await page.getByRole('button',{name:'Remover prévia',exact:true}).click();
   }
   const field=name=>page.locator(`[data-registration-field="${name}"]`);
   await field('title').fill('Titulo revisado '+condition);await field('parentCode').fill('LV12345');
   if(condition==='Usado')await field('childCode').fill('LV12345-01');
   await field('price').fill('2490');await field('price').blur();await field('quantity').fill('3');
   const summary=page.getByRole('region',{name:'Resumo do cadastro'});
   assert.ok((await summary.innerText()).includes('Titulo revisado '+condition));
   assert.match(await summary.innerText(),/24,90/);assert.match(await summary.innerText(),/3 un\./);
   const columns=await page.locator('.isbn-registration-grid').evaluate(n=>getComputedStyle(n).gridTemplateColumns.split(' ').length);
   assert.equal(columns,width>=1280?3:width>=768?2:1);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.evaluate(()=>scrollTo(0,0));
   await page.screenshot({path:`dist/qa/v14-cadastro-${condition.toLowerCase()}-${width}.png`,fullPage:true});
   await page.locator('#btn-submit-magazord-registration').click();
   const review=page.getByRole('region',{name:'Revisão do cadastro'});
   if(await review.isVisible()){
    assert.match(await review.innerText(),/Titulo revisado/);
    await page.locator('#btn-return-to-registration').click();
   }else{
    assert.ok(await page.locator('[data-registration-form]').isVisible());
    assert.ok(await page.locator('[data-registration-form] input:focus,[data-registration-form] textarea:focus,[data-registration-form] select:focus').count());
   }
   await page.getByRole('button',{name:/^Histórico/}).filter({visible:true}).click();
   await page.getByRole('button',{name:'Consultar',exact:true}).filter({visible:true}).click();
   assert.ok(await page.getByRole('region',{name:'Fontes da pesquisa'}).isVisible());
  }
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({viewports:[1440,900,390],conditions:['NOVO','USADO'],fixtureSearches:6,externalSourceRequests:0,pageErrors:errors,checks:['four states','Curitiba/Google links','quantity 1','editable fields','summary','Brazilian price','review/validation','navigation','responsive columns','no horizontal overflow'],screenshots:'dist/qa/v14-*'}));
}catch(error){console.error(JSON.stringify({errors,states:await page?.locator('[data-source]').evaluateAll(nodes=>nodes.map(n=>({source:n.dataset.source,state:n.dataset.state}))),text:(await page?.locator('body').innerText())?.slice(-2400)}));throw error;
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
