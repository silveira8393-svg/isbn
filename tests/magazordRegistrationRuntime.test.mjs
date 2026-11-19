import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

test('registration route initializes as native ESM without bundling its transitive modules', async () => {
  // Bundled fixture tests hide extensionless-import failures in serverless Node.
  const graph = await build({ entryPoints: ['api/magazord/registration.ts'], bundle: true, write: false,
    platform: 'node', format: 'esm', target: 'node24', metafile: true });
  const directory = await mkdtemp(join(tmpdir(), 'isbn-magazord-runtime-'));
  try {
    await build({ entryPoints: Object.keys(graph.metafile.inputs), bundle: false, outbase: process.cwd(), outdir: directory,
      platform: 'node', format: 'esm', target: 'node24' });
    await writeFile(join(directory, 'package.json'), '{"type":"module"}');
    await writeFile(join(directory, 'check.mjs'), `
      import assert from 'node:assert/strict';
      let calls = 0;
      globalThis.fetch = async () => { calls++; throw new Error('Network forbidden in runtime smoke test'); };
      const {default: entry} = await import('./api/magazord/registration.js');
      assert.equal(typeof entry.fetch, 'function');
      const response = await entry.fetch(new Request('https://isbn.invalid/api/magazord/registration'));
      assert.equal(response.status, 405);
      assert.equal(calls, 0);
    `);
    const result = spawnSync(process.execPath, [join(directory, 'check.mjs')], { encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
  } finally {
    // The recursive cleanup is restricted to this freshly allocated temporary directory.
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(directory.startsWith(join(tmpdir(), 'isbn-magazord-runtime-')));
    await rm(directory, { recursive: true, force: true });
  }
});
