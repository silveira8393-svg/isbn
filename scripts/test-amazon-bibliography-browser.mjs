// Offline real-React/DOM integration test. No installed test dependencies, credentials or external requests.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { loadTypeScript } from '../experimentos/amazon/runtime_typescript.mjs';

const browser = process.env.ISBN_TEST_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
await access(browser); // An unavailable browser is a test impediment, never a silent pass.
const user = { id: '11111111-1111-4111-8111-111111111111', storeId: '22222222-2222-4222-8222-222222222222', active: true, role: 'developer', name: 'Offline fixture' };
const asin = 'B0G4CS2PMG';
const { parseAmazonHtml, toLabResult } = await loadTypeScript(new URL('../experimentos/amazon/extrator_amazon.ts', import.meta.url));
const fixtures = ['9788535914849', '9798276439839'].map(isbn => {
  // Authored controlled facts; these values do not purport to describe either edition.
  const source = `<link rel="canonical" href="https://www.amazon.com.br/dp/${asin}"><input id="ASIN" value="${asin}">
    <h1 id="productTitle">Obra de ensaio DOM</h1><table id="productDetails_detailBullets_sections1">
    <tr><th>ISBN-13</th><td>${isbn}</td></tr><tr><th>Editora</th><td>Selo DOM</td></tr><tr><th>Número de páginas</th><td>211 páginas</td></tr>
    <tr><th>Peso do produto</th><td>319 g</td></tr><tr><th>Data da publicação</th><td>15/03/2024</td></tr>
    <tr><th>Dimensões do produto</th><td>140 x 210 x 20 mm (L x A x P)</td></tr></table>`;
  return { isbn, lab: toLabResult(parseAmazonHtml(source, isbn, 'memory', 'fixture_sintetica', asin), 'http'),
    catalog: { isbn, items: [{ isbn, asin, marketplaceId: 'A2Q3Y263D00KWC', title: 'Obra de ensaio DOM', authors: ['Autor DOM'],
      identifiers: [{ type: 'ISBN_13', identifier: isbn }], language: 'portuguese', binding: 'paperback' }], hasMore: false } };
});
const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React from 'react'; import {createRoot} from 'react-dom/client';
import App from './src/App'; import {magazordMockService} from './src/services/magazordMockService';
const fixtures=${JSON.stringify(fixtures)}, user=${JSON.stringify(user)};
window.__fixture=fixtures[0]; window.__auditDenied=0; window.__calls=[]; window.__errors=[];
window.addEventListener('error',e=>window.__errors.push(e.message));
window.fetch=async (url,init)=>{window.__calls.push(String(url));
  if(String(url).startsWith('/api/amazon/spapi/catalog?'))return Response.json(window.__fixture.catalog);
  if(url==='/api/amazon?acao=search') {const body=JSON.parse(init.body); if(body.asin!=='${asin}')throw Error('Missing ASIN');return Response.json(window.__fixture.lab);}
  throw Error('External/persistence request forbidden: '+url);
};
magazordMockService.forStore(user.storeId).setSimulationConfig({mode:'force_new_not_found'});
const pause=()=>new Promise(r=>setTimeout(r,20));
async function wait(fn,label){for(let i=0;i<300;i++){if(fn())return;await pause();}throw Error('Timeout: '+label);}
const field=k=>document.querySelector('[data-registration-field="'+k+'"]');
const check=(condition,label)=>{if(!condition)throw Error(label);};
function edit(node,value){check(!!node,'missing input');const setter=Object.getOwnPropertyDescriptor(node.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set;
  setter.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));}
const clickText=text=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);check(!!b,'button '+text);b.click();};
const root=createRoot(document.getElementById('root'));
window.__completed=[];
async function run(){const completed=window.__completed;
for(const fixture of fixtures)for(const condition of ['novo','usado']){
 root.render(null);await pause();
 window.__fixture=fixture; root.render(<React.StrictMode><App key={fixture.isbn+condition}/></React.StrictMode>);
 await wait(()=>document.querySelector('input[placeholder*="ISBN"]'),'search');
 edit(document.querySelector('input[placeholder*="ISBN"]'),fixture.isbn);await pause();
 document.getElementById('search-submit-button').click();
 await wait(()=>document.getElementById('btn-open-magazord-registration'),'local lookup and simulated status');
 check(document.getElementById('root').textContent.includes('Selo DOM'),'Consulta publisher');
 if(condition==='novo')document.getElementById('btn-open-magazord-registration').click();
 else clickText('Usado');
 await wait(()=>field('pageCount'),'form');
 for(const [key,value] of Object.entries({title:'Obra de ensaio DOM',publisher:'Selo DOM',year:'2024',pageCount:'211',weight:'319',width:'14',height:'21',depth:'2',language:'Português'}))check(field(key).value===value,condition+' initial '+key+': '+field(key).value);
 check(field('authors').value==='Autor DOM','author input');
 const brand=[...document.querySelectorAll('input')].find(n=>n.placeholder.startsWith('Ex: Pão'));check(brand?.value==='','commercial brand not inferred');
 const edits={title:'Título manual DOM',publisher:'Editora manual DOM',pageCount:'412',year:'1998',weight:'444',width:'13',height:'22',depth:'3'};
 for(const [key,value]of Object.entries(edits)){edit(field(key),value);await pause();}
 clickText('Consultar'); await wait(()=>document.getElementById('btn-open-magazord-registration'),'return to Consulta');
 if(condition==='novo')document.getElementById('btn-open-magazord-registration').click();
 else clickText('Usado');
 await wait(()=>field('pageCount'),'reopened form');
 for(const[key,value]of Object.entries(edits))check(field(key).value===value,condition+' reopened '+key+': '+field(key).value);
 edit(field('publisher'),'');await pause();clickText('Consultar');await pause();clickText('Cadastro');await pause();check(field('publisher').value==='','intentional clearing');
 completed.push(fixture.isbn+' '+condition);
}
check(window.__calls.length===8,'exactly one catalog and one Lab per search');check(window.__auditDenied===4,'all automatic operation writes denied');check(!window.__errors.length,'page errors: '+window.__errors.join(';'));
return {completed,calls:window.__calls.length,persistenceDenied:window.__auditDenied,externalRequests:0,pageErrors:window.__errors};}
run().then(result=>{document.getElementById('result').textContent=JSON.stringify({ok:true,...result});}).catch(error=>{document.getElementById('result').textContent=JSON.stringify({ok:false,message:error.message,completed:window.__completed,isbn:window.__fixture.isbn,calls:window.__calls,errors:window.__errors});});
` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"development"' },
plugins: [{ name: 'offline-boundaries', setup(b) {
  const mocks = [
    [/contexts\/UserContext$/, `export const useUser=()=>({currentUser:${JSON.stringify(user)},canViewProduction:false,canViewSettings:true,operationEnvironment:'development'});`],
    [/lib\/supabase(?:\.js)?$/, `export const supabaseUrl='https://database.invalid';export const supabase={auth:{getSession:async()=>({data:{session:{user:{id:'${user.id}'},access_token:'synthetic-offline-only'}}})},from:()=>{throw Error('Database forbidden')}};`],
    [/hooks\/useOperationAudit$/, `export const useOperationAudit=()=>({saveOperation:async()=>{window.__auditDenied++;return false},pending:[],saving:false,retry:()=>{},storageUnavailable:false,lastConfirmation:null});`],
    [/hooks\/useLocalHistory$/, `import {useState}from'react';export const useLocalHistory=()=>{const[history,setHistory]=useState([]);return{history,setHistory,clearHistory:()=>setHistory([])}};`],
    [/services\/brasilApi$/, `export const searchBookByIsbnBrasilApi=async()=>({book:null,diagnostic:{status:404}});`],
    [/services\/distribuidoraCuritiba$/, `export const searchBookByIsbnDistribuidoraCuritiba=async()=>({book:null,diagnostic:{status:200,state:'not_found'}});export const mergeBookWithDistribuidora=a=>a;`],
  ];
  b.onResolve({ filter: /.*/ }, args => {const mock=mocks.find(([re])=>re.test(args.path));if(mock)return {path:args.path,namespace:'mock',pluginData:mock[1]};});
  b.onLoad({ filter: /.*/,namespace:'mock' },args=>({contents:args.pluginData,loader:'js',resolveDir:process.cwd()}));
} }] });
const directory = await mkdtemp(join(tmpdir(), 'isbn-bib-dom-'));
const file = join(directory, 'test.html');
await writeFile(file, `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'"><div id="root"></div><pre id="result">pending</pre><script>${bundle.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script>`, 'utf8');
let result;
try {
  result = await new Promise((resolvePromise, reject) => {
    const child = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking',
      '--host-resolver-rules=MAP * ~NOTFOUND', '--user-data-dir=' + join(directory, 'profile'), '--dump-dom', '--virtual-time-budget=20000', pathToFileURL(file).href], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout='', stderr=''; child.stdout.on('data', c=>stdout+=c); child.stderr.on('data',c=>stderr+=c);
    const timer=setTimeout(()=>{child.kill();reject(new Error('Offline browser timed out'));},45000);
    child.on('error', reject); child.on('exit', code=>{clearTimeout(timer);if(code!==0)return reject(new Error('Browser exited '+code));
      const encoded=/<pre id="result">([\s\S]*?)<\/pre>/.exec(stdout)?.[1];
      if(!encoded||encoded==='pending')return reject(new Error('No completed browser result: '+stderr.slice(-400)));
      resolvePromise(JSON.parse(encoded.replaceAll('&quot;','"').replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>')));
    });
  });
  console.log(JSON.stringify(result)); assert.equal(result.ok,true,result.message);
} finally {
  // Delete only this freshly generated task directory, after validating its resolved location.
  const target=resolve(directory),parent=resolve(tmpdir());
  if(dirname(target)===parent&&basename(target).startsWith('isbn-bib-dom-'))await rm(target,{recursive:true,force:true,maxRetries:3}).catch(()=>{});
}
