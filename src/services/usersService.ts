import { supabase } from '../lib/supabase';
import type { UserRole } from '../types';

export type StoreUserStatus = 'pending_invitation' | 'active' | 'inactive';

export interface StoreUser {
  id: string;
  name: string;
  role: UserRole;
  active: boolean;
  status: StoreUserStatus;
  membershipActive: boolean;
}

interface StoreMembership {
  store_id: string;
  user_id: string;
  role: UserRole;
  active: boolean;
}

interface StoreProfile {
  id: string;
  display_name: string;
  active: boolean;
}

export const USERS_LOAD_ERROR = 'Não foi possível carregar os usuários da loja. Tente novamente.';

const roleLabels: Record<UserRole, string> = {
  admin: 'Proprietário', operator: 'Operador', developer: 'Desenvolvedor',
};

export const storeUserRoleLabel = (role: UserRole) => roleLabels[role];
const statusLabels: Record<StoreUserStatus, string> = {
  pending_invitation: 'Convite pendente', active: 'Ativo', inactive: 'Inativo',
};
export const storeUserStatusLabel = (status: StoreUserStatus) => statusLabels[status];

/** Read the current store's authorized memberships and profiles through existing RLS. */
export async function loadStoreUsers(storeId: string, signal?: AbortSignal): Promise<StoreUser[]> {
  const failure = () => new Error(USERS_LOAD_ERROR);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storeId)) throw failure();

  try {
    const memberships: StoreMembership[] = [];
    let offset = 0;
    while (true) {
      if (signal?.aborted) throw failure();
      let query = supabase.from('store_users')
        .select('store_id,user_id,role,active', { count: 'exact' })
        .eq('store_id', storeId).order('user_id', { ascending: true }).range(offset, offset + 499);
      if (signal) query = query.abortSignal(signal);
      const { data, error, count } = await query;
      if (error || !data || count === null || signal?.aborted) throw failure();
      memberships.push(...(data as StoreMembership[]).filter(row => row.store_id === storeId));
      offset += data.length;
      if (offset >= count) break;
      if (!data.length) throw failure();
    }

    const profiles = new Map<string, StoreProfile>();
    const userIds = [...new Set(memberships.map(row => row.user_id))];
    for (let index = 0; index < userIds.length; index += 100) {
      if (signal?.aborted) throw failure();
      let query = supabase.from('profiles').select('id,display_name,active')
        .in('id', userIds.slice(index, index + 100));
      if (signal) query = query.abortSignal(signal);
      const { data, error } = await query;
      if (error || !data || signal?.aborted) throw failure();
      for (const profile of data as StoreProfile[]) profiles.set(profile.id, profile);
    }

    if (signal?.aborted) throw failure();
    const users: StoreUser[] = memberships.map(membership => {
      const profile = profiles.get(membership.user_id);
      // Never turn an unavailable profile into an invented name/status or hide its membership.
      if (!profile || typeof profile.display_name !== 'string' || typeof profile.active !== 'boolean'
        || typeof membership.active !== 'boolean' || !Object.hasOwn(roleLabels, membership.role)) throw failure();
      return {
        id: membership.user_id, name: profile.display_name.trim() || 'Sem nome',
        role: membership.role, active: membership.active && profile.active,
        membershipActive: membership.active,
        status: membership.active && profile.active ? 'active' : 'inactive',
      };
    });
    // Internal enablement has priority. Auth is read only by the administrative backend.
    const enabledIds = [...new Set(users.filter(user => user.active).map(user => user.id))];
    const pending = new Map<string, boolean>();
    for (let index = 0; index < enabledIds.length; index += 100) {
      if (signal?.aborted) throw failure();
      const ids = enabledIds.slice(index, index + 100);
      const { data, error } = await supabase.functions.invoke('manage-store-users', {
        method: 'POST', body: { action: 'get_invitation_status', userIds: ids }, signal,
      });
      if (error || signal?.aborted || data?.success !== true || !Array.isArray(data.users)
        || data.users.length !== ids.length) throw failure();
      const batchIds = new Set<string>();
      for (const item of data.users) {
        if (!item || typeof item.id !== 'string' || !ids.includes(item.id)
          || batchIds.has(item.id) || typeof item.invitePending !== 'boolean') throw failure();
        batchIds.add(item.id);
        pending.set(item.id, item.invitePending);
      }
    }
    if (signal?.aborted) throw failure();
    for (const user of users) {
      if (user.active) user.status = pending.get(user.id) ? 'pending_invitation' : 'active';
    }
    return users.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') || a.id.localeCompare(b.id));
  } catch { throw failure(); }
}

export interface InviteStoreUserInput {
  displayName: string;
  email: string;
  role: 'admin' | 'operator';
}

type InviteField = 'displayName' | 'email' | 'role';

export class InviteStoreUserError extends Error {
  constructor(message: string, readonly field?: InviteField, readonly reviewRequired = false) {
    super(message);
    this.name = 'InviteStoreUserError';
  }
}

export function validateInviteStoreUserInput(input: InviteStoreUserInput): InviteStoreUserInput {
  const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!displayName) throw new InviteStoreUserError('Informe o nome.', 'displayName');
  if (displayName.length > 120 || /[\u0000-\u001f\u007f]/u.test(displayName)) {
    throw new InviteStoreUserError('Informe um nome com até 120 caracteres.', 'displayName');
  }
  if (!email) throw new InviteStoreUserError('Informe o e-mail.', 'email');
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) || /[\u0000-\u001f\u007f]/u.test(email)) {
    throw new InviteStoreUserError('Informe um e-mail válido.', 'email');
  }
  if (input.role !== 'admin' && input.role !== 'operator') {
    throw new InviteStoreUserError('Selecione Proprietário ou Operador.', 'role');
  }
  return { displayName, email, role: input.role };
}

const uncertainInvite = () => new InviteStoreUserError(
  'Não foi possível confirmar o convite. Verifique sua conexão e solicite uma revisão antes de tentar novamente.',
  undefined, true,
);

/** Uses only the signed-in user's JWT; the backend validates identity and derives the store. */
export async function inviteStoreUser(input: InviteStoreUserInput, context: {
  expectedUserId: string; isCurrent: () => boolean;
}): Promise<{ email: string }> {
  const payload = validateInviteStoreUserInput(input);
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.access_token || session.user.id !== context.expectedUserId || !context.isCurrent()) {
      throw new InviteStoreUserError('Sua sessão mudou ou expirou. Entre novamente para enviar o convite.');
    }
    const { data, error, response } = await supabase.functions.invoke('manage-store-users', {
      method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` },
      body: { action: 'invite_user', displayName: payload.displayName, email: payload.email, role: payload.role },
    });
    // FunctionsHttpError keeps the JSON body on its Response, even when data is null.
    const httpResponse = response ?? (error?.context instanceof Response ? error.context : undefined);
    let body: unknown = data;
    if (error && httpResponse) {
      try { body = await httpResponse.clone().json(); } catch { body = null; }
    }
    const result = body && typeof body === 'object' ? body as Record<string, unknown> : {};
    const status = httpResponse?.status;
    if (result.partial === true) {
      throw new InviteStoreUserError(
        'O convite foi criado, mas não foi possível concluir o vínculo com a loja. Solicite uma revisão antes de tentar novamente.',
        undefined, true,
      );
    }
    if (status === 409 || result.code === 'account_exists') {
      throw new InviteStoreUserError('Já existe uma conta com este e-mail.', 'email');
    }
    if (status === 401 || result.code === 'unauthenticated') {
      throw new InviteStoreUserError('Sua sessão expirou. Entre novamente para enviar o convite.');
    }
    if (status === 403 || result.code === 'forbidden' || result.code === 'origin_forbidden') {
      throw new InviteStoreUserError('Você não tem permissão para convidar usuários nesta loja.');
    }
    if (status === 400 || result.code === 'invalid_payload') {
      throw new InviteStoreUserError('Confira o nome, o e-mail e o perfil antes de enviar.');
    }
    if (status === 429) throw new InviteStoreUserError('Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.');
    if (['configuration_error', 'authorization_unavailable', 'account_check_failed'].includes(String(result.code))) {
      throw new InviteStoreUserError('O serviço de convites está indisponível. Tente novamente mais tarde.');
    }
    if (error || result.success !== true || (status !== undefined && status !== 201)) throw uncertainInvite();
    return { email: payload.email };
  } catch (error) {
    if (error instanceof InviteStoreUserError) throw error;
    throw uncertainInvite();
  }
}

export interface UpdateStoreUserInput {
  targetUserId: string; role?: 'admin' | 'operator'; active?: boolean;
}

export class UpdateStoreUserError extends Error {
  constructor(message: string, readonly reviewRequired = false) {
    super(message); this.name = 'UpdateStoreUserError';
  }
}

export function validateUpdateStoreUserInput(input: UpdateStoreUserInput): UpdateStoreUserInput {
  if (!input || typeof input.targetUserId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.targetUserId)
    || (input.role === undefined && input.active === undefined)
    || (input.active !== undefined && typeof input.active !== 'boolean')) {
    throw new UpdateStoreUserError('Confira o usuário e o status antes de salvar.');
  }
  if (input.role !== undefined && input.role !== 'admin' && input.role !== 'operator') {
    throw new UpdateStoreUserError('Selecione Proprietário ou Operador.');
  }
  return { targetUserId: input.targetUserId.toLowerCase(),
    ...(input.role !== undefined ? { role: input.role } : {}), ...(input.active !== undefined ? { active: input.active } : {}) };
}

const uncertainUpdate = () => new UpdateStoreUserError(
  'Não foi possível confirmar a atualização. Feche a edição e atualize a lista antes de tentar novamente.', true,
);

export async function updateStoreUser(input: UpdateStoreUserInput, context: {
  expectedUserId: string; isCurrent: () => boolean;
}): Promise<{ id: string; role: 'admin' | 'operator'; active: boolean }> {
  const payload = validateUpdateStoreUserInput(input);
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.access_token || session.user.id !== context.expectedUserId || !context.isCurrent()) {
      throw new UpdateStoreUserError('Sua sessão mudou ou expirou. Entre novamente para salvar.');
    }
    const { data, error, response } = await supabase.functions.invoke('manage-store-users', {
      method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` },
      body: { action: 'update_user', ...payload },
    });
    const httpResponse = response ?? (error?.context instanceof Response ? error.context : undefined);
    let body: unknown = data;
    if (error && httpResponse) { try { body = await httpResponse.clone().json(); } catch { body = null; } }
    const result = body && typeof body === 'object' ? body as Record<string, unknown> : {};
    if (result.code === 'last_active_admin') throw new UpdateStoreUserError(
      'Não é possível alterar este usuário porque a loja precisa manter pelo menos um Proprietário ativo.',
    );
    if (result.code === 'developer_not_editable') throw new UpdateStoreUserError('Usuários Desenvolvedores não podem ser editados por esta interface.');
    if (result.code === 'target_not_found' || httpResponse?.status === 404) throw new UpdateStoreUserError('Usuário não encontrado nesta loja.');
    if (result.code === 'invalid_role') throw new UpdateStoreUserError('Selecione Proprietário ou Operador.');
    if (httpResponse?.status === 401) throw new UpdateStoreUserError('Sua sessão expirou. Entre novamente para salvar.');
    if (httpResponse?.status === 403) throw new UpdateStoreUserError('Você não tem permissão para editar usuários nesta loja.');
    if (httpResponse?.status === 400) throw new UpdateStoreUserError('Confira o perfil e o status antes de salvar.');
    if (httpResponse?.status === 429) throw new UpdateStoreUserError('Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.');
    if (result.code === 'target_changed') throw new UpdateStoreUserError('O usuário mudou durante a edição. Feche a edição e atualize a lista.', true);
    if (result.code === 'authorization_unavailable') throw new UpdateStoreUserError('O serviço está indisponível. Tente novamente mais tarde.');
    if (result.code === 'update_unavailable') throw new UpdateStoreUserError('O serviço de atualização está indisponível. Feche a edição e atualize a lista antes de tentar novamente.', true);
    // A transport/backend failure can happen after the UPDATE; never retry it automatically.
    const user = result.user as Record<string, unknown> | undefined;
    if (error || result.success !== true || httpResponse?.status !== 200 || !user || user.id !== payload.targetUserId
      || !['admin', 'operator'].includes(String(user.role)) || typeof user.active !== 'boolean'
      || (payload.role !== undefined && user.role !== payload.role) || (payload.active !== undefined && user.active !== payload.active)) throw uncertainUpdate();
    return { id: user.id as string, role: user.role as 'admin' | 'operator', active: user.active };
  } catch (error) {
    if (error instanceof UpdateStoreUserError) throw error;
    throw uncertainUpdate();
  }
}
