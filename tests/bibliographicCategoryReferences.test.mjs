import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
// All classifications and provider responses below are synthetic test fixtures.
const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 export {default as Section} from './src/components/magazord/CategoryAndBrandSection';
 export * from './shared/googleBooks';export {complementWithGoogleBooks} from './src/services/googleBooks';
 export {searchBookByIsbnBrasilApi} from './src/services/brasilApi';
 export {searchBookByIsbnDistribuidoraCuritiba,mergeBookWithDistribuidora} from './src/services/distribuidoraCuritiba';
 export {createRegistrationDraft} from './src/utils/draft';export {createRegistrationSnapshot} from './src/utils/registrationSnapshot';
 export {renderToStaticMarkup} from 'react-dom/server';export {createElement} from 'react';
`},bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic'});
const mod={exports:{}};new Function('require','module','exports',output.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);const api=mod.exports;
const isbn='9788551003664';
const fixtureGoogle=fields=>({kind:'books#volumes',totalItems:1,items:[{kind:'books#volume',id:'synthetic_category_volume',volumeInfo:{title:'Obra sintética',industryIdentifiers:[{type:'ISBN_13',identifier:isbn}],...fields}}]});
const google=fields=>api.mapGoogleBooksResponse(fixtureGoogle(fields),isbn).book;
const book={id:'synthetic-book',title:'Obra sintética',isbn13:isbn};
const draft={...api.createRegistrationDraft(book),category:'Loja > Escolha manual',magazordCategoryId:777,magazordCategoryStoreId:'22222222-2222-4222-8222-222222222222',categorySource:'magazord',price:'12,90',quantity:2,parentCode:'FIXTURE-P',childCode:'FIXTURE-CHILD'};
const catalog={loading:false,storeId:draft.magazordCategoryStoreId,catalog:{source:'magazord',categories:[{id:777,nome:'Escolha manual',pai:null,path:draft.category,depth:0}],invalidCount:0,fetchedAt:'2026-11-08T00:00:00Z'},reload(){}};
const render=(originalBook,change=()=>assert.fail('Informative rendering must not change the draft'))=>api.renderToStaticMarkup(api.createElement(api.Section,{draft,originalBook,categories:catalog,onChange:change,errors:{}}));
const hasBlock=html=>html.includes('aria-label="Referências das fontes"');

for(const subject of [undefined,null,[],['Ficção sintética','História sintética']])test('BrasilAPI subject '+JSON.stringify(subject),async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({isbn,title:book.title,subject});});
 const result=await api.searchBookByIsbnBrasilApi(isbn);const html=render(result.book);assert.equal(calls,1);
 assert.equal(hasBlock(html),!!subject?.length);if(subject?.length){assert.match(html,/BrasilAPI:/);for(const item of subject)assert.ok(html.includes(item));}
});
for(const fields of [{},{dsCategoria:'Categoria Curitiba sintética'},{dsDepartamento:'Departamento Curitiba sintético'},{dsCategoria:'Categoria Curitiba sintética',dsDepartamento:'Departamento Curitiba sintético'}])
test('Curitiba fields '+Object.keys(fields).join('+'),async t=>{
 let calls=0;const product={cdProduto:'FIXTURE-CURITIBA',nuCdBarras:isbn,dsProduto:book.title,...fields};
 t.mock.method(globalThis,'fetch',async url=>{calls++;return Response.json(String(url).includes('loginAcessoPublico')?{sessionId:'synthetic-session',empresa:{cdEmpresa:1},cliente:{cdCliente:1}}:String(url).includes('findAllByExampleByPages')?{items:[product]}:product);});
 const result=await api.searchBookByIsbnDistribuidoraCuritiba(isbn);assert.equal(result.diagnostic.state,'success');assert.equal(calls,3);
 const merged=api.mergeBookWithDistribuidora(book,result.book);const html=render(merged);assert.equal(hasBlock(html),!!Object.keys(fields).length);
 for(const value of Object.values(fields))assert.ok(html.includes(value));if(Object.keys(fields).length)assert.match(html,/Distribuidora Curitiba:/);
});
for(const fields of [{},{categories:['Literatura Google sintética']},{mainCategory:'Gênero Google sintético'},{categories:['Literatura Google sintética'],mainCategory:'Gênero Google sintético'}])
test('Google classification '+Object.keys(fields).join('+'),()=>{
 const incoming=google(fields),merged=api.complementWithGoogleBooks(book,incoming,isbn);const html=render(merged);
 assert.equal(hasBlock(html),!!Object.keys(fields).length);assert.equal(merged.categories,undefined);
 for(const value of [...(fields.categories||[]),fields.mainCategory].filter(Boolean))assert.ok(html.includes(value));
 if(Object.keys(fields).length){assert.match(html,/Google Books:/);assert.deepEqual(merged.googleBooksReference,incoming.googleBooksReference);}
 else{assert.equal(Object.hasOwn(incoming.googleBooksReference,'categories'),false);assert.equal(Object.hasOwn(incoming.googleBooksReference,'mainCategory'),false);}
});
test('Google ignores invalid entries and deduplicates references without inventing classifications',()=>{
 const incoming=google({categories:[' Literatura sintética ','Literatura sintética','',null,42,'<script>'],mainCategory:' '});
 assert.deepEqual(incoming.googleBooksReference.categories,['Literatura sintética']);assert.equal(incoming.googleBooksReference.mainCategory,undefined);
 assert.equal(hasBlock(render({...book,categories:[' ',''],productCategory:' ',department:''})),false);
});
test('all three sources appear together, immediately below picker and before brand, with no Amazon row',t=>{
 t.mock.method(globalThis,'fetch',()=>assert.fail('Rendering must never request classifications'));
 const merged={...book,categories:['Brasil sintético'],productCategory:'Curitiba sintética',department:'Departamento sintético',googleBooksReference:google({categories:['Google sintético'],mainCategory:'Gênero sintético'}).googleBooksReference,amazonCategoryReference:'Amazon must not appear'};
 const html=render(merged);for(const source of ['BrasilAPI:','Distribuidora Curitiba:','Google Books:'])assert.ok(html.includes(source));
 assert.ok(html.indexOf('Referências das fontes')>html.indexOf('magazord-category-search'));assert.ok(html.indexOf('Referências das fontes')<html.indexOf('Marca Magazord'));
 assert.doesNotMatch(html,/Amazon must not appear|Amazon:/);
});
test('absence in all sources yields no reference block or empty source rows',()=>{for(const original of [undefined,book,{...book,categories:[],department:'',productCategory:''}]){const html=render(original);assert.equal(hasBlock(html),false);assert.doesNotMatch(html,/BrasilAPI:|Distribuidora Curitiba:|Google Books:/);}});
test('display does not mutate the chosen commercial category, draft or persisted history snapshot',()=>{
 const before=structuredClone(draft),snapshot=api.createRegistrationSnapshot(draft,'2026-11-08T00:00:00Z');
 const enriched={...book,categories:['Brasil sintético'],productCategory:'Curitiba sintética',googleBooksReference:google({categories:['Google sintético']}).googleBooksReference};
 const html=render(enriched);assert.ok(html.includes('ID 777'));assert.ok(html.includes('Loja &gt; Escolha manual'));
 assert.deepEqual(draft,before);assert.deepEqual(api.createRegistrationSnapshot(draft,'2026-11-08T00:00:00Z'),snapshot);
 assert.deepEqual(api.createRegistrationDraft(book),api.createRegistrationDraft(enriched));
});
test('Google primary bibliographic values and consolidation priority remain identical',()=>{
 const plain=google({publisher:'Editora Google sintética',authors:['Autora sintética']}),classified=google({publisher:'Editora Google sintética',authors:['Autora sintética'],categories:['Categoria sintética'],mainCategory:'Principal sintética'});
 const base={...book,publisher:'Editora prioritária',categories:['Brasil prioritário'],productCategory:'Curitiba prioritária'};
 const a=api.complementWithGoogleBooks(base,plain,isbn),b=api.complementWithGoogleBooks(base,classified,isbn);
 const {categories,mainCategory,...reference}=b.googleBooksReference;assert.deepEqual({...b,googleBooksReference:reference},a);
 assert.equal(b.publisher,base.publisher);assert.deepEqual(b.categories,base.categories);
});
