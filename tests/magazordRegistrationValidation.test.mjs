import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mfaToken } from './helpers/mfa.mjs';

const bundled = await build({ stdin: { resolveDir: process.cwd(), contents: `
  export * from './shared/magazordRegistration';
  export * from './server/magazordRegistration';
` }, bundle: true, write: false, platform: 'node', format: 'esm' });
const api = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const uid = '11111111-1111-4111-8111-111111111111', store = '22222222-2222-4222-8222-222222222222';
const draft = { parentCode: 'CODPAI001', childCode: '9788584390670', ean: '9788584390670',
  title: 'Livro de teste', condition: 'novo', magazordCategoryId: 6, magazordCategoryStoreId: store,
  fiscalOrigin: '0 - Nacional', unit: 'UN', ncm: '49019900', synopsis: '' };
const wireInput = (changes = {}) => JSON.parse(JSON.stringify(api.registrationInput({ ...draft, ...changes }, 1, 1)));

test('reported form values survive JSON transport and produce valid parent/child payloads', () => {
  assert.equal(Number.isNaN(Number(draft.fiscalOrigin)), true);
  assert.equal(JSON.parse(JSON.stringify({ fiscalOrigin: Number(draft.fiscalOrigin) })).fiscalOrigin, null);
  const input = wireInput(), payload = api.registrationPayload(input);
  assert.equal(input.fiscalOrigin, 0);
  assert.equal(payload.parent.origemFiscal, 0);
  assert.equal(payload.parent.codigo, 'CODPAI001');
  assert.equal(payload.child.codigo, '9788584390670');
  assert.equal(payload.child.ean, '9788584390670');
  assert.equal(payload.parent.ncm, '49019900');
  assert.equal(payload.parent.marca, 1);
  assert.deepEqual(payload.parent.categorias, [6]);
  assert.deepEqual(payload.child.lojas, [1]);
});

test('existing fiscal select labels and numeric values retain their codes without relaxing backend validation', () => {
  for (const [label, number] of [['0 - Nacional', 0], ['1 - Estrangeira (Importação direta)', 1],
    ['2 - Estrangeira (Adquirida no mercado interno)', 2], ['0', 0], ['8', 8], ['0.0', 0]]) {
    assert.equal(api.registrationPayload(wireInput({ fiscalOrigin: label })).parent.origemFiscal, number);
  }
  for (const value of [null, NaN, 9, -1, 0.5, '0 - Nacional']) {
    assert.throws(() => api.registrationPayload({ ...wireInput(), fiscalOrigin: value }),
      error => error instanceof api.RegistrationValidationError && error.fields.length === 1 && error.fields[0] === 'fiscalOrigin');
  }
});

test('field-specific diagnostics preserve the existing title, NCM, code, ID and ISBN rules', () => {
  for (const [field, value] of [['title', 'x'.repeat(101)], ['ncm', '4901.99.A0'], ['parentCode', 'x'.repeat(26)],
    ['brandId', 0], ['categoryId', '6'], ['channelId', -1], ['unit', 'un'], ['ean', '9788584390671']]) {
    assert.throws(() => api.registrationPayload({ ...wireInput(), [field]: value }),
      error => error instanceof api.RegistrationValidationError && assert.deepEqual(error.fields, [field]) === undefined);
  }
  assert.throws(() => api.registrationPayload({ ...wireInput(), childCode: draft.parentCode }),
    error => error.fields.includes('codesDistinct'));
  assert.throws(() => api.registrationPayload(null), error => error.fields[0] === 'input');
});

test('backend returns only known field names before any catalog, journal or Magazord access', async () => {
  let authCalls = 0;
  const env = { MAGAZORD_BASE_URL: 'https://homologacaosilveiralab.painel.magazord.com.br/api',
    MAGAZORD_API_USER: 'fixture-token', MAGAZORD_API_PASSWORD: 'fixture-password', MAGAZORD_STORE_ID: store,
    SUPABASE_URL: 'https://auth.invalid', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture' };
  const handler = api.createMagazordRegistrationFunction({ env, fetcher: async (target, init) => {
    const url = new URL(target); assert.equal(url.origin, 'https://auth.invalid'); assert.equal(init.method, 'GET'); authCalls++;
    if (url.pathname === '/auth/v1/user') return Response.json({ id: uid });
    if (url.pathname === '/rest/v1/profiles') return Response.json([{ id: uid, active: true }]);
    if (url.pathname === '/rest/v1/store_users') return Response.json([{ user_id: uid, store_id: store, role: 'operator', active: true }]);
    if (url.pathname === '/rest/v1/stores') return Response.json([{ id: store, active: true }]);
    assert.fail('Unexpected source access');
  } });
  const response = await handler(new Request('https://isbn.invalid/api/magazord/registration', { method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${mfaToken(uid)}`, 'x-isbn-store-id': store },
    body: JSON.stringify({ action: 'preview', operationId: crypto.randomUUID(), input: { ...wireInput(), fiscalOrigin: null } }) }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { code: 'invalid_registration', fields: ['fiscalOrigin'] });
  assert.equal(authCalls, 4);
});

test('client uses allowlisted messages and serializes the corrected fiscal origin', async () => {
  const built = await build({ stdin: { resolveDir: process.cwd(), contents: `export * from './src/services/magazordRegistration';` },
    bundle: true, write: false, platform: 'node', format: 'cjs', plugins: [{ name: 'fixture-session', setup(b) {
      b.onResolve({ filter: /\/lib\/supabase$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `exports.supabase={auth:{getSession:async()=>({data:{session:{user:{id:'${uid}'},access_token:'synthetic-session'}}})}};` }));
    } }] });
  const calls = [], module = { exports: {} };
  new Function('module', 'exports', 'fetch', built.outputFiles[0].text)(module, module.exports, async (_url, init) => {
    calls.push(JSON.parse(init.body));
    return Response.json({ code: 'invalid_registration', fields: ['fiscalOrigin', 'unknown-secret-details'], message: 'private upstream value' }, { status: 400 });
  });
  await assert.rejects(module.exports.submitMagazordRegistration('preview', crypto.randomUUID(), wireInput(), { id: uid, storeId: store, active: true }),
    { message: 'Origem fiscal inválida: selecione um código de 0 a 8.' });
  assert.equal(calls[0].input.fiscalOrigin, 0);
  assert.equal(api.registrationValidationMessage(['unknown-secret-details', '__proto__']), undefined);
});

test('used books omit the commercial EAN while preserving bibliographic ISBN; new books retain EAN', () => {
  const usedDraft = { ...draft, condition: 'usado', childCode: 'LVP018001', isbn13: '9788584390670', ean: '9788584390670',
    usedBookConditionNotes: 'Bom estado de conservação.' };
  const fromDraft = wireInput(usedDraft);
  assert.equal(fromDraft.ean, '');
  assert.equal(usedDraft.isbn13, '9788584390670');
  const usedPayload = api.registrationPayload(fromDraft);
  assert.equal(usedPayload.child.codigo, 'LVP018001');
  assert.equal(Object.hasOwn(usedPayload.child, 'ean'), false);
  assert.match(usedPayload.parent.produtoLoja[0].descricao, /<strong>Bom estado de conservação\.<\/strong>/);
  // Server-side guard also covers legacy/frozen operations containing an ISBN in the used EAN input.
  const legacyPayload = api.registrationPayload({ ...fromDraft, ean: '9788584390670' });
  assert.equal(Object.hasOwn(legacyPayload.child, 'ean'), false);
  const newPayload = api.registrationPayload(wireInput());
  assert.equal(newPayload.child.ean, '9788584390670');
});
