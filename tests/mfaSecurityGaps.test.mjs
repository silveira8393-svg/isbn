// Offline contract tests only. No remote SQL, real JWTs, users, providers or deployments.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { mfaToken } from './helpers/mfa.mjs';

const compiled = await build({ stdin: { resolveDir: process.cwd(), contents: `
export {createInfrastructureHandler} from './supabase/functions/infrastructure-control/handler';
export {createManageStoreUsersHandler} from './supabase/functions/manage-store-users/handler';
` }, write: false, bundle: true, platform: 'node', format: 'esm' });
const api = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const uid = '11111111-1111-4111-8111-111111111111';
const store = '22222222-2222-4222-8222-222222222222';
const otherStore = '33333333-3333-4333-8333-333333333333';
const configId = '44444444-4444-4444-8444-444444444444';
const origin = 'https://isbn.invalid';
const config = { id: configId, store_id: store, provider: 'supabase', version: 1, environment: 'development',
  enabled: true, mode: 'demo', project_ref: 'synthetic-project', account_scope_id: null, plan_label: 'Test',
  refresh_minutes: 30, retention_days: 30, alert_thresholds_json: { warning: 70, critical: 90 } };
const draft = (({ enabled, mode, project_ref, account_scope_id, plan_label, refresh_minutes, retention_days, alert_thresholds_json }) =>
  ({ enabled, mode, project_ref, account_scope_id, plan_label, refresh_minutes, retention_days, alert_thresholds_json }))(config);
const body = action => ({ action, storeId: store, ...(['save', 'collect', 'test_connection'].includes(action) ? { configId } : {}),
  ...(action === 'save' ? { version: 1, config: draft, limits: [] } : {}) });
const request = (payload, token = mfaToken(uid), headers = {}) => new Request('https://edge.invalid/infrastructure-control', {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
  body: JSON.stringify(payload),
});

function infrastructure(options = {}) {
  const calls = [];
  const userClient = {
    auth: { async getUser(token) {
      calls.push(['auth', token]);
      if (options.authThrows) throw new Error('private auth details');
      return { data: { user: options.invalid ? null : { id: uid, is_anonymous: options.anonymous ?? false } }, error: options.invalid ? { code: 'bad_jwt' } : null };
    } },
    async rpc(name, args) {
      calls.push(['rpc', name, args]);
      if (options.permissionError) return { data: null, error: { code: '42501' } };
      if (name === 'infra_is_developer') return { data: (options.role ?? 'developer') === 'developer' && options.active !== false && args.p_store_id === store, error: null };
      if (name === 'infra_save_config') return { data: { ...config, version: 2 }, error: null };
      assert.ok(['infra_initialize', 'infra_authorize_action'].includes(name));
      return { data: null, error: null };
    },
    from(table) {
      const filters = []; calls.push(['from', table, filters]);
      const result = () => ({ data: table === 'infra_monitor_configs' ? [config].filter(c => filters.every(([k, v]) => c[k] === v)) : [], error: null });
      return { select() { return this; }, eq(k, v) { filters.push([k, v]); return this; }, in() { return this; }, order() { return this; }, limit() { return this; },
        maybeSingle: async () => ({ data: result().data[0] ?? null, error: null }), then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); } };
    },
  };
  const handler = api.createInfrastructureHandler({ allowedOrigins: [origin], userClient: () => userClient,
    adminClient() { calls.push(['adminClient']); return { async rpc(name, args) {
      calls.push(['adminRpc', name, args]); assert.ok(['infra_claim_run', 'infra_finish_run'].includes(name));
      return { data: name === 'infra_claim_run' ? '55555555-5555-4555-8555-555555555555' : null, error: null };
    } }; }, getSecret: () => assert.fail('demo needs no secrets'), fetch: () => assert.fail('no provider network in offline test'),
  });
  return { handler, calls };
}

for (const action of ['read', 'initialize', 'save', 'test_connection', 'collect']) {
  for (const role of ['operator', 'admin', 'developer']) test(`infrastructure ${action}: aal1 ${role} stops before RPC/data/admin`, async () => {
    const h = infrastructure({ role }); const response = await h.handler(request(body(action), mfaToken(uid, 'aal1'), { 'x-mfa-verified': 'true', 'x-role': 'developer' }));
    assert.equal(response.status, 403); assert.equal((await response.json()).code, 'mfa_required');
    assert.deepEqual(h.calls.map(c => c[0]), ['auth']);
  });
  test(`infrastructure ${action}: aal2 developer keeps existing authorized flow`, async () => {
    const h = infrastructure(); const response = await h.handler(request(body(action)));
    assert.equal(response.status, 200); const result = await response.json();
    assert.equal(h.calls[0][0], 'auth'); assert.equal(h.calls[1][1], 'infra_is_developer');
    if (['collect', 'test_connection'].includes(action)) {
      assert.equal(result.collected, true);
      assert.ok(h.calls.findIndex(c => c[1] === 'infra_authorize_action') < h.calls.findIndex(c => c[0] === 'adminClient'));
      assert.deepEqual(h.calls.filter(c => c[0] === 'adminRpc').map(c => c[1]), ['infra_claim_run', 'infra_finish_run']);
    } else assert.equal(h.calls.some(c => c[0] === 'adminClient'), false);
    for (const [, table, filters] of h.calls.filter(c => c[0] === 'from' && c[1] === 'infra_monitor_configs')) {
      assert.ok(filters.some(([key, value]) => key === 'store_id' && value === store), table + ' must remain scoped');
    }
  });
}

for (const settings of [{ role: 'operator' }, { role: 'admin' }, { active: false }, { permissionError: true }]) {
  test('aal2 does not bypass infrastructure role/activity checks: ' + JSON.stringify(settings), async () => {
    const h = infrastructure(settings); const response = await h.handler(request(body('collect')));
    assert.equal(response.status, 403); assert.equal(h.calls.some(c => c[0] === 'adminClient' || c[0] === 'from'), false);
  });
}
test('aal2 developer cannot select another store', async () => {
  const h = infrastructure(); const response = await h.handler(request({ ...body('save'), storeId: otherStore }));
  assert.equal(response.status, 403); assert.deepEqual(h.calls.map(c => c[0]), ['auth', 'rpc']);
});
for (const settings of [{ invalid: true }, { anonymous: true }, { authThrows: true }]) test('invalid/Auth outage fails closed: ' + JSON.stringify(settings), async () => {
  const h = infrastructure(settings); const response = await h.handler(request(body('read')));
  assert.equal(response.status, settings.authThrows ? 503 : 401);
  assert.equal(h.calls.length, 1); assert.doesNotMatch(await response.text(), /private auth/);
});
test('missing or user-mismatched JWT cannot construct an infrastructure admin client', async () => {
  const h = infrastructure(); assert.equal((await h.handler(request(body('read'), null))).status, 401); assert.equal(h.calls.length, 0);
  assert.equal((await h.handler(request(body('read'), mfaToken('another-user')))).status, 403);
  assert.equal(h.calls.length, 1);
});

for (const action of ['invite_user', 'update_user', 'get_invitation_status']) test(`manage-store-users ${action}: aal1 never constructs privileged client`, async () => {
  let authCalls = 0;
  const handler = api.createManageStoreUsersHandler({ allowedOrigins: [origin], inviteRedirectTo: origin + '/?auth=recovery',
    getAuthClient: () => ({ auth: { getUser: async () => { authCalls++; return { data: { user: { id: uid } }, error: null }; } } }),
    getAdminClient: () => assert.fail('admin client before MFA'),
  });
  const response = await handler(request({ action }, mfaToken(uid, 'aal1')));
  assert.equal(response.status, 403); assert.equal((await response.json()).code, 'mfa_required'); assert.equal(authCalls, 1);
});

// Static SQL artifacts are not a Postgres/RLS execution test. Those checks remain pending authorization.
const sql = await readFile('supabase/setup/mfa_required_review.sql', 'utf8');
const rollback = await readFile('supabase/setup/mfa_rollback_review.sql', 'utf8');
const baseline = JSON.parse(await readFile('supabase/setup/mfa_rpc_baseline.json', 'utf8'));
const md5 = value => createHash('md5').update(value).digest('hex');
const normalized = value => value.replace(/\s/g, '');
const functionBody = text => /AS \$function\$([\s\S]*?)\$function\$/.exec(text)[1];
const tableList = text => [.../foreach table_name in array array\[([\s\S]*?)\] loop/i.exec(text)[1].matchAll(/'([^']+)'/g)].map(m => m[1]).sort();

test('static SQL contract: all eleven tables and rollback coverage; no managed Storage DDL or grants', () => {
  const expected = ['profiles', 'stores', 'store_users', 'operations', 'store_settings', 'audit_logs', 'infra_monitor_configs',
    'infra_metric_limits', 'infra_metric_snapshots', 'infra_sync_runs', 'infra_config_audit'].sort();
  assert.deepEqual(tableList(sql), expected); assert.deepEqual(tableList(rollback), expected);
  const statements = sql.replace(/^--.*$/gm, '');
  assert.doesNotMatch(statements, /storage\.objects|\bgrant\b|\brevoke\b|force row level|disable row level|alter.*owner/i);
  assert.match(statements, /as restrictive for all to anon, authenticated/);
  assert.match(statements, /using \(\(select auth.jwt\(\)->>''aal''\) = ''aal2''\) with check/);
  assert.match(sql, /existing\.marker is distinct from marker/); assert.match(rollback, /unrecognized policy/);
  assert.match(sql, /alter policy isbn_require_mfa/); assert.match(sql, /RPC drift/);
});

test('static RPC contract: only MFA is added to the audited common gate; no mutator signature/body/grant changes', () => {
  const original = baseline.functions.find(f => f.name === 'infra_is_developer');
  const originalBody = normalized(functionBody(original.definition));
  const protectedBody = normalized(functionBody(sql));
  assert.equal(protectedBody.replace("SELECTcoalesce((selectauth.jwt()->>'aal')='aal2',false)AND", 'SELECT'), originalBody);
  assert.equal(normalized(functionBody(rollback)), originalBody);
  assert.ok(sql.includes(md5(originalBody)) && sql.includes(md5(protectedBody)));
  assert.ok(rollback.includes(md5(originalBody)) && rollback.includes(md5(protectedBody)));
  for (const f of baseline.functions.filter(f => f.name !== 'infra_is_developer')) {
    assert.match(f.definition, /public\.infra_is_developer/);
    assert.ok(sql.includes(md5(f.definition)), f.name + ' must detect drift');
    assert.ok(rollback.includes(md5(f.definition)), f.name + ' rollback must detect drift');
    assert.doesNotMatch(sql, new RegExp('create or replace function public\\.' + f.name + '\\('));
  }
});

test('static Storage contract: each existing predicate is retained completely and ANDed with MFA', async () => {
  const storage = JSON.parse(await readFile('supabase/setup/mfa_storage_baseline.json', 'utf8'));
  for (const action of ['read', 'insert']) {
    const p = storage.policies.find(p => p.policyname.endsWith(action));
    const expression = (await readFile(`supabase/setup/mfa_storage_${action}_predicate.sql`, 'utf8')).replace(/^--.*$/gm, '').trim();
    assert.equal(expression, `(${p.qual ?? p.with_check})\nAND ((select auth.jwt()->>'aal') = 'aal2')`);
    assert.equal(p.permissive, 'PERMISSIVE'); assert.equal(p.roles, '{authenticated}');
  }
});
