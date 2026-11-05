import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const output = await build({ stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
  export * from './shared/googleBooks'; export * from './server/googleBooksFunction';
  export * from './src/services/googleBooks'; export {createRegistrationDraft} from './src/utils/draft';
  export {createRegistrationSnapshot} from './src/utils/registrationSnapshot';
` }, bundle: true, write: false, platform: 'node', format: 'esm' });
const api = await import('data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64'));
const isbn = '9788550303628', isbn10 = '8550303623', independent = '9798276439839';
// Entirely synthetic metadata; these fixtures do not claim Google coverage of real ISBNs.
const volume = (changes = {}, ids = [{type:'ISBN_13', identifier:isbn}]) => ({kind:'books#volume', id:'fixture_id', volumeInfo:{
  title:'Título sintético', subtitle:'Subtítulo sintético', authors:['Autor sintético'], publisher:'Editora sintética',
  publishedDate:'2020-01-31', language:'pt-BR', pageCount:288, printType:'BOOK',
  industryIdentifiers:ids, infoLink:'http://books.google.com/books?id=fixture_id&source=gbs_api',
  previewLink:'https://books.google.com.br/books?id=fixture_id&printsec=frontcover',
  imageLinks:{thumbnail:'http://books.google.com/books/content?id=fixture_id&jscmd=viewapi&img=1'},
  description:'Descrição sintética cujo uso comercial não foi autorizado.', ...changes }});
const payload = (...items) => ({kind:'books#volumes',totalItems:items.length,items});
const mapped = (changes, ids, query=isbn) => api.mapGoogleBooksResponse(payload(volume(changes,ids)), query);
const request = value => new Request('https://isbn-preview.invalid/api/google-books?isbn='+value);

test('exact ISBN-13, equivalent ISBN-10 and 979 select only matching editions', () => {
  for(const query of [isbn,isbn10]) {
    const result = mapped({},[{type:'ISBN_10',identifier:isbn10},{type:'ISBN_13',identifier:isbn}],query);
    assert.equal(result.status,'success'); assert.equal(result.book.isbn13,isbn); assert.equal(result.book.isbn10,isbn10);
    assert.equal(result.book.publisher,'Editora sintética'); assert.equal(result.book.language,'Português');
    assert.equal(result.book.year,2020); assert.equal(result.book.publishedDate,'2020-01-31');
  }
  const own = mapped({},[{type:'ISBN_13',identifier:independent}],independent);
  assert.equal(own.status,'success'); assert.equal(own.book.isbn10,undefined);
  assert.equal(mapped({},undefined,'9798276439830').status,'invalid_query');
});
test('no results, similar title, invalid identifier and contradictory edition identifiers never match', () => {
  assert.equal(api.mapGoogleBooksResponse({kind:'books#volumes',totalItems:0},isbn).status,'not_found');
  for(const ids of [[],[{type:'OTHER',identifier:isbn}],[{type:'ISBN_13',identifier:independent}],
    [{type:'ISBN_13',identifier:isbn},{type:'ISBN_10',identifier:'8535914846'}],
    [{type:'ISBN_13',identifier:isbn},{type:'ISBN_10',identifier:'0000000000'}]]) assert.equal(mapped({},ids).status,'not_found');
  assert.equal(api.mapGoogleBooksResponse({},isbn).status,'unavailable');
  assert.equal(api.mapGoogleBooksResponse({kind:'books#volumes',totalItems:2},isbn).status,'unavailable');
});
test('one matching record is selected without importing facts from other records', () => {
  const result=api.mapGoogleBooksResponse(payload(volume({publisher:'Wrong'},[{type:'ISBN_13',identifier:independent}]),
    volume({publisher:undefined,pageCount:undefined}),volume({publisher:'Another record'})),isbn);
  assert.equal(result.book.publisher,undefined); assert.equal(result.book.pageCount,undefined);
});
test('missing cover/publisher/pages and invalid dates/numbers remain absent; BOOK is not a binding', () => {
  const {book}=mapped({imageLinks:undefined,publisher:null,pageCount:0,publishedDate:'2020-02-31'});
  for(const field of ['publisher','pageCount','publishedDate','year','edition','format','weight','width','height','depth','synopsis','description','coverUrl']) assert.equal(book[field],undefined);
  assert.equal(book.googleBooksReference.coverUrl,undefined);
  assert.equal(book.googleBooksReference.descriptionAvailable,true);
  assert.equal(book.googleBooksReference.contentReviewRequired,true);
  assert.match(book.bibliographicWarnings[0],/direitos de uso comercial/);
});
test('only returned product-specific links survive; descriptions and cover remain references', () => {
  const book=mapped().book;
  assert.equal(book.sourceLinks.length,2); assert.equal(book.sourceLinks[0].url.startsWith('https:'),true);
  assert.equal(book.synopsis,undefined); assert.equal(book.description,undefined); assert.equal(book.coverUrl,undefined);
  assert.equal(book.googleBooksReference.coverUrl,'https://books.google.com/books/content?id=fixture_id&jscmd=viewapi&img=1');
  for(const link of ['javascript:alert(1)','https://books.google.com/books','https://books.google.com/books?id=other',
    'https://books.google.com.attacker.invalid/books?id=fixture_id','https://user:pass@books.google.com/books?id=fixture_id']) {
    const candidate=mapped({infoLink:link,previewLink:link,imageLinks:{thumbnail:link}}).book;
    assert.equal(candidate.sourceLinks,undefined); assert.equal(candidate.googleBooksReference.coverUrl,undefined);
  }
});
test('fill only omissions, preserve provenance/manual edits, exact identity, dates and Curitiba gallery', () => {
  const incoming=mapped().book;
  const base={id:'curitiba',title:'Título escolhido',isbn13:isbn,publisher:'Editora Curitiba',year:2019,
    coverUrl:'https://images.invalid/cover.jpg',additionalImages:['https://images.invalid/back.jpg','https://images.invalid/inside.jpg'],
    synopsis:'Sinopse existente',edition:'Edição manual',provenance:{title:'manual',publisher:'Curitiba',edition:'manual'}};
  const before=structuredClone(base), merged=api.complementWithGoogleBooks(base,incoming,isbn);
  for(const field of Object.keys(base)) if(field!=='provenance') assert.deepEqual(merged[field],base[field]);
  assert.deepEqual(base,before); assert.equal(merged.pageCount,288); assert.equal(merged.provenance.pageCount,'Google Books');
  assert.equal(merged.publishedDate,undefined); assert.equal(merged.provenance.title,'manual');
  assert.equal(api.complementWithGoogleBooks(base,incoming,independent),base);
  assert.equal(api.complementWithGoogleBooks(base,null,isbn),base);
  const again=api.complementWithGoogleBooks(merged,incoming,isbn); assert.equal(again.sourceLinks.length,2);
  assert.equal(api.complementWithGoogleBooks({...base,publisher:'',provenance:{publisher:'manual'}},incoming,isbn).publisher,'');
});
test('new and used registration receive facts/links without commercial defaults or restricted content', () => {
  const merged=api.complementWithGoogleBooks(null,mapped().book,isbn);
  for(const condition of ['novo','usado']) {
    const draft=api.createRegistrationDraft(merged,condition);
    assert.equal(draft.publisher,'Editora sintética'); assert.equal(draft.pageCount,288); assert.equal(draft.year,'2020');
    assert.equal(draft.isbn13,isbn); assert.equal(draft.price,''); assert.equal(draft.quantity,1);
    assert.equal(draft.synopsis,''); assert.equal(draft.mainImageUrl,undefined); assert.equal(draft.sourceLinks.length,2);
    assert.equal(draft.childCode,condition==='novo'?isbn:'');
    assert.equal(api.createRegistrationSnapshot(draft,new Date().toISOString()).fields.sourceLinks,undefined);
  }
});
test('server uses one official GET, secret remains server-side, canonical query and bounded response', async () => {
  const calls=[]; const handler=api.createGoogleBooksFunction({env:{GOOGLE_BOOKS_API_KEY:'synthetic-test-key'},fetcher:async(url,init)=>{
    calls.push({url,init}); return Response.json(payload(volume())); }});
  const result=await(await handler(request(isbn10))).json(); assert.equal(result.status,'success'); assert.equal(calls.length,1);
  const {url,init}=calls[0]; assert.equal(url.origin,'https://www.googleapis.com'); assert.equal(url.searchParams.get('q'),'isbn:'+isbn);
  assert.equal(url.searchParams.get('key'),'synthetic-test-key'); assert.equal(init.credentials,'omit'); assert.equal(init.redirect,'error');
  assert.doesNotMatch(JSON.stringify(result),/synthetic-test-key|Descrição sintética/);
});
test('server does not query without key, on invalid ISBN, wrong origin or unsupported method', async () => {
  let calls=0; const fetcher=async()=>{calls++;throw Error('No request permitted');};
  assert.equal((await(await api.createGoogleBooksFunction({env:{},fetcher})(request(isbn))).json()).diagnostic.code,'not_configured');
  const handler=api.createGoogleBooksFunction({env:{GOOGLE_BOOKS_API_KEY:'synthetic'},fetcher});
  assert.equal((await handler(request('invalid'))).status,422);
  assert.equal((await handler(new Request(request(isbn),{method:'POST'}))).status,405);
  assert.equal((await handler(new Request(request(isbn),{headers:{origin:'https://other.invalid'}}))).status,403);
  assert.equal(calls,0);
});
for(const status of [400,403,404,429,500,503])test(`upstream HTTP ${status} is unavailable, never not_found and never retried`,async()=>{
  let calls=0;const handler=api.createGoogleBooksFunction({env:{GOOGLE_BOOKS_API_KEY:'synthetic'},fetcher:async()=>{calls++;return new Response('private error',{status});}});
  const result=await(await handler(request(isbn))).json(); assert.equal(result.status,'unavailable');assert.equal(result.diagnostic.httpStatus,status);assert.equal(calls,1);
  assert.doesNotMatch(JSON.stringify(result),/private error/);
});
test('timeout, malformed JSON, non-JSON and oversized responses preserve failure distinction',async()=>{
  const fetchers=[async(_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('deadline')),{once:true})),
    async()=>new Response('{',{headers:{'content-type':'application/json'}}),async()=>new Response('<html>invalid</html>'),
    async()=>new Response('x'.repeat(1024*1024+1),{headers:{'content-type':'application/json'}})];
  for(const fetcher of fetchers){const handler=api.createGoogleBooksFunction({env:{GOOGLE_BOOKS_API_KEY:'synthetic'},timeoutMs:5,fetcher});
    const result=await(await handler(request(isbn))).json();assert.equal(result.status,'unavailable');assert.equal(result.book,null);}
});
test('client discards mismatched and aborted responses and keeps one request',async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json(mapped());});
  assert.equal((await api.searchGoogleBooks(isbn10)).status,'success');assert.equal(calls,1);
  assert.equal((await api.searchGoogleBooks(independent)).status,'unavailable');
  const controller=new AbortController();controller.abort();assert.equal((await api.searchGoogleBooks(isbn,controller.signal)).status,'unavailable');
  assert.equal((await api.searchGoogleBooks('invalid')).status,'invalid_query');assert.equal(calls,3);
});
