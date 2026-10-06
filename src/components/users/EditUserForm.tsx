import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useUser } from '../../contexts/UserContext';
import { updateStoreUser, UpdateStoreUserError, type StoreUser, type UpdateStoreUserInput } from '../../services/usersService';

export default function EditUserForm({ user, onCancel, onSuccess }: {
  user: StoreUser; onCancel: () => void;
  onSuccess: (updated: { id: string; role: 'admin' | 'operator'; active: boolean }) => void;
}) {
  const { currentUser, canViewSettings } = useUser();
  const [role, setRole] = useState(user.role);
  const [active, setActive] = useState(user.membershipActive);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<UpdateStoreUserError | null>(null);
  const pending = useRef(false), completed = useRef(false), mounted = useRef(false);
  const contextKey = [currentUser.id, currentUser.storeId, currentUser.role, canViewSettings, user.id].join(':');
  const latestContext = useRef(contextKey); latestContext.current = contextKey;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending.current || completed.current || error?.reviewRequired || !mounted.current || !canViewSettings
      || !['admin', 'operator'].includes(user.role)) return;
    if (role !== 'admin' && role !== 'operator') { setError(new UpdateStoreUserError('Selecione Proprietário ou Operador.')); return; }
    if (role === user.role && active === user.membershipActive) { onCancel(); return; }
    const isCurrent = () => mounted.current && latestContext.current === contextKey;
    const payload: UpdateStoreUserInput = { targetUserId: user.id,
      ...(role !== user.role ? { role } : {}), ...(active !== user.membershipActive ? { active } : {}) };
    pending.current = true; setSaving(true); setError(null);
    try {
      const result = await updateStoreUser(payload, { expectedUserId: currentUser.id, isCurrent });
      completed.current = true;
      if (isCurrent()) onSuccess(result);
    } catch (failure) {
      if (isCurrent()) setError(failure instanceof UpdateStoreUserError ? failure : new UpdateStoreUserError(
        'Não foi possível confirmar a atualização. Feche a edição e atualize a lista antes de tentar novamente.', true,
      ));
    } finally { pending.current = false; if (isCurrent()) setSaving(false); }
  };
  if (!canViewSettings || !['admin', 'operator'].includes(user.role)) return null;
  const fieldClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60';
  return (
    <form onSubmit={handleSubmit} noValidate aria-labelledby="edit-user-title" aria-busy={saving}
      className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h4 id="edit-user-title" className="text-sm font-bold text-slate-900">Editar usuário</h4>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="edit-user-name" className="mb-1 block text-xs font-semibold text-slate-700">Nome</label>
          <input id="edit-user-name" value={user.name} readOnly className={fieldClass} />
        </div>
        <div>
          <label htmlFor="edit-user-role" className="mb-1 block text-xs font-semibold text-slate-700">Perfil</label>
          <select id="edit-user-role" autoFocus value={role} onChange={event => setRole(event.target.value as StoreUser['role'])}
            disabled={saving} aria-describedby={error ? 'edit-user-error' : undefined} className={fieldClass}>
            <option value="admin">Proprietário</option><option value="operator">Operador</option>
          </select>
        </div>
        <div>
          <label htmlFor="edit-user-active" className="mb-1 block text-xs font-semibold text-slate-700">Status</label>
          <select id="edit-user-active" value={active ? 'active' : 'inactive'}
            onChange={event => setActive(event.target.value === 'active')} disabled={saving} className={fieldClass}>
            <option value="active">Ativo</option><option value="inactive">Inativo</option>
          </select>
          <p className="mt-1 text-xs text-slate-500">Habilitação do vínculo com a loja.</p>
        </div>
      </div>
      {user.status === 'pending_invitation' && <p className="text-xs text-amber-800">O convite permanece pendente até a confirmação pelo usuário.</p>}
      {user.id === currentUser.id && <p className="text-xs text-slate-500">Ao alterar seu próprio acesso, a página será atualizada.</p>}
      {error && <p id="edit-user-error" role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">{error.message}</p>}
      {saving && <p role="status" className="text-xs text-slate-600">Salvando usuário...</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" disabled={saving} onClick={() => { if (!pending.current) onCancel(); }}
          className="cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60">Cancelar</button>
        <button type="submit" disabled={saving || Boolean(error?.reviewRequired)}
          className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60">{saving ? 'Salvando...' : 'Salvar'}</button>
      </div>
    </form>
  );
}
