import { supabase } from '../lib/supabase';

export type DatabaseOperationType = 'isbn_search' | 'new_product_created' | 'new_product_reused' | 'used_copy_created' | 'operation_error';
export type OperationStatus = 'pending' | 'success' | 'error';
export type OperationCondition = 'new' | 'used';
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface RecordOperationInput {
  id?: string;
  storeId: string;
  isbn?: string;
  title?: string;
  condition?: OperationCondition;
  operationType: DatabaseOperationType;
  status: Exclude<OperationStatus, 'pending'>;
  parentCode?: string;
  childCode?: string;
  errorMessage?: string;
  metadata?: { [key: string]: JsonValue };
  completedAt: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function failed(reason: 'invalid_context' | 'session_changed' | 'insert_failed' | 'request_failed'): false {
  // Never log server messages, sessions, payloads or raw exceptions.
  if (import.meta.env.DEV) console.warn('[operations] Registro não concluído:', reason);
  return false;
}

/** One INSERT attempt; retries with the same UUID can confirm a previous commit. Actor/environment belong to the database. */
export async function recordOperation(input: RecordOperationInput, expectedActorId: string): Promise<boolean> {
  if (!expectedActorId || !UUID_PATTERN.test(input.storeId) || (input.id !== undefined && !UUID_PATTERN.test(input.id))) return failed('invalid_context');
  try {
    const { data, error: sessionError } = await supabase.auth.getSession();
    // Do not attribute a late completion to a different account after logout/login.
    if (sessionError || !data.session || data.session.user.id !== expectedActorId) return failed('session_changed');
    const payload = {
      ...(input.id ? { id: input.id } : {}),
      store_id: input.storeId,
      isbn: input.isbn ?? null,
      title: input.title ?? null,
      condition: input.condition ?? null,
      operation_type: input.operationType,
      status: input.status,
      parent_code: input.parentCode ?? null,
      child_code: input.childCode ?? null,
      error_message: input.errorMessage ?? null,
      metadata: input.metadata ?? {},
      completed_at: input.completedAt,
    };
    const { error } = await supabase.from('operations').insert(payload);
    // A lost response may hide a committed INSERT. Never UPDATE/upsert an existing event.
    // A UUID conflict is success only after reading and matching the exact event under RLS.
    if (error?.code === '23505' && input.id) {
      const { data: existing, error: readError } = await supabase.from('operations')
        .select('id,store_id,user_id,isbn,title,condition,operation_type,status,parent_code,child_code,error_message,metadata,completed_at')
        .eq('id', input.id).eq('store_id', input.storeId).eq('user_id', expectedActorId).maybeSingle();
      if (!readError && existing && existing.user_id === expectedActorId
        && Object.entries(payload).every(([key, value]) => key === 'completed_at'
          ? new Date(existing[key]).getTime() === new Date(value as string).getTime()
          : canonicalJson(existing[key]) === canonicalJson(value))) return true;
    }
    return error ? failed('insert_failed') : true;
  } catch {
    return failed('request_failed');
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  return JSON.stringify(value);
}
