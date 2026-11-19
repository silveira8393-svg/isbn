import { createHash } from 'node:crypto';
import { PRICE_HOMOLOGATION, priceFail, priceUuid, salePricePayload, type PriceSnapshot } from '../shared/magazordPrice.js';

export type PriceStage = 'prepared' | 'price_started' | 'price_verified';
export interface PriceJob {
  id: string; registration_id: string; store_id: string; actor_id: string; environment: 'homologation';
  parent_code: string; child_code: string; channel_id: number; table_id: number; ad_scope: 'none';
  cents: number; fingerprint: string; stage: PriceStage;
}
export interface PriceStore {
  reserve(job: PriceJob): Promise<PriceJob>;
  advance(job: PriceJob, next: PriceStage): Promise<boolean>;
}
export function priceJob(input: Omit<PriceJob, 'fingerprint' | 'stage' | 'environment' | 'ad_scope'>): PriceJob {
  if (![input.id, input.registration_id, input.store_id, input.actor_id].every(priceUuid)
    || !Number.isSafeInteger(input.channel_id) || input.channel_id <= 0 || input.parent_code === input.child_code)
    return priceFail('invalid_price_operation', 400);
  salePricePayload(input.parent_code, input.table_id, input.cents);
  salePricePayload(input.child_code, input.table_id, input.cents);
  const identity = { registration_id: input.registration_id, store_id: input.store_id, actor_id: input.actor_id,
    environment: 'homologation' as const, parent_code: input.parent_code, child_code: input.child_code,
    channel_id: input.channel_id, table_id: input.table_id, ad_scope: 'none' as const, cents: input.cents };
  return { id: input.id, ...identity, fingerprint: createHash('sha256').update(JSON.stringify(identity)).digest('hex'), stage: 'prepared' };
}

/** Persistent intention and CAS always precede the single transport attempt. */
export async function exercisePriceOperation(job: PriceJob, ports: {
  baseUrl: string; verifiedRegistration: () => Promise<boolean>; store: PriceStore;
  read: () => Promise<PriceSnapshot>;
  write: (payload: ReturnType<typeof salePricePayload>) => Promise<{ status: number; body: unknown }>;
  reconcileOnly?: boolean;
}): Promise<PriceStage> {
  if (ports.baseUrl !== PRICE_HOMOLOGATION) return priceFail('homologation_only', 403);
  const expected = priceJob(job);
  if (expected.fingerprint !== job.fingerprint) return priceFail('price_payload_changed');
  if (!await ports.verifiedRegistration()) return priceFail('registration_not_verified');
  let record = await ports.store.reserve(expected);
  if (record.id !== job.id || record.fingerprint !== job.fingerprint || record.store_id !== job.store_id || record.actor_id !== job.actor_id)
    return priceFail('price_payload_changed');
  const advance = async (stage: PriceStage) => {
    if (!await ports.store.advance(record, stage)) return priceFail('price_operation_in_progress');
    record = { ...record, stage };
  };
  if (record.stage === 'price_started' || record.stage === 'price_verified') {
    const current = await ports.read();
    if (current.kind !== 'present' || current.cents !== job.cents) return priceFail('price_outcome_uncertain');
    if (record.stage === 'price_started') await advance('price_verified');
    return record.stage;
  }
  if (record.stage !== 'prepared') return priceFail('invalid_price_operation');
  if (ports.reconcileOnly) return priceFail('price_not_started');
  // This is the first price of a product created by the verified ISBN registration,
  // never a price-update workflow. No remote reads precede its single POST.
  await advance('price_started'); // Persistent CAS intention before the only POST attempt.
  try {
    const response: any = await ports.write(salePricePayload(job.child_code, job.table_id, job.cents));
    if (response?.status !== 200 || response.body?.sucesso !== true) return priceFail('price_outcome_uncertain');
    const confirmed = await ports.read();
    if (confirmed.kind !== 'present' || confirmed.cents !== job.cents) return priceFail('price_outcome_uncertain');
    await advance('price_verified');
    return record.stage;
  } catch { return priceFail('price_outcome_uncertain'); }
}
