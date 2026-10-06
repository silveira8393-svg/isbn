import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useUser } from '../../contexts/UserContext';
import {
  inviteStoreUser, InviteStoreUserError, validateInviteStoreUserInput, type InviteStoreUserInput,
} from '../../services/usersService';

export default function NewUserForm({ onCancel, onSuccess }: {
  onCancel: () => void; onSuccess: (email: string) => void;
}) {
  const { currentUser, canViewSettings } = useUser();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<InviteStoreUserError | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const roleInput = useRef<HTMLSelectElement>(null);
  const pending = useRef(false);
  const completed = useRef(false);
  const mounted = useRef(false);
  const contextKey = [currentUser.id, currentUser.storeId, currentUser.role, canViewSettings].join(':');
  const latestContext = useRef(contextKey);
  latestContext.current = contextKey;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending.current || completed.current || error?.reviewRequired || !mounted.current || !canViewSettings) return;
    const isCurrent = () => mounted.current && latestContext.current === contextKey;
    setError(null);
    let payload: InviteStoreUserInput;
    try { payload = validateInviteStoreUserInput({ displayName, email, role: role as InviteStoreUserInput['role'] }); }
    catch (failure) {
      const validation = failure as InviteStoreUserError;
      setError(validation);
      const field = validation.field === 'email' ? emailInput : validation.field === 'role' ? roleInput : nameInput;
      field.current?.focus();
      return;
    }
    pending.current = true;
    setSending(true);
    try {
      const result = await inviteStoreUser(payload, { expectedUserId: currentUser.id, isCurrent });
      completed.current = true;
      if (isCurrent()) {
        setDisplayName(''); setEmail(''); setRole('');
        onSuccess(result.email);
      }
    } catch (failure) {
      if (isCurrent()) setError(failure instanceof InviteStoreUserError ? failure : new InviteStoreUserError(
        'Não foi possível confirmar o convite. Solicite uma revisão antes de tentar novamente.', undefined, true,
      ));
    } finally {
      pending.current = false;
      if (isCurrent()) setSending(false);
    }
  };

  if (!canViewSettings) return null;
  const fieldClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60';
  return (
    <form onSubmit={handleSubmit} noValidate aria-labelledby="new-user-title" aria-busy={sending}
      className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div>
        <h4 id="new-user-title" className="text-sm font-bold text-slate-900">Novo Usuário</h4>
        <p className="mt-1 text-xs text-slate-500">A pessoa receberá um convite por e-mail para definir sua senha.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="new-user-name" className="mb-1 block text-xs font-semibold text-slate-700">Nome</label>
          <input id="new-user-name" ref={nameInput} autoFocus autoComplete="name" required maxLength={120}
            value={displayName} onChange={event => setDisplayName(event.target.value)} disabled={sending}
            aria-invalid={error?.field === 'displayName'} aria-describedby={error ? 'new-user-error' : undefined} className={fieldClass} />
        </div>
        <div>
          <label htmlFor="new-user-email" className="mb-1 block text-xs font-semibold text-slate-700">E-mail</label>
          <input id="new-user-email" ref={emailInput} type="email" autoComplete="email" required maxLength={254}
            value={email} onChange={event => setEmail(event.target.value)} disabled={sending}
            aria-invalid={error?.field === 'email'} aria-describedby={error ? 'new-user-error' : undefined} className={fieldClass} />
        </div>
        <div>
          <label htmlFor="new-user-role" className="mb-1 block text-xs font-semibold text-slate-700">Perfil</label>
          <select id="new-user-role" ref={roleInput} required value={role} onChange={event => setRole(event.target.value)} disabled={sending}
            aria-invalid={error?.field === 'role'} aria-describedby={error ? 'new-user-error' : undefined} className={fieldClass}>
            <option value="">Selecione o perfil</option>
            <option value="admin">Proprietário</option>
            <option value="operator">Operador</option>
          </select>
        </div>
      </div>
      {error && <p id="new-user-error" role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">{error.message}</p>}
      {sending && <p role="status" className="text-xs text-slate-600">Enviando convite...</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => { if (!pending.current) onCancel(); }} disabled={sending}
          className="cursor-pointer rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-wait disabled:opacity-60">
          Cancelar
        </button>
        <button type="submit" disabled={sending || Boolean(error?.reviewRequired)}
          className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
          {sending ? 'Enviando...' : 'Enviar convite'}
        </button>
      </div>
    </form>
  );
}
