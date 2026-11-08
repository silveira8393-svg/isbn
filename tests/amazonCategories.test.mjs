import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
// All Amazon catalog payloads and categories in this suite are SYNTHETIC fixtures.
const isbn='9788535914849',marketplaceId='A2Q3Y263D00KWC',asin='SYNTHETIC1';
const user={id:'synthetic-user',storeId:'synthetic-store',role:'developer',active:true};
const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 export {searchCatalog} from './server/spapi/catalog';
 export * from './shared/amazonCategories';
 export {searchAmazonOfficial,complementWithAmazon,selectEquivalentAmazonRecord} from './src/services/amazonOfficial';
 export {createRegistrationDraft} from './src/utils/draft';
 export {default as Section} from './src/components/magazord/CategoryAndBrandSection';
 export {createElement} from 'react'; export {renderToStaticMarkup} from 'react-dom/server';
`},bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',plugins:[{name:'synthetic-session',setup(b){
 b.onResolve({filter:/lib\/supabase$/},()=>({path:'session',namespace:'synthetic'}));
 b.onLoad({filter:/.*/,namespace:'synthetic'},()=>({contents:`export const supabase={auth:{getSession:async()=>({data:{session:{access_token:'synthetic',user:{id:'synthetic-user'}}}})}};`}));
}}]});
const mod={exports:{}};new Function('require','module','exports',output.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);const api=mod.exports;
const node=(id,name,parent)=>({classificationId:id,displayName:name,...(parent?{parent}:{})});
const summary=node('2','Resumo sintético');
const hierarchy=node('3','Gênero sintético',node('1','Livros sintéticos'));
const raw=(changes={})=>({asin,identifiers:[{marketplaceId,identifiers:[{identifierType:'ISBN',identifier:isbn}]}],
 summaries:[{marketplaceId,itemName:'Obra sintética',browseClassification:summary}],...changes});
const group=(classifications,market=marketplaceId)=>({marketplaceId:market,classifications});
async function project(items){let calls=0;const result=await api.searchCatalog({},async(url,init)=>{
 calls++;assert.equal(init.method,'GET');assert.equal(new URL(url).searchParams.get('includedData'),'summaries,attributes,identifiers,dimensions,images,classifications');
 return Response.json({numberOfResults:items.length,items});},isbn,'synthetic');assert.equal(calls,1);return result;}
async function client(t,payload){let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json(payload);});
 const result=await api.searchAmazonOfficial(isbn,user);assert.equal(calls,1);return result;}
const base={id:'synthetic-base',title:'Título prioritário',isbn13:isbn,categories:['Brasil sintético']};
function render(book){return api.renderToStaticMarkup(api.createElement(api.Section,{originalBook:book,draft:{...api.createRegistrationDraft(book),category:'Escolha manual',magazordCategoryId:777},
 categories:{loading:false,storeId:'synthetic-store',catalog:null,reload(){}},errors:{},onChange(){assert.fail('Informative references must not mutate commercial draft');}}));}
for(const [label,changes,expected] of [
 ['browseClassification only',{},'Resumo sintético'],
 ['classifications hierarchy',{summaries:[{marketplaceId,itemName:'Obra sintética'}],classifications:[group([hierarchy])]},'Livros sintéticos &gt; Gênero sintético'],
 ['both, hierarchy preferred',{classifications:[group([hierarchy,hierarchy])]},'Livros sintéticos &gt; Gênero sintético'],
 ['absent',{summaries:[{marketplaceId,itemName:'Obra sintética'}]},null],
 ['foreign marketplace',{summaries:[{marketplaceId,itemName:'Obra sintética'},{marketplaceId:'FOREIGN',browseClassification:summary}],classifications:[group([hierarchy],'FOREIGN')]},null],
 ['malformed hierarchy falls back',{classifications:[group([{displayName:'Missing ID'},{...hierarchy,parent:42},null])]},'Resumo sintético'],
 ['partial malformed groups',{classifications:[null,group(null),group([null,42,hierarchy])]},'Livros sintéticos &gt; Gênero sintético'],
])test(label,async t=>{
 const projected=await project([raw(changes)]);const result=await client(t,projected);assert.equal(result.status,'success');
 const merged=api.complementWithAmazon(base,result.book),html=render(merged);
 if(expected){assert.ok(html.includes(expected));assert.ok(html.includes('Amazon — categoria de navegação'));assert.equal(merged.amazonCategoryReference.asin,asin);assert.equal(merged.amazonCategoryReference.marketplaceId,marketplaceId);
 assert.equal(merged.amazonCategoryReference.classifications.length,1);if(label.startsWith('both'))assert.ok(!html.includes('Resumo sintético'));}
 else assert.equal(merged.amazonCategoryReference,undefined);
 assert.equal(merged.title,base.title);assert.deepEqual(merged.categories,base.categories);assert.deepEqual(api.createRegistrationDraft(merged),api.createRegistrationDraft({...merged,amazonCategoryReference:undefined}));
});
test('different ASINs remain ambiguous; categories never union',async t=>{
 const result=await client(t,await project([raw(),raw({asin:'SYNTHETIC2',summaries:[{marketplaceId,itemName:'Outra obra sintética'}],classifications:[group([hierarchy])]})]));
 assert.equal(result.status,'ambiguous');assert.equal(result.book,null);
});
test('equivalent ASIN selection retains categories of the selected ASIN only',()=>{
 const common={isbn,marketplaceId,title:'Obra sintética',authors:['Autor'],publisher:'Editora',publicationDate:'2020-01-01',identifiers:[{type:'ISBN_13',identifier:isbn}]};
 const selected=api.selectEquivalentAmazonRecord([{...common,asin:'SYNTHETIC1',classifications:[hierarchy]},{...common,asin:'SYNTHETIC2',classifications:[summary]}],isbn);
 assert.equal(selected.asin,'SYNTHETIC1');assert.deepEqual(selected.classifications,[hierarchy]);
});
test('invalid, cyclic and excessive metadata ignored without throwing',()=>{
 const cycle=node('1','Cycle');cycle.parent=cycle;
 assert.equal(api.amazonBrowseNode(cycle),undefined);assert.deepEqual(api.amazonBrowseNodes([null,{},node('1','<script>'),cycle]),[]);
 const values=api.amazonBrowseNodes([node('3','Gênero sintético'),hierarchy,hierarchy]);assert.deepEqual(values,[hierarchy]);
});
test('foreign or mismatched references cannot render or consolidate',()=>{
 const reference={asin,isbn,marketplaceId,classifications:[hierarchy]};
 for(const change of [{asin:'SYNTHETIC2'},{marketplaceId:'FOREIGN'},{isbn:'9788551003664'}]){
  const book={...base,amazonCatalogReference:{asin,isbn,marketplaceId},amazonCategoryReference:{...reference,...change}};
  assert.ok(!render(book).includes('Amazon — categoria de navegação'));
  assert.equal(api.complementWithAmazon(base,book).amazonCategoryReference,undefined);
 }
});
test('categories do not change existing bibliographic projection',async()=>{
 const a=await project([raw({summaries:[{marketplaceId,itemName:'Obra sintética'}]})]);const b=await project([raw({classifications:[group([hierarchy])]})]);
 const {browseClassification,classifications,...unchanged}=b.items[0];assert.deepEqual(unchanged,a.items[0]);
});
