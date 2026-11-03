import { supabase } from '../lib/supabase';
import type { User } from '../types';

export const CONDITION_TEMPLATES_KEY = 'used_book_condition_templates';
export interface ConditionTemplate { id: string; name: string; text: string; active: boolean }
export interface ConditionTemplateSnapshot {
  storeId: string;
  exists: boolean;
  settings: Record<string, unknown>;
  templates: ConditionTemplate[];
}
export type TemplateActor = Pick<User, 'id' | 'storeId' | 'role' | 'active'>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const messages = {
  permission: 'Sua conta não tem autorização para esta ação na loja atual.',
  load: 'Não foi possível carregar os modelos da loja. Você pode continuar com observações manuais.',
  invalid: 'A configuração dos modelos está em formato inválido ou não suportado. Nenhuma configuração foi substituída.',
  conflict: 'A gravação não foi confirmada: as configurações podem ter mudado ou o acesso foi recusado. Recarregue os modelos antes de tentar novamente.',
  save: 'Não foi possível confirmar a gravação dos modelos. Recarregue antes de tentar novamente; nenhuma confirmação de sucesso foi recebida.',
};
export class ConditionTemplateError extends Error {
  constructor(public code: keyof typeof messages) { super(messages[code]); }
}
export const canManageConditionTemplates = (actor: TemplateActor) => actor.active && ['admin', 'developer'].includes(actor.role);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

function validTemplates(value: unknown): value is ConditionTemplate[] {
  return Array.isArray(value) && value.every(item => object(item)
    && typeof item.id === 'string' && !!item.id.trim() && typeof item.name === 'string' && !!item.name.trim()
    && typeof item.text === 'string' && !!item.text.trim() && typeof item.active === 'boolean')
    && new Set(value.map(item => item.id)).size === value.length;
}

function snapshot(storeId: string, row: unknown): ConditionTemplateSnapshot {
  if (row === null) return { storeId, exists: false, settings: {}, templates: [] };
  if (!object(row) || row.store_id !== storeId || !object(row.settings)) throw new ConditionTemplateError('invalid');
  const settings = structuredClone(row.settings);
  if (!Object.prototype.hasOwnProperty.call(settings, CONDITION_TEMPLATES_KEY)) return { storeId, exists: true, settings, templates: [] };
  const config = settings[CONDITION_TEMPLATES_KEY];
  if (!object(config) || config.version !== 1 || !validTemplates(config.items)) throw new ConditionTemplateError('invalid');
  return { storeId, exists: true, settings, templates: structuredClone(config.items) };
}

async function authorize(actor: TemplateActor, write: boolean, signal?: AbortSignal) {
  if (!actor.active || !uuid.test(actor.id) || !actor.storeId || !uuid.test(actor.storeId)
    || !['admin', 'developer', 'operator'].includes(actor.role) || (write && !canManageConditionTemplates(actor))) throw new ConditionTemplateError('permission');
  const { data, error } = await supabase.auth.getUser();
  if (error || data.user?.id !== actor.id || signal?.aborted) throw new ConditionTemplateError('permission');
  let query = supabase.from('store_users').select('store_id,user_id,role,active').eq('store_id', actor.storeId).eq('user_id', actor.id);
  if (signal) query = query.abortSignal(signal);
  const { data: member, error: memberError } = await query.maybeSingle();
  if (memberError || !member || member.store_id !== actor.storeId || member.user_id !== actor.id || !member.active
    || member.role !== actor.role || signal?.aborted) throw new ConditionTemplateError('permission');
}

export async function loadConditionTemplates(actor: TemplateActor, signal?: AbortSignal): Promise<ConditionTemplateSnapshot> {
  try {
    await authorize(actor, false, signal);
    let query = supabase.from('store_settings').select('store_id,settings').eq('store_id', actor.storeId!);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query.maybeSingle();
    if (error || signal?.aborted) throw new ConditionTemplateError('load');
    return snapshot(actor.storeId!, data);
  } catch (error) { throw error instanceof ConditionTemplateError ? error : new ConditionTemplateError('load'); }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

/** Compare the entire previous JSONB, so changes to any setting cannot be overwritten.
 * PostgREST eq maps to PostgreSQL =. Never retry without the predicate or fall back to upsert.
 * https://docs.postgrest.org/en/stable/references/api/tables_views.html#operators
 */
export async function saveConditionTemplates(actor: TemplateActor, base: ConditionTemplateSnapshot,
  templates: ConditionTemplate[], signal?: AbortSignal): Promise<ConditionTemplateSnapshot> {
  try {
    if (base.storeId !== actor.storeId || !object(base.settings) || !validTemplates(templates)) throw new ConditionTemplateError('invalid');
    await authorize(actor, true, signal);
    const settings = { ...structuredClone(base.settings), [CONDITION_TEMPLATES_KEY]: { version: 1, items: structuredClone(templates) } };
    // Guard a logout/account change during the membership request; RLS remains authoritative.
    const { data: session, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || session.session?.user.id !== actor.id || signal?.aborted) throw new ConditionTemplateError('permission');
    let query = base.exists
      ? supabase.from('store_settings').update({ settings, updated_by: actor.id })
        .eq('store_id', actor.storeId!).eq('settings', JSON.stringify(base.settings))
      : supabase.from('store_settings').insert({ store_id: actor.storeId, settings, updated_by: actor.id });
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query.select('store_id,settings').maybeSingle();
    if (error?.code === '23505' || (!error && data === null)) throw new ConditionTemplateError('conflict');
    if (error || signal?.aborted) throw new ConditionTemplateError('save');
    const saved = snapshot(actor.storeId!, data);
    if (canonical(saved.settings) !== canonical(settings)) throw new ConditionTemplateError('save');
    return saved;
  } catch (error) { throw error instanceof ConditionTemplateError ? error : new ConditionTemplateError('save'); }
}
