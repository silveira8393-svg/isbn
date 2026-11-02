import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';

const compiled = await build({ stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
  export * from './server/spapi/provision'; export * from './server/spapi/core';
  export * from './server/spapi/handler'; export * from './server/spapi/supabaseHeaders';
` }, bundle: true, write: false, platform: 'node', format: 'esm', target: 'node24' });
const api = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const ref = 'a'.repeat(20), store = api.PRIVATE_STORE_ID, uid = '11111111-1111-4111-8111-111111111111';
const jwt = (claims) => Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.syntheticSignature';
const env = { ISBN_EXPECTED_SUPABASE_PROJECT_REF: ref, SUPABASE_URL: `https://${ref}.supabase.co`, ISBN_CONFIRM_PRIVATE_OWN_ACCOUNT: 'YES',
  AMAZON_SPAPI_STORE_ID: store, AMAZON_SPAPI_SELLER_ID: 'SELLERTEST', AMAZON_SPAPI_TOKEN_KEY: 'ab'.repeat(32),
  AMAZON_SPAPI_REFRESH_TOKEN: 'Atzr|synthetic-refresh-secret', SUPABASE_SERVICE_ROLE_KEY: jwt({ role: 'service_role', ref }) };
function harness(options = {}) {
  const saved = new Map(), calls = [];
  const fetcher = async (target, init) => {
    const url = new URL(target); calls.push({ url, init });
    assert.equal(url.origin, env.SUPABASE_URL); assert.equal(init.headers.apikey, options.key || env.SUPABASE_SERVICE_ROLE_KEY);
    assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store'); assert.equal(init.credentials, 'omit');
    assert.ok(init.signal instanceof AbortSignal); assert.equal(init.signal.aborted, false);
    assert.ok(!url.href.includes(env.AMAZON_SPAPI_REFRESH_TOKEN));
    if (options.error) throw new Error(options.error);
    if (options.status) return new Response('sensitive-upstream-body', { status: options.status });
    if (url.pathname === '/rest/v1/stores') {
      assert.equal(url.searchParams.get('id'), `eq.${store}`); assert.equal(url.searchParams.get('select'), 'id');
      return Response.json(options.stores ?? [{ id: store }]);
    }
    assert.equal(url.pathname, '/rest/v1/amazon_spapi_authorizations');
    if (!init.method || init.method === 'GET') {
      assert.equal(url.searchParams.get('store_id'), `eq.${store}`); assert.equal(url.searchParams.get('selling_partner_id'), 'eq.SELLERTEST');
      assert.equal(url.searchParams.get('select'), 'store_id,selling_partner_id');
      return Response.json(options.rows ?? [...saved.values()].map(v => ({ store_id: v.store_id, selling_partner_id: v.selling_partner_id })));
    }
    assert.equal(init.method, 'POST'); assert.equal(url.search, ''); assert.equal(init.headers.Prefer, 'return=minimal');
    assert.doesNotMatch(JSON.stringify(init), /resolution=|on_conflict/);
    if (options.insertStatus) return new Response('sensitive-insert-body', { status: options.insertStatus });
    const row = JSON.parse(init.body), key = `${row.store_id}:${row.selling_partner_id}`;
    if (saved.has(key)) return new Response('sensitive-conflict-body', { status: 409 });
    saved.set(key, row); return new Response(null, { status: 201 });
  };
  return { saved, calls, fetcher };
}
test('provisioned envelope decrypts using existing runtime crypto, with identical columns and fresh IV', async () => {
  const a = harness(), b = harness();
  await api.provisionSelfAuthorization(env, a.fetcher); await api.provisionSelfAuthorization(env, b.fetcher);
  const row = [...a.saved.values()][0], other = [...b.saved.values()][0];
  assert.deepEqual(Object.keys(row).sort(), ['store_id', 'selling_partner_id', 'ciphertext', 'iv', 'tag', 'key_version', 'updated_at'].sort());
  assert.equal(api.decrypt(row, env.AMAZON_SPAPI_TOKEN_KEY, `${store}:SELLERTEST:v1`), env.AMAZON_SPAPI_REFRESH_TOKEN);
  assert.equal(row.key_version, 1); assert.notEqual(row.iv, other.iv); assert.equal(Buffer.from(row.iv, 'base64').length, 12);
  assert.equal(Buffer.from(row.tag, 'base64').length, 16); assert.ok(Number.isFinite(Date.parse(row.updated_at)));
  assert.doesNotMatch(JSON.stringify(row), /Atzr\||synthetic-refresh-secret|service_role/);
  assert.throws(() => api.decrypt(row, 'cd'.repeat(32), `${store}:SELLERTEST:v1`));
  assert.throws(() => api.decrypt(row, env.AMAZON_SPAPI_TOKEN_KEY, `${uid}:SELLERTEST:v1`));
});
test('exact Supabase project guard rejects alternative hosts, credentials, paths, ports and normalization tricks before network', async () => {
  for (const SUPABASE_URL of [`https://${'b'.repeat(20)}.supabase.co`, `http://${ref}.supabase.co`, `https://u:p@${ref}.supabase.co`,
    `https://${ref}.supabase.co:443`, `https://${ref}.supabase.co/../`, `https://${ref}.supabase.co?token=x`, `https://${ref}.supabase.co/#x`,
    `https://${ref}.supabase.co.evil.invalid`, ` https://${ref}.supabase.co`, 'https://silveira-hub.supabase.co']) {
    const h = harness(); await assert.rejects(api.provisionSelfAuthorization({ ...env, SUPABASE_URL }, h.fetcher), /supabase_project_mismatch/); assert.equal(h.calls.length, 0);
  }
  for (const value of ['', '../project', 'A'.repeat(20), 'a'.repeat(19)])
    await assert.rejects(api.provisionSelfAuthorization({ ...env, ISBN_EXPECTED_SUPABASE_PROJECT_REF: value }, () => assert.fail('network')), /supabase_project_mismatch/);
});
test('confirmation, store UUID, seller, AES key and refresh token must validate before network', async () => {
  for (const override of [{ ISBN_CONFIRM_PRIVATE_OWN_ACCOUNT: 'NO' }, { AMAZON_SPAPI_STORE_ID: '-'.repeat(36) }, { AMAZON_SPAPI_SELLER_ID: 'seller?' },
    { AMAZON_SPAPI_TOKEN_KEY: 'bad' }, { AMAZON_SPAPI_REFRESH_TOKEN: '' }, { AMAZON_SPAPI_REFRESH_TOKEN: 'Atzr|bad\nvalue' },
    { AMAZON_SPAPI_REFRESH_TOKEN: 'Atzr|bad value' }, { AMAZON_SPAPI_REFRESH_TOKEN: 'Atzr|' + 'x'.repeat(2048) }, { AMAZON_SPAPI_REFRESH_TOKEN: 'not-lwa' }]) {
    const h = harness(); await assert.rejects(api.provisionSelfAuthorization({ ...env, ...override }, h.fetcher), api.ProvisionError); assert.equal(h.calls.length, 0);
  }
});
test('service key role and project are checked locally; anon, mismatched JWTs and malformed keys rejected', async () => {
  for (const key of ['', 'sb_publishable_synthetic', jwt({ role: 'anon', ref }), jwt({ role: 'service_role', ref: 'b'.repeat(20) }),
    jwt({ role: 'service_role' }), 'eyJbad.payload.signature', 'sb_secret_bad\nheader'])
    await assert.rejects(api.provisionSelfAuthorization({ ...env, SUPABASE_SERVICE_ROLE_KEY: key }, () => assert.fail('network')), /invalid_service_key/);
  const modern = 'sb_secret_' + 's'.repeat(32), h = harness({ key: modern });
  await api.provisionSelfAuthorization({ ...env, SUPABASE_SERVICE_ROLE_KEY: modern }, h.fetcher);
  assert.ok(h.calls.every(c => !('Authorization' in c.init.headers)));
  assert.equal(api.serviceHeaders(env.SUPABASE_SERVICE_ROLE_KEY).Authorization, `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`);
});
test('missing/mismatched store and invalid existing-row lookup stop before insertion', async () => {
  for (const options of [{ stores: [] }, { stores: [{ id: uid }] }, { stores: {} }, { rows: {} },
    { rows: [{ store_id: uid, selling_partner_id: 'OTHERSELLER' }] }]) {
    const h = harness(options); await assert.rejects(api.provisionSelfAuthorization(env, h.fetcher), api.ProvisionError);
    assert.equal(h.calls.filter(c => c.init.method === 'POST').length, 0); assert.equal(h.saved.size, 0);
  }
});
test('sequential duplicate provisioning never overwrites even with a different token/key', async () => {
  const h = harness(); await api.provisionSelfAuthorization(env, h.fetcher); const initial = JSON.stringify([...h.saved.values()]);
  await assert.rejects(api.provisionSelfAuthorization({ ...env, AMAZON_SPAPI_REFRESH_TOKEN: 'Atzr|different', AMAZON_SPAPI_TOKEN_KEY: 'cd'.repeat(32) }, h.fetcher), /authorization_exists_no_overwrite/);
  assert.equal(JSON.stringify([...h.saved.values()]), initial); assert.equal(h.calls.filter(c => c.init.method === 'POST').length, 1);
});
test('concurrent inserts use primary-key conflict and cannot overwrite the winner; no upsert or retries', async () => {
  const h = harness(), outcomes = await Promise.allSettled([api.provisionSelfAuthorization(env, h.fetcher), api.provisionSelfAuthorization(env, h.fetcher)]);
  assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(o => o.status === 'rejected').reason.code, 'authorization_exists_no_overwrite'); assert.equal(h.saved.size, 1);
  assert.equal(h.calls.filter(c => c.init.method === 'POST').length, 2);
  const sql = await readFile('supabase/setup/amazon_spapi_official.sql', 'utf8');
  assert.match(sql, /primary key \(store_id, selling_partner_id\)/);
});
test('CLI sanitizes upstream failures, does not echo secrets and rejects secret arguments', async () => {
  for (const options of [{ status: 401 }, { status: 403 }, { status: 500 }, { error: Object.values(env).join(' ') }]) {
    const output = [], h = harness(options);
    assert.equal(await api.runProvisionCli({ env, fetcher: h.fetcher, argv: [], out: m => output.push(m), err: m => output.push(m) }), 1);
    for (const key of ['AMAZON_SPAPI_REFRESH_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY', 'AMAZON_SPAPI_TOKEN_KEY', 'SUPABASE_URL']) assert.ok(!output.join().includes(env[key]));
    assert.doesNotMatch(output.join(), /sensitive-upstream-body/); assert.equal(h.calls.length, 1);
  }
  const errors = [];
  assert.equal(await api.runProvisionCli({ env, argv: [env.AMAZON_SPAPI_REFRESH_TOKEN], fetcher: () => assert.fail('network'), err: m => errors.push(m) }), 1);
  assert.deepEqual(errors, ['Provisioning aborted: arguments_not_allowed']);
});
test('CLI entry runs with package command/loader without real environment, and import is side-effect free', async () => {
  const childEnv = Object.fromEntries(['PATH', 'SystemRoot', 'USERNAME', 'USERDOMAIN', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'TEMP', 'TMP', 'LOCALAPPDATA']
    .filter(key => process.env[key]).map(key => [key, process.env[key]]));
  for (const args of [[], ['synthetic-secret-argument']]) {
    const result = spawnSync(process.execPath, ['scripts/provision-self-authorization.mjs', ...args], { env: childEnv, encoding: 'utf8' });
    assert.equal(result.status, 1); assert.equal(result.stdout, ''); assert.doesNotMatch(result.stderr, /synthetic-secret-argument|stack|Error:/);
    assert.match(result.stderr, args.length ? /arguments_not_allowed/ : /supabase_project_mismatch/);
  }
  const imported = spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./scripts/provision-self-authorization.mjs')"], { env: childEnv, encoding: 'utf8' });
  assert.equal(imported.status, 0); assert.equal(imported.stdout + imported.stderr, '');
});
test('CLI success exposes only fixed message and never returns persisted data', async () => {
  const h = harness(), out = [];
  assert.equal(await api.runProvisionCli({ env, fetcher: h.fetcher, argv: [], out: m => out.push(m), err: () => assert.fail('unexpected error') }), 0);
  assert.deepEqual(out, ['Encrypted private self-authorization provisioned to the confirmed ISBN project.']);
});
test('insert failures and ambiguous success stop without retry or credential disclosure', async () => {
  for (const insertStatus of [200, 403, 409, 500]) {
    const h = harness({ insertStatus }), output = [];
    assert.equal(await api.runProvisionCli({ env, fetcher: h.fetcher, argv: [], out: m => output.push(m), err: m => output.push(m) }), 1);
    assert.equal(h.calls.filter(c => c.init.method === 'POST').length, 1); assert.equal(h.saved.size, 0);
    assert.doesNotMatch(output.join(), /sensitive|Atzr\||syntheticSignature|confirmed ISBN project/);
  }
});
test('server environment token supports ISBN query without provisioned rows and keeps external authorization blocked', async () => {
  const calls = [];
  const runtimeEnv = { ...env, AMAZON_SPAPI_ENABLED: 'true', AMAZON_SPAPI_EXTERNAL_AUTH_APPROVED: 'false', AMAZON_SPAPI_ORIGIN: 'https://isbn.example.invalid',
    AMAZON_SPAPI_APP_ID: 'amzn1.sellerapps.app.synthetic', AMAZON_SPAPI_CLIENT_ID: 'synthetic-client', AMAZON_SPAPI_CLIENT_SECRET: 'synthetic-client-secret',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_' + 's'.repeat(32) };
  const fetcher = async (target, init) => {
    const url = new URL(target); calls.push(url.href);
    if (url.pathname === '/auth/v1/user') return Response.json({ id: uid });
    if (url.pathname.startsWith('/rest/')) { assert.equal(init.headers.apikey, runtimeEnv.SUPABASE_PUBLISHABLE_KEY); assert.equal(init.headers.Authorization, 'Bearer synthetic-session-token'); }
    if (url.pathname.endsWith('/profiles')) return Response.json([{ id: uid, active: true }]);
    if (url.pathname.endsWith('/store_users')) return Response.json([{ user_id: uid, store_id: store, active: true, role: 'developer' }]);
    assert.ok(!url.pathname.includes('amazon_spapi_authorizations'));
    if (url.href === 'https://api.amazon.com/auth/o2/token') {
      assert.equal(init.body.get('refresh_token'), env.AMAZON_SPAPI_REFRESH_TOKEN);
      return Response.json({ access_token: 'synthetic-access', token_type: 'bearer', expires_in: 3600 });
    }
    assert.equal(url.origin, 'https://sellingpartnerapi-na.amazon.com'); assert.equal(url.searchParams.get('identifiers'), '9788535914849');
    assert.equal(init.method, 'GET'); return Response.json({ items: [], numberOfResults: 0 });
  };
  const response = await api.createSpapiHandler('catalog', { env: runtimeEnv, fetcher })(new Request(runtimeEnv.AMAZON_SPAPI_ORIGIN + '/api/amazon/spapi/catalog?isbn=9788535914849', { headers: { authorization: 'Bearer synthetic-session-token' } }));
  assert.equal(response.status, 200); assert.deepEqual((await response.json()).items, []);
  const start = await api.createSpapiHandler('start', { env: runtimeEnv, fetcher, store: { active: async () => {} } })(new Request(runtimeEnv.AMAZON_SPAPI_ORIGIN + '/api/amazon/oauth/start', { method: 'POST', headers: { authorization: 'Bearer synthetic-session-token', origin: runtimeEnv.AMAZON_SPAPI_ORIGIN } }));
  assert.equal(start.status, 403); assert.equal((await start.json()).code, 'developer_classification_pending');
  assert.equal(calls.filter(url => /sellercentral/.test(url)).length, 0);
});
test('HTTP route bundles exclude administrative provisioning and CLI confirmation input', async () => {
  const routes = await build({ entryPoints: ['api/amazon/spapi/catalog.ts', 'api/amazon/oauth/start.ts', 'api/amazon/oauth/login.ts', 'api/amazon/oauth/callback.ts'],
    outdir: 'unused', bundle: true, write: false, metafile: true, platform: 'node', format: 'esm' });
  assert.ok(!Object.keys(routes.metafile.inputs).some(p => /provision/.test(p)));
  for (const file of routes.outputFiles) assert.doesNotMatch(file.text, /ISBN_CONFIRM_PRIVATE_OWN_ACCOUNT/);
});
test('frontend bundle contains no provisioning code, administrative variables or synthetic credentials', async () => {
  const frontend = await build({ entryPoints: ['src/main.tsx'], bundle: true, write: false, metafile: true, platform: 'browser', format: 'esm',
    loader: { '.css': 'empty' }, define: { 'import.meta.env': '{}' }, logLevel: 'silent' });
  assert.ok(!Object.keys(frontend.metafile.inputs).some(p => /server\/spapi|scripts\/provision/.test(p.replaceAll('\\', '/'))));
  for (const file of frontend.outputFiles) {
    assert.doesNotMatch(file.text, /AMAZON_SPAPI_REFRESH_TOKEN|ISBN_CONFIRM_PRIVATE_OWN_ACCOUNT|ISBN_EXPECTED_SUPABASE_PROJECT_REF/);
    assert.ok(!file.text.includes(env.AMAZON_SPAPI_REFRESH_TOKEN)); assert.ok(!file.text.includes(env.SUPABASE_SERVICE_ROLE_KEY));
  }
});
