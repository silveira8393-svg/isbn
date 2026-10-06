import type { SupabaseClient, User } from '@supabase/supabase-js';

export interface InvitePayload {
  action: 'invite_user';
  displayName: string;
  email: string;
  role: 'admin' | 'operator';
}

export interface HandlerOptions {
  getAdminClient: () => SupabaseClient;
  allowedOrigins: readonly string[];
  inviteRedirectTo: string;
}

class RequestError extends Error {
  constructor(readonly status: number, message: string, readonly code: string) { super(message); }
}

const duplicate = () => new RequestError(409, 'Já existe uma conta com este e-mail.', 'account_exists');
const forbidden = () => new RequestError(403, 'Você não tem permissão para convidar usuários nesta loja.', 'forbidden');
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface UpdatePayload {
  action: 'update_user'; targetUserId: string; role?: 'admin' | 'operator'; active?: boolean;
}

function validateUpdatePayload(value: Record<string, unknown>): UpdatePayload {
  if (Object.keys(value).some(key => !['action', 'targetUserId', 'role', 'active'].includes(key))
    || typeof value.targetUserId !== 'string' || !uuidPattern.test(value.targetUserId)
    || (!Object.hasOwn(value, 'role') && !Object.hasOwn(value, 'active'))
    || (Object.hasOwn(value, 'active') && typeof value.active !== 'boolean')) {
    throw new RequestError(400, 'Informe o usuário e o perfil ou status a alterar.', 'invalid_payload');
  }
  if (Object.hasOwn(value, 'role') && value.role !== 'admin' && value.role !== 'operator') {
    throw new RequestError(400, 'Selecione Proprietário ou Operador.', 'invalid_role');
  }
  return { action: 'update_user', targetUserId: value.targetUserId.toLowerCase(),
    ...(Object.hasOwn(value, 'role') ? { role: value.role as 'admin' | 'operator' } : {}),
    ...(Object.hasOwn(value, 'active') ? { active: value.active as boolean } : {}) };
}

async function updateCommercialUser(client: SupabaseClient, callerId: string, storeId: string, payload: UpdatePayload) {
  const unavailable = () => new RequestError(503, 'Não foi possível atualizar o usuário. Atualize a lista antes de tentar novamente.', 'update_unavailable');
  const { data: target, error } = await client.from('store_users').select('store_id,user_id,role,active')
    .eq('store_id', storeId).eq('user_id', payload.targetUserId).maybeSingle();
  if (error) throw unavailable();
  if (!target || target.store_id !== storeId || target.user_id !== payload.targetUserId) {
    // Same response for nonexistent users and memberships in other stores.
    throw new RequestError(404, 'Usuário não encontrado nesta loja.', 'target_not_found');
  }
  if (target.role === 'developer') throw new RequestError(403, 'Usuários Desenvolvedores não podem ser editados por esta interface.', 'developer_not_editable');
  if (!['admin', 'operator'].includes(target.role) || typeof target.active !== 'boolean') throw unavailable();
  if (await authorizedStore(client, callerId) !== storeId) throw forbidden();
  const role = payload.role ?? target.role;
  const active = payload.active ?? target.active;
  if (target.role === 'admin' && target.active && (role !== 'admin' || !active)) {
    const { count, error: countError } = await client.from('store_users')
      .select('user_id,profiles!inner(active)', { count: 'exact', head: true })
      .eq('store_id', storeId).eq('role', 'admin').eq('active', true)
      .eq('profiles.active', true).neq('user_id', target.user_id);
    if (countError || typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) throw unavailable();
    if (count < 1) throw new RequestError(409,
      'Não é possível alterar este usuário porque a loja precisa manter pelo menos um Proprietário ativo.', 'last_active_admin');
  }
  const changes = { ...(payload.role !== undefined ? { role } : {}), ...(payload.active !== undefined ? { active } : {}) };
  // Compare the target's read state: a concurrent developer promotion/change cannot be overwritten.
  const { data: updated, error: updateError } = await client.from('store_users').update(changes)
    .eq('store_id', storeId).eq('user_id', target.user_id).eq('role', target.role).eq('active', target.active)
    .select('user_id,role,active').maybeSingle();
  if (updateError) throw unavailable();
  if (!updated) throw new RequestError(409, 'O usuário mudou durante a edição. Atualize a lista antes de tentar novamente.', 'target_changed');
  if (updated.user_id !== target.user_id || updated.role !== role || updated.active !== active) throw unavailable();
  return { id: updated.user_id, role: updated.role, active: updated.active };
}

function validateStatusPayload(value: Record<string, unknown>): string[] {
  if (Object.keys(value).some(key => !['action', 'userIds'].includes(key))
    || !Array.isArray(value.userIds) || value.userIds.length < 1 || value.userIds.length > 100
    || value.userIds.some(id => typeof id !== 'string' || !uuidPattern.test(id))) {
    throw new RequestError(400, 'Informe de 1 a 100 usuários da loja.', 'invalid_payload');
  }
  const ids = value.userIds.map((id: string) => id.toLowerCase());
  if (new Set(ids).size !== ids.length) throw new RequestError(400, 'Informe usuários distintos.', 'invalid_payload');
  return ids;
}

async function assertStoreUsers(client: SupabaseClient, storeId: string, ids: string[]) {
  const { data, error } = await client.from('store_users').select('store_id,user_id')
    .eq('store_id', storeId).in('user_id', ids);
  if (error || !data) throw new RequestError(503, 'Não foi possível consultar o status dos convites.', 'status_unavailable');
  const scopedIds = new Set(data.filter(row => row.store_id === storeId).map(row => row.user_id));
  if (ids.some(id => !scopedIds.has(id))) throw forbidden();
}

export function validateInvitePayload(value: unknown): InvitePayload {
  const invalid = (message: string) => new RequestError(400, message, 'invalid_payload');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid('Informe um objeto JSON válido.');
  const payload = value as Record<string, unknown>;
  if (Object.keys(payload).some(key => !['action', 'displayName', 'email', 'role'].includes(key))) {
    throw invalid('O payload contém campos não suportados.');
  }
  if (payload.action !== 'invite_user') throw invalid('Ação não suportada.');
  if (payload.role !== 'admin' && payload.role !== 'operator') {
    throw invalid('O perfil de destino deve ser Proprietário ou Operador. Desenvolvedor não é permitido.');
  }
  if (typeof payload.displayName !== 'string' || typeof payload.email !== 'string') {
    throw invalid('Nome e e-mail são obrigatórios.');
  }
  const displayName = payload.displayName.trim();
  const email = payload.email.trim().toLowerCase();
  if (!displayName || displayName.length > 120 || /[\u0000-\u001f\u007f]/u.test(displayName)) {
    throw invalid('Informe um nome com até 120 caracteres.');
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) || /[\u0000-\u001f\u007f]/u.test(email)) {
    throw invalid('Informe um e-mail válido.');
  }
  return { action: 'invite_user', displayName, email, role: payload.role };
}

async function authorizedStore(client: SupabaseClient, callerId: string): Promise<string> {
  const { data: profile, error: profileError } = await client.from('profiles')
    .select('id,active').eq('id', callerId).maybeSingle();
  if (profileError) throw new RequestError(503, 'Não foi possível verificar sua permissão.', 'authorization_unavailable');
  if (!profile || profile.id !== callerId || profile.active !== true) throw forbidden();

  // Match UserContext: first active membership by store_id, without selecting a different admin store.
  const { data: membership, error: membershipError } = await client.from('store_users')
    .select('store_id,user_id,role,active').eq('user_id', callerId).eq('active', true)
    .order('store_id', { ascending: true }).limit(1).maybeSingle();
  if (membershipError) throw new RequestError(503, 'Não foi possível verificar sua permissão.', 'authorization_unavailable');
  if (!membership || membership.user_id !== callerId || membership.active !== true
    || !['admin', 'developer'].includes(membership.role) || !uuidPattern.test(membership.store_id)) throw forbidden();

  const { data: store, error: storeError } = await client.from('stores')
    .select('id,active').eq('id', membership.store_id).maybeSingle();
  if (storeError) throw new RequestError(503, 'Não foi possível verificar sua permissão.', 'authorization_unavailable');
  if (!store || store.id !== membership.store_id || store.active !== true) throw forbidden();
  return store.id;
}

async function rejectExistingAccount(client: SupabaseClient, email: string) {
  // Auth Admin API only; no auth.users SQL and no account/store details leave the backend.
  for (let page = 1; ; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users) throw new RequestError(503, 'Não foi possível verificar o convite. Tente novamente mais tarde.', 'account_check_failed');
    const users: readonly User[] = data.users;
    if (users.some(user => user.email?.trim().toLowerCase() === email)) throw duplicate();
    // Do not trust page length or optional pagination totals when the server caps returned pages.
    if (users.length === 0) return;
  }
}

export function createManageStoreUsersHandler(options: HandlerOptions) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('Origin');
    const originAllowed = !origin || options.allowedOrigins.includes(origin);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Vary': 'Origin',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    };
    if (origin && originAllowed) headers['Access-Control-Allow-Origin'] = origin;
    const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers });
    const fail = (error: RequestError, partial = false) => json({ success: false, error: error.message, code: error.code, ...(partial ? { partial: true } : {}) }, error.status);
    if (!originAllowed) return fail(new RequestError(403, 'Origem não permitida.', 'origin_forbidden'));
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return fail(new RequestError(405, 'Use POST para esta ação.', 'method_not_allowed'));
    const token = request.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!token) return fail(new RequestError(401, 'Entre novamente para continuar.', 'unauthenticated'));

    let invited = false;
    let readingStatus = false;
    let updating = false;
    try {
      const client = options.getAdminClient();
      const { data: identity, error: identityError } = await client.auth.getUser(token);
      if (identityError || !identity.user || !uuidPattern.test(identity.user.id)) {
        throw new RequestError(401, 'Entre novamente para continuar.', 'unauthenticated');
      }
      const storeId = await authorizedStore(client, identity.user.id);
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') ?? '')) {
        throw new RequestError(400, 'Envie o payload como JSON.', 'invalid_payload');
      }
      let raw: unknown;
      try { raw = await request.json(); } catch { throw new RequestError(400, 'Informe um JSON válido.', 'invalid_payload'); }
      if (raw && typeof raw === 'object' && !Array.isArray(raw)
        && (raw as Record<string, unknown>).action === 'update_user') {
        updating = true;
        const user = await updateCommercialUser(client, identity.user.id, storeId,
          validateUpdatePayload(raw as Record<string, unknown>));
        return json({ success: true, user }, 200);
      }
      if (raw && typeof raw === 'object' && !Array.isArray(raw)
        && (raw as Record<string, unknown>).action === 'get_invitation_status') {
        readingStatus = true;
        const ids = validateStatusPayload(raw as Record<string, unknown>);
        // Authorize every target before accessing Auth; never enumerate the Auth directory here.
        await assertStoreUsers(client, storeId, ids);
        const users: { id: string; invitePending: boolean }[] = [];
        for (let offset = 0; offset < ids.length; offset += 10) {
          const batch = await Promise.all(ids.slice(offset, offset + 10).map(async id => {
            const { data, error } = await client.auth.admin.getUserById(id);
            if (error || !data?.user || data.user.id !== id) {
              throw new RequestError(503, 'Não foi possível consultar o status dos convites.', 'status_unavailable');
            }
            // Email invitation confirmation uses email_confirmed_at, not a login timestamp.
            return { id, invitePending: Boolean(data.user.invited_at) && !data.user.email_confirmed_at };
          }));
          users.push(...batch);
        }
        if (await authorizedStore(client, identity.user.id) !== storeId) throw forbidden();
        await assertStoreUsers(client, storeId, ids);
        return json({ success: true, users }, 200);
      }
      const payload = validateInvitePayload(raw);
      let redirect: URL;
      try { redirect = new URL(options.inviteRedirectTo); } catch { throw new RequestError(503, 'O serviço de convites não está configurado.', 'configuration_error'); }
      if (!['https:', 'http:'].includes(redirect.protocol) || redirect.username || redirect.password
        || !options.allowedOrigins.includes(redirect.origin) || redirect.searchParams.get('auth') !== 'recovery') {
        throw new RequestError(503, 'O serviço de convites não está configurado.', 'configuration_error');
      }

      await rejectExistingAccount(client, payload.email);
      // Revalidate immediately before side effects; this does not make Auth/PostgREST atomic.
      if (await authorizedStore(client, identity.user.id) !== storeId) throw forbidden();
      const invitationRequestId = crypto.randomUUID();
      const { data: invitation, error: invitationError } = await client.auth.admin.inviteUserByEmail(payload.email, {
        data: { display_name: payload.displayName, isbn_invitation_request_id: invitationRequestId },
        redirectTo: redirect.toString(),
      });
      if (invitationError) {
        if (['email_exists', 'user_already_exists', 'email_address_exists'].includes(invitationError.code ?? '') || invitationError.status === 409) throw duplicate();
        throw new RequestError(502, 'Não foi possível enviar o convite. Verifique o estado da conta antes de tentar novamente.', 'auth_invite_failed');
      }
      const user = invitation.user;
      // inviteUserByEmail may reuse an unconfirmed account. Only a newly created request's metadata permits linking.
      if (user && user.user_metadata?.isbn_invitation_request_id !== invitationRequestId) throw duplicate();
      invited = true;
      if (!user || !uuidPattern.test(user.id) || user.id === identity.user.id || user.email?.toLowerCase() !== payload.email) throw new Error('Invalid invitation result');

      const { data: newProfile, error: newProfileError } = await client.from('profiles')
        .select('id,active').eq('id', user.id).maybeSingle();
      if (newProfileError || !newProfile || newProfile.id !== user.id || newProfile.active !== true) throw new Error('Profile unavailable');
      // No manual profiles INSERT: handle_new_auth_user is responsible for creation.
      if (await authorizedStore(client, identity.user.id) !== storeId) throw new Error('Caller permission changed');
      const { error: membershipError } = await client.from('store_users').insert({
        store_id: storeId, user_id: user.id, role: payload.role, active: true,
      });
      if (membershipError) throw new Error('Membership creation failed');
      return json({ success: true, message: 'Convite enviado e usuário vinculado à loja.',
        user: { id: user.id, displayName: payload.displayName, role: payload.role } }, 201);
    } catch (error) {
      if (invited) return fail(new RequestError(502,
        'O convite foi enviado, mas não foi possível concluir o vínculo com a loja. Solicite verificação administrativa antes de tentar novamente.',
        'membership_creation_failed'), true);
      if (error instanceof RequestError) return fail(error);
      if (updating) return fail(new RequestError(503, 'Não foi possível atualizar o usuário. Atualize a lista antes de tentar novamente.', 'update_unavailable'));
      if (readingStatus) return fail(new RequestError(503, 'Não foi possível consultar o status dos convites.', 'status_unavailable'));
      return fail(new RequestError(503, 'Não foi possível concluir o convite. Verifique o estado da conta antes de tentar novamente.', 'service_unavailable'));
    }
  };
}
