// Actual App + React StrictMode + browser DOM. Fixture-only network; persistence is refused.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { access, readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const browser=process.env.ISBN_TEST_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
await access(browser);
const detail=JSON.parse(await readFile(new URL('../tests/fixtures/curitiba/gravity-falls-detail.json',import.meta.url),'utf8'));
const html=await readFile(new URL('../tests/fixtures/curitiba/gravity-falls-index.html',import.meta.url),'utf8');
const images=[...html.matchAll(/href="(lv434083_[1-5]\.jpg)"/g)].map(m=>new URL(m[1],detail.urlFoto).href);
const user={id:'11111111-1111-4111-8111-111111111111',storeId:'22222222-2222-4222-8222-222222222222',role:'developer',active:true,name:'Offline fixture'};
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React from 'react';import{createRoot}from'react-dom/client';
import App from './src/App';import{magazordMockService}from'./src/services/magazordMockService';
const detail=${JSON.stringify(detail)},html=${JSON.stringify(html)},images=${JSON.stringify(images)},user=${JSON.stringify(user)};
window.__auditDenied=0;window.__calls=[];window.__errors=[];window.__completed=[];window.__failIndex=false;
window.addEventListener('error',e=>window.__errors.push(e.message));
window.fetch=async(url,init)=>{const target=String(url);window.__calls.push(target);
 if(target.includes('/auth/loginAcessoPublico'))return Response.json({cdSistema:50});
 if(target.includes('/findAllByExampleByPages'))return Response.json(detail);
 if(target.includes('/findProdutoByPrimaryKey'))return Response.json(detail);
 if(target===detail.urlFoto){if(init.method!=='GET'||init.mode!=='cors'||init.redirect!=='error')throw Error('Unsafe gallery request');
   if(window.__failIndex)throw new TypeError('CORS denied');return new Response(html,{headers:{'Content-Type':'text/html'}});}
 if(target.startsWith('/api/amazon/spapi/catalog?'))return Response.json({isbn:detail.nuCdBarras,items:[]});
 if(target==='/api/amazon?acao=search')return Response.json({status:'interrompida',status_http:503});
 throw Error('External/persistence request forbidden: '+target);
};
magazordMockService.forStore(user.storeId).setSimulationConfig({mode:'force_new_not_found'});
const pause=()=>new Promise(r=>setTimeout(r,20));
const check=(value,message)=>{if(!value)throw Error(message);};
async function wait(fn,label){for(let i=0;i<300;i++){if(fn())return;await pause();}throw Error('Timeout '+label);}
function edit(input,value){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}
function clickText(text){const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);check(button,'button '+text);button.click();}
function assertImages(expected,label){const rendered=new Set([...document.querySelectorAll('#root img')].map(img=>img.getAttribute('src')));
 for(const image of expected)check(rendered.has(image),label+' missing '+image);
 const productImages=[...rendered].filter(src=>images.includes(src));check(productImages.length===expected.length,label+' distinct images '+productImages.length);}
const root=createRoot(document.getElementById('root'));
async function run(){
 for(const scenario of ['novo','menu','usado','cors-failure']){
  root.render(null);await pause();window.__failIndex=scenario==='cors-failure';
  root.render(<React.StrictMode><App key={scenario}/></React.StrictMode>);
  await wait(()=>document.querySelector('input[placeholder*="ISBN"]'),'search input');
  edit(document.querySelector('input[placeholder*="ISBN"]'),detail.nuCdBarras);await pause();document.getElementById('search-submit-button').click();
  await wait(()=>document.getElementById('btn-open-magazord-registration'),'Consulta');
  const expected=window.__failIndex?images.slice(0,1):images;
  assertImages(expected,'Consulta '+scenario);
  if(scenario==='usado')clickText('Usado');else if(scenario==='menu')clickText('Cadastro');else document.getElementById('btn-open-magazord-registration').click();
  await wait(()=>document.querySelector('[data-registration-field="title"]'),'Cadastro');
  check(document.querySelector('[data-registration-field="title"]').value===detail.dsProduto,'title transfer');
  assertImages(expected,'Cadastro '+scenario);
  window.__completed.push({scenario,cover:expected[0],additional:expected.length-1});
 }
 check(window.__calls.filter(u=>u===detail.urlFoto).length===4,'one index GET per search');
 check(window.__calls.length===24,'four API flows, no probes/retries');
 check(window.__auditDenied===4,'all automatic writes refused');check(!window.__errors.length,'page errors '+window.__errors.join(';'));
 return {ok:true,completed:window.__completed,mockedCalls:window.__calls.length,persistenceDenied:window.__auditDenied,externalRequests:0,pageErrors:window.__errors};
}
run().then(result=>document.getElementById('result').textContent=JSON.stringify(result)).catch(error=>document.getElementById('result').textContent=JSON.stringify({ok:false,message:error.message,completed:window.__completed,calls:window.__calls,errors:window.__errors}));
`},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'import.meta.env':'{}','process.env.NODE_ENV':'"development"'},
plugins:[{name:'offline-boundaries',setup(b){
 const mocks=[
  [/contexts\/UserContext$/,`export const useUser=()=>({currentUser:${JSON.stringify(user)},canViewProduction:false,canViewSettings:true,operationEnvironment:'development'});`],
  [/lib\/supabase(?:\.js)?$/,`export const supabaseUrl='https://database.invalid';export const supabase={auth:{getSession:async()=>({data:{session:{user:{id:'${user.id}'},access_token:'synthetic-offline-only'}}})},from:()=>{throw Error('Persistence forbidden')}};`],
  [/hooks\/useOperationAudit$/,`export const useOperationAudit=()=>({saveOperation:async()=>{window.__auditDenied++;return false},pending:[],saving:false,retry:()=>{},storageUnavailable:false,lastConfirmation:null});`],
  [/hooks\/useLocalHistory$/,`import{useState}from'react';export const useLocalHistory=()=>{const[history,setHistory]=useState([]);return{history,setHistory,clearHistory:()=>setHistory([])}};`],
  [/services\/brasilApi$/,`export const searchBookByIsbnBrasilApi=async()=>({book:null,diagnostic:{status:404}});`],
 ];
 b.onResolve({filter:/.*/},args=>{const mock=mocks.find(([re])=>re.test(args.path));if(mock)return{path:args.path,namespace:'mock',pluginData:mock[1]};});
 b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.pluginData,loader:'js',resolveDir:process.cwd()}));
}}]});
const directory=await mkdtemp(join(tmpdir(),'isbn-curitiba-dom-'));
const file=join(directory,'test.html');
await writeFile(file,`<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none';script-src 'unsafe-inline';style-src 'unsafe-inline';img-src https:;connect-src 'none'"><div id="root"></div><pre id="result">pending</pre><script>${bundle.outputFiles[0].text.replaceAll('</script','<\\/script')}</script>`,'utf8');
const profile=join(directory,'profile');
let child, socket;
try{
 child=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions','--disable-background-networking',
  '--host-resolver-rules=MAP * ~NOTFOUND','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let active;
 for(let i=0;i<150;i++){try{active=await readFile(join(profile,'DevToolsActivePort'),'utf8');break;}catch{await new Promise(r=>setTimeout(r,100));}}
 assert.ok(active,'Isolated browser did not start');
 const [port,path]=active.trim().split(/\r?\n/);socket=new WebSocket(`ws://127.0.0.1:${port}${path}`);
 await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
 let sequence=0,servedImages=0;const pending=new Map();
 const command=(method,params={},sessionId)=>new Promise((resolve,reject)=>{
  const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},10000);
  pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
 });
 socket.onmessage=async event=>{
  const message=JSON.parse(event.data);
  if(message.id){const entry=pending.get(message.id);if(entry){clearTimeout(entry.timer);pending.delete(message.id);message.error?entry.reject(Error(message.error.message)):entry.resolve(message.result);}return;}
  if(message.method==='Fetch.requestPaused'){
   const {requestId,request,resourceType}=message.params;
   if(resourceType==='Image'&&images.includes(request.url)){
    servedImages++;
    // Local one-pixel PNG, never a CDN download. The element's real source URL stays intact.
    await command('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'image/png'}],
     body:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aAccAAAAASUVORK5CYII='},message.sessionId);
   }else await command('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'},message.sessionId);
  }
 };
 const {targetId}=await command('Target.createTarget',{url:'about:blank'});
 const {sessionId}=await command('Target.attachToTarget',{targetId,flatten:true});
 await command('Fetch.enable',{patterns:[{urlPattern:'http://*'},{urlPattern:'https://*'}]},sessionId);
 await command('Page.enable',{},sessionId);
 await command('Page.navigate',{url:pathToFileURL(file).href},sessionId);
 let result;
 for(let i=0;i<350;i++){
  const evaluated=await command('Runtime.evaluate',{expression:'document.getElementById("result")?.textContent',returnByValue:true},sessionId);
  const value=evaluated.result?.value;
  if(value&&value!=='pending'){result=JSON.parse(value);break;}
  await new Promise(r=>setTimeout(r,100));
 }
 assert.ok(result,'Offline browser timed out');console.log(JSON.stringify({...result,localImageResponses:servedImages}));assert.equal(result.ok,true,result.message);
 await command('Browser.close');
}finally{
 socket?.close();if(child&&!child.killed)child.kill();
 const target=resolve(directory),parent=resolve(tmpdir());
 if(dirname(target)===parent&&basename(target).startsWith('isbn-curitiba-dom-'))await rm(target,{recursive:true,force:true,maxRetries:3}).catch(()=>{});
}
