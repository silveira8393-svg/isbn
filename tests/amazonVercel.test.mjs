import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const built = await build({ stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
  export { createAmazonFunction } from './server/amazonFunction';
  export { authorizeAmazonDeveloper } from './server/amazonAuthorization';
  export { LabError } from './experimentos/amazon/consulta_amazon';
  export { default as entry } from './api/amazon';
` }, bundle: true, write: false, metafile: true, format: 'esm', platform: 'node', target: 'node24' });
const { createAmazonFunction, authorizeAmazonDeveloper, LabError, entry } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
const isbn = '9788501014863';
const html = await readFile('experimentos/amazon/tests/fixtures/amazon_estrangeiro_9788501014863_galeria_sanitizada.html', 'utf8');
const uid = '11111111-1111-4111-8111-111111111111', store = '22222222-2222-4222-8222-222222222222';
const token = 'session-for-local-automated-test-only';
const env = { SUPABASE_URL: 'https://auth.example.invalid', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic' };
const request = (body, options = {}) => new Request('https://preview.example.invalid/api/amazon' + (options.query || ''), {
  method: body === undefined ? 'GET' : 'POST', headers: { authorization: `Bearer ${token}`,
    ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...options.headers },
  ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
});
function authFetcher(overrides = {}) {
  const calls = [];
  const data = { '/auth/v1/user': { id: uid, user_metadata: { role: 'developer' } },
    '/rest/v1/profiles': [{ id: uid, active: true }],
    '/rest/v1/store_users': [{ user_id: uid, store_id: store, active: true, role: 'developer' }],
    '/rest/v1/stores': [{ id: store }], ...overrides };
  return { calls, fetch: async (url, init) => {
    const parsed = new URL(url); calls.push({ url: parsed, init });
    assert.equal(parsed.origin, env.SUPABASE_URL);
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${token}`);
    assert.equal(init.headers.apikey, env.SUPABASE_PUBLISHABLE_KEY);
    return data[parsed.pathname] instanceof Response ? data[parsed.pathname] : Response.json(data[parsed.pathname]);
  } };
}
function harness(options = {}) {
  const logs = [], queries = [];
  const auth = authFetcher(options.authData);
  const handler = createAmazonFunction({ env,
    authorize: (req, settings) => authorizeAmazonDeveloper(req, settings, auth.fetch),
    log: line => logs.push(line), fetchHtml: async value => { queries.push(value); return { html, status_http: 200 }; }, ...options });
  return { handler, logs, queries, auth };
}

test('Node 24 Web Standard entry bundles without local server, filesystem, Python or subprocesses', () => {
  assert.equal(typeof entry.fetch, 'function');
  assert.ok(!Object.keys(built.metafile.inputs).some(file => /servidor_laboratorio|runtime_typescript|servico_typescript/.test(file)));
  assert.doesNotMatch(built.outputFiles[0].text, /from ["']node:(?:fs|child_process)|\.listen\(/);
});

test('health and search deny missing or invalid bearer before reading Amazon', async () => {
  const h = harness();
  for (const headers of [{ authorization: '' }, { authorization: 'Bearer bad' }, { authorization: '', 'x-role': 'developer' }]) {
    assert.equal((await h.handler(request(undefined, { headers }))).status, 401);
    assert.equal((await h.handler(request({ isbn }, { headers }))).status, 401);
  }
  assert.equal(h.queries.length, 0); assert.equal(h.auth.calls.length, 0);
});

test('authorization validates Auth and fresh profile, membership and store with GET under the caller token', async () => {
  const h = harness(); const response = await h.handler(request());
  assert.equal(response.status, 200); assert.equal(h.auth.calls.length, 4); assert.equal(h.queries.length, 0);
  const membership = h.auth.calls.find(call => call.url.pathname.endsWith('store_users'));
  assert.equal(membership.url.searchParams.get('user_id'), `eq.${uid}`);
  assert.equal(membership.url.searchParams.get('limit'), '1');
  assert.equal(membership.url.searchParams.get('order'), 'store_id.asc');
  assert.deepEqual((await response.json()).fixtures, []);
});

test('admin, operator, inactive, anonymous, removed or mismatched identities cannot consult', async () => {
  const cases = [
    { '/auth/v1/user': { id: uid, is_anonymous: true } },
    { '/auth/v1/user': { id: 'invalid' } },
    { '/rest/v1/profiles': [] },
    { '/rest/v1/profiles': [{ id: uid, active: false }] },
    { '/rest/v1/profiles': [{ id: store, active: true }] },
    { '/rest/v1/store_users': [] },
    ...['admin', 'operator'].map(role => ({ '/rest/v1/store_users': [{ user_id: uid, store_id: store, active: true, role }] })),
    { '/rest/v1/store_users': [{ user_id: uid, store_id: store, active: false, role: 'developer' }] },
    { '/rest/v1/store_users': [{ user_id: store, store_id: store, active: true, role: 'developer' }] },
    { '/rest/v1/stores': [] },
  ];
  for (const authData of cases) {
    const h = harness({ authData });
    assert.equal((await h.handler(request({ isbn }))).status, 403, JSON.stringify(authData));
    assert.equal(h.queries.length, 0);
  }
});

test('expired tokens, auth failures and malformed Auth responses fail closed', async () => {
  for (const [upstream, status] of [[401, 401], [500, 503]]) {
    const h = harness({ authData: { '/auth/v1/user': new Response('private upstream data', { status: upstream }) } });
    const response = await h.handler(request({ isbn }));
    assert.equal(response.status, status); assert.doesNotMatch(await response.text(), /private upstream/); assert.equal(h.queries.length, 0);
  }
  const bad = harness({ authData: { '/auth/v1/user': new Response('<html>private</html>') } });
  assert.equal((await bad.handler(request({ isbn }))).status, 503);
  assert.equal(bad.queries.length, 0);
});

test('configuration never accepts a secret key or insecure auth URL', async () => {
  for (const settings of [{}, { ...env, SUPABASE_URL: 'http://auth.example.invalid' }, { ...env, SUPABASE_PUBLISHABLE_KEY: 'sb_secret_synthetic' }]) {
    await assert.rejects(authorizeAmazonDeveloper(request(), settings, async () => assert.fail('Do not send token')), error => error.status === 503);
  }
});

test('real extractor returns one cover, three additional images, provenance and sanitized diagnostics', async () => {
  const h = harness(); const response = await h.handler(request({ isbn, modo: 'http' }));
  const result = await response.json();
  assert.equal(response.status, 200); assert.deepEqual(h.queries, [isbn]);
  assert.equal(result.correspondencia, 'corresponde'); assert.equal(Object.keys(result.campos).length, 9);
  assert.equal(result.imagens.itens.filter(item => item.papel === 'principal').length, 1);
  assert.equal(result.imagens.itens.filter(item => item.papel === 'adicional').length, 3);
  assert.equal(result.book_info.additionalImages.length, 3);
  assert.ok(result.imagens.itens.every(item => item.origem));
  assert.equal(result.diagnostico.status_http, 200); assert.equal(result.diagnostico.codigo, 'completed');
  assert.ok(result.diagnostico.duracao_ms >= 0); assert.equal(response.headers.get('x-isbn-request-id'), result.diagnostico.id);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.doesNotMatch(h.logs.join(''), new RegExp(`${token}|${isbn}|${uid}|landingImage|<html|referencia`));
});

test('invalid ISBN, arrays, custom URL, batch fields and remote fixtures never reach transport', async () => {
  const h = harness();
  for (const [payload, status] of [[{ isbn: 'invalid' }, 422], [[isbn], 400], [{ isbn, url: 'https://other.invalid' }, 400],
    [{ isbn, role: 'developer' }, 400], [{ isbn, modo: 'fixture' }, 400]]) {
    assert.equal((await h.handler(request(payload))).status, status);
  }
  assert.equal(h.queries.length, 0);
});

test('method, cross-origin, body, content type and route controls are enforced', async () => {
  const h = harness();
  assert.equal((await h.handler(new Request('https://preview.example.invalid/api/amazon', { method: 'OPTIONS' }))).status, 405);
  assert.equal((await h.handler(request(undefined, { headers: { origin: 'https://other.invalid' } }))).status, 403);
  assert.equal((await h.handler(request(undefined, { headers: { 'sec-fetch-site': 'cross-site' } }))).status, 403);
  assert.equal((await h.handler(request('{bad'))).status, 400);
  assert.equal((await h.handler(request('x'.repeat(1025)))).status, 413);
  assert.equal((await h.handler(request('x'.repeat(1025), { headers: { 'content-length': '1' } }))).status, 413);
  assert.equal((await h.handler(request({ isbn }, { headers: { 'content-type': 'text/plain' } }))).status, 415);
  assert.equal((await h.handler(request(undefined, { query: '?acao=search' }))).status, 404);
  assert.equal((await h.handler(request(undefined, { query: '?acao=health&acao=search' }))).status, 404);
  assert.equal(h.queries.length, 0);
});

test('HTTP blocks, CAPTCHA and unexpected content stop without retry or raw body', async () => {
  for (const [status, message, code] of [[403, 'Resposta não 200', 'amazon_http'], [429, 'Resposta não 200', 'amazon_http'],
    [302, 'Resposta não 200', 'amazon_http'], [200, 'CAPTCHA ou restrição detectada', 'amazon_captcha'], [200, 'Resposta sem HTML', 'amazon_unexpected']]) {
    let count = 0;
    const h = harness({ fetchHtml: async () => { count++; return { html: null, status_http: status, mensagem: message }; } });
    const response = await h.handler(request({ isbn })), result = await response.json();
    assert.equal(result.status, 'interrompida'); assert.equal(result.diagnostico.status_http, status);
    assert.equal(result.diagnostico.codigo, code); assert.equal(count, 1); assert.equal(result.book_info, undefined);
  }
});

test('timeout, network failure and internal exception are sanitized in response and logs', async () => {
  for (const [error, status, code] of [[new LabError(502, 'Falha de transporte.', 'timeout'), 504, 'timeout'],
    [new LabError(502, 'Falha de transporte.', 'amazon_transport'), 502, 'amazon_transport'],
    [new Error('token secret private stack'), 500, 'internal_error']]) {
    const h = harness({ fetchHtml: async () => { throw error; } });
    const response = await h.handler(request({ isbn })), body = await response.json();
    assert.equal(response.status, status); assert.equal(body.diagnostico.codigo, code);
    assert.doesNotMatch(JSON.stringify(body) + h.logs.join(''), /token secret private stack/);
  }
});

test('concurrent calls in one instance are rejected without a queue; next call works', async () => {
  let finish, begin;
  const started = new Promise(resolve => { begin = resolve; });
  const h = harness({ fetchHtml: async () => { begin(); return new Promise(resolve => { finish = resolve; }); } });
  const pending = h.handler(request({ isbn })); await started;
  assert.equal((await h.handler(request({ isbn }))).status, 409);
  finish({ html, status_http: 200 }); assert.equal((await pending).status, 200);
});
