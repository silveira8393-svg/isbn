import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const built=await build({entryPoints:['shared/magazordPrice.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {priceSnapshot:read}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
// Synthetic contract probes only. None of these objects is a tenant API capture.
const child='PRICE-CONTRACT-C',table=1;
const record=(changes={})=>({produto:child,tabelaPreco:table,anuncio:null,precoAntigo:null,precoVenda:30,...changes});
test('V1 price pagination is distinct from V2 table envelopes; incomplete totals never prove absence',()=>{
  assert.deepEqual(read({total:0,data:[]},child,table),{kind:'absent'});
  for(const body of [{status:'success',data:{items:[],page:1,total:0}},{data:[]},{total:'0',data:[]},{total:1,data:[]},
    {total:2,data:[record()]},{sucesso:false,total:0,data:[]}])assert.throws(()=>read(body,child,table),{code:'ambiguous_price_response'});
});
test('null/zero sale and old prices remain blocked rather than inferred as absent',()=>{
  for(const changes of [{precoVenda:null},{precoVenda:0},{precoAntigo:0},{precoAntigo:40},{precoAntigo:'0'},{precoVenda:'30.00'}])
    assert.throws(()=>read({total:1,data:[record(changes)]},child,table),{code:'existing_price_review_required'});
});
test('undocumented no-ad sentinels, wrong identifiers and multiple rows do not relax price safety',()=>{
  assert.deepEqual(read({total:1,data:[record()]},child,table),{kind:'present',cents:3000});
  for(const changes of [{anuncio:0},{anuncio:1},{anuncio:undefined},{produto:'OTHER'},{tabelaPreco:'1'}])
    assert.throws(()=>read({total:1,data:[record(changes)]},child,table),{code:'ambiguous_price_response'});
  assert.throws(()=>read({total:2,data:[record(),record()]},child,table),{code:'existing_price_review_required'});
});
