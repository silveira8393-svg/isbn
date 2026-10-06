import React, { useEffect, useRef, useState } from 'react';
import { useUser } from '../../contexts/UserContext';
import {
  loadStoreUsers, storeUserRoleLabel, storeUserStatusLabel, USERS_LOAD_ERROR, type StoreUser,
} from '../../services/usersService';
import NewUserForm from './NewUserForm';
import EditUserForm from './EditUserForm';

export default function UserManagement() {
  const { currentUser, canViewSettings } = useUser();
  const [retry, setRetry] = useState(0);
  const [formKey, setFormKey] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ key: string; user: StoreUser } | null>(null);
  const [notice, setNotice] = useState<{ key: string; message: string } | null>(null);
  const newUserButton = useRef<HTMLButtonElement>(null);
  const previousFormKey = useRef<string | null>(null);
  const editButton = useRef<HTMLButtonElement | null>(null);
  const previousEditKey = useRef<string | null>(null);
  const [loadState, setLoadState] = useState<{
    key: string; status: 'loading' | 'success' | 'error'; users: StoreUser[];
  }>({ key: '', status: 'loading', users: [] });
  const contextKey = [currentUser.id, currentUser.storeId, currentUser.role, canViewSettings].join(':');

  useEffect(() => { setFormKey(null); setEditing(null); setNotice(null); }, [contextKey]);
  useEffect(() => {
    if (previousEditKey.current === contextKey && editing?.key !== contextKey) editButton.current?.focus();
    previousEditKey.current = editing?.key ?? null;
  }, [editing, contextKey]);
  useEffect(() => {
    if (previousFormKey.current === contextKey && formKey !== contextKey) newUserButton.current?.focus();
    previousFormKey.current = formKey;
  }, [formKey, contextKey]);

  useEffect(() => {
    if (!canViewSettings) return;
    const controller = new AbortController();
    let cancelled = false;
    setLoadState({ key: contextKey, status: 'loading', users: [] });
    void loadStoreUsers(currentUser.storeId ?? '', controller.signal)
      .then(users => { if (!cancelled) setLoadState({ key: contextKey, status: 'success', users }); })
      .catch(() => { if (!cancelled) setLoadState({ key: contextKey, status: 'error', users: [] }); });
    return () => { cancelled = true; controller.abort(); };
  }, [contextKey, currentUser.storeId, canViewSettings, retry]);

  if (!canViewSettings) return null;
  const status = loadState.key === contextKey ? loadState.status : 'loading';
  const users = status === 'success' ? loadState.users : [];

  return (
    <section className="space-y-4" aria-labelledby="store-users-title" aria-busy={status === 'loading'}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 id="store-users-title" className="text-sm font-bold text-slate-900">Usuários</h3>
          <p className="text-xs text-slate-500">Usuários vinculados à {currentUser.storeName || 'loja atual'}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {status === 'success' && (
            <span className="text-xs text-slate-500 font-medium">
              {users.length} {users.length === 1 ? 'usuário' : 'usuários'}
            </span>
          )}
          <button ref={newUserButton} type="button" aria-expanded={formKey === contextKey}
            aria-controls={formKey === contextKey ? 'new-user-panel' : undefined} disabled={formKey === contextKey || editing?.key === contextKey}
            onClick={() => { setNotice(null); setFormKey(contextKey); }}
            className="cursor-pointer rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-default disabled:opacity-60">
            + Novo Usuário
          </button>
        </div>
      </div>

      {notice?.key === contextKey && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">{notice.message}</p>
      )}
      {formKey === contextKey && (
        <div id="new-user-panel" key={contextKey}>
          <NewUserForm onCancel={() => setFormKey(null)}
            onSuccess={email => {
              setFormKey(null);
              setNotice({ key: contextKey, message: `Convite enviado com sucesso para ${email}.` });
              setRetry(value => value + 1);
            }} />
        </div>
      )}
      {editing?.key === contextKey && (
        <div id="edit-user-panel" key={`${contextKey}:${editing.user.id}`}>
          <EditUserForm user={editing.user} onCancel={() => { setEditing(null); setRetry(value => value + 1); }}
            onSuccess={updated => {
              setEditing(null);
              setNotice({ key: contextKey, message: editing.user.membershipActive && !updated.active
                ? 'Usuário desativado com sucesso.' : 'Usuário atualizado com sucesso.' });
              if (updated.id === currentUser.id && (updated.role !== currentUser.role || !updated.active)) {
                window.location.reload();
                return;
              }
              setRetry(value => value + 1);
            }} />
        </div>
      )}

      {status === 'loading' && (
        <p role="status" className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600">
          Carregando usuários da loja...
        </p>
      )}
      {status === 'error' && (
        <div role="alert" className="p-4 bg-red-50 rounded-xl border border-red-200 text-xs text-red-800 space-y-3">
          <p>{USERS_LOAD_ERROR}</p>
          <button type="button" onClick={() => setRetry(value => value + 1)}
            className="px-3 py-2 bg-white border border-red-200 rounded-lg font-semibold hover:bg-red-100 cursor-pointer">
            Tentar novamente
          </button>
        </div>
      )}
      {status === 'success' && users.length === 0 && (
        <p role="status" className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600">
          Nenhum usuário vinculado à loja atual.
        </p>
      )}
      {status === 'success' && users.length > 0 && (
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th scope="col" className="px-3.5 py-3 font-semibold">Nome</th>
                <th scope="col" className="px-3.5 py-3 font-semibold">Perfil</th>
                <th scope="col" className="px-3.5 py-3 font-semibold">Status</th>
                <th scope="col" className="px-3.5 py-3 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map(user => (
                <tr key={user.id} className="bg-white">
                  <td className="px-3.5 py-3.5 font-semibold text-slate-900 break-words">{user.name}</td>
                  <td className="px-3.5 py-3.5 text-slate-700">{storeUserRoleLabel(user.role)}</td>
                  <td className="px-3.5 py-3.5">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                      user.status === 'active' ? 'bg-emerald-50 text-emerald-700'
                        : user.status === 'pending_invitation' ? 'bg-amber-50 text-amber-800'
                          : 'bg-slate-100 text-slate-600'
                    }`}>
                      {storeUserStatusLabel(user.status)}
                    </span>
                  </td>
                  <td className="px-3.5 py-3.5">
                    {(user.role === 'admin' || user.role === 'operator') && (
                      <button type="button" aria-label={`Editar ${user.name}`}
                        disabled={formKey === contextKey || editing?.key === contextKey}
                        onClick={event => {
                          editButton.current = event.currentTarget;
                          setNotice(null); setEditing({ key: contextKey, user });
                        }}
                        className="cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-default disabled:opacity-60">
                        Editar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
