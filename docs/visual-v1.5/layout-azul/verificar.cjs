/* Ensaio isolado de apresentação. Nenhum dado de produção é lido ou gravado. */
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const {createHash} = require('node:crypto');
const { build } = require('esbuild');
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(path.join(require('node:os').homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }

(async () => {
  const stage = process.argv.includes('--antes') ? 'antes' : 'depois';
  const root = process.cwd();
  const baseline = '8c96e2c00ebdb360142b80b49038512b42979d1c';
  const baselineSource = file => cp.execFileSync('git',['show',baseline+':'+path.relative(root,file).replace(/\\/g,'/')],{encoding:'utf8'});
  let dist = 'dist/assets';
  if(stage==='antes') {
    // Reconstrói somente a referência visual em um cache ignorado, sem trocar o checkout.
    const {build: viteBuild} = await import('vite');
    const cache='node_modules/.cache/isbn-blue-before';
    await viteBuild({root,logLevel:'error',build:{outDir:cache,emptyOutDir:true},plugins:[{name:'baseline-presentation',enforce:'pre',load(id){const file=path.resolve(id.split('?')[0]);if(file.startsWith(path.join(root,'src')+path.sep)&&/\.(tsx|css)$/.test(file))return baselineSource(file);}}]});
    dist=cache+'/assets';
  }
  const output = path.join(__dirname, stage);
  await fs.mkdir(output, { recursive: true });
  const entry = `
    import React, {useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import App from './src/App';
    import Login from './src/components/Login';
    import Header from './src/components/Header';
    import BookDetailsCard from './src/components/BookDetailsCard';
    import SearchForm from './src/components/SearchForm';
    import SearchHistoryGroup from './src/components/SearchHistoryGroup';
    import MagazordStatusCard from './src/components/magazord/MagazordStatusCard';
    import ProductRegistrationForm from './src/components/magazord/ProductRegistrationForm';
    import {createRegistrationDraft} from './src/utils/draft';
    const root = createRoot(document.getElementById('root'));
    const book = {id:'visual-book',title:'O jardim das palavras',subtitle:'Uma edição para leitura e descoberta',authors:['Autoria de demonstração'],publisher:'Editora de demonstração',isbn13:'9788535914849',language:'pt',year:2024,pageCount:240,format:'Brochura',weight:320,width:14,height:21,depth:1.6,edition:'1',coverUrl:'https://isbn-fixtures.invalid/capa-autoral.svg',additionalImages:['https://isbn-fixtures.invalid/contracapa-autoral.svg','https://isbn-fixtures.invalid/miolo-autoral.svg'],synopsis:'Uma obra de referência para conferir a apresentação bibliográfica, a leitura dos dados e a organização das imagens. Todos os dados desta tela são exclusivos do ensaio visual.'};
    const history = [book.title,'Entre páginas e histórias','A biblioteca do amanhã'].map((title,i)=>({isbn:book.isbn13,title,timestamp:1793790000000-i*60000,magazordStatus:i?'localizado':'nao_cadastrado',historyKind:'operational'}));
    function Registration({used}) {
      const [draft,setDraft]=useState(()=>({...createRegistrationDraft(book,used?'usado':'novo'),parentCode:'LV26579-P',childCode:used?'LV26579-F':book.isbn13,price:'39,90',usedBookConditionNotes:used?'Exemplar em bom estado de conservação.':''}));
      return <ProductRegistrationForm draft={draft} originalBook={book} onUpdateDraft={updates=>setDraft(d=>({...d,...updates}))} onBackToSearch={()=>{}} onSuccessRegistration={()=>{}} onProcessNextBook={()=>{}}/>;
    }
    function Result(){const [isbn,setIsbn]=useState(book.isbn13);return <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"><div className="space-y-6 lg:col-span-8"><SearchForm isbnValue={isbn} setIsbnValue={setIsbn} onSearch={()=>{}} isLoading={false} onOpenScanner={()=>{}}/><BookDetailsCard book={book}/><MagazordStatusCard book={book} checkResult={{status:'NOT_FOUND',exists:false}} isChecking={false} checkError={null} onOpenRegistration={()=>{}} onRetryCheck={()=>{}} onResetForNextBook={()=>{}}/></div><div className="hidden lg:block lg:col-span-4"><SearchHistoryGroup items={history} onSelect={()=>{}} onClear={()=>{}} onExport={()=>{}}/></div></div>}
    window.renderFixture=(view,role)=>{
      window.__visualRole=role;
      localStorage.setItem('sebo_isbn_history_v2:11111111-1111-4111-8111-111111111111:visual-'+role,JSON.stringify(history.map(item=>({...item,success:true,userId:'visual-'+role,storeId:'11111111-1111-4111-8111-111111111111',userName:'Conta de exemplo',userRole:role}))));
      root.render(view==='login'?<Login key={view+role} message={null}/>:view==='consulta'||view==='app'?<App key={view+role}/>:<div key={view+role} className="isbn-app-shell min-h-screen bg-slate-50"><Header activeTab={view.startsWith('cadastro')||view==='revisao'?'cadastro':'consultar'}/><main className="isbn-workspace max-w-7xl mx-auto px-4 sm:px-6 py-6"><div className={view.startsWith('cadastro')||view==='revisao'?'max-w-5xl mx-auto':''}>{view.startsWith('cadastro')||view==='revisao'?<Registration used={view==='cadastro-usado'}/>:<Result/>}</div></main></div>);
    };
  `;
  const bundle = await build({stdin:{contents:entry,loader:'tsx',resolveDir:root},bundle:true,format:'iife',write:false,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{}'},plugins:[{name:'visual-isolation',setup(b){
    if(stage==='antes')b.onLoad({filter:/[\\/]src[\\/].*\.tsx$/},args=>({loader:'tsx',contents:baselineSource(args.path)}));
    b.onResolve({filter:/contexts\/UserContext$/},()=>({path:'context',namespace:'fixture'}));
    b.onResolve({filter:/lib\/supabase$/},()=>({path:'database',namespace:'fixture'}));
    b.onResolve({filter:/services\/productionService$/},()=>({path:'production',namespace:'fixture'}));
    b.onLoad({filter:/^production$/,namespace:'fixture'},()=>({loader:'js',contents:`
      export async function loadProduction(storeId,environment){return {names:{'visual-operator':'Conta de exemplo'},operations:['isbn_search','new_product_created','used_copy_created','new_product_reused','isbn_search','used_copy_created','isbn_search','new_product_created'].map((operation_type,i)=>({id:'fixture-'+i,store_id:storeId,user_id:'visual-operator',environment,operation_type,status:'success',condition:i%2?'novo':'usado',isbn:'9788535914849',title:'O jardim das palavras',parent_code:'LV26579-P',child_code:'LV26579-F',metadata:{mock:true},created_at:new Date(1793790000000-i*86400000).toISOString(),completed_at:new Date(1793790000000-i*86400000).toISOString()}))};}
    `}));
    b.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'js',contents:args.path==='context'?`
      const users=Object.fromEntries(['operator','admin','developer'].map(role=>[role,{id:'visual-'+role,storeId:'11111111-1111-4111-8111-111111111111',storeName:'Sebo Livraria Sul',name:'Conta de exemplo',role,active:true}]));
      export function useUser(){const role=window.__visualRole;return {currentUser:users[role],canViewProduction:role!=='operator',canViewSettings:role!=='operator',canViewAllHistory:role!=='operator',canViewDeveloperTools:role==='developer',isOperator:role==='operator',isAdmin:role==='admin',isDeveloper:role==='developer',operationEnvironment:role==='developer'?'development':'production',signOut:async()=>{}};}
    `:`
      const query=new Proxy(()=>{}, {get:(_,key)=>key==='then'?resolve=>resolve({data:[],error:null,count:0}):()=>query,apply:()=>query});export const supabaseUrl='https://visual.invalid';export const supabase=new Proxy({}, {get:()=>query});
    `}));
  }}]});
  const cssFile=(await fs.readdir(dist)).find(f=>f.endsWith('.css'));
  const css=(await fs.readFile(dist+'/'+cssFile,'utf8')).replace(/@import"[^"]+";/g,'');
  assert.equal(css.includes('.isbn-sidebar'),stage==='depois','CSS does not match requested baseline/stage');
  const logo=stage==='antes'?Buffer.from(baselineSource(path.join(root,'public/brand/livraria-sul.svg'))):await fs.readFile('public/brand/livraria-sul.svg');
  const assets=new Map(await Promise.all(['capa-autoral.svg','contracapa-autoral.svg','miolo-autoral.svg'].map(async file=>[file,await fs.readFile('experimentos/amazon/tests/fixtures/'+file)])));
  const browser=await playwright.chromium.launch({headless:true,channel:'msedge'});
  const evidence=[];
  const checks=[];
  const contrastRatio=(foreground,background)=>{
    const luminance=color=>{const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;});return 0.2126*rgb[0]+0.7152*rgb[1]+0.0722*rgb[2];};
    const a=luminance(foreground),b=luminance(background);return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
  };
  try {
    for(const width of [390,768,1024,1440]) for(const role of ['operator','admin','developer']) {
      const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});
      await page.addInitScript(()=>{const RealDate=Date;window.Date=class extends RealDate {constructor(...args){super(...(args.length?args:[1793800000000]));}static now(){return 1793800000000;}};});
      const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/*',route=>{
        const url=new URL(route.request().url());
        if(route.request().resourceType()==='document')return route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>'+css+'</style></head><body><div id="root"></div></body></html>'});
        if(url.pathname==='/brand/livraria-sul.svg')return route.fulfill({contentType:'image/svg+xml',body:logo});
        if(url.hostname==='isbn-fixtures.invalid'&&assets.has(path.basename(url.pathname)))return route.fulfill({contentType:'image/svg+xml',body:assets.get(path.basename(url.pathname))});
        return route.abort();
      });
      await page.goto('http://isbn-visual.local/');
      await page.addScriptTag({content:bundle.outputFiles[0].text});
      const capture=async(view)=>{
        await page.waitForTimeout(100);
        const metrics=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,fontFamily:getComputedStyle(document.body).fontFamily,controls:[...document.querySelectorAll('button,input,select,textarea')].map(el=>({tag:el.tagName,id:el.id,type:el.getAttribute('type'),text:el.tagName==='BUTTON'?el.textContent.trim():null,value:el.value,disabled:el.disabled,required:el.required,readOnly:el.readOnly,tabIndex:el.tabIndex,role:el.getAttribute('role'),'aria-label':el.getAttribute('aria-label'),'aria-expanded':el.getAttribute('aria-expanded')}))}));
        if(metrics.scrollWidth>width)console.warn('OVERFLOW',stage,role,width,view,metrics.scrollWidth);
        metrics.controlCount=metrics.controls.length;
        metrics.controlSignature=createHash('sha256').update(JSON.stringify(metrics.controls)).digest('hex');
        delete metrics.controls;
        if((width===1440&&role===(['dashboard','registros','configuracoes'].includes(view)?'admin':'operator'))||(width===390&&role===(['dashboard','registros','configuracoes'].includes(view)?'developer':'operator'))||([768,1024].includes(width)&&['resultado','cadastro-novo','configuracoes'].includes(view)&&role===(view==='configuracoes'?'admin':'operator')))await page.screenshot({path:path.join(output,view+'-'+width+'.png'),fullPage:false,animations:'disabled'});
        evidence.push({role,view,...metrics});
      };
      for(const view of ['login','consulta','resultado','cadastro-novo','cadastro-usado','galeria','revisao','historico',...(role==='operator'?[]:['dashboard','registros','configuracoes'])]) {
        if(['historico','dashboard','registros','configuracoes'].includes(view)){
          await page.evaluate(role=>window.renderFixture('app',role),role);
          const index={historico:2,dashboard:3,registros:3,configuracoes:4}[view];
          await page.locator('.isbn-header nav:visible button').nth(index).click();
          if(view==='dashboard'||view==='registros')await page.getByRole('heading',{name:'Dashboard do Proprietário',exact:true}).waitFor();
          if(view==='registros')await page.getByRole('tab',{name:'Registros',exact:true}).click();
        } else {
          await page.evaluate(({view,role})=>window.renderFixture(view,role),{view,role});
          if(view==='login')await page.locator('#login-email').waitFor();else await page.locator('.isbn-header').waitFor();
        }
        if(view==='consulta'){
          await page.locator('.isbn-header nav:visible button').nth(0).click();
          await page.locator('#isbn-input-field').fill('9788535914849');
          assert.equal(await page.locator('#search-submit-button').isEnabled(),true);
          assert.equal(await page.locator('.isbn-header nav:visible button').count(),role==='operator'?3:5);
        }
        if(view==='galeria'){
          await page.getByTitle('Imagem adicional 1',{exact:true}).click();
          const image=page.getByRole('img',{name:'Capa do livro O jardim das palavras',exact:true});
          assert.match(await image.getAttribute('src'),/contracapa/);
          await page.getByRole('heading',{name:'Capa e Imagens',exact:true}).scrollIntoViewIfNeeded();
        }
        if(view==='revisao'){
          await page.locator('#btn-submit-magazord-registration').click();
          await page.getByRole('region',{name:'Revisão do cadastro',exact:true}).waitFor();
          await page.getByRole('heading',{name:'Revisão do cadastro',exact:true}).scrollIntoViewIfNeeded();
        }
        await capture(view);
        if(stage==='depois'&&view.startsWith('cadastro')){
          const quantity=page.locator('[data-registration-field="quantity"]');
          assert.equal(await quantity.inputValue(),'1');
          assert.equal(await quantity.isEditable(),true);
          await quantity.fill('2');assert.equal(await quantity.inputValue(),'2');await quantity.fill('1');
          const price=page.locator('[data-registration-field="price"]');
          await price.fill('15000');assert.equal(await price.inputValue(),'150,00');
          await price.fill('123456');assert.equal(await price.inputValue(),'1.234,56');
          checks.push({role,width,view,quantityDefault:1,quantityEditable:true,centMask:true});
          if(view==='cadastro-novo'&&width===390&&role==='operator'){
            await price.fill('');await page.locator('#btn-submit-magazord-registration').click();
            await page.getByText('Por favor, revise os seguintes campos obrigatórios:',{exact:true}).waitFor();
            await page.getByText('Por favor, revise os seguintes campos obrigatórios:',{exact:true}).scrollIntoViewIfNeeded();
            await page.screenshot({path:path.join(output,'erro-cadastro-390.png'),animations:'disabled'});
          }
        }
        if(stage==='depois'&&view==='revisao'){
          assert.equal(await page.locator('[data-registration-form] > div[hidden]').isVisible(),false);
          checks.push({role,width,view,registrationHiddenDuringReview:true});
        }
        if(stage==='depois'&&view==='configuracoes'){
          assert.equal(await page.getByRole('button',{name:'Laboratório Amazon',exact:true}).count(),role==='developer'?1:0);
          assert.equal(await page.getByRole('button',{name:'Infraestrutura',exact:true}).count(),role==='developer'?1:0);
          checks.push({role,width,view,technicalNavigationRestricted:true});
        }
        if(view==='consulta'){
          await page.locator('#btn-user-switcher-toggle:visible').click();
          await page.locator('#user-account-menu:visible').waitFor();
          await page.keyboard.press('Escape');
          assert.equal(await page.locator('#user-account-menu:visible').count(),0);
          if(stage==='depois'){
            const samples=await page.evaluate(()=>{
              const active=[...document.querySelectorAll('.isbn-header nav button.bg-white')].find(el=>el.getBoundingClientRect().width);
              const button=document.querySelector('#search-submit-button');const input=document.querySelector('#isbn-input-field');
              return [active,button,input].map(el=>({foreground:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor}));
            });
            const contrast=samples.map(sample=>Number(contrastRatio(sample.foreground,sample.background).toFixed(2)));
            assert.ok(contrast.every(value=>value>=4.5),'Primary controls contrast below 4.5:1');
            await page.locator('#isbn-input-field').focus();
            const order=[];for(let i=0;i<3;i++){await page.keyboard.press('Tab');order.push(await page.evaluate(()=>({id:document.activeElement.id,title:document.activeElement.getAttribute('title')})));}
            assert.equal(order[0].title,'Limpar campo');
            assert.equal(order[2].id,'search-submit-button');
            if(width===390){const summary=page.locator('.isbn-mobile-navigation summary');await summary.click();assert.equal(await page.locator('.isbn-header nav:visible').count(),0);await summary.press('Enter');assert.equal(await page.locator('.isbn-header nav:visible').count(),1);}
            checks.push({role,width,view,tabOrder:order,mobileDisclosureVerified:width===390,primaryControlContrast:contrast});
          }
        }
      }
      assert.deepEqual(errors,[],role+' '+width+' JavaScript errors');
      await page.close();
    }
    await fs.writeFile(path.join(output,'verificacao.json'),JSON.stringify({stage,context:'Real components with isolated fixture users, books and database. External requests blocked. No authenticated production integration or persistence tested.',controlSignature:'SHA-256 of ordered control attributes and values serialized as JSON; excludes presentation classes.',evidence},null,2)+'\n');
    if(stage==='depois')await fs.writeFile(path.join(output,'verificacoes-adicionais.json'),JSON.stringify({context:'Isolated UI checks, no confirmation/submission or backend write.',checks},null,2)+'\n');
    console.log(stage+': '+evidence.length+' screen/profile/width combinations verified.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1});
