import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mfaToken } from './helpers/mfa.mjs';

const output = await build({ stdin: { resolveDir: process.cwd(), contents: "export * from './server/magazordSeo';" },
  platform: 'node', format: 'esm', bundle: true, write: false });
const api = await import('data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64'));
const store = '22222222-2222-4222-8222-222222222222';
const uid = '11111111-1111-4111-8111-111111111111';
const env = { MAGAZORD_BASE_URL:'https://homologacaosilveiralab.painel.magazord.com.br/api',
  MAGAZORD_STORE_ID: store, MAGAZORD_API_USER:'fixture-token', MAGAZORD_API_PASSWORD:'fixture-secret',
  MAGAZORD_HOMOLOGATION_CHANNELS: JSON.stringify({ [store]:1 }),
  SUPABASE_URL:'https://auth.invalid', SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture' };
const req = (childCode='LVP019001', changes={}) => new Request('https://isbn.invalid/api/magazord/price?seo=1', {
  method:'POST', headers:{ 'content-type':'application/json', authorization:`Bearer ${mfaToken(uid)}`,
    'x-isbn-store-id': store }, body: JSON.stringify({ action:'lookup', childCode, ...changes }) });
const page = (items=[]) => Response.json({ status:'success',
  data:{ items, page:1, limit:100, total:items.length, has_more:false } });
function fixture(remote) {
  const calls=[];
  const handler = api.createMagazordSeoLookup({ env, fetcher:async(target,init) => {
    const url = new URL(target); calls.push({url, init});
    assert.equal(init.method,'GET');
    if(url.origin==='https://auth.invalid') {
      if(url.pathname==='/auth/v1/user') return Response.json({id:uid});
      if(url.pathname==='/rest/v1/profiles') return Response.json([{ id:uid,active:true }]);
      if(url.pathname==='/rest/v1/store_users') return Response.json([{user_id:uid,store_id:store,role:'operator',active:true}]);
      if(url.pathname==='/rest/v1/stores') return Response.json([{ id:store,active:true }]);
      assert.fail('Unexpected auth path');
    }
    assert.equal(url.origin,'https://homologacaosilveiralab.painel.magazord.com.br');
    assert.equal(url.pathname,'/api/v2/site/paginas');
    assert.equal(url.searchParams.get('codigoDerivacao'),'LVP019001');
    assert.equal(url.searchParams.get('id_loja'),'1');
    assert.equal(init.headers.Authorization,'Basic '+Buffer.from('fixture-token:fixture-secret').toString('base64'));
    return remote ?? page([{ id:25, id_loja:1, title:'Guerra Mundial Z', metaDescription:'' }]);
  }});
  return { handler,calls };
}
test('read-only page search finds exactly one candidate and NEVER mutates Magazord', async()=>{
  const f=fixture();const resp=await f.handler(req());
  assert.equal(resp.status,200);
  assert.deepEqual((await resp.json()).pages,[{id:25,title:'Guerra Mundial Z',metaDescription:''}]);
  const remote=f.calls.filter(x=>x.url.origin.includes('magazord.com.br'));
  assert.equal(remote.length,1); assert.equal(remote[0].init.method,'GET');
});
test('not found does not invent a page or write a new page',async()=>{
  const f=fixture(page());
  const body=await (await f.handler(req())).json();
  assert.equal(body.status,'not_found');assert.deepEqual(body.pages,[]);
});
test('ambiguous or mismatched pages cannot be treated as verified',async()=>{
  for(const response of [page([{id:10,id_loja:2,title:'Other store',metaDescription:''}]),
    page([{id:10,id_loja:1,title:'A',metaDescription:''},{id:10,id_loja:1,title:'B',metaDescription:''}])]){
    const f=fixture(response);
    const result=await f.handler(req());
    assert.equal(result.status,503);
  }
});
test('invalid requests and production configuration are blocked without remote calls',async()=>{
  const f=fixture();
  assert.equal((await f.handler(req('bad/../sku'))).status,400);
  assert.equal(f.calls.length,0);
  const production=api.createMagazordSeoLookup({env:{...env,MAGAZORD_BASE_URL:'https://livrariasul.painel.magazord.com.br/api'},fetcher:()=>assert.fail('No network')});
  assert.equal((await production(req())).status,403);
});
