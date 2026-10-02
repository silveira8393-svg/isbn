import { useState, type FormEvent } from 'react';
import { BookOpen } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ResetPasswordProps {
  sessionValid: boolean;
  onComplete: () => Promise<void>;
  onCancel: () => Promise<void>;
}

export default function ResetPassword({ sessionValid, onComplete, onCancel }: ResetPasswordProps) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [changed, setChanged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async () => {
    try {
      await onComplete();
    } catch {
      setError('Sua senha foi alterada, mas não foi possível encerrar a sessão. Tente sair novamente.');
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    if (changed) {
      setBusy(true);
      try { await finish(); } finally { setBusy(false); }
      return;
    }
    if (!sessionValid) { setError('Seu link de recuperação é inválido ou expirou. Solicite um novo link no login.'); return; }
    if (!password || !confirmation) { setError('Preencha os dois campos de senha.'); return; }
    if (password.length < 8) { setError('A nova senha deve ter pelo menos 8 caracteres.'); return; }
    if (password !== confirmation) { setError('As senhas devem ser iguais.'); return; }
    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.status === 401 || updateError.status === 403 || ['session_not_found', 'refresh_token_not_found', 'refresh_token_already_used', 'bad_jwt'].includes(updateError.code ?? '')
          ? 'Sua sessão de recuperação é inválida ou expirou. Solicite um novo link no login.'
          : updateError.code === 'same_password'
          ? 'Escolha uma senha diferente da senha atual.'
          : updateError.code === 'weak_password'
          ? 'Esta senha não foi aceita. Escolha outra senha com pelo menos 8 caracteres.'
          : 'Não foi possível alterar a senha. Tente novamente.');
        return;
      }
      setPassword('');
      setConfirmation('');
      setChanged(true);
      await finish();
    } catch {
      setError('Não foi possível alterar a senha. Verifique sua conexão e tente novamente.');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try { await onCancel(); }
    catch { setError('Não foi possível encerrar a sessão. Verifique sua conexão e tente novamente.'); }
    finally { setBusy(false); }
  };

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-xl p-8 shadow-xs">
        <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-4"><BookOpen aria-hidden="true" /></div>
        <h1 className="text-xl font-bold text-slate-900">Definir nova senha</h1>
        <p className="text-sm text-slate-500 mt-1 mb-6">Escolha uma senha com pelo menos 8 caracteres.</p>
        {!sessionValid && !changed && <p role="alert" className="text-sm text-red-700 mb-4">Seu link de recuperação é inválido ou expirou. Solicite um novo link no login.</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          {!changed && <>
            <div>
              <label htmlFor="new-password" className="block text-sm font-semibold text-slate-700 mb-1">Nova senha</label>
              <input id="new-password" type={visible ? 'text' : 'password'} autoComplete="new-password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} disabled={busy || !sessionValid} className="w-full border border-slate-300 rounded-lg p-2.5 focus:outline-blue-600" />
            </div>
            <div>
              <label htmlFor="confirm-password" className="block text-sm font-semibold text-slate-700 mb-1">Confirmar nova senha</label>
              <input id="confirm-password" type={visible ? 'text' : 'password'} autoComplete="new-password" required minLength={8} value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={busy || !sessionValid} className="w-full border border-slate-300 rounded-lg p-2.5 focus:outline-blue-600" />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={visible} onChange={e => setVisible(e.target.checked)} disabled={busy} /> Exibir senhas</label>
          </>}
          {changed && <p role="status" className="text-sm text-emerald-700">Senha alterada com sucesso.</p>}
          {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}
          <button type="submit" disabled={busy || (!sessionValid && !changed)} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg py-2.5 disabled:opacity-60 cursor-pointer">{busy ? 'Aguarde...' : changed ? 'Sair e voltar ao login' : 'Salvar nova senha'}</button>
          {!changed && <button type="button" onClick={() => { void cancel(); }} disabled={busy} className="w-full text-sm text-blue-600 hover:underline disabled:opacity-60 cursor-pointer">Voltar ao login</button>}
        </form>
      </div>
    </main>
  );
}
