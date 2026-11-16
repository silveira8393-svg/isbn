import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mfaToken } from './helpers/mfa.mjs';

const output = await build({ stdin: { resolveDir: process.cwd(), contents: `
  export * from './server/mfaAuthorization';
  export * from './server/amazonAuthorization';
  export {authorize} from './server/spapi/store';
  export {createManageStoreUsersHandler} from './supabase/functions/manage-store-users/handler';
  export {createMagazordCategoriesFunction} from './server/magazordCategories';
  export {createMagazordProductsFunction} from './server/magazordProducts';
  export {default as google} from './api/google-books';
  export {default as gallery} from './api/curitiba/gallery';
  export {default as link} from './api/curitiba/product-link';
` }, bundle: true, write: false, format: 'esm', platform: 'node' });
const api = await import('data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64'));
const uid = '11111111-1111-4111-8111-111111111111';
const env = { SUPABASE_URL: 'https://auth.invalid', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture' };
const request = (token, path = '/api/google-books?isbn=9788550303628') => new Request('https://isbn.invalid' + path,
  { headers: token ? { Authorization: `Bearer ${token}` } : {} });

test('HTTP boundary denies missing, aal1, malformed and mismatched tokens before the source handler', async () => {
  let sourceCalls = 0, authCalls = 0;
  const h = api.withMfa(async () => { sourceCalls++; return Response.json({ ok: true }); }, { env,
    fetcher: async () => { authCalls++; return Response.json({ id: uid }); } });
  assert.equal((await h(request(null))).status, 401);
  for (const token of [mfaToken(uid, 'aal1'), mfaToken(uid, null),
    mfaToken('22222222-2222-4222-8222-222222222222'), 'malformed-token-for-test']) {
    assert.equal((await h(request(token))).status, 403);
  }
  assert.equal(sourceCalls, 0);
  const good = await h(request(mfaToken(uid)));
  assert.equal(good.status, 200); assert.equal(sourceCalls, 1);
  assert.equal(good.headers.get('vary'), 'Authorization'); assert.ok(authCalls > 0);
});

test('forged aal2 is not accepted when Supabase rejects the exact token', async () => {
  let reached = false;
  const h = api.withMfa(async () => { reached = true; return Response.json({}); }, { env,
    fetcher: async () => new Response('', { status: 401 }) });
  assert.equal((await h(request(mfaToken(uid)))).status, 401); assert.equal(reached, false);
});

test('Auth outage and administrative/malformed configuration fail closed', async () => {
  for (const badEnv of [{ ...env, SUPABASE_URL: 'http://auth.invalid' }, { ...env, SUPABASE_PUBLISHABLE_KEY: 'sb_secret_wrong' }, {}]) {
    const h = api.withMfa(() => assert.fail('source'), { env: badEnv, fetcher: () => assert.fail('auth') });
    assert.equal((await h(request(mfaToken(uid)))).status, 503);
  }
  const h = api.withMfa(() => assert.fail('source'), { env, fetcher: async () => { throw new Error('private upstream'); } });
  const response = await h(request(mfaToken(uid))); assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /private/);
});

test('each deployed source entry denies unauthenticated direct HTTP requests', async () => {
  for (const entry of [api.google, api.gallery, api.link]) assert.equal((await entry.fetch(request(null))).status, 401);
});

test('each deployed source entry rejects direct aal1 requests even with client MFA flags', async t => {
  const previous = [process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY];
  Object.assign(process.env, env);
  t.after(() => { for (const [index, name] of ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'].entries()) {
    if (previous[index] === undefined) delete process.env[name]; else process.env[name] = previous[index];
  } });
  t.mock.method(globalThis, 'fetch', async url => { assert.equal(new URL(url).pathname, '/auth/v1/user'); return Response.json({ id: uid }); });
  for (const entry of [api.google, api.gallery, api.link]) {
    const req = request(mfaToken(uid, 'aal1')); req.headers.set('x-mfa-verified', 'true');
    const response = await entry.fetch(req); assert.equal(response.status, 403); assert.equal((await response.json()).code, 'mfa_required');
  }
});

test('Amazon/Magazord and SP-API reject aal1 before data, credentials or upstream access', async () => {
  const req = request(mfaToken(uid, 'aal1'));
  let calls = 0;
  const fetcher = async url => { calls++; assert.equal(new URL(url).pathname, '/auth/v1/user'); return Response.json({ id: uid }); };
  await assert.rejects(api.authorizeAmazonDeveloper(req, env, fetcher), e => e.status === 403 && e.code === 'mfa_required');
  await assert.rejects(api.authorizeAmazonSearch(req, env, fetcher), e => e.status === 403 && e.code === 'mfa_required');
  await assert.rejects(api.authorize(req, { supabase: env.SUPABASE_URL, publishable: env.SUPABASE_PUBLISHABLE_KEY },
    { active: () => assert.fail('privileged read') }, fetcher), e => e.status === 403 && e.code === 'mfa_required');
  assert.equal(calls, 3);
});

test('administrative Edge Function rejects aal1 before any privileged query or mutation', async () => {
  const handler = api.createManageStoreUsersHandler({ allowedOrigins: ['https://isbn.invalid'], inviteRedirectTo: 'https://isbn.invalid/?auth=recovery',
    getAuthClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: uid } }, error: null }) } }),
    getAdminClient: () => assert.fail('privileged client before MFA') });
  const response = await handler(new Request('https://edge.invalid/manage-store-users', { method: 'POST',
    headers: { Origin: 'https://isbn.invalid', Authorization: `Bearer ${mfaToken(uid, 'aal1')}`, 'Content-Type': 'application/json' }, body: '{}' }));
  assert.equal(response.status, 403); assert.equal((await response.json()).code, 'mfa_required');
});

test('direct Magazord category and product requests reject aal1 without calling Magazord', async () => {
  const store = '22222222-2222-4222-8222-222222222222'; let calls = 0;
  const options = { env: { ...env, MAGAZORD_STORE_ID: store }, fetcher: async url => {
    calls++; assert.equal(new URL(url).pathname, '/auth/v1/user'); return Response.json({ id: uid });
  } };
  for (const [handler, path] of [
    [api.createMagazordCategoriesFunction(options), '/api/magazord/categories'],
    [api.createMagazordProductsFunction(options), '/api/magazord/products?kind=child&value=FIXTURE-U-001'],
  ]) {
    const req = request(mfaToken(uid, 'aal1'), path); req.headers.set('x-isbn-store-id', store);
    assert.equal((await handler(req)).status, 403);
  }
  assert.equal(calls, 2);
});

const components = await build({ stdin: { resolveDir: process.cwd(), contents: `export {default as MfaChallenge} from './src/components/MfaChallenge';export {default as Login} from './src/components/Login';` },
  bundle: true, write: false, format: 'cjs', platform: 'node', jsx: 'automatic', plugins: [{ name: 'ui-runtime', setup(b) {
    b.onResolve({ filter: /^react$|^react\/jsx-runtime$|\/lib\/supabase$|^lucide-react$/ }, a => ({ path: a.path, namespace: 'mock' }));
    b.onLoad({ filter: /.*/, namespace: 'mock' }, a => ({ contents: a.path === 'react' ? 'module.exports=deps.react' : a.path === 'react/jsx-runtime' ? 'exports.jsx=exports.jsxs=(type,props)=>({type,props})' : a.path === 'lucide-react' ? 'exports.BookOpen="icon"' : 'exports.supabase=deps.sdk' }));
  } }] });
function mount(sdk, component = 'MfaChallenge') {
  const slots = []; let cursor = 0, effects = [], tree, verified = 0, signedOut = 0;
  const react = { useRef: initial => slots[cursor++] ??= { current: initial },
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useEffect(callback, dependencies) { const i = cursor++, old = slots[i]; if (!old || dependencies.some((v, j) => !Object.is(v, old.dependencies[j]))) effects.push(() => { old?.cleanup?.(); slots[i] = { dependencies, callback, cleanup: callback() }; }); } };
  const module = { exports: {} }; new Function('deps', 'module', 'exports', components.outputFiles[0].text)({ react, sdk }, module, module.exports);
  const render = () => { cursor = 0; effects = []; tree = module.exports[component]({ userId: uid, onVerified: () => verified++, onSignOut: async () => signedOut++, message: null }); effects.forEach(e => e()); };
  const nodes = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(nodes) : [n, ...nodes(n.props?.children)];
  const text = n => n == null || typeof n === 'boolean' ? '' : typeof n !== 'object' ? String(n) : Array.isArray(n) ? n.map(text).join('') : text(n.props?.children);
  render();
  return { render, async settle() { for (let i = 0; i < 16; i++) { await Promise.resolve(); render(); } },
    replay() { for (const s of slots) if (s?.callback) { s.cleanup?.(); s.cleanup = s.callback(); } },
    unmount() { for (const s of slots) s?.cleanup?.(); },
    text: () => text(tree), nodes: () => nodes(tree), verified: () => verified,
    change(id, value) { nodes(tree).find(n => n.props?.id === id).props.onChange({ target: { value } }); render(); },
    async submit() { await nodes(tree).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); render(); } };
}
function fakeMfa({ enrolled = false, wrong = false, interrupted = false } = {}) {
  const calls = [];
  return { calls, auth: { getSession: async () => ({ data: { session: { user: { id: uid } } }, error: null }), mfa: {
    listFactors: async () => ({ data: { totp: enrolled ? [{ id: 'existing', status: 'verified' }] : [], all: interrupted ? [{ id: 'old', factor_type: 'totp', status: 'unverified' }] : [] }, error: null }),
    unenroll: async args => { calls.push(['unenroll', args]); return { error: null }; },
    enroll: async args => { calls.push(['enroll', args]); return { data: { id: 'new', totp: { qr_code: '<svg/>', secret: 'SYNTHETICMANUALKEY' } }, error: null }; },
    challengeAndVerify: async args => { calls.push(['verify', args]); return { data: {}, error: wrong ? { status: 400 } : null }; },
  } } };
}

test('first enrollment shows QR/manual key, survives StrictMode replay and confirms only six digits', async () => {
  const sdk = fakeMfa(), view = mount(sdk); view.replay(); await view.settle();
  assert.equal(sdk.calls.filter(c => c[0] === 'enroll').length, 1);
  assert.match(view.text(), /SYNTHETICMANUALKEY/); assert.ok(view.nodes().some(n => n.type === 'img' && n.props.src.startsWith('data:image/svg+xml')));
  view.change('mfa-code', '123'); await view.submit(); assert.equal(view.verified(), 0); assert.equal(sdk.calls.filter(c => c[0] === 'verify').length, 0);
  view.change('mfa-code', '012345'); await view.submit(); assert.equal(view.verified(), 1);
  assert.deepEqual(sdk.calls.at(-1), ['verify', { factorId: 'new', code: '012345' }]);
  assert.doesNotMatch(view.text(), /SYNTHETICMANUALKEY/);
});

test('incorrect code stays blocked; an existing authenticator never enrolls a new factor', async () => {
  const sdk = fakeMfa({ enrolled: true, wrong: true }), view = mount(sdk); await view.settle();
  assert.equal(sdk.calls.length, 0); view.change('mfa-code', '999999'); await view.submit();
  assert.equal(view.verified(), 0); assert.match(view.text(), /Não foi possível validar/);
  assert.equal(view.nodes().find(n => n.props?.id === 'mfa-code').props.value, '');
});

test('page reload with incomplete enrollment replaces only the unverified TOTP', async () => {
  const sdk = fakeMfa({ interrupted: true }), view = mount(sdk); await view.settle();
  assert.deepEqual(sdk.calls.map(c => c[0]), ['unenroll', 'enroll']); assert.deepEqual(sdk.calls[0][1], { factorId: 'old' });
});

test('enrollment never continues after leaving the screen or switching user', async () => {
  let release;
  const sdk = fakeMfa(), pending = new Promise(resolve => { release = resolve; });
  sdk.auth.mfa.listFactors = () => pending;
  const view = mount(sdk); await view.settle(); view.unmount();
  release({ data: { totp: [], all: [] }, error: null });
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.equal(sdk.calls.length, 0);
  const switched = fakeMfa(); switched.auth.getSession = async () => ({ data: { session: { user: { id: 'another-user' } } }, error: null });
  const otherView = mount(switched); await otherView.settle();
  assert.equal(switched.calls.length, 0); assert.match(otherView.text(), /Não foi possível preparar/);
});

test('MFA setup network failure can retry without opening the application', async () => {
  const sdk = fakeMfa(); let failures = 1;
  const original = sdk.auth.mfa.listFactors;
  sdk.auth.mfa.listFactors = () => failures-- > 0 ? Promise.reject(new Error('private network detail')) : original();
  const view = mount(sdk); await view.settle(); assert.equal(view.verified(), 0);
  assert.match(view.text(), /Não foi possível preparar/); assert.doesNotMatch(view.text(), /private network/);
  view.nodes().find(n => n.type === 'button' && n.props.children === 'Tentar novamente').props.onClick();
  await view.settle(); assert.match(view.text(), /SYNTHETICMANUALKEY/); assert.equal(view.verified(), 0);
});

test('existing email/password form still submits to Supabase without a replacement login', async () => {
  const calls = [], view = mount({ auth: { signInWithPassword: async args => { calls.push(args); return { error: null }; } } }, 'Login');
  view.change('login-email', ' pessoa@example.invalid '); view.change('login-password', 'synthetic-password'); await view.submit();
  assert.deepEqual(calls, [{ email: 'pessoa@example.invalid', password: 'synthetic-password' }]);
});
