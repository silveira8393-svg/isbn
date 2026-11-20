import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mediaImages } from './helpers/mediaImages.mjs';

const bundled = await build({stdin:{resolveDir:process.cwd(),contents:"export * from './shared/magazordMedia';"},
 bundle:true,write:false,platform:'node',format:'esm'});
const api = await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const jpeg = mediaImages.jpg;
const photo = {bytes:jpeg, format:'jpg', name:'capa-9788532530837.jpg'};

test('imagem JSON Base64 no contrato Magazord com tipo derivação',()=>{
  const body = api.buildMagazordImageUpload(photo);
  assert.deepEqual({tipo:body.tipo,plataforma:body.plataforma,tipoMidia:body.tipoMidia,nomeArquivo:body.nomeArquivo},
    {tipo:6,plataforma:1,tipoMidia:1,nomeArquivo:photo.name});
  assert.deepEqual(Buffer.from(body.midiaFile,'base64'),Buffer.from(jpeg));
});
test('bloqueia extensão falsa, arquivo vazio ou tamanho excessivo',()=>{
  assert.throws(()=>api.buildMagazordImageUpload({...photo,format:'png'}),/invalid_media_image/);
  assert.throws(()=>api.buildMagazordImageUpload({...photo,bytes:new Uint8Array(0)}),/invalid_media_size/);
  assert.throws(()=>api.buildMagazordImageUpload({...photo,bytes:new Uint8Array(api.MAGAZORD_MEDIA_MAX_BYTES+1)}),/invalid_media_size/);
});
test('só aceita id inteiro positivo de resposta Magazord',()=>{
  assert.equal(api.validatedMagazordMediaId({status:'success',data:{id:'105'}}),105);
  for(const value of [null,{}, {status:'failed',data:{id:105}}, {status:'success',data:{id:'0'}},{status:'success',data:{id:2.5}}])
    assert.throws(()=>api.validatedMagazordMediaId(value));
});
test('relaciona apenas ao Filho e por POST aditivo, nunca PUT',()=>{
 const req = api.buildMagazordMediaRelation('LVP013','9788532530837',[105,106]);
 assert.equal(req.method,'POST');
 assert.equal(req.path,'/v2/site/produto/LVP013/derivacao/9788532530837/midia');
 assert.deepEqual(req.body,{midiaId:[105,106]});
 assert.throws(()=>api.buildMagazordMediaRelation('LVP013','9788532530837',[105,105]),/invalid_media_ids/);
 assert.throws(()=>api.buildMagazordMediaRelation('LVP013','9788532530837',[]),/invalid_media_relation/);
});
