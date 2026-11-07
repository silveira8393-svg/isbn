import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const reference='fe06f92bca387b2cd06c03e6df74d97d49b96ee9';
const original=execFileSync('git',['show',reference+':src/components/BookDetailsCard.tsx'],{encoding:'utf8'});
const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 export {default as Card} from './src/components/BookDetailsCard';
 export {default as Original} from 'reference-card';
 export {default as Settings} from './src/components/SettingsView';
 export {isAmazonLabAvailable} from './src/services/amazonLabClient';
 export {renderToStaticMarkup} from 'react-dom/server';export {createElement} from 'react';
`},bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',define:{'import.meta.env':'{}'},plugins:[{name:'offline-presentation',setup(b){
 b.onResolve({filter:/^reference-card$/},()=>({path:'reference-card',namespace:'reference'}));
 b.onLoad({filter:/.*/,namespace:'reference'},()=>({contents:original,loader:'tsx',resolveDir:process.cwd()+'/src/components'}));
 b.onResolve({filter:/\/contexts\/UserContext$/},()=>({path:'user',namespace:'fixture'}));
 b.onResolve({filter:/\/services\/conditionTemplatesService$/},()=>({path:'templates',namespace:'fixture'}));
 b.onResolve({filter:/(?:^|\/)(MagazordTestMode|ConditionTemplateManager|UserManagement|InfrastructureEntry|AmazonLab)$/},()=>({path:'component',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='user'?`export const useUser=()=>({currentUser:{role:'developer',active:true,name:'Fixture'},canViewDeveloperTools:true});`:a.path==='templates'?'export const canManageConditionTemplates=()=>false;':'export default ()=>null;'}));
}}]});
const mod={exports:{}};new Function('require','module','exports',output.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);const api=mod.exports;
const render=(Component,book)=>api.renderToStaticMarkup(api.createElement(Component,{book}));
const lab=[
 'Edição divergente no Laboratório Amazon; complemento bibliográfico não incorporado.',
 'Dimensões Amazon sem eixos inequívocos ou conflitantes; medidas selecionadas preservadas para revisão.',
 ...['titulo','subtitulo','autores','editora','ano','edicao','idioma','formato','paginas','data_publicacao','peso','largura','altura','profundidade'].flatMap(field=>[
 `${field}: candidato inconsistente no Laboratório Amazon; requer revisão, sem preenchimento automático.`,
 `${field}: ano e data divergentes no Laboratório Amazon; fonte selecionada preservada.`,
 `${field}: divergência no Laboratório Amazon; fonte selecionada preservada.`])
];
const other=[
 'BrasilAPI: confira a edição da obra.', 'Curitiba: confira o formato bibliográfico.',
 'Google Books: conteúdo exige revisão de direitos.',
 'Formato físico/digital divergente na Amazon; formato da fonte prioritária preservado para revisão.',
 'Ano/data de publicação divergentes na Amazon; ano da fonte prioritária preservado.',
 'formato: valor selecionado ambíguo ou unidade não identificada; preservado para revisão.',
 'BrasilAPI: divergência também observada no Laboratório Amazon; conferir a fonte original.'
];
const book={id:'fixture',title:'Título preservado',subtitle:'Subtítulo',authors:['Autor'],isbn13:'9788551003664',isbn10:'8551003666',publisher:'Editora',year:2020,format:'Capa dura',pageCount:150,
 coverUrl:'https://images.invalid/front.jpg',thumbnailUrl:'https://images.invalid/thumb.jpg',additionalImages:['https://images.invalid/back.jpg','https://images.invalid/inside.jpg'],
 provenance:{publisher:'amazon_lab_verified: fixture',title:'amazon_spapi_catalog_2022-04-01'},bibliographicWarnings:[...lab,...other]};

test('only known laboratory warnings and its operational source note are hidden',()=>{
 const html=render(api.Card,{...book,bibliographicWarnings:lab});
 for(const warning of lab)assert.ok(!html.includes(warning));
 assert.doesNotMatch(html,/Laboratório Amazon|verificada no laboratório|<ul role="status"/);
 assert.match(html,/Fonte complementar: Amazon SP-API/);
});
test('other sources, official Amazon conflicts and generic review warnings remain verbatim',()=>{
 const html=render(api.Card,book);for(const warning of other)assert.ok(html.includes(warning),warning);
 assert.equal((html.match(/<li>/g)||[]).length,other.length);
});
test('rendering never changes bibliographic data, internal diagnostics or original warnings',()=>{
 const value=structuredClone(book),before=structuredClone(value);
 function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
 render(api.Card,freeze(value));assert.deepEqual(value,before);
});
test('entire bibliographic card, covers, gallery and links match reference apart from specified messages',()=>{
 let baseline=render(api.Original,book);
 baseline=baseline.replace('<p class="text-xs text-slate-500">Fonte complementar: Amazon (edição verificada no laboratório).</p>','');
 for(const warning of lab)baseline=baseline.replace(`<li>${warning}</li>`,'');
 assert.equal(render(api.Card,book),baseline);
});
test('Development still exposes the existing Amazon Laboratory entry and role rules',()=>{
 const html=api.renderToStaticMarkup(api.createElement(api.Settings));assert.match(html,/Laboratório Amazon/);
 assert.equal(api.isAmazonLabAvailable('developer',true),true);
 for(const role of ['admin','operator'])assert.equal(api.isAmazonLabAvailable(role,true),false);
 assert.equal(api.isAmazonLabAvailable('developer',false),false);
});
test('scope stays limited to presentation and tests; research and real categories remain unchanged',async()=>{
 const changed=execFileSync('git',['diff',reference,'--name-only'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
 assert.ok(changed.every(path=>['src/components/BookDetailsCard.tsx','tests/amazonLabPresentation.test.mjs','tests/amazonBibliography.test.mjs'].includes(path)));
 for(const path of ['src/App.tsx','src/services/amazonOfficial.ts','src/services/amazonLabClient.ts','src/components/SettingsView.tsx','src/components/magazord/MagazordCategoryPicker.tsx','src/hooks/useMagazordCategories.ts','server/magazordCategories.ts']){
  assert.ok((await readFile(path,'utf8')).replaceAll('\r\n','\n')===execFileSync('git',['show',reference+':'+path],{encoding:'utf8'}),path+' must remain unchanged');
 }
});
