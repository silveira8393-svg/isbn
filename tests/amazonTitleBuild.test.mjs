import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfigFromFile } from 'vite';

test('actual Vite config enables the client production tab and preserves Preview branch restrictions', async () => {
  const names = ['VERCEL_ENV', 'VERCEL_GIT_COMMIT_REF', 'NODE_ENV'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    for (const [environment, branch, expected] of [
      ['production', 'feature/isbn-melhorias-pos-demo', true],
      ['production', 'main', true],
      ['preview', 'feature/isbn-melhorias-pos-demo', true],
      ['preview', 'other-branch', false],
      ['staging', 'feature/isbn-melhorias-pos-demo', false],
    ]) {
      Object.assign(process.env, { VERCEL_ENV: environment, VERCEL_GIT_COMMIT_REF: branch, NODE_ENV: 'production' });
      const result = await loadConfigFromFile({ command: 'build', mode: 'production' });
      assert.equal(result.config.define['import.meta.env.ISBN_AMAZON_TITLE_PREVIEW'], JSON.stringify(expected), `${environment}:${branch}`);
    }
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name];
    }
  }
});
