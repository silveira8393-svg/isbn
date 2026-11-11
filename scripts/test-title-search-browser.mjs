// Real App/React/DOM with synthetic bibliography; external requests and persistence are denied.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { access, readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const browser = process.env.ISBN_TEST_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
await access(browser);
const images = [];
const user = { id: '11111111-1111-4111-8111-111111111111', storeId: '22222222-2222-4222-8222-222222222222', role: 'operator', active: true, name: 'Teste offline' };
const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React from 'react'; import { createRoot } from 'react-dom/client';
import App from './src/App'; import { mapGoogleBooksTitleResponse } from './shared/googleBooks';
window.__calls=[]; window.__errors=[]; window.__completed=[];
window.addEventListener('error',event=>window.__errors.push(event.message));
const payload={kind:'books#volumes',totalItems:2,items:[
 {id:'first',volumeInfo:{title:'Obra sintética',publisher:'Editora A',publishedDate:'2001',authors:['Autor A']}},
 {id:'second',volumeInfo:{title:'Obra sintética',subtitle:'Edição revisada',publisher:'Editora B',publishedDate:'2020',industryIdentifiers:[{type:'ISBN_10',identifier:'8550303623'}]}}
]};
let scenario='multiple';
window.fetch=async(url,init)=>{
 window.__calls.push(String(url));
 if(!String(url).startsWith('/api/google-books?title=')||init.method!=='GET')throw Error('External/persistence forbidden');
 if(scenario==='failure')return new Response('offline',{status:503});
 return Response.json(mapGoogleBooksTitleResponse(scenario==='empty'?{kind:'books#volumes',totalItems:0}:payload));
};
const pause=()=>new Promise(r=>setTimeout(r,20));
const check=(value,message)=>{if(!value)throw Error(message);};
async function wait(fn,label){for(let i=0;i<250;i++){if(fn())return;await pause();}throw Error('Timeout '+label);}
function click(text){const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);check(button,'button '+text);button.click();}
function edit(input,value){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}
const field=key=>document.querySelector('[data-registration-field="'+key+'"]');
const root=createRoot(document.getElementById('root'));
async function run(){
 for(scenario of ['multiple','without-isbn','empty','failure']){
  root.render(<React.StrictMode><App key={scenario}/></React.StrictMode>);
  await pause();
  await wait(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Por título'),'mode');
  click('Por título');await wait(()=>document.querySelector('section[aria-label="Pesquisa por título"] input'),'title input');
  const section=document.querySelector('section[aria-label="Pesquisa por título"]');
  edit(section.querySelector('input'),'Obra sintética');await pause();click('Pesquisar título');
  if(['empty','failure'].includes(scenario)){
   await wait(()=>section.textContent.includes(scenario==='empty'?'Nenhum resultado':'indisponível'),'failure state');
   check(section.querySelectorAll('article').length===0,'no stale cards');window.__completed.push(scenario);continue;
  }
  await wait(()=>section.querySelectorAll('article').length===2,'multiple cards');
  for(const source of ['Amazon','Distribuidora Curitiba'])check([...section.querySelectorAll('button')].find(b=>b.textContent.includes(source)).disabled,'disabled '+source);
  section.querySelectorAll('article button')[scenario==='multiple'?1:0].click();await pause();
  check(!field('title'),'selection alone cannot open form');click('Confirmar seleção e abrir cadastro');
  await wait(()=>field('title'),'existing registration form');
  check(field('title').value==='Obra sintética','mapped title');
  check(field('publisher').value===(scenario==='multiple'?'Editora B':'Editora A'),'selected publisher');
  check(field('year').value===(scenario==='multiple'?'2020':'2001'),'selected edition year');
  check(field('isbn13').value===(scenario==='multiple'?'9788550303628':''),'ISBN optional and canonical');
  edit(field('title'),'Correção manual');await pause();check(field('title').value==='Correção manual','editable form');
  click('Consultar');await pause();click('Cadastro');await wait(()=>field('title'),'reopened form');
  check(field('title').value==='Correção manual','draft preserved');window.__completed.push(scenario);
 }
 check(window.__calls.length===4,'exactly one title query per scenario');check(!window.__errors.length,'page errors');
 return {ok:true,completed:window.__completed,mockedCalls:window.__calls.length,externalRequests:0,registrations:0,pageErrors:window.__errors};
}
run().then(result=>document.getElementById('result').textContent=JSON.stringify(result)).catch(error=>document.getElementById('result').textContent=JSON.stringify({ok:false,message:error.message,completed:window.__completed,calls:window.__calls,errors:window.__errors}));
` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'offline-boundaries', setup(b) {
    const mocks = [
      [/contexts\/UserContext$/, `export const useUser=()=>({currentUser:${JSON.stringify(user)},canViewProduction:false,canViewSettings:false,operationEnvironment:'production'});`],
      [/lib\/supabase(?:\.js)?$/, `export const supabaseUrl='https://database.invalid';export const supabase={auth:{getSession:async()=>({data:{session:null}})},from:()=>{throw Error('Persistence forbidden')}};`],
      [/hooks\/useOperationAudit$/, `export const useOperationAudit=()=>({saveOperation:()=>{throw Error('Persistence forbidden')},pending:[],saving:0,retry:()=>{}});`],
      [/hooks\/useLocalHistory$/, `import{useState}from'react';export const useLocalHistory=()=>{const[history,setHistory]=useState([]);return{history,setHistory,clearHistory:()=>setHistory([])}};`],
    ];
    b.onResolve({ filter: /.*/ }, args => { const mock = mocks.find(([re]) => re.test(args.path)); if (mock) return { path: args.path, namespace: 'mock', pluginData: mock[1] }; });
    b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: args.pluginData, loader: 'js', resolveDir: process.cwd() }));
  } }] });
const directory=await mkdtemp(join(tmpdir(),'isbn-title-dom-'));
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
 if(dirname(target)===parent&&basename(target).startsWith('isbn-title-dom-'))await rm(target,{recursive:true,force:true,maxRetries:3}).catch(()=>{});
}
