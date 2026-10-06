import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const compiled = await build({ entryPoints: ['supabase/functions/manage-store-users/handler.ts'], bundle: true,
  write: false, platform: 'node', format: 'cjs' });
const module = { exports: {} };
new Function('module', 'exports', compiled.outputFiles[0].text)(module, module.exports);
const { createManageStoreUsersHandler, validateInvitePayload } = module.exports;

const callerId = '11111111-1111-1111-1111-111111111111';
const storeId = '22222222-2222-2222-2222-222222222222';
const otherStore = '33333333-3333-3333-3333-333333333333';
const invitedId = '44444444-4444-4444-4444-444444444444';
const origin = 'https://isbn.example';
const redirect = `${origin}/?auth=recovery`;
const payload = { action: 'invite_user', displayName: ' Pessoa convidada ', email: ' PESSOA@EXAMPLE.COM ', role: 'operator' };

function setup(options = {}) {
  const calls = [], inserts = [], invites = [], authPages = [], authReads = [], updates = [];
  let authorizationReads = 0;
  let targetReads = 0;
  const client = {
    auth: {
      async getUser(token) {
        calls.push({ action: 'getUser', token });
        return { data: { user: options.invalidJwt ? null : { id: callerId, user_metadata: { role: 'admin' } } }, error: options.invalidJwt ? { message: 'private token details' } : null };
      },
      admin: {
        async getUserById(id) {
          authReads.push(id);
          if (options.statusThrows) throw new Error('private Auth service_role error');
          return { data: { user: options.authUserMissing ? null : {
            id, invited_at: options.invited === false ? null : '2026-10-01T00:00:00Z',
            email_confirmed_at: options.confirmed ? '2026-10-02T00:00:00Z' : null,
            confirmed_at: options.legacyConfirmed ? '2026-10-02T00:00:00Z' : null,
            last_sign_in_at: options.signedIn ? '2026-10-02T00:00:00Z' : null,
            email: 'private@example.com', user_metadata: { private: 'secret' },
          } }, error: options.statusError ? { message: 'private Auth directory' } : null };
        },
        async listUsers(pageOptions) {
          authPages.push(pageOptions);
          if (options.accountCheckError) return { data: null, error: { message: 'private Auth directory' } };
          return { data: { users: options.accounts?.[pageOptions.page - 1] ?? [] }, error: null };
        },
        async inviteUserByEmail(email, inviteOptions) {
          invites.push({ email, options: inviteOptions });
          if (options.authThrows) throw new Error('private service_role transport error');
          if (options.authError) return { data: { user: null }, error: options.authError };
          return { data: { user: options.nullInvitation ? null : {
            id: invitedId, email,
            user_metadata: options.reusedAccount ? { display_name: 'Existing account' } : inviteOptions.data,
          } }, error: null };
        },
      },
    },
    from(table) {
      assert.ok(['profiles', 'store_users', 'stores'].includes(table), 'Only existing public objects are used');
      const call = { table, filters: [] }; calls.push(call);
      const query = {
        select(columns, selectOptions) { call.columns = columns; call.selectOptions = selectOptions; return this; },
        eq(field, value) { call.filters.push([field, value]); return this; },
        neq(field, value) { call.exclusions = [field, value]; return this; },
        update(changes) { assert.equal(table, 'store_users'); call.changes = changes; updates.push(call); return this; },
        in(field, ids) { call.in = [field, ids]; return this; },
        order(field, orderOptions) { call.order = [field, orderOptions]; return this; },
        limit(value) { call.limit = value; return this; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            assert.equal(table, 'store_users');
            if (call.selectOptions?.head) return { count: options.countMissing ? null : options.otherActiveAdmins ?? 1,
              error: options.countError ? { message: 'private owner count' } : null };
            targetReads++;
            if (options.targetReadError) return { data: null, error: { message: 'private membership' } };
            let rows = options.targetMemberships ?? [{ store_id: storeId, user_id: invitedId }];
            if (options.unlinkAt && targetReads >= options.unlinkAt) rows = [];
            return { data: rows.filter(row => options.targetLeak || (call.filters.every(([field, value]) => row[field] === value)
              && call.in[1].includes(row[call.in[0]]))), error: null };
          }).then(resolve, reject);
        },
        async maybeSingle() {
          if (options.queryError === table) return { data: null, error: { message: 'private database details' } };
          if (table === 'profiles') {
            const id = call.filters.find(([field]) => field === 'id')[1];
            if (id === invitedId) return { data: options.targetProfileMissing ? null : { id, active: true }, error: null };
            authorizationReads++;
            return { data: options.profileMissing ? null : { id, active: options.profileActive !== false }, error: null };
          }
          if (table === 'store_users') {
            if (call.filters.some(([field]) => field === 'store_id')) {
              const id = call.filters.find(([field]) => field === 'user_id')[1];
              const target = { store_id: options.targetStore ?? storeId, user_id: id,
                role: options.targetRole ?? 'operator', active: options.targetActive !== false };
              if (call.changes) {
                if (options.updateThrows) throw new Error('private database mutation');
                return { data: options.targetChanged ? null : { user_id: id, role: target.role, active: target.active, ...call.changes },
                  error: options.updateError ? { message: 'private mutation' } : null };
              }
              return { data: options.editTargetMissing ? null : target, error: null };
            }
            let rows = options.memberships ?? [{ store_id: storeId, user_id: callerId, role: options.callerRole ?? 'admin', active: options.membershipActive !== false }];
            rows = rows.filter(row => call.filters.every(([field, value]) => row[field] === value))
              .sort((a, b) => a.store_id.localeCompare(b.store_id));
            const row = rows[0];
            const revoked = options.revokeAt && authorizationReads >= options.revokeAt;
            return { data: options.membershipMissing || revoked ? null : row ?? null, error: null };
          }
          const id = call.filters.find(([field]) => field === 'id')[1];
          return { data: options.storeMissing ? null : { id, active: options.storeActive !== false }, error: null };
        },
        async insert(row) {
          assert.equal(table, 'store_users', 'Never insert profiles or any other table');
          inserts.push(row);
          if (options.membershipThrows) throw new Error('private insert details');
          return { error: options.membershipError ? { code: '23505', message: 'private constraint details' } : null };
        },
      };
      return query;
    },
  };
  const handler = createManageStoreUsersHandler({ getAdminClient: () => client,
    allowedOrigins: [origin], inviteRedirectTo: options.redirect ?? redirect });
  const request = async (body = payload, overrides = {}) => {
    const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer caller-jwt', Origin: origin, ...overrides.headers };
    if (overrides.noAuth) delete headers.Authorization;
    if (overrides.noOrigin) delete headers.Origin;
    const method = overrides.method ?? 'POST';
    const response = await handler(new Request('https://edge.example/manage-store-users', { method, headers,
      ...(['POST', 'PUT'].includes(method) ? { body: overrides.rawBody ?? JSON.stringify(body) } : {}) }));
    const json = response.status === 204 ? null : await response.json();
    return { response, json };
  };
  return { handler, request, calls, inserts, invites, authPages, authReads, updates };
}

for (const callerRole of ['admin', 'developer']) for (const role of ['admin', 'operator']) {
  test(`${callerRole} can invite ${role}, with normalized input and server-derived store`, async () => {
    const fake = setup({ callerRole });
    const { response, json } = await fake.request({ ...payload, role });
    assert.equal(response.status, 201);
    assert.deepEqual(json, { success: true, message: 'Convite enviado e usuário vinculado à loja.', user: { id: invitedId, displayName: 'Pessoa convidada', role } });
    assert.deepEqual(fake.inserts, [{ store_id: storeId, user_id: invitedId, role, active: true }]);
    assert.equal(fake.invites[0].email, 'pessoa@example.com');
    assert.equal(fake.invites[0].options.data.display_name, 'Pessoa convidada');
    assert.ok(fake.invites[0].options.data.isbn_invitation_request_id);
    assert.equal(fake.invites[0].options.redirectTo, redirect);
    assert.deepEqual(fake.calls[0], { action: 'getUser', token: 'caller-jwt' });
    const membershipRead = fake.calls.find(call => call.table === 'store_users');
    assert.deepEqual(membershipRead.filters, [['user_id', callerId], ['active', true]]);
    assert.deepEqual(membershipRead.order, ['store_id', { ascending: true }]);
    assert.equal(membershipRead.limit, 1);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.doesNotMatch(JSON.stringify(json), /caller-jwt|service_role|email|user_metadata|store_id/);
  });
}

for (const options of [
  { callerRole: 'operator' }, { callerRole: 'unknown' }, { profileActive: false }, { profileMissing: true },
  { membershipActive: false }, { membershipMissing: true }, { storeActive: false }, { storeMissing: true },
]) {
  test(`Unauthorized caller is 403 without side effects: ${JSON.stringify(options)}`, async () => {
    const fake = setup(options), { response, json } = await fake.request();
    assert.equal(response.status, 403); assert.equal(json.success, false);
    assert.equal(fake.invites.length, 0); assert.equal(fake.inserts.length, 0); assert.equal(fake.authPages.length, 0);
  });
}

test('Another admin membership cannot replace the first operator store selected by UserContext', async () => {
  const fake = setup({ memberships: [
    { store_id: otherStore, user_id: callerId, active: true, role: 'admin' },
    { store_id: storeId, user_id: callerId, active: true, role: 'operator' },
  ] });
  assert.equal((await fake.request()).response.status, 403);
  assert.equal(fake.invites.length, 0);
});

for (const body of [
  { ...payload, role: 'developer' }, { ...payload, role: 'owner' }, { ...payload, role: null },
  { ...payload, displayName: '   ' }, { ...payload, displayName: 'x'.repeat(121) }, { ...payload, displayName: 'Bad\nName' },
  { ...payload, email: 'invalid' }, { ...payload, email: 'bad@@example.com' }, { ...payload, email: 'x'.repeat(255) },
  { ...payload, store_id: otherStore }, { ...payload, actor_id: invitedId }, { ...payload, password: 'not-allowed' },
  { ...payload, redirectTo: 'https://outside.example' }, { ...payload, active: false },
  { ...payload, action: 'delete_user' }, { ...payload, displayName: null }, [], null,
]) {
  test(`Invalid or unsupported payload is rejected before Auth side effects: ${JSON.stringify(body)}`, async () => {
    const fake = setup(), { response, json } = await fake.request(body);
    assert.equal(response.status, 400); assert.equal(json.code, 'invalid_payload');
    assert.equal(fake.authPages.length, 0); assert.equal(fake.invites.length, 0); assert.equal(fake.inserts.length, 0);
  });
}

test('Payload validation preserves destination codes and lowercases only the email', () => {
  assert.deepEqual(validateInvitePayload(payload), { action: 'invite_user', displayName: 'Pessoa convidada', email: 'pessoa@example.com', role: 'operator' });
});

for (const overrides of [{ noAuth: true }, { headers: { Authorization: 'Basic invalid' } }]) {
  test(`Missing/non-Bearer JWT is 401: ${JSON.stringify(overrides)}`, async () => {
    const fake = setup(); assert.equal((await fake.request(payload, overrides)).response.status, 401);
    assert.equal(fake.calls.length, 0);
  });
}

test('Invalid JWT cannot reach database authorization or Auth Admin', async () => {
  const fake = setup({ invalidJwt: true }), { response } = await fake.request();
  assert.equal(response.status, 401); assert.equal(fake.calls.length, 1);
  assert.equal(fake.authPages.length, 0); assert.equal(fake.invites.length, 0);
});

test('CORS preflight is public, only explicit origins are allowed, and direct calls still require a JWT', async () => {
  const fake = setup();
  const preflight = await fake.request(payload, { method: 'OPTIONS', noAuth: true });
  assert.equal(preflight.response.status, 204); assert.equal(fake.calls.length, 0);
  assert.match(preflight.response.headers.get('Access-Control-Allow-Headers'), /authorization/);
  const blocked = await fake.request(payload, { headers: { Origin: 'https://outside.example' } });
  assert.equal(blocked.response.status, 403); assert.equal(blocked.response.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(fake.calls.length, 0);
  const direct = await fake.request(payload, { noOrigin: true, noAuth: true });
  assert.equal(direct.response.status, 401);
});

test('Unsupported methods and malformed JSON/content types are rejected', async () => {
  const fake = setup();
  assert.equal((await fake.request(payload, { method: 'GET' })).response.status, 405);
  assert.equal((await fake.request(payload, { rawBody: '{' })).response.status, 400);
  assert.equal((await fake.request(payload, { headers: { 'Content-Type': 'text/plain' } })).response.status, 400);
  assert.equal(fake.invites.length, 0);
});

test('Existing accounts on any Auth page return a generic conflict without invitation or membership changes', async () => {
  const fake = setup({ accounts: [[{ email: 'unrelated@example.com' }], [{ email: 'PESSOA@example.com' }]] });
  const { response, json } = await fake.request();
  assert.equal(response.status, 409); assert.equal(json.error, 'Já existe uma conta com este e-mail.');
  assert.deepEqual(fake.authPages.map(page => page.page), [1, 2]);
  assert.equal(fake.invites.length, 0); assert.equal(fake.inserts.length, 0);
  assert.doesNotMatch(JSON.stringify(json), /unrelated|store_id|role|password/);
});

test('Unconfirmed account returned in a race cannot receive a new or changed commercial membership', async () => {
  const fake = setup({ reusedAccount: true }), { response, json } = await fake.request();
  assert.equal(response.status, 409); assert.equal(json.code, 'account_exists');
  assert.equal(fake.invites.length, 1); assert.equal(fake.inserts.length, 0);
});

for (const code of ['email_exists', 'user_already_exists', 'email_address_exists']) {
  test(`Auth duplicate code ${code} is a sanitized 409`, async () => {
    const fake = setup({ authError: { code, status: 422, message: 'private Auth details' } });
    const { response, json } = await fake.request();
    assert.equal(response.status, 409); assert.equal(json.code, 'account_exists');
    assert.equal(fake.inserts.length, 0); assert.doesNotMatch(JSON.stringify(json), /private/);
  });
}

for (const options of [{ authError: { code: 'unexpected_failure', status: 500, message: 'private service_role' } }, { authThrows: true }]) {
  test(`Auth failure never reports success or exposes internals: ${JSON.stringify(options)}`, async () => {
    const fake = setup(options), { response, json } = await fake.request();
    assert.ok([502, 503].includes(response.status)); assert.equal(json.success, false);
    assert.equal(fake.inserts.length, 0); assert.doesNotMatch(JSON.stringify(json), /private|service_role|caller-jwt/);
  });
}

for (const options of [{ membershipError: true }, { membershipThrows: true }, { targetProfileMissing: true }, { nullInvitation: true }, { revokeAt: 3 }]) {
  test(`Auth success followed by a failed linkage is explicit partial failure: ${JSON.stringify(options)}`, async () => {
    const fake = setup(options), { response, json } = await fake.request();
    assert.equal(response.status, 502); assert.equal(json.success, false); assert.equal(json.partial, true);
    assert.equal(json.code, 'membership_creation_failed'); assert.match(json.error, /convite foi enviado/);
    assert.match(json.error, /verificação administrativa/);
    assert.equal(fake.invites.length, 1); assert.doesNotMatch(JSON.stringify(json), /private|constraint|caller-jwt/);
  });
}

test('Permission revocation before invitation aborts without any write', async () => {
  const fake = setup({ revokeAt: 2 });
  assert.equal((await fake.request()).response.status, 403);
  assert.equal(fake.invites.length, 0); assert.equal(fake.inserts.length, 0);
});

for (const options of [{ queryError: 'profiles' }, { queryError: 'store_users' }, { queryError: 'stores' }, { accountCheckError: true }, { redirect: 'https://outside.example/?auth=recovery' }, { redirect: '' }]) {
  test(`Lookup/configuration failure is closed and safe: ${JSON.stringify(options)}`, async () => {
    const fake = setup(options), { response, json } = await fake.request();
    assert.equal(response.status, 503); assert.equal(json.success, false);
    assert.equal(fake.invites.length, 0); assert.equal(fake.inserts.length, 0);
    assert.doesNotMatch(JSON.stringify(json), /private/);
  });
}

test('Entry point keeps server-only secrets and a pinned Deno import; frontend invokes without admin credentials', () => {
  const index = readFileSync('supabase/functions/manage-store-users/index.ts', 'utf8');
  const handler = readFileSync('supabase/functions/manage-store-users/handler.ts', 'utf8');
  const deno = JSON.parse(readFileSync('supabase/functions/manage-store-users/deno.json', 'utf8'));
  assert.equal(deno.imports['@supabase/supabase-js'], 'npm:@supabase/supabase-js@2.117.2');
  assert.match(index, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(index, /persistSession: false, autoRefreshToken: false, detectSessionInUrl: false/);
  assert.doesNotMatch(index + handler, /console\.|\bVITE_[A-Z_]+|\.upsert\(|deleteUser\(|updateUserById\(|createUser\(/);
  const frontend = readFileSync('src/services/usersService.ts', 'utf8');
  assert.doesNotMatch(frontend, /service_role|SUPABASE_SERVICE_ROLE_KEY|auth\.admin|\.insert\(|\.upsert\(/);
  assert.match(frontend, /functions\.invoke\('manage-store-users'/);
});

const statusPayload = { action: 'get_invitation_status', userIds: [invitedId] };

for (const callerRole of ['admin', 'developer']) test(`${callerRole} reads only minimal invitation status without any write or directory scan`, async () => {
  const fake = setup({ callerRole, redirect: '' });
  const { response, json } = await fake.request(statusPayload);
  assert.equal(response.status, 200);
  assert.deepEqual(json, { success: true, users: [{ id: invitedId, invitePending: true }] });
  assert.deepEqual(fake.authReads, [invitedId]);
  assert.equal(fake.invites.length + fake.inserts.length + fake.authPages.length, 0);
  const targets = fake.calls.filter(call => call.in);
  assert.equal(targets.length, 2);
  for (const call of targets) {
    assert.equal(call.columns, 'store_id,user_id');
    assert.deepEqual(call.filters, [['store_id', storeId]]);
    assert.deepEqual(call.in, ['user_id', [invitedId]]);
  }
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.doesNotMatch(JSON.stringify(json), /private|secret|metadata|email|confirmed|invited_at|jwt|store_id/);
});

for (const [options, pending] of [
  [{ confirmed: true }, false], [{ invited: false }, false], [{ signedIn: true }, true],
  [{ legacyConfirmed: true }, true], [{ confirmed: true, signedIn: false }, false],
]) test(`Native email invitation confirmation, independent of legacy/login fields: ${JSON.stringify(options)}`, async () => {
  const fake = setup(options), { json } = await fake.request(statusPayload);
  assert.deepEqual(json.users, [{ id: invitedId, invitePending: pending }]);
});

for (const options of [
  { callerRole: 'operator' }, { profileActive: false }, { membershipActive: false },
  { storeActive: false }, { invalidJwt: true },
]) test(`Status query rejects unauthorized caller before reading Auth: ${JSON.stringify(options)}`, async () => {
  const fake = setup(options), { response } = await fake.request(statusPayload);
  assert.equal(response.status, options.invalidJwt ? 401 : 403);
  assert.equal(fake.authReads.length + fake.invites.length + fake.inserts.length + fake.authPages.length, 0);
});

for (const body of [
  { ...statusPayload, userIds: [] }, { ...statusPayload, userIds: 'not-an-array' },
  { ...statusPayload, userIds: [invitedId, invitedId] }, { ...statusPayload, userIds: ['invalid'] },
  { ...statusPayload, userIds: [null] }, { ...statusPayload, userIds: Array(101).fill(invitedId) },
  { ...statusPayload, store_id: otherStore }, { ...statusPayload, actor_id: callerId },
]) test(`Status payload rejects invalid scope/IDs (${Object.keys(body).join(',')}/${body.userIds?.length})`, async () => {
  const fake = setup(), { response } = await fake.request(body);
  assert.equal(response.status, 400);
  assert.equal(fake.authReads.length + fake.invites.length + fake.inserts.length + fake.authPages.length, 0);
});

test('A mixed-store request is rejected entirely, without checking any target in Auth', async () => {
  const fake = setup({ targetMemberships: [
    { store_id: storeId, user_id: invitedId }, { store_id: otherStore, user_id: callerId },
  ], targetLeak: true });
  const { response, json } = await fake.request({ ...statusPayload, userIds: [invitedId, callerId] });
  assert.equal(response.status, 403); assert.equal(fake.authReads.length, 0);
  assert.doesNotMatch(JSON.stringify(json), /33333333|44444444|11111111/);
});

for (const options of [
  { targetReadError: true }, { statusError: true }, { statusThrows: true }, { authUserMissing: true },
]) test(`Status dependency failure has no false success or sensitive detail: ${JSON.stringify(options)}`, async () => {
  const fake = setup(options), { response, json } = await fake.request(statusPayload);
  assert.equal(response.status, 503); assert.equal(json.success, false); assert.equal(json.code, 'status_unavailable');
  assert.doesNotMatch(JSON.stringify(json), /private|service_role|jwt|users/);
  assert.equal(fake.invites.length + fake.inserts.length + fake.authPages.length, 0);
});

for (const options of [{ revokeAt: 2 }, { unlinkAt: 2 }]) test(`Revocation/unlink before response prevents status disclosure: ${JSON.stringify(options)}`, async () => {
  const fake = setup(options), { response, json } = await fake.request(statusPayload);
  assert.equal(response.status, 403); assert.equal(json.users, undefined);
});

test('A maximum-size status batch reads only the requested store users', async () => {
  const ids = Array.from({ length: 100 }, (_, i) => `44444444-4444-4444-4444-${String(i).padStart(12, '0')}`);
  const fake = setup({ targetMemberships: ids.map(user_id => ({ store_id: storeId, user_id })) });
  const { response, json } = await fake.request({ ...statusPayload, userIds: ids });
  assert.equal(response.status, 200); assert.equal(json.users.length, 100);
  assert.deepEqual(fake.authReads, ids); assert.equal(fake.authPages.length, 0);
});

const editPayload = { action: 'update_user', targetUserId: invitedId };
for (const callerRole of ['admin', 'developer']) for (const [targetRole, role] of [['operator', 'admin'], ['admin', 'operator']]) {
  test(`${callerRole} edits ${targetRole} to ${role} in its own store only`, async () => {
    const fake = setup({ callerRole, targetRole, redirect: '' }), { response, json } = await fake.request({ ...editPayload, role });
    assert.equal(response.status, 200);
    assert.deepEqual(json, { success: true, user: { id: invitedId, role, active: true } });
    assert.equal(fake.updates.length, 1); assert.deepEqual(fake.updates[0].changes, { role });
    assert.deepEqual(fake.updates[0].filters, [['store_id', storeId], ['user_id', invitedId], ['role', targetRole], ['active', true]]);
    assert.equal(fake.invites.length + fake.inserts.length + fake.authPages.length + fake.authReads.length, 0);
    assert.doesNotMatch(JSON.stringify(json), /jwt|metadata|store_id|email|password/);
  });
}

for (const [targetRole, targetActive, active] of [['operator', true, false], ['operator', false, true], ['admin', true, false], ['admin', false, true]]) {
  test(`Membership activation ${targetRole}: ${targetActive} to ${active} never touches profiles/Auth`, async () => {
    const fake = setup({ targetRole, targetActive }), { response, json } = await fake.request({ ...editPayload, active });
    assert.equal(response.status, 200); assert.equal(json.user.active, active); assert.equal(json.user.role, targetRole);
    assert.deepEqual(fake.updates[0].changes, { active });
    assert.equal(fake.updates[0].table, 'store_users');
    assert.equal(fake.invites.length + fake.inserts.length + fake.authPages.length + fake.authReads.length, 0);
  });
}

for (const change of [{ active: false }, { role: 'operator' }, { role: 'operator', active: false }]) {
  test(`Last active owner is protected for ${JSON.stringify(change)}, even from developer`, async () => {
    for (const callerRole of ['admin', 'developer']) {
      const fake = setup({ callerRole, targetRole: 'admin', otherActiveAdmins: 0 });
      const { response, json } = await fake.request({ ...editPayload, ...change });
      assert.equal(response.status, 409); assert.equal(json.code, 'last_active_admin');
      assert.equal(json.error, 'Não é possível alterar este usuário porque a loja precisa manter pelo menos um Proprietário ativo.');
      assert.equal(fake.updates.length, 0);
      const count = fake.calls.find(call => call.selectOptions?.head);
      assert.deepEqual(count.selectOptions, { count: 'exact', head: true });
      assert.deepEqual(count.filters, [['store_id', storeId], ['role', 'admin'], ['active', true], ['profiles.active', true]]);
      assert.deepEqual(count.exclusions, ['user_id', invitedId]);
    }
  });
}

test('Self demotion/deactivation requires another effective active owner, and developer cannot edit itself', async () => {
  for (const otherActiveAdmins of [0, 1]) for (const changes of [{ role: 'operator' }, { active: false }]) {
    const fake = setup({ targetRole: 'admin', otherActiveAdmins });
    const { response } = await fake.request({ ...editPayload, targetUserId: callerId, ...changes });
    assert.equal(response.status, otherActiveAdmins ? 200 : 409);
    assert.equal(fake.updates.length, otherActiveAdmins);
  }
  const fake = setup({ callerRole: 'developer', targetRole: 'developer' });
  assert.equal((await fake.request({ ...editPayload, targetUserId: callerId, active: false })).json.code, 'developer_not_editable');
  assert.equal(fake.updates.length, 0);
});

for (const options of [
  { callerRole: 'operator' }, { profileActive: false }, { profileMissing: true }, { membershipActive: false },
  { membershipMissing: true }, { storeActive: false }, { storeMissing: true }, { invalidJwt: true }, { revokeAt: 2 },
]) test(`Update caller authorization fails closed: ${JSON.stringify(options)}`, async () => {
  const fake = setup(options), { response } = await fake.request({ ...editPayload, active: false });
  assert.equal(response.status, options.invalidJwt ? 401 : 403); assert.equal(fake.updates.length, 0);
});

for (const options of [{ targetRole: 'developer' }, { targetRole: 'developer', callerRole: 'developer' }]) {
  test(`Developer target cannot be updated by direct backend call: ${JSON.stringify(options)}`, async () => {
    const fake = setup(options), { response, json } = await fake.request({ ...editPayload, role: 'operator', active: false });
    assert.equal(response.status, 403); assert.equal(json.code, 'developer_not_editable'); assert.equal(fake.updates.length, 0);
  });
}

test('Missing target and target from another store receive the same sanitized not-found response', async () => {
  const results = [];
  for (const options of [{ editTargetMissing: true }, { targetStore: otherStore }]) {
    const fake = setup(options), { response, json } = await fake.request({ ...editPayload, active: true });
    assert.equal(response.status, 404); results.push(json); assert.equal(fake.updates.length, 0);
    assert.doesNotMatch(JSON.stringify(json), /33333333|email|role|active/);
  }
  assert.deepEqual(results[0], results[1]);
});

for (const changes of [
  { role: 'developer' }, { role: null }, { role: 'owner' }, { active: 'false' }, { active: null },
  { targetUserId: 'invalid', role: 'admin' }, { targetUserId: null, active: false }, {},
  { role: 'admin', store_id: otherStore }, { role: 'admin', actor_id: callerId },
  { active: false, email: 'private@example.com' }, { active: false, password: 'private' },
  { active: false, profiles: { active: false } },
]) test(`Strict update contract rejects ${JSON.stringify(changes)} without mutation`, async () => {
  const fake = setup(), { response } = await fake.request({ ...editPayload, ...changes });
  assert.equal(response.status, 400); assert.equal(fake.updates.length, 0);
});

for (const options of [
  { queryError: 'store_users' }, { countError: true, targetRole: 'admin' }, { countMissing: true, targetRole: 'admin' },
  { updateError: true }, { updateThrows: true },
]) test(`Update dependency failure is sanitized: ${JSON.stringify(options)}`, async () => {
  const fake = setup(options), { response, json } = await fake.request({ ...editPayload, active: false });
  assert.equal(response.status, 503); assert.equal(json.success, false); assert.doesNotMatch(JSON.stringify(json), /private|stack|service_role/);
});

test('Concurrent target change, including promotion to developer, cannot be overwritten', async () => {
  const fake = setup({ targetChanged: true }), { response, json } = await fake.request({ ...editPayload, active: false });
  assert.equal(response.status, 409); assert.equal(json.code, 'target_changed');
  assert.deepEqual(fake.updates[0].filters.slice(-2), [['role', 'operator'], ['active', true]]);
});

test('Simultaneous role and activation patch returns only the final commercial membership', async () => {
  const fake = setup({ targetRole: 'operator', targetActive: false });
  const { response, json } = await fake.request({ ...editPayload, role: 'admin', active: true });
  assert.equal(response.status, 200); assert.deepEqual(fake.updates[0].changes, { role: 'admin', active: true });
  assert.deepEqual(json.user, { id: invitedId, role: 'admin', active: true });
});
