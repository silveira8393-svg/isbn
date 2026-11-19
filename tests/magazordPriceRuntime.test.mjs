import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
test('price route initializes as native ESM including price orchestration without network calls',async()=>{
  const graph=await build({entryPoints:['api/magazord/price.ts'],bundle:true,write:false,platform:'node',format:'esm',target:'node24',metafile:true});
  assert.ok(Object.keys(graph.metafile.inputs).some(p=>p.endsWith('magazordPriceOperation.ts')));
  const directory=await mkdtemp(join(tmpdir(),'isbn-price-runtime-'));
  try{
    await build({entryPoints:Object.keys(graph.metafile.inputs),bundle:false,outbase:process.cwd(),outdir:directory,platform:'node',format:'esm',target:'node24'});
    await writeFile(join(directory,'package.json'),'{"type":"module"}');
    await writeFile(join(directory,'check.mjs'),`import assert from 'node:assert/strict';let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Network forbidden');};const {default:entry}=await import('./api/magazord/price.js');const r=await entry.fetch(new Request('https://isbn.invalid/api/magazord/price'));assert.equal(r.status,405);assert.equal(calls,0);`);
    const result=spawnSync(process.execPath,[join(directory,'check.mjs')],{encoding:'utf8',timeout:15000});assert.equal(result.status,0,result.stderr||result.error?.message);
  }finally{assert.equal(dirname(resolve(directory)),resolve(tmpdir()));assert.ok(directory.startsWith(join(tmpdir(),'isbn-price-runtime-')));await rm(directory,{recursive:true,force:true});}
});
