import { createHash } from 'node:crypto';
import { authorizeAmazonSearch, AmazonAccessError, readLimitedJson } from './amazonAuthorization.js';
import { resolveMagazordBaseUrl } from './magazordBaseUrl.js';
import { serviceHeaders } from './spapi/supabaseHeaders.js';
import { PRICE_HOMOLOGATION, priceUuid } from '../shared/magazordPrice.js';

class StockError extends Error {
  constructor(public code: string, public status = 409) { super(code); }
}
const fail = (code: string, status = 409): never => { throw new StockError(code, status); };
const positive = (n: unknown): n is number => Number.isSafeInteger(n) && Number(n) > 0;
type Stage = 'prepared' | 'stock_started' | 'stock_verified';
type StockJob = {
  id: string; registration_id: string; store_id: string; actor_id: string; environment: 'homologation';
  parent_code: string; child_code: string; deposit_id: number; quantity: number;
  fingerprint: string; stage: Stage; movement_id?: number | null;
};
function stockOperationId(registrationId: string): string {
  const bytes = createHash('sha256').update('isbn-magazord-initial-stock:v1:').update(registrationId.toLowerCase()).digest('hex').slice(0,32).split('');
  bytes[12] = '4'; bytes[16] = '89ab'[parseInt(bytes[16],16)%4];
  const hex = bytes.join('');
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
function configuredDeposit(env: NodeJS.ProcessEnv, store: string): number {
  let bindings: unknown;
  try { bindings = JSON.parse(env.MAGAZORD_HOMOLOGATION_STOCK || ''); } catch { return fail('stock_not_configured', 423); }
  if (!bindings || typeof bindings !== 'object' || Array.isArray(bindings)) return fail('stock_not_configured', 423);
  const items = Object.entries(bindings);
  if (!items.length || items.some(([id, deposit]) => !priceUuid(id) || !positive(deposit))
    || !Object.hasOwn(bindings, store)) return fail('stock_not_configured', 423);
  return (bindings as Record<string, number>)[store];
}
function journal(env: NodeJS.ProcessEnv, fetcher: typeof fetch) {
  let base: URL;
  try { base = new URL((env.SUPABASE_URL || env.VITE_SUPABASE_URL)!); }
  catch { return fail('stock_persistence_unavailable', 503); }
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || base.protocol !== 'https:' || base.username || base.password || base.port || base.search || base.hash || base.pathname !== '/')
    return fail('stock_persistence_unavailable', 503);
  return async (table: 'magazord_registration_jobs' | 'magazord_price_jobs' | 'magazord_stock_jobs',
    method: 'GET' | 'POST' | 'PATCH', query: Record<string,string>, body?: unknown): Promise<any[]> => {
    if (table !== 'magazord_stock_jobs' && method !== 'GET') return fail('stock_persistence_unavailable', 503);
    const url = new URL('/rest/v1/' + table, base); url.search = new URLSearchParams(query).toString();
    const signal = AbortSignal.timeout(5000);
    const response = await fetcher(url, { method, redirect:'error', credentials:'omit', cache:'no-store', signal,
      headers: { ...serviceHeaders(key), Prefer:'return=representation' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (!response.ok || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') || '')) {
      void response.body?.cancel().catch(()=>{});
      return fail('stock_persistence_unavailable', 503);
    }
    const rows = await readLimitedJson(response.body, 65536, signal);
    if (!Array.isArray(rows)) return fail('stock_persistence_unavailable', 503);
    return rows;
  };
}
function fingerprint(fields: Omit<StockJob,'fingerprint'|'stage'|'movement_id'>): string {
  return createHash('sha256').update(JSON.stringify(fields)).digest('hex');
}

/** Homologation-only initial stock: one entry after verified ISBN creation AND price.
 * A lost/uncertain POST is NEVER repeated; reconciliation of it is a manual review.
 */
export function createMagazordStockFunction(options: {env?: NodeJS.ProcessEnv; fetcher?: typeof fetch} = {}) {
  const env = options.env || process.env, fetcher = options.fetcher || fetch;
  const reply = (data: unknown, status=200) => Response.json(data, {status, headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  return async (request: Request): Promise<Response> => {
    try {
      if (request.method !== 'POST') return reply({code:'method_not_allowed'},405);
      const url = new URL(request.url);
      if (url.pathname !== '/api/magazord/price' || url.search !== '?stock=1') return fail('invalid_stock_request',400);
      if ((request.headers.get('origin') && request.headers.get('origin') !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site')
        return fail('origin_denied',403);
      if (resolveMagazordBaseUrl(env.MAGAZORD_BASE_URL) !== PRICE_HOMOLOGATION) return fail('homologation_only',403);
      const store = request.headers.get('x-isbn-store-id');
      if (!priceUuid(store) || store !== env.MAGAZORD_STORE_ID) return fail('store_access_denied',403);
      await authorizeAmazonSearch(request, env, fetcher);
      const actor = JSON.parse(Buffer.from(request.headers.get('authorization')!.split('.')[1], 'base64url').toString()).sub;
      if (!priceUuid(actor)) return fail('store_access_denied',403);
      if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||'')) return fail('json_required',415);
      const body = await readLimitedJson(request.body,4096,AbortSignal.timeout(5000));
      if (!body || !['prepare','send','reconcile'].includes(body.action)
        || Object.keys(body).some((key:string)=>!['action','registrationId','quantity',...(body.action==='prepare'?[]:['operationId'])].includes(key))
        || !priceUuid(body.registrationId) || !positive(body.quantity) || body.quantity > 100000) return fail('invalid_stock_request',400);
      const depositId = configuredDeposit(env,store);
      const call = journal(env,fetcher);
      const registrations = await call('magazord_registration_jobs','GET',{id:'eq.'+body.registrationId,store_id:'eq.'+store,actor_id:'eq.'+actor,select:'id,store_id,actor_id,parent_code,child_code,stage',limit:'2'});
      const registration = registrations[0];
      if (registrations.length !== 1 || registration.stage !== 'verified' || registration.id !== body.registrationId
        || registration.store_id !== store || registration.actor_id !== actor || registration.parent_code === registration.child_code)
        return fail('registration_not_verified');
      const prices = await call('magazord_price_jobs','GET',{registration_id:'eq.'+body.registrationId,
        store_id:'eq.'+store,actor_id:'eq.'+actor,select:'registration_id,parent_code,child_code,stage',limit:'2'});
      if (prices.length !== 1 || prices[0].stage !== 'price_verified' || prices[0].parent_code !== registration.parent_code
        || prices[0].child_code !== registration.child_code) return fail('price_not_verified');
      const fields = {id:stockOperationId(body.registrationId),registration_id:registration.id,store_id:store,actor_id:actor,
        environment:'homologation' as const,parent_code:registration.parent_code,child_code:registration.child_code,
        deposit_id:depositId,quantity:body.quantity};
      const proposed: StockJob = {...fields,fingerprint:fingerprint(fields),stage:'prepared'};
      const scope = {registration_id:'eq.'+registration.id,store_id:'eq.'+store,actor_id:'eq.'+actor,select:'*',limit:'2'};
      let rows = await call('magazord_stock_jobs','GET',scope);
      if (rows.length > 1) return fail('stock_persistence_unavailable',503);
      let job: StockJob | undefined = rows[0];
      if (job && (job.id !== proposed.id || job.fingerprint !== proposed.fingerprint || job.quantity !== proposed.quantity
        || job.deposit_id !== proposed.deposit_id || job.child_code !== proposed.child_code)) return fail('stock_payload_changed');
      if (body.action === 'prepare') return reply({status:'prepared',environment:'homologation',operationId:proposed.id,
        stage:job?.stage||'not_started',childCode:proposed.child_code,quantity:proposed.quantity,depositId});
      if (body.operationId !== proposed.id) return fail('stock_operation_mismatch',423);
      if (job?.stage === 'stock_verified') return reply({status:'verified',operationId:proposed.id,stage:'stock_verified',
        childCode:proposed.child_code,quantity:proposed.quantity,depositId});
      if (job?.stage === 'stock_started') return fail('stock_outcome_uncertain',409);
      if (body.action === 'reconcile') return fail('stock_not_started');
      if (!job) {
        try {
          rows = await call('magazord_stock_jobs','POST',{},proposed);
          if (rows.length !== 1) return fail('stock_persistence_unavailable',503);
          job = rows[0];
        } catch (error) {
          rows = await call('magazord_stock_jobs','GET',scope);
          if (rows.length !== 1) throw error;
          job = rows[0];
        }
      }
      if (job?.id !== proposed.id || job.fingerprint !== proposed.fingerprint) return fail('stock_payload_changed');
      if (job.stage !== 'prepared') return fail('stock_outcome_uncertain',409);
      rows = await call('magazord_stock_jobs','PATCH',{id:'eq.'+job.id,stage:'eq.prepared',fingerprint:'eq.'+job.fingerprint,
        store_id:'eq.'+store,actor_id:'eq.'+actor},{stage:'stock_started'});
      if (rows.length !== 1) return fail('stock_operation_in_progress',409);
      // From this point onward never replay: the remote POST might have succeeded.
      try {
        if (!env.MAGAZORD_API_USER || !env.MAGAZORD_API_PASSWORD) return fail('stock_outcome_uncertain');
        const response = await fetcher(PRICE_HOMOLOGATION+'/v1/estoque',{method:'POST',redirect:'error',
          credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(20000),
          headers:{'Content-Type':'application/json',Accept:'application/json',
            Authorization:'Basic '+Buffer.from(env.MAGAZORD_API_USER+':'+env.MAGAZORD_API_PASSWORD).toString('base64')},
          body:JSON.stringify({produto:proposed.child_code,deposito:depositId,quantidade:proposed.quantity,
            tipo:1,tipoOperacao:1})});
        if (response.status !== 200 || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') || '')) {
          void response.body?.cancel().catch(()=>{}); return fail('stock_outcome_uncertain');
        }
        const result = await readLimitedJson(response.body,65536,AbortSignal.timeout(5000));
        if (result?.sucesso !== true || !positive(result.movimentacao_id)) return fail('stock_outcome_uncertain');
        rows = await call('magazord_stock_jobs','PATCH',{id:'eq.'+job.id,stage:'eq.stock_started',fingerprint:'eq.'+job.fingerprint,
          store_id:'eq.'+store,actor_id:'eq.'+actor},{stage:'stock_verified',movement_id:result.movimentacao_id});
        if (rows.length !== 1) return fail('stock_outcome_uncertain');
        return reply({status:'verified',operationId:proposed.id,stage:'stock_verified',childCode:proposed.child_code,
          quantity:proposed.quantity,depositId});
      } catch { return fail('stock_outcome_uncertain'); }
    } catch (error) {
      if (error instanceof AmazonAccessError) return reply({code:'stock_access_denied'},error.status);
      if (error instanceof StockError) return reply({code:error.code},error.status);
      return reply({code:'stock_unavailable'},503);
    }
  };
}
