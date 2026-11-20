import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mediaImages } from './helpers/mediaImages.mjs';
const built=await build({stdin:{resolveDir:process.cwd(),contents:"export * from './server/magazordMediaImage'; export * from './server/magazordMediaRuntime';"},bundle:true,write:false,platform:'node',format:'esm'});
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));

for(const format of ['jpg','png','webp'])test('estrutura completa e truncamentos de '+format,()=>{
 assert.doesNotThrow(()=>api.validateMediaImage(mediaImages[format],format));
 for(let n=0;n<mediaImages[format].length;n++)assert.throws(()=>api.validateMediaImage(mediaImages[format].slice(0,n),format));
 assert.throws(()=>api.validateMediaImage(mediaImages[format],format==='jpg'?'png':'jpg'));
});
test('JPEG com dimensões excessivas e PNG com CRC adulterado são recusados',()=>{
 const jpeg=Buffer.from(mediaImages.jpg),sof=jpeg.indexOf(Buffer.from([255,192]));assert.ok(sof>0);
 jpeg.writeUInt16BE(65535,sof+5);jpeg.writeUInt16BE(65535,sof+7);
 assert.throws(()=>api.validateMediaImage(jpeg,'jpg'));
 const png=Buffer.from(mediaImages.png);png[45]^=1;assert.throws(()=>api.validateMediaImage(png,'png'));
});
test('orçamento compartilhado limita cada prazo e protege margem',()=>{
 let time=0;const rt=api.mediaRuntime(()=>time,()=>{});
 assert.equal(rt.remaining(),28000);time=24000;
 assert.throws(()=>rt.signal(12000,5000),{name:'TimeoutError'});
 assert.doesNotThrow(()=>rt.signal(4000));time=28000;assert.throws(()=>rt.signal(1),{name:'TimeoutError'});
});
