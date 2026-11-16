import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BookOpen } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Enrollment { id: string; qr: string; secret: string }
interface Props { userId: string; onVerified: () => void; onSignOut: () => Promise<void> }

export default function MfaChallenge({ userId, onVerified, onSignOut }: Props) {
  const [factors, setFactors] = useState<{ id: string; friendly_name?: string }[]>([]);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [factorId, setFactorId] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  // A single in-flight setup survives React StrictMode's effect replay. Secrets stay in memory.
  const setup = useRef<Promise<{ factors: typeof factors; enrollment: Enrollment | null }> | null>(null);
  const submitting = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    setLoading(true); setError(null);
    setup.current ??= (async () => {
      const ensureCurrent = async () => {
        const session = await supabase.auth.getSession();
        if (!mounted.current || session.error || session.data.session?.user.id !== userId) throw new Error('session_changed');
      };
      await ensureCurrent();
      const listed = await supabase.auth.mfa.listFactors();
      if (listed.error) throw listed.error;
      const verified = listed.data.totp.filter(factor => factor.status === 'verified');
      if (verified.length) return { factors: verified, enrollment: null };
      // An interrupted enrollment has no recoverable QR/secret. Remove only unverified TOTP factors.
      for (const factor of listed.data.all.filter(f => f.factor_type === 'totp' && f.status === 'unverified')) {
        await ensureCurrent();
        const removed = await supabase.auth.mfa.unenroll({ factorId: factor.id });
        if (removed.error) throw removed.error;
      }
      await ensureCurrent();
      const enrolled = await supabase.auth.mfa.enroll({ factorType: 'totp', issuer: 'Projeto ISBN' });
      if (enrolled.error) throw enrolled.error;
      return { factors: [], enrollment: { id: enrolled.data.id, qr: enrolled.data.totp.qr_code, secret: enrolled.data.totp.secret } };
    })();
    void setup.current.then(result => {
      if (!active) return;
      setFactors(result.factors); setEnrollment(result.enrollment);
      setFactorId(result.enrollment?.id ?? result.factors[0].id); setLoading(false);
    }).catch(() => {
      if (!active) return;
      setup.current = null; setLoading(false);
      setError('Não foi possível preparar o autenticador. Verifique sua conexão e tente novamente.');
    });
    return () => { active = false; mounted.current = false; };
  }, [revision, userId]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current || loading || !factorId) return;
    if (!/^\d{6}$/.test(code)) { setError('Informe o código de seis dígitos do autenticador.'); return; }
    submitting.current = true; setBusy(true); setError(null);
    try {
      const result = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      if (!mounted.current) return;
      if (result.error) {
        setCode('');
        setError(result.error.status === 429 ? 'Muitas tentativas. Aguarde e tente novamente.' : 'Não foi possível validar o código. Use o código atual do aplicativo e tente novamente.');
        return;
      }
      setCode(''); setEnrollment(null);
      onVerified();
    } catch { setCode(''); setError('Não foi possível validar o código. Verifique sua conexão e tente novamente.'); }
    finally { submitting.current = false; setBusy(false); }
  };

  return <main className="isbn-login min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12">
    <section aria-label="Autenticação em duas etapas" className="w-full max-w-sm bg-white border border-slate-200 rounded-xl p-8 shadow-xs">
      <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-4"><BookOpen aria-hidden="true" /></div>
      <h1 className="text-xl font-bold text-slate-900">{enrollment ? 'Configurar autenticador' : 'Autenticação em duas etapas'}</h1>
      <p className="text-sm text-slate-500 mt-1 mb-6">Para acessar o ISBN, confirme o código do seu aplicativo autenticador.</p>
      {loading ? <p role="status" className="text-sm text-slate-600">Preparando autenticação...</p> : <>
        {enrollment && <div className="space-y-3 mb-5 text-sm text-slate-700">
          <p>No Google Authenticator ou Microsoft Authenticator, adicione uma conta e leia este QR Code.</p>
          <img className="w-52 h-52 mx-auto" src={enrollment.qr.startsWith('data:') ? enrollment.qr : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(enrollment.qr)}`} alt="QR Code para cadastrar o Projeto ISBN no autenticador" />
          <p>Se preferir, informe esta chave manualmente:</p>
          <code className="block break-all rounded-lg bg-slate-50 border p-3 select-all">{enrollment.secret}</code>
          <p>Depois, digite o código para confirmar o cadastro.</p>
        </div>}
        {factorId && <form onSubmit={submit} className="space-y-4">
          {factors.length > 1 && <div><label htmlFor="mfa-factor" className="block text-sm font-semibold mb-1">Autenticador</label>
            <select id="mfa-factor" value={factorId} disabled={busy} onChange={e => { setFactorId(e.target.value); setCode(''); }} className="w-full border border-slate-300 rounded-lg p-2.5">
              {factors.map((factor, index) => <option key={factor.id} value={factor.id}>{factor.friendly_name || `Autenticador ${index + 1}`}</option>)}
            </select></div>}
          <div><label htmlFor="mfa-code" className="block text-sm font-semibold text-slate-700 mb-1">Código de seis dígitos</label>
            <input id="mfa-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus aria-invalid={Boolean(error)} aria-describedby={error ? 'mfa-error' : undefined} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} disabled={busy} className="w-full border border-slate-300 rounded-lg p-2.5 tracking-widest focus:outline-blue-600" /></div>
          <button type="submit" disabled={busy} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg py-2.5 disabled:opacity-60 cursor-pointer">{busy ? 'Validando...' : 'Confirmar código'}</button>
        </form>}
        {!factorId && <button type="button" onClick={() => setRevision(v => v + 1)} className="text-sm text-blue-600 hover:underline">Tentar novamente</button>}
      </>}
      {error && <p id="mfa-error" role="alert" className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}
      <p className="mt-4 text-xs text-slate-500">Sem acesso ao autenticador? Contate o administrador responsável. O acesso permanece bloqueado.</p>
      <button type="button" disabled={busy} onClick={() => { void onSignOut(); }} className="w-full mt-4 text-sm text-blue-600 hover:underline disabled:opacity-60 cursor-pointer">Sair e voltar ao login</button>
    </section>
  </main>;
}
