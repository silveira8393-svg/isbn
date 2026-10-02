import { supabase } from '../lib/supabase';
import type { OperationEnvironment } from '../types';
import type { DatabaseOperationType, OperationCondition, OperationStatus } from './operationsService';

export type ProductionPeriod = 'today' | '7days' | '30days' | 'all';

export interface ProductionOperation {
  id: string;
  store_id: string;
  user_id: string | null;
  environment: OperationEnvironment;
  operation_type: DatabaseOperationType;
  status: OperationStatus;
  condition: OperationCondition | null;
  isbn: string | null;
  title: string | null;
  parent_code: string | null;
  child_code: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
}

export interface ProductionData {
  operations: ProductionOperation[];
  names: Record<string, string>;
}

/** Capture one time boundary for all pages; completed_at takes precedence over created_at. */
export function productionPeriodBounds(period: ProductionPeriod, now = new Date()) {
  const end = now.toISOString();
  if (period === 'all') return { start: null, end };
  const start = new Date(now);
  if (period === 'today') start.setHours(0, 0, 0, 0);
  else start.setTime(now.getTime() - (period === '7days' ? 7 : 30) * 86400000);
  return { start: start.toISOString(), end };
}

/** Read only the active store/environment, without local history or privileged credentials. */
export async function loadProduction(
  storeId: string, environment: OperationEnvironment, period: ProductionPeriod, signal?: AbortSignal,
): Promise<ProductionData> {
  const failure = () => new Error('Não foi possível carregar a produção. Tente novamente mais tarde.');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storeId)
    || !['production', 'development'].includes(environment)) throw failure();
  const { start, end } = productionPeriodBounds(period);
  const operations: ProductionOperation[] = [];
  try {
    let offset = 0;
    while (true) {
      let query = supabase.from('operations')
        .select('id,store_id,user_id,environment,operation_type,status,condition,isbn,title,parent_code,child_code,metadata,created_at,completed_at', { count: 'exact' })
        .eq('store_id', storeId).eq('environment', environment)
        .or(`completed_at.lte.${end},and(completed_at.is.null,created_at.lte.${end})`);
      if (start) query = query.or(`completed_at.gte.${start},and(completed_at.is.null,created_at.gte.${start})`);
      query = query.order('created_at', { ascending: true }).order('id', { ascending: true }).range(offset, offset + 499);
      if (signal) query = query.abortSignal(signal);
      const { data, error, count } = await query;
      if (error || !data || count === null || signal?.aborted) throw failure();
      // Defence in depth; RLS and explicit SELECT filters remain authoritative.
      operations.push(...(data as ProductionOperation[]).filter(row => row.store_id === storeId && row.environment === environment));
      offset += data.length;
      if (offset >= count) break;
      // Use actual returned length even if the server caps pages below the requested size.
      if (!data.length) throw failure();
    }
    const names: Record<string, string> = {};
    const ids = [...new Set(operations.flatMap(row => row.user_id ? [row.user_id] : []))];
    for (let index = 0; index < ids.length; index += 100) {
      if (signal?.aborted) throw failure();
      // Optional enrichment under existing RLS. Unavailable names retain their real UUID.
      try {
        let query = supabase.from('profiles').select('id,display_name').in('id', ids.slice(index, index + 100));
        if (signal) query = query.abortSignal(signal);
        const { data, error } = await query;
        if (!error) for (const profile of data ?? []) {
          if (typeof profile.display_name === 'string' && profile.display_name.trim()) names[profile.id] = profile.display_name.trim();
        }
      } catch { /* Keep UUIDs when profile lookup is unavailable. */ }
    }
    if (signal?.aborted) throw failure();
    return { operations, names };
  } catch { throw failure(); }
}
