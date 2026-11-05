import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const fixture = name => readFile(new URL(`./fixtures/curitiba/${name}`, import.meta.url), 'utf8');
const detail = JSON.parse(await fixture('gravity-falls-detail.json'));
const tarot = JSON.parse(await fixture('tarot-detail.json'));
const html = await fixture('gravity-falls-index.html');
const images = [...html.matchAll(/href="(lv434083_[1-5]\.jpg)"/g)].map(m => new URL(m[1], detail.urlFoto).href);
assert.equal(images.length, 5);
const user = { id: '11111111-1111-4111-8111-111111111111', storeId: '22222222-2222-4222-8222-222222222222', role: 'developer', active: true };
const output = await build({ stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
  export * from './src/services/distribuidoraCuritiba';
  export {complementWithAmazon,complementAmazonImages} from './src/services/amazonOfficial';
  export {createRegistrationDraft} from './src/utils/draft';
  export {renderToStaticMarkup} from 'react-dom/server';
  export {createElement} from 'react';
  export {parseHtml} from './experimentos/amazon/html_local';
  export {default as Form} from './src/components/magazord/ProductRegistrationForm';
  export {default as Card} from './src/components/BookDetailsCard';
` }, bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', define: { 'import.meta.env': '{}' },
  plugins: [{ name: 'deny-database', setup(b) {
    b.onResolve({ filter: /lib\/supabase(?:\.js)?$/ }, () => ({ path: 'database', namespace: 'mock' }));
    b.onResolve({ filter: /contexts\/UserContext$/ }, () => ({ path: 'user', namespace: 'mock' }));
    b.onLoad({ filter: /^user$/, namespace: 'mock' }, () => ({ contents: `export const useUser=()=>({currentUser:${JSON.stringify(user)}});` }));
    b.onLoad({ filter: /^database$/, namespace: 'mock' }, () => ({ contents: `export const supabaseUrl='https://database.invalid';export const supabase={auth:{getSession:async()=>({data:{session:{user:{id:'${user.id}'},access_token:'synthetic-only'}}})},from:()=>{throw Error('Persistence forbidden')}};` }));
  } }] });
const mod = { exports: {} };
new Function('module','exports','require',output.outputFiles[0].text)(mod,mod.exports,createRequire(import.meta.url));
const api = mod.exports;
const indexResponse = source => new Response(source, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });

function mockSource(t, options = {}) {
  const product = options.detail || detail, calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({url:String(url), init});
    assert.ok(calls.length <= 4, 'No retries, probes or extra provider calls');
    if (calls.length <= 3) {
      assert.equal(init.method, 'POST');
      return Response.json(calls.length === 1 ? { cdSistema: 50 } : calls.length === 2 ? (options.selected || product) : product);
    }
    assert.equal(String(url), options.expectedIndex || product.urlFoto);
    assert.equal(init.method, 'GET'); assert.equal(init.mode, 'cors'); assert.equal(init.credentials, 'omit');
    assert.equal(init.redirect, 'error'); assert.equal(init.referrerPolicy, 'no-referrer');
    if (options.index instanceof Error) throw options.index;
    return typeof options.index === 'function' ? options.index(url, init) : options.index || indexResponse(html);
  });
  return { calls, search: () => api.searchBookByIsbnDistribuidoraCuritiba(product.nuCdBarras) };
}

test('real detail + actual index yield one thumbnail-selected cover and four distinct additional URLs, in one GET', async t => {
  const source = mockSource(t);
  const result = await source.search();
  assert.equal(source.calls.length, 4); assert.equal(result.diagnostic.state, 'success');
  assert.deepEqual(result.diagnostic.gallery, {state:'loaded',images:5,status:200});
  assert.equal(result.book.coverUrl, images[0]); assert.equal(result.book.thumbnailUrl, images[0]);
  assert.deepEqual(result.book.additionalImages, images.slice(1));
});

test('cover wins over index order; partial explicit URLs, duplicate links and direct references are united', async t => {
  const changed = {...detail, imagens:[{urlImagem:images[2]}]};
  const source = mockSource(t, { detail:changed, index:indexResponse(`<a href="${images[4]}">last</a><img src="${images[0]}"><a href="${images[2]}">duplicate</a>`) });
  const result = await source.search();
  assert.equal(result.book.coverUrl, images[0]);
  assert.deepEqual(result.book.additionalImages, [images[2], images[4]]);
});

for (const status of [403,404,429,503]) test(`index HTTP ${status} preserves bibliographic fields and direct images without retry`, async t => {
  const source = mockSource(t, { index:new Response('Unavailable', {status}) });
  const result = await source.search();
  assert.equal(source.calls.length, 4); assert.equal(result.book.title, detail.dsProduto);
  assert.equal(result.book.coverUrl, images[0]); assert.deepEqual(result.book.additionalImages, []);
  assert.deepEqual(result.diagnostic.gallery,{state:'unavailable',images:0,status});
});

test('browser CORS/network rejection is nonfatal and never switches to a bypass transport', async t => {
  const source = mockSource(t, {index:new TypeError('Failed to fetch')});
  const result = await source.search();
  assert.equal(source.calls.length,4); assert.equal(result.book.coverUrl,images[0]);
  assert.equal(result.diagnostic.gallery.status,'NETWORK_OR_CORS');
});

test('empty gallery preserves cover and reports empty without manufacturing filenames', async t => {
  const source=mockSource(t,{index:indexResponse('<html><a href="../">Parent</a></html>')});
  const result=await source.search();assert.deepEqual(result.book.additionalImages,[]);
  assert.equal(result.diagnostic.gallery.state,'empty');assert.equal(source.calls.length,4);
});

test('index ignores comments/scripts, other hosts/products, traversal, credentials, queries, non-images and encoded paths', async t => {
  const rejected = [
    '../lv999999/lv999999_2.jpg','/icons/image2.gif','https://evil.invalid/lv434083_2.jpg',
    detail.urlFoto.replace('https://','https://user:pass@')+'lv434083_2.jpg',
    'lv434083_2.jpg?token=x','lv434083_2.jpg#fragment','lv434083_2.svg','lv434083_2.html',
    'lv488040_2.jpg','%6cv434083_2.jpg','data:image/png;base64,AAAA','javascript:alert(1)',
    'child/lv434083_2.jpg','https://conteudo.livrariascuritiba.com.br.evil.invalid/lv434083_2.jpg',
  ];
  const source=mockSource(t,{index:indexResponse(rejected.map(url=>`<a href="${url}">bad</a>`).join('')
    +`<!-- <img src="${images[1]}"> --><script>const a='<a href="${images[2]}">';</script>`
    +`<a href="${images[0]}">cover</a><img src='lv434083_4.jpg'><a href=lv434083_4.jpg>duplicate</a>`) });
  const result=await source.search();assert.deepEqual(result.book.additionalImages,[images[3]]);
});

for(const mutation of [
  {urlFoto:'http://conteudo.livrariascuritiba.com.br/images/lv/lvndd/lv434083/'},
  {urlFoto:detail.urlFoto+'?q=1'}, {urlFoto:detail.urlFoto+'#x'},
  {urlFoto:detail.urlFoto.replace('lv434083/','lv488040/')},
  {urlFoto:detail.urlFoto.replace('.com.br/','.com.br.evil.invalid/')},
  {urlFoto:detail.urlFoto.replace('https://','https://user:pass@')},
  {urlFoto:detail.urlFoto.replace('/lvndd/','/other/')}, {urlFoto:images[0]},
]) test(`untrusted or non-index directory is not requested: ${mutation.urlFoto}`,async t=>{
  const source=mockSource(t,{detail:{...detail,...mutation}});const result=await source.search();
  assert.equal(source.calls.length,3);assert.equal(result.diagnostic.gallery.state,'not_applicable');
  assert.ok(result.book.coverUrl);
});

test('detail and selected product must agree before any index request',async t=>{
  const source=mockSource(t,{selected:{...detail,cdProduto:'LV488040'}});
  const result=await source.search();assert.equal(source.calls.length,3);assert.equal(result.diagnostic.gallery.state,'not_applicable');
});

for(const headers of [{'Content-Type':'application/json'},{'Content-Type':'text/html','Content-Length':'65537'}])
  test(`invalid type or oversized Content-Length preserves direct data: ${JSON.stringify(headers)}`,async t=>{
    const source=mockSource(t,{index:new Response(html,{headers})});const result=await source.search();
    assert.equal(source.calls.length,4);assert.equal(result.book.coverUrl,images[0]);assert.equal(result.diagnostic.gallery.state,'unavailable');
  });

test('stream is bounded even without Content-Length and is cancelled after exceeding the byte limit',async t=>{
  let cancelled=false;
  const stream=new ReadableStream({pull(c){c.enqueue(new Uint8Array(65537));},cancel(){cancelled=true;}});
  const source=mockSource(t,{index:new Response(stream,{headers:{'Content-Type':'text/html'}})});
  const result=await source.search();assert.equal(result.diagnostic.gallery.status,'LIMIT');assert.equal(cancelled,true);
  assert.equal(result.book.coverUrl,images[0]);
});

test('redirect responses are not followed and final URL mismatches are rejected',async t=>{
  const response=indexResponse(html);Object.defineProperty(response,'url',{value:'https://evil.invalid/'});
  const source=mockSource(t,{index:response});const result=await source.search();
  assert.equal(result.diagnostic.gallery.status,'INVALID_RESPONSE');assert.deepEqual(result.book.additionalImages,[]);
});

test('index deadline aborts the one request and preserves the cover',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});let requested=false;
  const source=mockSource(t,{index:(_,init)=>new Promise((_,reject)=>{requested=true;init.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});})});
  const pending=source.search();while(!requested)await new Promise(resolve=>setImmediate(resolve));
  t.mock.timers.tick(4001);const result=await pending;
  assert.equal(source.calls.length,4);assert.equal(result.diagnostic.gallery.status,'TIMEOUT');assert.equal(result.book.coverUrl,images[0]);
});

test('bounded image count preserves document order without probing unlisted files',async t=>{
  // Authored excess entries, not a claim that these assets exist at the provider.
  const source=mockSource(t,{index:indexResponse(Array.from({length:60},(_,i)=>`<a href="lv434083_fixture${i}.jpg">test</a>`).join(''))});
  const result=await source.search();assert.equal(result.diagnostic.gallery.images,32);
  assert.equal(result.book.additionalImages.length,32);assert.equal(source.calls.length,4);
});

test('merge unions valid sources in order, preserves cover and source objects, and removes duplicates',()=>{
  const prior={id:'chosen',title:'Chosen',coverUrl:'https://fixtures.invalid/chosen.jpg',thumbnailUrl:'https://fixtures.invalid/chosen.jpg',
    additionalImages:['https://fixtures.invalid/prior.jpg',images[2],images[2],'not-an-image']};
  const incoming={coverUrl:images[0],thumbnailUrl:images[0],additionalImages:images.slice(1)};
  const before=[structuredClone(prior),structuredClone(incoming)];
  const merged=api.mergeBookWithDistribuidora(prior,incoming);
  assert.equal(merged.coverUrl,prior.coverUrl);assert.deepEqual(merged.additionalImages,[prior.additionalImages[0],images[2],images[0],images[1],images[3],images[4]]);
  assert.deepEqual([prior,incoming],before);
  const empty=api.mergeBookWithDistribuidora({id:'empty',title:'',coverUrl:'bad',thumbnailUrl:'bad'},incoming);
  assert.equal(empty.coverUrl,images[0]);assert.deepEqual(empty.additionalImages,images.slice(1));
});

test('Tarot real detail + unknown historical additional fixture retains two images through CORS failure and NOVO/USADO',async t=>{
  // The second URL is deliberately synthetic: no historical additional URL was preserved.
  const additional='https://fixtures.invalid/tarot/historical-additional.jpg';
  const prior={id:'tarot',title:tarot.dsProduto,isbn13:tarot.nuCdBarras,coverUrl:tarot.urlFotoMiniatura,additionalImages:[additional]};
  const source=mockSource(t,{detail:tarot,index:new TypeError('CORS denied')});
  const result=await source.search();const merged=api.mergeBookWithDistribuidora(prior,result.book);
  assert.equal(source.calls.length,4);assert.equal(merged.coverUrl,prior.coverUrl);assert.deepEqual(merged.additionalImages,[additional]);
  for(const condition of ['novo','usado']){const draft=api.createRegistrationDraft(merged,condition);
    assert.equal(draft.mainImageUrl,prior.coverUrl);assert.deepEqual(draft.additionalImageUrls,[additional]);}
});

test('Gravity Falls real fixture reaches actual Consulta and NOVO/USADO form images after Amazon consolidation',async t=>{
  const source=mockSource(t);const result=await source.search();
  const primary=api.mergeBookWithDistribuidora({id:'isbn',title:'',isbn13:detail.nuCdBarras},result.book);
  const merged=api.complementWithAmazon(primary,{id:'amazon',title:'',isbn13:detail.nuCdBarras,coverUrl:images[0],additionalImages:[images[1]]});
  assert.deepEqual([merged.coverUrl,...merged.additionalImages],images);
  // A failed Lab must preserve the complete provider gallery, without additional provider requests.
  t.mock.method(globalThis,'fetch',async(url)=>{assert.equal(url,'/api/amazon?acao=search');return Response.json({status:'interrompida',status_http:503});});
  const book=await api.complementAmazonImages(merged,detail.nuCdBarras,user);
  assert.deepEqual([book.coverUrl,...book.additionalImages],images);
  const card=api.renderToStaticMarkup(api.createElement(api.Card,{book}));
  const cardImages=[...api.parseHtml(card).root.walk()].filter(n=>n.tag==='img').map(n=>n.attrs.src);
  for(const image of images)assert.ok(cardImages.includes(image),'Consulta '+image);
  for(const condition of ['novo','usado']){
    const draft=api.createRegistrationDraft(book,condition);
    assert.equal(draft.mainImageUrl,images[0]);assert.deepEqual(draft.additionalImageUrls,images.slice(1));
    const markup=api.renderToStaticMarkup(api.createElement(api.Form,{draft,originalBook:book,onUpdateDraft(){},onBackToSearch(){},onSuccessRegistration(){},onProcessNextBook(){}}));
    const rendered=[...api.parseHtml(markup).root.walk()].filter(n=>n.tag==='img').map(n=>n.attrs.src);
    for(const image of images)assert.ok(rendered.includes(image),condition+' '+image);
  }
});
