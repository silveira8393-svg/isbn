import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const built=await build({entryPoints:['server/magazordValidationDiagnostics.ts'],bundle:true,write:false,platform:'node',format:'esm',target:'node24'});
const {validationDiagnosticCodes:codes,readValidationDiagnosticCodes:read}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const unavailable=['remote_validation_detail_unavailable'];
const secret='token-secret private-person@example.invalid private-description';

test('validation diagnostic extracts only explicit allowlisted fields and exact machine rules',()=>{
  assert.deepEqual(codes({errors:[{field:'derivacoes',rule:'minItems',message:secret,value:secret},
    {path:['produtoLoja',0,'loja'],code:'required',description:secret},{property:'marca',code:'not_found'},
    {field:secret,code:'required'},{field:'ncm',code:secret}]}),[
    'remote_validation_derivacoes_min_items','remote_validation_marca_not_found','remote_validation_ncm_unspecified','remote_validation_produto_loja_loja_required']);
});

test('validation diagnostic handles error maps without interpreting message text or echoing values',()=>{
  assert.deepEqual(codes({data:{errors:{marca:secret,categorias:[secret],origemFiscal:{code:'invalid',message:secret},
    ncm:{rule:'format',value:secret},produtoLoja:{code:'type'},'produtoLoja.0.loja':secret,'derivacoes[0]':secret}}}),[
    'remote_validation_categorias_unspecified','remote_validation_derivacoes_unspecified','remote_validation_marca_unspecified',
    'remote_validation_ncm_format','remote_validation_origem_fiscal_invalid','remote_validation_produto_loja_loja_unspecified','remote_validation_produto_loja_type']);
});

test('validation diagnostic never infers a field from prose, echoed payloads or unsupported error shapes',()=>{
  for(const value of [null,[],secret,{message:'derivacoes marca ncm '+secret},{data:{marca:1,derivacoes:[]}},
    {errors:['derivacoes required '+secret]},{errors:[{message:'marca obrigatoria',value:secret}]},
    {errors:{['ncm '+secret]:'invalid',__proto__:{required:true}}},{error:{message:secret}}])assert.deepEqual(codes(value),unavailable);
  assert.deepEqual(codes(JSON.parse('{"errors":{"__proto__":"private","constructor":"private"}}')),unavailable);
});

test('validation diagnostic canonicalizes field paths without logging indexes or arbitrary suffixes',()=>{
  assert.deepEqual(codes({errors:[{field:'produtoLoja[123].loja',rule:'required'},{field:'produtoLoja.4.loja',rule:'required'},
    {field:'derivacoes[0].valor',rule:'required'},{field:'produtoLoja.0.descricao',rule:'required'},
    {field:'marca.secret',rule:'invalid'},{field:'marca',rule:'REQUIRED '+secret}]}),[
    'remote_validation_derivacoes_required','remote_validation_marca_unspecified','remote_validation_produto_loja_loja_required']);
});

test('validation diagnostic deduplicates and bounds output from untrusted structures',()=>{
  const errors=Array.from({length:1000},()=>({field:'marca',code:'required',message:secret}));
  assert.deepEqual(codes({errors}),['remote_validation_marca_required']);
  const result=codes({errors:Array.from({length:100},(_,n)=>({field:n<32?secret:'ncm',rule:'required'}))});
  assert.deepEqual(result,unavailable);
  assert.ok(!JSON.stringify(result).includes(secret));
});

test('validation body reader is bounded and ignores HTML, malformed JSON, oversized or unreadable bodies',async()=>{
  for(const response of [new Response(secret),new Response('{'+secret,{headers:{'content-type':'application/json'}}),
    new Response('x'.repeat(16*1024+1),{headers:{'content-type':'application/json'}}),
    new Response(new ReadableStream({start(c){c.error(new Error(secret));}}),{headers:{'content-type':'application/json'}})])
    assert.deepEqual(await read(response,new AbortController().signal),unavailable);
  assert.deepEqual(await read(Response.json({errors:{marca:{code:'required',value:secret}}}),new AbortController().signal),['remote_validation_marca_required']);
});

test('validation body reader caps diagnostic wait and accepts an already expired request',async t=>{
  const original=AbortSignal.timeout.bind(AbortSignal),requested=[];
  t.mock.method(AbortSignal,'timeout',ms=>{requested.push(ms);return original(5);});
  const controller=new AbortController();controller.abort();
  assert.deepEqual(await read(Response.json({errors:{marca:'invalid'}}),controller.signal),unavailable);
  let cancelled=false;
  assert.deepEqual(await read(new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'content-type':'application/json'}}),new AbortController().signal),unavailable);
  assert.equal(cancelled,true);assert.deepEqual(requested,[1000,1000]);
});
