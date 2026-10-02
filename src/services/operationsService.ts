import { supabase } from '../lib/supabase';

export type DatabaseOperationType = 'isbn_search' | 'new_product_created' | 'new_product_reused' | 'used_copy_created' | 'operation_error';
export type OperationStatus = 'pending' | 'success' | 'error';
export type OperationCondition = 'new' | 'used';
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface RecordOperationInput {
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

/** A single best-effort INSERT; actor/environment remain exclusively controlled by the database. */
export async function recordOperation(input: RecordOperationInput, expectedActorId: string): Promise<boolean> {
  if (!expectedActorId || !UUID_PATTERN.test(input.storeId)) return failed('invalid_context');
  try {
    const { data, error: sessionError } = await supabase.auth.getSession();
    // Do not attribute a late completion to a different account after logout/login.
    if (sessionError || !data.session || data.session.user.id !== expectedActorId) return failed('session_changed');
    const { error } = await supabase.from('operations').insert({
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
    });
    return error ? failed('insert_failed') : true;
  } catch {
    return failed('request_failed');
  }
}
