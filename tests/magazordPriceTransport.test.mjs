import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const built=await build({entryPoints:['server/magazordPriceTransport.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {createPriceTransport}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const env={MAGAZORD_BASE_URL:'https://homologacaosilveiralab.painel.magazord.com.br/api',MAGAZORD_API_USER:'private-user',MAGAZORD_API_PASSWORD:'private-password'};
const path='/v1/listPreco?tabelaPreco=1&produto=private-product&ativo=0&limit=100&offset=0&token=private-query';

test('HTTP/content type rejection cancels the unread body and logs only safe metadata once',async()=>{
  for(const [status,header,contentType,reason] of [
    [401,'application/json; private=secret','application/json','http_error'],
    [404,'text/html; private=secret','text/html','http_error'],
    [200,'text/html; private=secret','text/html','unexpected_content_type'],
    [200,'application/private-secret','other','unexpected_content_type'],
    [200,null,'missing','unexpected_content_type'],
  ]){
    let calls=0,reads=0,cancels=0;const logs=[];
    const transport=createPriceTransport(env,async(target,init)=>{
      calls++;assert.equal(init.method,'GET');assert.equal(init.redirect,'error');
      return new Response(new ReadableStream({pull(){reads++;},cancel(){cancels++;}},{highWaterMark:0}),
        {status,headers:header?{'Content-Type':header}:{}});
    },entry=>logs.push(entry));
    await assert.rejects(transport.get(path),error=>{
      assert.equal(error.code,'price_read_unavailable');assert.equal(error.status,502);
      assert.deepEqual(error.diagnostic,{operation:'read_prices_inactive',endpoint:'/api/v1/listPreco',httpStatus:status,contentType,reason});
      assert.deepEqual(logs,[error.diagnostic]);return true;
    });
    assert.equal(calls,1);assert.equal(reads,0);assert.equal(cancels,1);
    assert.doesNotMatch(JSON.stringify(logs),/private|secret|Authorization|Basic|token|produto=/);
  }
});

test('network, timeout and invalid JSON diagnostics never include remote text or exception details',async()=>{
  for(const [fetcher,reason,httpStatus,contentType] of [
    [async()=>{throw Error('private-network');},'network_error',null,'missing'],
    [async()=>{throw new DOMException('private-timeout','TimeoutError');},'timeout',null,'missing'],
    [async()=>new Response('private-invalid-json',{headers:{'Content-Type':'application/json'}}),'invalid_response',200,'application/json'],
    [async()=>new Response('x'.repeat(512*1024+1),{headers:{'Content-Type':'application/json'}}),'invalid_response',200,'application/json'],
  ]){
    const logs=[];let calls=0;
    const transport=createPriceTransport(env,async(...args)=>{calls++;return fetcher(...args);},entry=>logs.push(entry));
    await assert.rejects(transport.get(path),error=>{
      assert.equal(error.code,'price_read_unavailable');
      assert.deepEqual(error.diagnostic,{operation:'read_prices_inactive',endpoint:'/api/v1/listPreco',httpStatus,contentType,reason});return true;
    });
    assert.equal(calls,1);assert.equal(logs.length,1);assert.doesNotMatch(JSON.stringify(logs),/private/);
  }
});

test('successful JSON reads are unchanged and a logging failure does not mask a remote rejection',async()=>{
  const logs=[];
  const success=createPriceTransport(env,async()=>Response.json({total:0,data:[]}),entry=>logs.push(entry));
  assert.deepEqual(await success.get(path),{total:0,data:[]});assert.equal(logs.length,0);
  const failure=createPriceTransport(env,async()=>new Response(null,{status:403}),()=>{throw Error('private-logger');});
  await assert.rejects(failure.get(path),{code:'price_read_unavailable',status:502});
});
