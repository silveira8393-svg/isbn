import { useState, useRef, type FormEvent } from 'react';
import { BookOpen } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function Login({ message, notice }: { message: string | null; notice?: string | null }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const emailInput = useRef<HTMLInputElement>(null);

  const requestRecovery = async () => {
    if (busy || recoveryBusy) return;
    setError(null);
    setRecoveryNotice(null);
    if (!email.trim()) {
      setError('Informe seu e-mail para receber o link de recuperação.');
      emailInput.current?.focus();
      return;
    }
    if (!emailInput.current?.validity.valid) {
      setError('Informe um e-mail válido.');
      emailInput.current?.focus();
      return;
    }
    setRecoveryBusy(true);
    try {
      const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/?auth=recovery`,
      });
      if (recoveryError) {
        setError(recoveryError.status === 429 || recoveryError.code === 'over_email_send_rate_limit'
          ? 'Não foi possível enviar outro e-mail agora. Aguarde alguns minutos e tente novamente.'
          : 'Não foi possível enviar o link de recuperação. Verifique seu e-mail e tente novamente.');
      } else {
        setRecoveryNotice('Se este e-mail estiver cadastrado, você receberá um link de recuperação.');
      }
    } catch {
      setError('Não foi possível enviar o link. Verifique sua conexão e tente novamente.');
    } finally {
      setRecoveryBusy(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || recoveryBusy) return;
    setBusy(true);
    setError(null);
    setRecoveryNotice(null);
    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (loginError) {
        setError(loginError.code === 'invalid_credentials'
          ? 'E-mail ou senha inválidos.'
          : loginError.status === 429
          ? 'Muitas tentativas. Aguarde um pouco e tente novamente.'
          : 'Não foi possível entrar. Verifique suas credenciais e sua conexão.');
      }
    } catch {
      setError('Não foi possível conectar. Verifique sua conexão e tente novamente.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-xl p-8 shadow-xs">
        <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-4"><BookOpen aria-hidden="true" /></div>
        <h1 className="text-xl font-bold text-slate-900">Projeto ISBN</h1>
        <p className="text-sm text-slate-500 mt-1 mb-6">Entre com sua conta para continuar.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-sm font-semibold text-slate-700 mb-1">E-mail</label>
            <input ref={emailInput} id="login-email" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} disabled={busy || recoveryBusy} className="w-full border border-slate-300 rounded-lg p-2.5 focus:outline-blue-600" />
          </div>
          <div>
            <label htmlFor="login-password" className="block text-sm font-semibold text-slate-700 mb-1">Senha</label>
            <input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} disabled={busy || recoveryBusy} className="w-full border border-slate-300 rounded-lg p-2.5 focus:outline-blue-600" />
          </div>
          {(error || message) && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error || message}</p>}
          {(recoveryNotice || notice) && <p role="status" className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">{recoveryNotice || notice}</p>}
          <button type="submit" disabled={busy || recoveryBusy} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg py-2.5 disabled:opacity-60 cursor-pointer">{busy ? 'Entrando...' : 'Entrar'}</button>
          <button type="button" onClick={() => { void requestRecovery(); }} disabled={busy || recoveryBusy} className="w-full text-sm text-blue-600 hover:underline disabled:opacity-60 cursor-pointer">{recoveryBusy ? 'Enviando link...' : 'Esqueci minha senha'}</button>
        </form>
      </div>
    </main>
  );
}
