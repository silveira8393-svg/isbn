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
 [/contexts\/UserContext$/,`export const useUser=()=>{const role=window.__testRole||'developer';return{currentUser:{...{"id":"11111111-1111-4111-8111-111111111111","storeId":"22222222-2222-4222-8222-222222222222","active":true,"name":"Teste","storeName":"Loja fixture"},role},operationEnvironment:'development',canViewProduction:role!=='operator',canViewSettings:role!=='operator',isOperator:role==='operator',signOut:async()=>{window.__signOutCalls++}}};`],
 [/hooks\/useOperationAudit$/,`export const useOperationAudit=()=>({saveOperation:()=>{},pending:[],retry:()=>{},saving:0});`],
 [/hooks\/useLocalHistory$/,`import{useState}from'react';export const useLocalHistory=()=>{const[history,setHistory]=useState([]);return{history,setHistory,clearHistory:()=>setHistory([])}};`],
 [/services\/brasilApi$/,`export const searchBookByIsbnBrasilApi=async()=>({book:null,diagnostic:{status:window.__sourceMode==='unavailable'?503:404}});`],
 [/services\/distribuidoraCuritiba$/,`export const searchBookByIsbnDistribuidoraCuritiba=async()=>({book:null,diagnostic:{status:window.__sourceMode==='unavailable'?503:200,state:window.__sourceMode}});export const mergeBookWithDistribuidora=(a,b)=>a||b;`],
 [/services\/googleBooks$/,`export const searchGoogleBooks=async()=>({book:null,status:window.__sourceMode,diagnostic:{httpStatus:window.__sourceMode==='unavailable'?503:200}});export const complementWithGoogleBooks=(a,b)=>a||b;`],
 [/services\/amazonOfficial$/,`export const searchAmazonOfficial=async()=>({book:null,status:window.__sourceMode});export const complementWithAmazon=(a,b)=>a||b;export const complementAmazonImages=async b=>b;`],
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
 for(const width of [1440,900,390])for(const role of ['developer','admin','operator']){
  await page.setViewportSize({width,height:width===900?360:700});
  for(const mode of ['not_found','unavailable']){
   await page.addInitScript(({role,mode})=>{window.__testRole=role;window.__sourceMode=mode;window.__signOutCalls=0;},{role,mode});
   await page.goto('http://127.0.0.1:'+server.address().port);
   await page.getByRole('button',{name:'Consultar',exact:true}).filter({visible:true}).click();
   await page.locator('#isbn-input-field').fill('9788550303628');await page.locator('#search-submit-button').click();
   await page.getByRole('button',{name:'Continuar com cadastro manual',exact:true}).waitFor();
   assert.equal(await page.locator('[data-source]').count(),4);
   for(const condition of ['Novo','Usado']){
    await page.getByRole('button',{name:condition,exact:true}).click();await page.waitForSelector('[data-registration-form]');
    assert.equal(await page.locator('[data-registration-field="isbn13"]').inputValue(),'9788550303628');
    assert.equal(await page.locator('[data-registration-field="quantity"]').inputValue(),'1');
    assert.equal(await page.locator('[data-registration-field="title"]').inputValue(),condition==='Novo'?'':'Cadastro manual Novo');
    await page.locator('[data-registration-field="title"]').fill('Cadastro manual '+condition);
    assert.match(await page.getByRole('region',{name:'Resumo do cadastro'}).innerText(),/Cadastro manual/);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.locator('.isbn-registration-actions').getByRole('button',{name:'Voltar',exact:true}).click();
   }
   for(const bottom of [false,true]){
    await page.evaluate(bottom=>scrollTo(0,bottom?document.body.scrollHeight:0),bottom);
    const profile=page.locator('#btn-user-switcher-toggle').filter({visible:true});await profile.click();
    const exit=page.getByRole('button',{name:'Sair',exact:true});await exit.waitFor();
    await exit.scrollIntoViewIfNeeded();
    assert.ok(await exit.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&el.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));}));
    await exit.click();assert.equal(await page.evaluate(()=>window.__signOutCalls),bottom?2:1);
    await page.keyboard.press('Escape');
   }
  }
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({viewports:[1440,900,390],roles:['developer','admin','operator'],sourceScenarios:['not_found','unavailable'],manualForms:36,logoutClicks:36,externalRequests:0,pageErrors:errors}));
}catch(error){console.error(JSON.stringify({errors,states:await page?.locator('[data-source]').evaluateAll(nodes=>nodes.map(n=>({source:n.dataset.source,state:n.dataset.state}))),text:(await page?.locator('body').innerText())?.slice(-2400)}));throw error;
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
