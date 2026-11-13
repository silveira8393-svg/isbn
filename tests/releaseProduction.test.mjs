import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfigFromFile } from 'vite';

test('Vite exposes the shared Amazon title rollout in Production and the release Preview only', async () => {
  const keys = ['NODE_ENV', 'VERCEL_ENV', 'VERCEL_GIT_COMMIT_REF'];
  const previous = keys.map(key => [key, process.env[key]]);
  try {
    for (const [deployment, branch, enabled] of [
      ['production', 'release/isbn-v1.5.0-production', true],
      ['preview', 'release/isbn-v1.5.0-production', true],
      ['preview', 'feature/isbn-melhorias-pos-demo', false],
      ['preview', 'unknown-branch', false],
    ]) {
      Object.assign(process.env, { NODE_ENV: 'production', VERCEL_ENV: deployment, VERCEL_GIT_COMMIT_REF: branch });
      const config = await loadConfigFromFile({ command: 'build', mode: 'production' });
      assert.equal(config.config.define['import.meta.env.ISBN_AMAZON_TITLE_PREVIEW'], JSON.stringify(enabled));
    }
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
