import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const output=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
 export * from './src/utils/bookSourceLinks'; export * from './src/utils/researchSources';
 export {createRegistrationDraft} from './src/utils/draft'; export {createRegistrationSnapshot} from './src/utils/registrationSnapshot';
 export {default as Links} from './src/components/BookSourceLinks'; export {default as Panel} from './src/components/ResearchSourcesPanel';
 export {default as Card} from './src/components/BookDetailsCard';
 export {default as Images} from './src/components/magazord/ImagesSection';
 export {renderToStaticMarkup} from 'react-dom/server';export {createElement} from 'react';
`},bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',plugins:[{name:'offline',setup(b){
 b.onResolve({filter:/lib\/supabase$/},()=>({path:'database',namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const supabaseUrl="https://database.invalid";export const supabase={};'}));
}}]});
const mod={exports:{}};new Function('require','module','exports',output.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);const api=mod.exports;
const isbn='9788550303628',other='9798276439839';
const google='https://books.google.com/books?id=moEq0gEACAAJ&source=gbs_api';
const amazon={asin:'B0G4CS2PMG',isbn:other,marketplaceId:'A2Q3Y263D00KWC'};
const curitiba={source:'curitiba',kind:'info',isbn,url:'https://www.livrariascuritiba.com.br/produto-fornecido-434083/p'};
const render=(Component,props)=>api.renderToStaticMarkup(api.createElement(Component,props));
test('request outcome distinguishes absence, failures, skipped sources and exact identity',()=>{
 const book={isbn13:isbn};assert.equal(api.researchOutcome(book,isbn,'success',200),'found');
 assert.equal(api.researchOutcome({isbn10:'8550303623'},isbn,'success',200),'found');
 assert.equal(api.researchOutcome({isbn13:other},isbn,'success',200),'not_found');
 for(const status of [403,429,500,503,'TIMEOUT'])assert.equal(api.researchOutcome(null,isbn,undefined,status),'unavailable');
 assert.equal(api.researchOutcome(null,isbn,'unavailable',404),'unavailable');
 assert.equal(api.researchOutcome(null,isbn,undefined,404),'not_found');
 assert.equal(api.researchOutcome(null,isbn,'not_found',200),'not_found');
 assert.equal(api.researchOutcome(null,isbn,'ambiguous',200),'review_required');
 assert.equal(api.researchOutcome(null,isbn,'ambiguous',503),'unavailable');
 assert.equal(api.researchOutcome(null,isbn,'skipped'),'not_consulted');
 assert.equal(api.researchOutcome(null,isbn,'unavailable',undefined,'not_configured'),'not_consulted');
 const markup=render(api.Panel,{states:{brasil_api:'found',curitiba:'not_found',amazon:'not_consulted',google_books:'unavailable'}});
 for(const label of ['BrasilAPI','Distribuidora Curitiba','Amazon SP-API','Google Books','Encontrado','Não encontrado','Não consultado','Indisponível'])assert.ok(markup.includes(label));
 assert.doesNotMatch(markup,/\bms\b|gráfico/i);
});
test('Amazon product URL requires a validated ASIN/ISBN/marketplace reference',()=>{
 const book={isbn13:other,amazonCatalogReference:amazon};
 assert.deepEqual(api.bookSourceLinks(book),[{source:'amazon',kind:'info',isbn:other,url:'https://www.amazon.com.br/dp/B0G4CS2PMG'}]);
 for(const change of [{asin:'invalid'},{isbn},{marketplaceId:'other'}])assert.deepEqual(api.bookSourceLinks({...book,amazonCatalogReference:{...amazon,...change}}),[]);
 assert.deepEqual(api.bookSourceLinks({isbn13:isbn,amazonCatalogReference:amazon}),[]);
});

test('source cards explain skipped SP-API without counting it as queried or relabeling failures',()=>{
 const states={brasil_api:'found',curitiba:'found',amazon:'not_consulted',google_books:'not_found'};
 const skipped=render(api.Panel,{states});
 assert.match(skipped,/Pesquisa concluída/);assert.match(skipped,/Fontes consultadas: 3/);
 assert.match(skipped,/Requer usuário autenticado, ativo e vinculado à loja/);
 assert.equal((skipped.match(/<svg /g)||[]).length,4);
 for(const [state,label] of [['found','Encontrado'],['not_found','Não encontrado'],['unavailable','Indisponível'],['review_required','Revisão necessária']]){
  const markup=render(api.Panel,{states:{...states,amazon:state}});
  assert.match(markup,/Fontes consultadas: 4/);
  assert.ok(markup.includes(label));assert.doesNotMatch(markup,/Requer usuário autenticado/);
 }
});
test('Curitiba accepts only explicitly returned product URLs tied to verified identifiers; never manufactures a slug',()=>{
 assert.deepEqual(api.curitibaProductLinks({urlProduto:curitiba.url},[isbn,'8550303623'],isbn),[curitiba]);
 assert.deepEqual(api.curitibaProductLinks({dsProduto:'Gravity Falls',cdProduto:'LV434083'},[isbn],isbn),[]);
 assert.deepEqual(api.curitibaProductLinks({urlProduto:curitiba.url},[],isbn),[]);
 assert.deepEqual(api.curitibaProductLinks({urlProduto:curitiba.url},[other],isbn),[]);
});
test('generic, credential-bearing, wrong-host, HTTP and mismatched links remain hidden',()=>{
 for(const link of [
  {...curitiba,url:'https://www.livrariascuritiba.com.br/'},{...curitiba,url:'https://www.livrariascuritiba.com.br/busca/p'},
  {...curitiba,url:'http://www.livrariascuritiba.com.br/produto/p'},{...curitiba,isbn:other},
  {source:'amazon',kind:'info',isbn,url:'https://www.amazon.com.br/s?k='+isbn},
  {source:'amazon',kind:'info',isbn,url:'https://www.amazon.com.br.attacker.invalid/dp/B0G4CS2PMG'},
  {source:'google_books',kind:'info',isbn,url:'https://books.google.com/books?q='+isbn},
  {source:'google_books',kind:'info',isbn,url:google+'&key=private'},
  {source:'google_books',kind:'info',isbn,url:google+'&access_token=private'},
  {...curitiba,url:'https://user:pass@www.livrariascuritiba.com.br/produto/p'},
  {...curitiba,url:'javascript:alert(1)'},
 ])assert.deepEqual(api.bookSourceLinks({isbn13:isbn,sourceLinks:[link]}),[]);
 assert.equal(api.validSourceLink({...curitiba,isbn:'bad'},'bad'),false);
 assert.equal(render(api.Links,{book:{isbn13:isbn}}),'');
});
test('same validated links render in Consulta and NOVO/USADO image management, persist through manual edits and stay out of export',()=>{
 const source={id:'selected',title:'Gravity Falls',isbn13:isbn,sourceLinks:[curitiba],
  googleBooksReference:{volumeId:'moEq0gEACAAJ',isbn,infoLink:google,descriptionAvailable:true,contentReviewRequired:true},
  coverUrl:'https://images.invalid/cover.jpg',additionalImages:['https://images.invalid/inside.jpg'],year:2020,pageCount:288};
 const book=api.attachBookSourceLinks(source,isbn,[source]);const before=structuredClone(book);
 const consulta=render(api.Card,{book});assert.match(consulta,/Fontes externas da obra/);
 for(const condition of ['novo','usado']){
  const draft=api.createRegistrationDraft(book,condition);const edited={...draft,title:'Título manual',price:'15,00'};
  const html=render(api.Images,{draft:edited,onChange(){}});
  for(const link of api.bookSourceLinks(book)){assert.ok(consulta.includes(link.url.replaceAll('&','&amp;')));assert.ok(html.includes(link.url.replaceAll('&','&amp;')));}
  assert.match(html,/target="_blank"/);assert.match(html,/noopener noreferrer/);
  assert.deepEqual(draft.sourceLinks,book.sourceLinks);assert.equal(edited.title,'Título manual');
  assert.equal(draft.mainImageUrl,book.coverUrl);assert.deepEqual(draft.additionalImageUrls,book.additionalImages);
  assert.equal(api.createRegistrationSnapshot(edited,new Date().toISOString()).fields.sourceLinks,undefined);
 }
 assert.deepEqual(book,before);
 assert.equal(api.attachBookSourceLinks(book,isbn,[{isbn13:other,sourceLinks:[{...curitiba,isbn:other}]}]).sourceLinks.length,2);
});
test('Google link must match its selected volume and duplicate info/preview links render one source',()=>{
 const book={isbn13:isbn,googleBooksReference:{isbn,volumeId:'moEq0gEACAAJ',infoLink:google,previewLink:google,descriptionAvailable:false,contentReviewRequired:true},
 sourceLinks:[{source:'google_books',kind:'info',isbn,url:'https://books.google.com/books?id=other'}]};
 const links=api.bookSourceLinks(book);assert.equal(links.length,2);assert.ok(links.every(link=>link.url===google));
 const html=render(api.Links,{book});assert.equal((html.match(/target="_blank"/g)||[]).length,1);
});

test('ambiguous returned Amazon ASINs render identified optional links and candidate cover without selecting a product',()=>{
 const candidates=[{asin:'TESTBOOK01',isbn,marketplaceId:'A2Q3Y263D00KWC',title:'Primeira edição',images:[{variant:'MAIN',link:'https://m.media-amazon.com/images/I/Test._SL100_.jpg',width:100,height:150},{variant:'MAIN',link:'https://m.media-amazon.com/images/I/Test._SL1000_.jpg',width:1000,height:1500}]},{asin:'TESTBOOK02',isbn,marketplaceId:'A2Q3Y263D00KWC',title:'Outra edição'},{asin:'invalid/asin',isbn,marketplaceId:'A2Q3Y263D00KWC'}];
 const book={id:'priority',title:'Confirmado',isbn13:isbn,amazonReviewRequired:true,amazonCandidates:candidates};
 const before=structuredClone(book);const links=api.bookSourceLinks(book);
 assert.equal(links.length,2);assert.ok(links.every(link=>link.reviewRequired));
 const html=render(api.Links,{book});
 for(const asin of ['TESTBOOK01','TESTBOOK02'])assert.ok(html.includes('https://www.amazon.com.br/dp/'+asin));
 assert.match(html,/candidato TESTBOOK01/);assert.match(html,/Capa candidata/);assert.match(html,/_SL1000_/);assert.doesNotMatch(html,/_SL100_/);
 assert.equal(book.amazonCatalogReference,undefined);assert.equal(book.coverUrl,undefined);assert.deepEqual(book,before);
 for(const condition of ['novo','usado']) {
  const draft=api.createRegistrationDraft(book,condition);const formLinks=render(api.Links,{book:draft});
  assert.match(formLinks,/candidato TESTBOOK01/);assert.match(formLinks,/candidato TESTBOOK02/);assert.equal(draft.mainImageUrl,undefined);
  assert.equal(api.createRegistrationSnapshot(draft,new Date().toISOString()).fields.amazonCandidates,undefined);
 }
});
test('a confirmed returned reference presents its sole product link rather than ambiguous candidate links',()=>{
 const book={isbn13:other,amazonCatalogReference:amazon,amazonReviewRequired:false,amazonCandidates:[{asin:'TESTBOOK02',isbn:other,marketplaceId:'A2Q3Y263D00KWC'}]};
 const links=api.bookSourceLinks(book);assert.equal(links.length,1);assert.equal(links[0].url,'https://www.amazon.com.br/dp/'+amazon.asin);
 assert.doesNotMatch(render(api.Links,{book}),/candidato/);
});
