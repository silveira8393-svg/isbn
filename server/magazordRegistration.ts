import { createHash } from 'node:crypto';
import { authorizeAmazonSearch, AmazonAccessError, readLimitedJson } from './amazonAuthorization.js';
import { resolveMagazordBaseUrl } from './magazordBaseUrl.js';
import { registrationPayload, RegistrationValidationError, type RegistrationInput } from '../shared/magazordRegistration.js';
import { createRegistrationStore, JournalError, type RegistrationStore, type RegistrationRecord, type Stage } from './magazordRegistrationStore.js';

const HOMOLOGATION = 'https://homologacaosilveiralab.painel.magazord.com.br/api';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
class RegistrationError extends Error { constructor(public status: number, public code: string) { super(code); } }
const fail = (status: number, code: string): never => { throw new RegistrationError(status, code); };

export function createMagazordRegistrationFunction(options: { env?: NodeJS.ProcessEnv; fetcher?: typeof fetch; journal?: RegistrationStore } = {}) {
  const env = options.env || process.env, fetcher = options.fetcher || fetch;
  return async (request: Request): Promise<Response> => {
    const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff', ...(status === 405 ? { Allow: 'POST' } : {}) } });
    try {
      if (request.method !== 'POST') return reply({ code: 'method_not_allowed' }, 405);
      const url = new URL(request.url);
      if (url.pathname !== '/api/magazord/registration' || url.search) fail(400, 'invalid_query');
      if ((request.headers.get('origin') && request.headers.get('origin') !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') fail(403, 'origin_denied');
      // A valid production configuration must still NEVER grant write access.
      if (resolveMagazordBaseUrl(env.MAGAZORD_BASE_URL) !== HOMOLOGATION) fail(403, 'homologation_only');
      if (!env.MAGAZORD_API_USER || !env.MAGAZORD_API_PASSWORD) fail(503, 'not_configured');
      const storeId = request.headers.get('x-isbn-store-id') || '';
      if (!UUID.test(storeId) || storeId !== env.MAGAZORD_STORE_ID) fail(403, 'store_access_denied');
      await authorizeAmazonSearch(request, env, fetcher);
      // Only after Auth and AAL2 validated this exact token can sub identify the journal actor.
      const actor = JSON.parse(Buffer.from(request.headers.get('authorization')!.split('.')[1], 'base64url').toString()).sub;
      if (!UUID.test(actor)) fail(403, 'store_access_denied');
      if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) fail(415, 'json_required');
      let body: any;
      try { body = await readLimitedJson(request.body, 65536, AbortSignal.timeout(5000)); } catch { fail(400, 'invalid_registration'); }
      if (!body || !['preview', 'create'].includes(body.action) || !UUID.test(body.operationId || '')
        || Object.keys(body).some(k => !['action', 'operationId', 'input'].includes(k))) fail(400, 'invalid_registration');
      const input = body.input as RegistrationInput;
      let payload: ReturnType<typeof registrationPayload>;
      try { payload = registrationPayload(input); }
      catch (error) {
        if (error instanceof RegistrationValidationError) return reply({ code: 'invalid_registration', fields: error.fields }, 400);
        fail(400, 'invalid_registration');
      }
      if (input.categoryStoreId !== storeId) fail(403, 'store_access_denied');
      const signal = AbortSignal.timeout(20000);
      const headers = { Accept: 'application/json', Authorization: 'Basic ' + Buffer.from(`${env.MAGAZORD_API_USER}:${env.MAGAZORD_API_PASSWORD}`).toString('base64') };
      async function remote(path: string, method: 'GET' | 'POST' = 'GET', data?: unknown, missing = false): Promise<any> {
        const response = await fetcher(HOMOLOGATION + path, { method, signal, redirect: 'error', credentials: 'omit', cache: 'no-store',
          headers: { ...headers, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
        if (missing && response.status === 404) { void response.body?.cancel(); return null; }
        if (!response.ok || (method === 'POST' && response.status !== 201)) { void response.body?.cancel(); fail(502, 'remote_rejected'); }
        if (!/^application\/json(?:;|$)/i.test(response.headers.get('content-type') || '')) { void response.body?.cancel(); fail(502, 'invalid_remote_response'); }
        const result = await readLimitedJson(response.body, 512 * 1024, signal);
        if (result?.status !== 'success' || result.data == null) fail(502, 'invalid_remote_response');
        return result.data;
      }
      const parentPath = '/v2/site/produto/' + encodeURIComponent(input.parentCode);
      async function exact(code: string) {
        const data = await remote('/v2/site/produtoDerivacoes?' + new URLSearchParams({ codigo: code, limit: '100', page: '1' }));
        if (!Array.isArray(data.items) || data.page !== 1 || data.limit !== 100 || data.has_more !== false || data.total !== data.items.length)
          fail(502, 'incomplete_code_lookup');
        return data.items.filter((item: any) => typeof item?.codigo === 'string' && item.codigo.toLowerCase() === code.toLowerCase());
      }
      async function state() {
        const p = await remote(parentPath, 'GET', undefined, true);
        const otherParent = await remote('/v2/site/produto/' + encodeURIComponent(input.childCode), 'GET', undefined, true);
        const parentCodes = await exact(input.parentCode), children = await exact(input.childCode);
        if (otherParent || parentCodes.length > 1 || (parentCodes.length && !p)
          || parentCodes.some((x: any) => x.tipoRegistro !== 'pai') || children.length > 1) fail(409, 'commercial_code_conflict');
        if (p && (p.codigo !== input.parentCode || p.nome !== input.title || p.marca !== input.brandId)) fail(409, 'commercial_code_conflict');
        const child = children[0];
        if (child && (child.codigo !== input.childCode || child.tipoRegistro !== 'filho' || child.agrupador !== input.parentCode || child.nome !== input.title)) fail(409, 'commercial_code_conflict');
        if (child && !p) fail(409, 'invalid_relationship');
        return { parent: p, child };
      }
      async function references() {
        const brand = await remote('/v2/site/marca?' + new URLSearchParams({ id: String(input.brandId), limit: '100', page: '1' }));
        const channels = await remote('/v2/site/loja?ativo=1');
        const category = await remote('/v2/site/categoria?' + new URLSearchParams({ id: String(input.categoryId), limit: '100', page: '1' }));
        if (!Array.isArray(brand.items) || !brand.items.some((b: any) => b.id === input.brandId)
          || !Array.isArray(channels.items) || !channels.items.some((c: any) => c.id === input.channelId && c.ativo === true)
          || !Array.isArray(category.items) || !category.items.some((c: any) => c.id === input.categoryId)) fail(400, 'invalid_catalog_reference');
      }
      if (body.action === 'preview') {
        await references();
        const s = await state();
        if (s.parent || s.child) fail(409, 'commercial_code_conflict');
        return reply({ status: 'preview', environment: 'homologation', payload });
      }
      const journal = options.journal || createRegistrationStore(env, fetcher);
      // Reject a wrong brand/channel/category before reserving commercial codes permanently.
      await references();
      const fingerprint = createHash('sha256').update(JSON.stringify({ storeId, condition: input.condition, payload })).digest('hex');
      let record = await journal.reserve({ id: body.operationId, store_id: storeId, actor_id: actor,
        parent_code: input.parentCode, child_code: input.childCode, fingerprint, stage: 'prepared' });
      if (record.fingerprint !== fingerprint || record.actor_id !== actor || record.store_id !== storeId
        || record.parent_code !== input.parentCode || record.child_code !== input.childCode) fail(409, 'operation_payload_changed');
      async function advance(stage: Stage) {
        if (!await journal.advance(record, stage)) fail(409, 'operation_in_progress');
        record = { ...record, stage };
      }
      let s = await state();
      if (record.stage === 'prepared') {
        if (s.parent || s.child) fail(409, 'commercial_code_conflict');
        await advance('parent_started'); // Durable intent BEFORE any remote write.
        await remote('/v2/site/produto', 'POST', payload.parent);
        s = await state();
      }
      if (record.stage === 'parent_started') {
        // Timeout/crash recovery never repeats a POST. Absence may be eventual consistency.
        if (!s.parent) fail(409, 'parent_outcome_uncertain');
        await advance('parent_confirmed');
      }
      if (record.stage === 'parent_confirmed') {
        if (!s.parent) fail(409, 'parent_outcome_uncertain');
        if (s.child) fail(409, 'commercial_code_conflict');
        await advance('child_started');
        await remote(parentPath + '/derivacao', 'POST', payload.child);
        s = await state();
      }
      if (record.stage === 'child_started' || record.stage === 'verified') {
        if (!s.parent || !s.child) fail(409, 'child_outcome_uncertain');
        const related = await remote(parentPath + '/derivacao');
        if (!Array.isArray(related) || related.filter((c: any) => c.codigo === input.childCode && c.tipoRegistro === 'filho' && c.agrupador === input.parentCode).length !== 1)
          fail(409, 'invalid_relationship');
        if (record.stage !== 'verified') await advance('verified');
        return reply({ status: 'verified', environment: 'homologation', parentCode: input.parentCode, childCode: input.childCode });
      }
      fail(409, 'operation_in_progress');
    } catch (error) {
      if (error instanceof RegistrationError) return reply({ code: error.code }, error.status);
      if (error instanceof AmazonAccessError) return reply({ code: error.status === 401 ? 'unauthenticated' : error.status === 403 ? 'access_denied' : 'auth_unavailable' }, error.status);
      if (error instanceof JournalError) return reply({ code: error.message }, error.message === 'code_reserved' ? 409 : 503);
      return reply({ code: 'operation_uncertain_reconcile_before_retry' }, 503);
    }
  };
}
