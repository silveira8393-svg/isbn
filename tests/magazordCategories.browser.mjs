// Offline end-to-end UI -> authenticated API -> sanitized fixture. No operational writes.
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {readFile,readdir,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {homedir} from 'node:os';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);let playwright;
try{playwright=require('playwright');}catch{playwright=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const user={id:'11111111-1111-4111-8111-111111111111',storeId:'22222222-2222-4222-8222-222222222222',role:'developer',active:true,name:'Fixture',storeName:'Fixture'};
const fixture=JSON.parse(await readFile('tests/fixtures/magazord-categories.json','utf8'));
const backend=await build({entryPoints:['server/magazordCategories.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {createMagazordCategoriesFunction}=await import('data:text/javascript;base64,'+Buffer.from(backend.outputFiles[0].text).toString('base64'));
let upstreamCalls=0,apiCalls=0,failRefresh=false;
const handler=createMagazordCategoriesFunction({env:{MAGAZORD_BASE_URL:'https://livrariasul.painel.magazord.com.br/api',MAGAZORD_API_USER:'fixture-user',MAGAZORD_API_PASSWORD:'fixture-password',MAGAZORD_STORE_ID:user.storeId,SUPABASE_URL:'https://database.invalid',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'},fetcher:async(input,init)=>{
 assert.equal(init.method,'GET');const url=new URL(input);
 if(url.hostname==='livrariasul.painel.magazord.com.br'){upstreamCalls++;await new Promise(r=>setTimeout(r,350));return Response.json({data:{items:fixture,total:5,page:1,limit:100,total_pages:1,has_more:false}});}
 if(url.pathname==='/auth/v1/user')return Response.json({id:user.id});
 if(url.pathname==='/rest/v1/profiles')return Response.json([{id:user.id,active:true}]);
 if(url.pathname==='/rest/v1/store_users')return Response.json([{user_id:user.id,store_id:user.storeId,role:'developer',active:true}]);
 if(url.pathname==='/rest/v1/stores')return Response.json([{id:user.storeId,active:true}]);
 throw Error('unexpected_fixture_request');
}});
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React,{useState} from 'react';import{createRoot}from'react-dom/client';
 import Form from './src/components/magazord/ProductRegistrationForm';import{createRegistrationDraft}from'./src/utils/draft';
 const user=${JSON.stringify(user)};window.submissions=[];
 const service={getSimulationConfig:()=>({mode:'auto'}),getRecordsForEan:()=>[],createProduct:async draft=>{window.submissions.push(draft);return{success:true,parentCode:draft.parentCode,childCode:draft.childCode,registeredAt:Date.now()}}};
 const manual=!location.search.includes('automatic');const book=manual?{id:'manual-entry',title:'',authors:[]}:{id:'fixture-book',title:'Fixture automatic',authors:['Fixture'],isbn13:'9788551003664'};
 function Harness(){const[draft,setDraft]=useState(()=>({...createRegistrationDraft(book),title:book.title||'Fixture manual',parentCode:'TESTE-CATEGORIA-P',childCode:book.isbn13||'TESTE-CATEGORIA-1',price:'12,90'}));window.currentDraft=draft;return <div className="isbn-app-shell"><Form draft={draft} originalBook={book} imageUser={user} simulationService={service} onUpdateDraft={updates=>setDraft(prior=>({...prior,...updates}))} onBackToSearch={()=>{}} onSuccessRegistration={()=>{}} onProcessNextBook={()=>{}}/></div>};
 createRoot(document.getElementById('root')).render(<React.StrictMode><Harness/></React.StrictMode>);
 `},bundle:true,write:false,platform:'browser',format:'iife',define:{'import.meta.env':'{}','process.env.NODE_ENV':'"production"'},plugins:[{name:'local-session',setup(b){
 b.onResolve({filter:/\/lib\/supabase$/},a=>({path:a.path,namespace:'fixture'}));
 b.onResolve({filter:/\/contexts\/UserContext$/},a=>({path:a.path,namespace:'fixture-user'}));
 b.onLoad({filter:/.*/,namespace:'fixture-user'},()=>({contents:`export const useUser=()=>({currentUser:${JSON.stringify(user)}});`}));
 b.onResolve({filter:/\/hooks\/useConditionTemplates$/},a=>({path:a.path,namespace:'fixture-templates'}));
 b.onLoad({filter:/.*/,namespace:'fixture-templates'},()=>({contents:`export const useConditionTemplates=()=>({status:'ready',data:{exists:true,templates:[]}});`}));
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const supabaseUrl='https://database.invalid';export const supabase={auth:{getSession:async()=>({data:{session:{user:{id:${JSON.stringify(user.id)}},access_token:'synthetic-valid-session'}}})}};`}));
 }}]});
const style=await readFile('dist/assets/'+(await readdir('dist/assets')).find(x=>x.endsWith('.css')));
const server=createServer(async(req,res)=>{try{
 if(req.url.startsWith('/api/magazord/categories')){apiCalls++;assert.equal(req.method,'GET');if(failRefresh&&req.url.includes('refresh')){res.writeHead(503,{'content-type':'application/json'});res.end('{"code":"fixture_unavailable"}');return;}
 const headers=new Headers();for(const[k,v]of Object.entries(req.headers))if(typeof v==='string')headers.set(k,v);
 const result=await handler(new Request('http://'+req.headers.host+req.url,{headers}));res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text());
 }else if(req.url==='/app.js'){res.setHeader('content-type','text/javascript');res.end(bundle.outputFiles[0].text);}
 else if(req.url==='/style.css'){res.setHeader('content-type','text/css');res.end(style);}
 else{res.setHeader('content-type','text/html');res.end('<meta charset="utf-8"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/app.js"></script>');}
 }catch{res.statusCode=500;res.end('fixture_error');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;let checks=0;
const check=(name)=>{checks++;console.log('PASS '+name);};
try{
 browser=await playwright.chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1100}});
 const blocked=[];await page.route('**/*',route=>{if(new URL(route.request().url()).hostname==='127.0.0.1')return route.continue();blocked.push(route.request().url());return route.abort();});
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.getByText('Carregando categorias da loja…',{exact:true}).waitFor();check('loading visible without disabling manual form');
 await page.locator('[data-registration-field="title"]').fill('Fixture preserved title');
 await page.getByText('5 categorias reais.',{exact:false}).waitFor();
 await page.locator('#magazord-category-search').fill('historia');assert.equal(await page.locator('#magazord-category-options button').count(),2);
 assert.match(await page.locator('#magazord-category-options').innerText(),/Estudos > História/);check('accent-insensitive search distinguishes equal names by full path');
 await page.locator('#magazord-category-options button').filter({hasText:'Livros > História'}).click();
 assert.equal(await page.evaluate(()=>window.currentDraft.magazordCategoryId),30);assert.equal(await page.evaluate(()=>window.currentDraft.magazordCategoryStoreId),user.storeId);check('selection preserves original ID and owning store');
 const before=await page.evaluate(()=>structuredClone(window.currentDraft));failRefresh=true;
 await page.getByRole('button',{name:'Atualizar categorias'}).click();await page.getByText('Os dados do formulário e a seleção foram preservados.',{exact:false}).waitFor();
 assert.deepEqual(await page.evaluate(()=>window.currentDraft),before);assert.equal(await page.locator('[data-registration-field="title"]').inputValue(),'Fixture preserved title');check('HTTP failure preserves selection and every edited field');
 failRefresh=false;await page.getByRole('button',{name:'Atualizar categorias'}).click();await page.waitForFunction(()=>!document.querySelector('[aria-busy="true"]'));
 assert.equal(await page.evaluate(()=>window.currentDraft.magazordCategoryId),30);check('controlled retry restores availability without replacing selection');
 await mkdir('dist/qa',{recursive:true});await page.screenshot({path:'dist/qa/magazord-categories-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'USADO (SEBO)',exact:true}).click();assert.equal(await page.evaluate(()=>window.currentDraft.magazordCategoryId),30);
 assert.equal(await page.evaluate(()=>window.currentDraft.category),'Livros > História');check('NOVO/USADO switch preserves real hierarchy and category');
 await page.getByRole('button',{name:'Revisar cadastro',exact:true}).first().click();await page.locator('#btn-confirm-magazord-registration').waitFor();await page.locator('#btn-confirm-magazord-registration').click();await page.getByText('Cadastro simulado concluído',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.submissions.length),1);assert.equal(await page.evaluate(()=>window.submissions[0].magazordCategoryId),30);assert.equal(upstreamCalls,1);check('manual confirmation stays simulated with no stock or product HTTP writes');
 await page.goto('http://127.0.0.1:'+server.address().port+'/?automatic');await page.getByText('5 categorias reais.',{exact:false}).waitFor();
 assert.equal(await page.locator('[data-registration-field="isbn13"]').inputValue(),'9788551003664');await page.locator('#magazord-category-search').fill('literatura');await page.locator('#magazord-category-options button').click();
 await page.getByRole('button',{name:'Revisar cadastro',exact:true}).first().click();await page.locator('#btn-confirm-magazord-registration').waitFor();check('bibliographic registration retains ISBN and reaches review after real category selection');
 await page.locator('#btn-return-to-registration').click();
 await page.setViewportSize({width:390,height:1000});await mkdir('dist/qa',{recursive:true});await page.screenshot({path:'dist/qa/magazord-categories-mobile.png',fullPage:true});
 assert.ok(blocked.every(value => /fonts\.googleapis\.com|fonts\.gstatic\.com/.test(new URL(value).hostname)),JSON.stringify(blocked));assert.equal(upstreamCalls,1);assert.ok(apiCalls>=3);check('cache avoids duplicate upstream requests; external assets are blocked and API traffic stays local');
 console.log(JSON.stringify({checks,apiCalls,fixtureCategoryReads:upstreamCalls,externalRequests:blocked.length}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
