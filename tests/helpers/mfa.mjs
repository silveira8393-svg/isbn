// Unsigned synthetic JWT for tests whose Auth service is explicitly mocked. Never a real credential.
export const mfaToken = (sub = '11111111-1111-4111-8111-111111111111', aal = 'aal2') =>
  Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') + '.' +
  Buffer.from(JSON.stringify({ sub, aal, exp: Math.floor(Date.now() / 1000) + 3600, nonce: crypto.randomUUID() })).toString('base64url') + '.synthetic-signature';

// Source-client tests exercise bibliography/transport with a synthetic authenticated session.
export const mfaHeadersPlugin = { name: 'synthetic-source-auth', setup(b) {
  b.onResolve({ filter: /\/mfaHeaders$/ }, () => ({ path: 'source-auth', namespace: 'mfa-mock' }));
  b.onLoad({ filter: /.*/, namespace: 'mfa-mock' }, () => ({ contents: `export const mfaHeaders=async()=>({Accept:'application/json',Authorization:'Bearer synthetic-mfa-session'});` }));
} };
