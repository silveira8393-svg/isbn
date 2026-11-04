const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
let playwright; try { playwright = require('playwright'); } catch { playwright = require(path.join(require('node:os').homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); } const { chromium } = playwright;

(async () => {
  const root = process.cwd();
  const out = path.join(root, 'docs/visual-v1.5');
  await fs.mkdir(out, { recursive: true });
  const bundle = await build({
    stdin: { resolveDir: root, loader: 'tsx', contents: `
      import React from 'react';
      import {createRoot} from 'react-dom/client';
      import App from './src/App';
      import Login from './src/components/Login';
      import Header from './src/components/Header';
      import ProductRegistrationForm from './src/components/magazord/ProductRegistrationForm';
      import {createRegistrationDraft} from './src/utils/draft';
      const root = createRoot(document.getElementById('root'));
      const book = {id:'fixture', title:'Livro de exemplo para revisao visual', author:'Autoria de exemplo', publisher:'Editora de exemplo', isbn13:'9788535914849', language:'Portugues', year:2024, pageCount:240};
      window.renderFixture = (view, role) => {
        window.__visualRole = role;
        root.render(view === 'login' ? <Login message={null}/> : view.startsWith('registration') ? <React.Fragment key={view+role}><Header activeTab="cadastro"/><main className="max-w-5xl mx-auto p-4 sm:p-6"><ProductRegistrationForm draft={createRegistrationDraft(book, view.endsWith('used') ? 'usado' : 'novo')} originalBook={book} onUpdateDraft={()=>{}} onBackToSearch={()=>{}} onSuccessRegistration={()=>{}} onProcessNextBook={()=>{}}/></main></React.Fragment> : <App key={role}/>);
      };
    ` },
    bundle: true, write: false, format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
    plugins: [{name:'isolated-visual-fixtures', setup(b) {
      b.onResolve({ filter: /contexts\/UserContext$/ }, () => ({path:'context', namespace:'visual'}));
      b.onResolve({ filter: /lib\/supabase$/ }, () => ({path:'database', namespace:'visual'}));
      b.onLoad({filter:/.*/, namespace:'visual'}, args => ({loader:'js', contents: args.path === 'context' ? `
        const users = Object.fromEntries(['operator','admin','developer'].map(role=>[role,{id:'visual-'+role,storeId:'11111111-1111-4111-8111-111111111111',storeName:'Sebo Livraria Sul',name:'Conta de exemplo',role,active:true}]));
        export function useUser(){ const role=window.__visualRole; return {currentUser:users[role],canViewProduction:role!=='operator',canViewSettings:role!=='operator',canViewAllHistory:role!=='operator',canViewDeveloperTools:role==='developer',isOperator:role==='operator',isAdmin:role==='admin',isDeveloper:role==='developer',operationEnvironment:role==='developer'?'development':'production',signOut:async()=>{}}; }
      ` : `
        const query = new Proxy(()=>{}, {get:(_,key)=>key==='then' ? resolve=>resolve({data:[],error:null,count:0}) : ()=>query, apply:()=>query});
        export const supabaseUrl='https://visual.invalid';
        export const supabase=new Proxy({}, {get:()=>query});
      `}));
    }}],
  });
  const cssName = (await fs.readdir('dist/assets')).find(f=>f.endsWith('.css'));
  const css = (await fs.readFile('dist/assets/'+cssName,'utf8')).replace(/@import"[^"]+";/g,'');
  const logo = await fs.readFile('public/brand/livraria-sul.svg');
  const browser = await chromium.launch({headless:true,channel:"msedge"});
  const evidence = [];
  try {
    for (const width of [360, 390, 768, 1024, 1440]) {
      for (const role of ['operator','admin','developer']) {
        const page = await browser.newPage({viewport:{width,height:1000}});
        const errors=[];
        page.on('pageerror', e=>{errors.push(e.message);console.error('PAGE ERROR',e.stack)}); page.on('console',msg=>{if(msg.type()==='error')console.error('CONSOLE',msg.text())});
        await page.route('**/*', route => route.request().resourceType()==='document' ? route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="pt-BR"><head><style>'+css+'</style></head><body><div id="root"></div></body></html>'}) : route.request().url().endsWith('/brand/livraria-sul.svg') ? route.fulfill({contentType:'image/svg+xml',body:logo}) : route.abort());
        await page.goto('http://isbn-visual.local/');
        await page.addScriptTag({content:bundle.outputFiles[0].text});
        await page.evaluate(role=>window.renderFixture('app',role),role);
        await page.locator('.isbn-header').waitFor();
        await page.getByRole('button',{name:'Consultar',exact:true}).click();
        await page.locator('#isbn-input-field').fill('9788535914849');
        assert.equal(await page.locator('#search-submit-button').isEnabled(),true);
        const dimensions=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,header:getComputedStyle(document.querySelector('.isbn-header')).backgroundColor,logo:[...document.querySelectorAll('.isbn-header img')].filter(i=>i.getBoundingClientRect().width>0).map(i=>({loaded:i.complete&&i.naturalWidth>0,width:i.getBoundingClientRect().width}))}));
        assert.equal(dimensions.scrollWidth,width,'horizontal overflow '+width+' '+role);
        assert.equal(dimensions.header,'rgb(30, 27, 50)');
        assert.ok(dimensions.logo.every(i=>i.loaded));
        const tabs=await page.locator('.isbn-header nav:visible button').allTextContents();
        assert.equal(tabs.length,role==='operator'?3:5);
        if ([390,1440].includes(width)) await page.screenshot({path:path.join(out,'consulta-'+role+'-'+width+'.png'),fullPage:true,animations:"disabled"});
        await page.getByRole('button',{name:'Cadastro',exact:true}).click();
        await page.getByRole('button',{name:'Histórico',exact:true}).click();
        if(role!=='operator') {
          await page.getByRole('button',{name:'Dashboard',exact:true}).click();
          await page.locator('.isbn-header nav:visible button').nth(4).click();
        }
        await page.locator('#btn-user-switcher-toggle:visible').click();
        await page.locator('#user-account-menu:visible').waitFor();
        assert.ok(await page.getByRole('button',{name:'Sair',exact:true}).isVisible());
        await page.keyboard.press('Escape');
        if ([390,1440].includes(width) && role==='operator') {
          for(const view of ['login','registration-new','registration-used']) {
            await page.evaluate(view=>window.renderFixture(view,'operator'),view);
            await page.waitForTimeout(150);
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width,view+' overflow');
            await page.screenshot({path:path.join(out,view+'-'+width+'.png'),fullPage:true,animations:"disabled"});
          }
        }
        assert.deepEqual(errors,[]);
        evidence.push({role,...dimensions,tabs,javascriptErrors:errors});
        await page.close();
      }
    }
    await fs.writeFile(path.join(out,'verificacao.json'),JSON.stringify({context:'Real components, local fixture users and database stub; all external requests blocked. No authentication, integration or production persistence exercised.',evidence},null,2)+'\n');
    console.log('Visual verification passed: '+evidence.length+' profile/viewport combinations.');
  } finally { await browser.close(); }
})().catch(e=>{ console.error(e); process.exitCode=1; });
