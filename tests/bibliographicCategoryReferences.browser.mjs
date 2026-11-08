// Synthetic, offline UI fixtures. No provider, database or Magazord requests.
import {build} from 'esbuild';import{createServer}from'node:http';import{readFile,readdir,mkdir}from'node:fs/promises';
import{createRequire}from'node:module';import{join}from'node:path';import{homedir}from'node:os';import assert from'node:assert/strict';
const require=createRequire(import.meta.url);let playwright;try{playwright=require('playwright');}catch{playwright=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));}
const user={id:'11111111-1111-4111-8111-111111111111',storeId:'22222222-2222-4222-8222-222222222222',active:true,role:'developer'};
const book={id:'synthetic-book',title:'Obra sintética',categories:['Ficção BrasilAPI sintética'],productCategory:'Literatura Curitiba sintética',department:'Livros Curitiba sintético',googleBooksReference:{volumeId:'synthetic',isbn:'9788551003664',categories:['Fiction / Fantasy sintética'],mainCategory:'Juvenile Fiction sintética',descriptionAvailable:false,contentReviewRequired:true}};
book.isbn13='9788551003664';
book.amazonCatalogReference={asin:'SYNTHETIC1',isbn:book.isbn13,marketplaceId:'A2Q3Y263D00KWC'};
book.amazonCategoryReference={...book.amazonCatalogReference,classifications:[
 {classificationId:'k',displayName:'Fantasia sintética',parent:{classificationId:'kindle',displayName:'Loja Kindle'}},
 {classificationId:'p',displayName:'Literatura e Ficção sintética',parent:{classificationId:'books',displayName:'Livros'}},
 {classificationId:'o',displayName:'Outro caminho sintético preservado'},
]};
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React,{useState}from'react';import{createRoot}from'react-dom/client';import Form from './src/components/magazord/ProductRegistrationForm';import{createRegistrationDraft}from'./src/utils/draft';
 const initial=${JSON.stringify(book)},user=${JSON.stringify(user)};
 function Harness(){const[original,setOriginal]=useState(initial);const[draft,setDraft]=useState(()=>({...createRegistrationDraft(initial),category:'Loja > Manual',magazordCategoryId:777,categorySource:'magazord',magazordCategoryStoreId:user.storeId}));window.currentDraft=draft;
 return <main className="isbn-app-shell"><button id="clear-references" onClick={()=>setOriginal({id:initial.id,title:initial.title})}>Retirar referências da fixture</button><Form draft={draft} originalBook={original} imageUser={user} onUpdateDraft={updates=>setDraft(prior=>({...prior,...updates}))} onBackToSearch={()=>{}} onSuccessRegistration={()=>{}} onProcessNextBook={()=>{}}/></main>};createRoot(document.getElementById('root')).render(<Harness/>);
 `},bundle:true,write:false,platform:'browser',format:'iife',define:{'import.meta.env':'{}','process.env.NODE_ENV':'"production"'},plugins:[{name:'offline-categories',setup(b){
 b.onResolve({filter:/\/hooks\/useMagazordCategories$/},()=>({path:'categories',namespace:'fixture'}));
 b.onResolve({filter:/\/lib\/supabase$/},()=>({path:'session',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='categories'?`export const useMagazordCategories=()=>({loading:false,storeId:'${user.storeId}',reload(){},catalog:{categories:[{id:777,nome:'Manual',pai:null,path:'Loja > Manual',depth:0},{id:888,nome:'Outra escolha',pai:null,path:'Loja > Outra escolha',depth:0}],invalidCount:0}});`:`export const supabaseUrl='https://database.invalid';export const supabase={auth:{getSession:async()=>({data:{session:null}})}};`}));
 }}]});
const style=await readFile('dist/assets/'+(await readdir('dist/assets')).find(name=>name.endsWith('.css')));
const server=createServer((req,res)=>{if(req.url==='/app.js'){res.setHeader('content-type','text/javascript');res.end(bundle.outputFiles[0].text);}else if(req.url==='/style.css'){res.setHeader('content-type','text/css');res.end(style);}else{res.setHeader('content-type','text/html');res.end('<meta charset="utf-8"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/app.js"></script>');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;let requests=0;
try{
 browser=await playwright.chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname==='127.0.0.1'&&!url.pathname.startsWith('/api/'))return route.continue();if(url.pathname.startsWith('/api/'))requests++;return route.abort();});
 await page.goto('http://127.0.0.1:'+server.address().port);const reference=page.getByRole('complementary',{name:'Referências das fontes'});await reference.waitFor();
 for(const name of ['BrasilAPI:','Distribuidora Curitiba:','Google Books:','Amazon — categoria de navegação:','Kindle','Livro físico'])assert.ok((await reference.innerText()).includes(name));
 assert.equal(await reference.locator('li').count(),8);
 assert.equal(await page.evaluate(()=>window.currentDraft.magazordCategoryId),777);console.log('PASS all four sources render separate paths and badges without altering selected ID');
 await page.locator('#magazord-category-search').fill('Outra');await page.locator('#magazord-category-options button').click();assert.equal(await page.evaluate(()=>window.currentDraft.magazordCategoryId),888);assert.ok((await reference.innerText()).includes('Ficção BrasilAPI sintética'));console.log('PASS manual category selection remains independent of source references');
 await mkdir('dist/qa',{recursive:true});await page.locator('#registration-category').screenshot({path:'dist/qa/bibliographic-categories-desktop.png'});await page.setViewportSize({width:390,height:1000});await page.locator('#registration-category').screenshot({path:'dist/qa/bibliographic-categories-mobile.png'});
 const boxes=await reference.locator('li').evaluateAll(rows=>rows.map(row=>({top:row.getBoundingClientRect().top,bottom:row.getBoundingClientRect().bottom,overflow:row.scrollWidth>row.clientWidth})));
 for(let i=0;i<boxes.length;i++){assert.equal(boxes[i].overflow,false);if(i)assert.ok(boxes[i].top>=boxes[i-1].bottom);}
 console.log('PASS mobile paths occupy distinct lines without horizontal overflow');
 await page.locator('#clear-references').click();assert.equal(await reference.count(),0);assert.equal(await page.evaluate(()=>window.currentDraft.magazordCategoryId),888);console.log('PASS absent classifications hide the block and preserve the commercial choice');
 assert.equal(requests,0);console.log('PASS no additional HTTP API request');console.log(JSON.stringify({checks:5,syntheticFixtures:true,apiRequests:requests}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
