import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const built=await build({stdin:{resolveDir:process.cwd(),contents:`export {default} from './src/components/magazord/MagazordRealRegistration';`},bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',plugins:[{name:'offline-ui',setup(b){
  b.onResolve({filter:/^react$/},()=>({path:'react',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'module.exports=deps.react'}));
  b.onResolve({filter:/^react\/jsx-runtime$/},()=>({path:'jsx',namespace:'jsx'}));b.onLoad({filter:/.*/,namespace:'jsx'},()=>({contents:'exports.jsx=exports.jsxs=(type,props)=>({type,props})'}));
  b.onResolve({filter:/\/services\/magazordRegistration$/},()=>({path:'service',namespace:'service'}));b.onLoad({filter:/.*/,namespace:'service'},()=>({contents:'exports.submitMagazordRegistration=(...args)=>deps.submit(...args)'}));
}}]});
const user={id:'11111111-1111-4111-8111-111111111111',storeId:'22222222-2222-4222-8222-222222222222',active:true};
const draft={parentCode:'U1-P',childCode:'U1',title:'Fixture',condition:'usado',magazordCategoryId:10,magazordCategoryStoreId:user.storeId,unit:'UN',ncm:'49019900',fiscalOrigin:'0 - Nacional',synopsis:'Sinopse',usedBookConditionNotes:'Estado',ean:''};
function harness(submit,storage=new Map()){
  const slots=[],deps={submit};let cursor=0,effects=[],tree,done=0,started=0;const props={draft:{...draft,price:'12,00'},user:{...user},onBusy(){},onStarted(){started++;},onDone(){done++;}};
  deps.react={useState(init){const i=cursor++;if(!(i in slots))slots[i]=typeof init==='function'?init():init;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},useRef(init){const i=cursor++;return slots[i]??={current:init};},useEffect(fn,ds){const i=cursor++;if(!slots[i]||ds.some((d,n)=>d!==slots[i][n])){slots[i]=ds;effects.push(fn);}}};
  const module={exports:{}};const sessionStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
  new Function('deps','module','exports','sessionStorage',built.outputFiles[0].text)(deps,module,module.exports,sessionStorage);
  function render(){cursor=0;effects=[];tree=module.exports.default(props);effects.forEach(fn=>fn());}
  function nodes(n){return!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)];}
  const button=text=>nodes(tree).find(n=>n.type==='button'&&String(n.props.children).includes(text));
  const fill=(label,value)=>nodes(tree).find(n=>n.type==='input'&&n.props['aria-label']===label).props.onChange({target:{value}});
  render();return{render,button,fill,props,storage,price:()=>nodes(tree).find(n=>typeof n.type==='function'&&n.type.name==='MagazordPrice')?.props.price,preview:()=>nodes(tree).find(n=>n.type==='pre'),started:()=>started,done:()=>done};
}
test('review and create are separate; double click is locked, error preserves operation and reload resumes same frozen data',async()=>{
  const calls=[];let fail=true,resolve;
  const submit=async(action,key,input)=>{calls.push({action,key,input});if(action==='preview')return{payload:{parent:{codigo:input.parentCode},child:{codigo:input.childCode}}};await new Promise(r=>resolve=r);if(fail)throw new Error('Falha sanitizada');return{parentCode:input.parentCode,childCode:input.childCode};};
  const h=harness(submit);h.fill('ID da Marca Magazord','20');h.fill('ID da loja/canal Magazord','30');h.render();await h.button('Consultar códigos').props.onClick();h.render();
  assert.equal(calls.length,1);assert.equal(h.storage.size,0);assert.equal(JSON.parse(JSON.stringify(calls[0].input)).fiscalOrigin,0);
  const create=h.button('Confirmar criação real').props.onClick;const first=create();await create();assert.equal(calls.length,2);assert.equal(h.storage.size,1);resolve();await first;h.render();assert.ok(h.button('Consultar estado'));
  const reloaded=harness(submit,h.storage);assert.equal(reloaded.started(),1);reloaded.props.draft.title='Changed after reload';reloaded.render();fail=false;
  assert.equal(reloaded.preview(),undefined,'Reload must not reconstruct a false payload with empty backend derivations');
  const retry=reloaded.button('Consultar estado').props.onClick();resolve();await retry;reloaded.render();assert.equal(calls[1].key,calls[2].key);assert.deepEqual(calls[1].input,calls[2].input);
  reloaded.button('Continuar para outro livro').props.onClick();assert.equal(reloaded.done(),1);
});

test('review displays backend derivations without adding free browser configuration fields',async()=>{
  const payload={parent:{derivacoes:[3],ativo:false},child:{derivacoes:[{derivacao:3,derivacaoItemId:8}],ativo:false}};
  const h=harness(async(action,key,input)=>{assert.equal(action,'preview');assert.equal(Object.hasOwn(input,'derivacoes'),false);assert.equal(Object.hasOwn(input,'definitionId'),false);return{payload};});
  h.fill('ID da Marca Magazord','1');h.fill('ID da loja/canal Magazord','1');h.render();await h.button('Consultar códigos').props.onClick();h.render();
  assert.deepEqual(JSON.parse(h.preview().props.children),payload);
});
test('changing active store cannot submit an operation prepared in another store',async()=>{
  let calls=0;const h=harness(async()=>{calls++;return{payload:{}};});h.fill('ID da Marca Magazord','20');h.fill('ID da loja/canal Magazord','30');h.render();await h.button('Consultar códigos').props.onClick();h.render();
  h.props.user={...user,storeId:'33333333-3333-4333-8333-333333333333'};h.render();assert.equal(h.button('Confirmar criação real').props.disabled,true);await h.button('Confirmar criação real').props.onClick();assert.equal(calls,1);
});

test('price frozen at creation survives a lost registration response and a changed form after reload',async()=>{
  let fail=true;
  const submit=async(action,key,input)=>{if(action==='preview')return{payload:{}};if(fail)throw Error('Lost response');return{parentCode:input.parentCode,childCode:input.childCode};};
  const h=harness(submit);h.fill('ID da Marca Magazord','1');h.fill('ID da loja/canal Magazord','1');h.render();
  await h.button('Consultar códigos').props.onClick();h.render();h.props.draft.price='15,00';h.render();
  await h.button('Confirmar criação real').props.onClick();assert.equal(JSON.parse([...h.storage.values()][0]).price,'15,00');
  fail=false;const reload=harness(submit,h.storage);reload.props.draft.price='99,00';reload.render();
  await reload.button('Consultar estado').props.onClick();reload.render();assert.equal(reload.price(),'15,00');
});

test('invalid price stops registration before any remote request',async()=>{
  let calls=0;const h=harness(async()=>{calls++;});h.props.draft.price='12,';h.fill('ID da Marca Magazord','1');h.fill('ID da loja/canal Magazord','1');h.render();
  await h.button('Consultar códigos').props.onClick();assert.equal(calls,0);assert.equal(h.storage.size,0);
});
