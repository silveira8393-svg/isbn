import { authorizeAmazonSearch, AmazonAccessError, readLimitedJson } from './amazonAuthorization.js';
import { resolveMagazordBaseUrl } from './magazordBaseUrl.js';
import { priceDatabase, createPriceStore } from './magazordPriceStore.js';
import { exercisePriceOperation, priceJob } from './magazordPriceOperation.js';
import { createPriceTransport } from './magazordPriceTransport.js';
import { PRICE_HOMOLOGATION, PriceError, priceFail, priceUuid, priceCents, priceSnapshot, salePricePayload, type PricePreview } from '../shared/magazordPrice.js';

function binding(env: NodeJS.ProcessEnv, store: string): { channelId: number; tableId: number } {
  let map: any, channels: any;
  try { map = JSON.parse(env.MAGAZORD_HOMOLOGATION_PRICES || ''); channels = JSON.parse(env.MAGAZORD_HOMOLOGATION_CHANNELS || ''); }
  catch { return priceFail('price_binding_not_configured', 503); }
  if (!map || typeof map !== 'object' || Array.isArray(map) || !channels || typeof channels !== 'object' || Array.isArray(channels)
    || !Object.hasOwn(map, store) || !Object.hasOwn(channels, store)) return priceFail('price_binding_not_configured', 503);
  const tables = new Set<number>();
  for (const [id, b] of Object.entries(map) as [string, any][]) {
    if (!priceUuid(id) || !b || typeof b !== 'object' || Array.isArray(b) || Object.keys(b).length !== 2
      || !Object.hasOwn(b, 'channelId') || !Object.hasOwn(b, 'tableId')
      || !Number.isSafeInteger(b.channelId) || b.channelId <= 0 || !Number.isSafeInteger(b.tableId) || b.tableId <= 0
      || tables.has(b.tableId) || channels[id] !== b.channelId) return priceFail('price_binding_not_configured', 503);
    tables.add(b.tableId); // Shared tables across ISBN stores need an explicit later design/review.
  }
  return map[store];
}

/** Prepare uses the verified ISBN registration; preview remains an optional remote diagnostic. */
export function createMagazordPriceFunction(options: { env?: NodeJS.ProcessEnv; fetcher?: typeof fetch } = {}) {
  const env = options.env || process.env, fetcher = options.fetcher || fetch;
  return async (request: Request): Promise<Response> => {
    const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff', ...(status === 405 ? { Allow: 'POST' } : {}) } });
    try {
      if (request.method !== 'POST') return reply({ code: 'method_not_allowed' }, 405);
      const url = new URL(request.url);
      if (url.pathname !== '/api/magazord/price' || url.search) return priceFail('invalid_price_request', 400);
      if (request.headers.get('origin') && request.headers.get('origin') !== url.origin || request.headers.get('sec-fetch-site') === 'cross-site') return priceFail('origin_denied', 403);
      if (resolveMagazordBaseUrl(env.MAGAZORD_BASE_URL) !== PRICE_HOMOLOGATION) return priceFail('homologation_only', 403);
      const store = request.headers.get('x-isbn-store-id');
      if (!priceUuid(store) || store !== env.MAGAZORD_STORE_ID) return priceFail('store_access_denied', 403);
      await authorizeAmazonSearch(request, env, fetcher);
      const actor = JSON.parse(Buffer.from(request.headers.get('authorization')!.split('.')[1], 'base64url').toString()).sub;
      if (!priceUuid(actor)) return priceFail('store_access_denied', 403);
      if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) return priceFail('json_required', 415);
      const input = await readLimitedJson(request.body, 4096, AbortSignal.timeout(5000));
      const enabledId = env.MAGAZORD_HOMOLOGATION_PRICE_OPERATION_ID;
      const enabled = priceUuid(enabledId);
      const readOnly = ['preview', 'prepare'].includes(input?.action);
      if (!readOnly && (!enabled || !['send', 'reconcile'].includes(input?.action))) return priceFail('price_writes_disabled', 423);
      if (Object.keys(input).some(k => !['action', 'registrationId', 'price', ...(readOnly ? [] : ['operationId'])].includes(k))
        || !priceUuid(input.registrationId)) return priceFail('invalid_price_request', 400);
      if (!readOnly && input.operationId !== enabledId) return priceFail('price_writes_disabled', 423);
      const cents = priceCents(input.price), configured = binding(env, store);
      if (input.action !== 'preview' && configured.tableId !== 1) return priceFail('invalid_price_table');
      const call = priceDatabase(env, fetcher);
      const jobs = await call('magazord_registration_jobs', 'GET', { id: `eq.${input.registrationId}`, store_id: `eq.${store}`,
        actor_id: `eq.${actor}`, select: 'id,store_id,actor_id,parent_code,child_code,stage', limit: '1' });
      const job = jobs[0];
      if (jobs.length !== 1 || job.id !== input.registrationId || job.store_id !== store || job.actor_id !== actor || job.stage !== 'verified')
        return priceFail('registration_not_verified');
      const payload = salePricePayload(job.child_code, configured.tableId, cents);
      salePricePayload(job.parent_code, configured.tableId, cents);
      if (job.parent_code === job.child_code) return priceFail('invalid_relationship');
      // verified is reached only by the new-product registration state machine.
      // Preexisting codes are rejected there; products created by that same operation can resume here.
      if (input.action === 'prepare') {
        if (enabled) await call('magazord_price_jobs', 'GET', { select: 'id', limit: '0' });
        const result: PricePreview = { status: 'preview', environment: 'homologation', writesEnabled: enabled,
          ...(enabled ? { operationId: enabledId } : {}), parentCode: job.parent_code, childCode: job.child_code,
          tableId: 1, tableName: 'Padrão', cents, eligible: true, state: 'ready_for_local_review', payload };
        return reply(result);
      }
      const transport = createPriceTransport(env, fetcher), get = transport.get;
      if (input.action !== 'preview') {
        const priceOperation = priceJob({ id: enabledId!, registration_id: job.id, store_id: store, actor_id: actor,
          parent_code: job.parent_code, child_code: job.child_code, channel_id: configured.channelId, table_id: configured.tableId, cents });
        const stage = await exercisePriceOperation(priceOperation, {
          baseUrl: PRICE_HOMOLOGATION, store: createPriceStore(env, fetcher), verifiedRegistration: async () => true,
          reconcileOnly: input.action === 'reconcile', write: transport.write,
          read: async () => {
            const snapshots = [];
            for (const active of ['0', '1']) snapshots.push(priceSnapshot(await get('/v1/listPreco?' + new URLSearchParams({ tabelaPreco: String(configured.tableId), produto: job.child_code, ativo: active, limit: '100', offset: '0' })), job.child_code, configured.tableId));
            const present = snapshots.filter(s => s.kind === 'present');
            if (present.length > 1) return priceFail('ambiguous_price_response', 502);
            return present[0] || { kind: 'absent' };
          },
        });
        return reply({ status: 'verified', operationId: enabledId, stage, childCode: job.child_code, tableId: configured.tableId, cents });
      }
      const unwrap = (body: any) => body?.status === 'success' && body.data != null ? body.data : priceFail('invalid_remote_response', 502);
      const parent = unwrap(await get('/v2/site/produto/' + encodeURIComponent(job.parent_code)));
      const child = unwrap(await get('/v2/site/produto/' + encodeURIComponent(job.parent_code) + '/derivacao/' + encodeURIComponent(job.child_code)));
      if (parent.codigo !== job.parent_code || child.codigo !== job.child_code || child.agrupador !== job.parent_code
        || typeof child.tipoRegistro !== 'string' || child.tipoRegistro.toLowerCase() !== 'filho'
        || !Array.isArray(child.lojas) || !child.lojas.includes(configured.channelId)
        || !Array.isArray(parent.produtoLoja) || !parent.produtoLoja.some((l: any) => l?.loja === configured.channelId)) return priceFail('invalid_relationship');
      const table = unwrap(await get('/v2/site/tabelaPreco?' + new URLSearchParams({ id: String(configured.tableId), limit: '100', page: '1' })));
      if (!Array.isArray(table.items) || table.items.length !== 1 || table.total !== 1 || table.page !== 1 || table.limit !== 100 || table.has_more !== false
        || table.items[0]?.id !== configured.tableId || table.items[0]?.ativa !== true || typeof table.items[0]?.nome !== 'string') return priceFail('invalid_price_table');
      // An absent/unreadable journal prevents enabling the button or attempting a remote POST.
      if (enabled) await call('magazord_price_jobs', 'GET', { select: 'id', limit: '0' });
      let state: PricePreview['state'] = 'ready_for_local_review';
      // No implicit active-product filter may turn an existing inactive price into false absence.
      for (const active of ['0', '1']) {
        try {
          const current = priceSnapshot(await get('/v1/listPreco?' + new URLSearchParams({ tabelaPreco: String(configured.tableId), produto: job.child_code, ativo: active, limit: '100', offset: '0' })), job.child_code, configured.tableId);
          if (current.kind !== 'absent' && state !== 'ambiguous_price_response') state = 'existing_price_review_required';
        } catch (error) {
          if (!(error instanceof PriceError) || !['existing_price_review_required', 'ambiguous_price_response'].includes(error.code)) throw error;
          if (error.code === 'ambiguous_price_response' || state === 'ready_for_local_review') state = error.code as PricePreview['state'];
        }
      }
      const result: PricePreview = { status: 'preview', environment: 'homologation', writesEnabled: enabled, ...(enabled ? { operationId: enabledId } : {}),
        parentCode: job.parent_code, childCode: job.child_code, tableId: configured.tableId, tableName: table.items[0].nome.slice(0,100),
        cents, eligible: state === 'ready_for_local_review', state, payload };
      return reply(result);
    } catch (error) {
      if (error instanceof AmazonAccessError) return reply({ code: 'price_access_denied' }, error.status);
      if (error instanceof PriceError) return reply({ code: error.code, ...(error.diagnostic ? { diagnostic: error.diagnostic } : {}) }, error.status);
      return reply({ code: 'price_preview_unavailable' }, 503);
    }
  };
}
