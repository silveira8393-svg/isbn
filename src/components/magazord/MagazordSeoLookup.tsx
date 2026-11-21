import { useState } from 'react';
import type { User } from '../../types';

/** Page discovery only. This interface intentionally has no update/send action. */
export default function MagazordSeoLookup({ user, initialChildCode }: { user: User; initialChildCode: string }) {
  const [childCode, setChildCode] = useState(initialChildCode);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [message, setMessage] = useState('');
  async function inspect() {
    if (busy || !user.active || !user.storeId) return;
    setBusy(true); setResult(null); setMessage('');
    try {
      const { supabase } = await import('../../lib/supabase');
      const { data, error } = await supabase.auth.getSession();
      if (error || data.session?.user.id !== user.id) throw Error('Sua sessão expirou. Entre novamente.');
      const response = await fetch('/api/magazord/price?seo=1', { method: 'POST', credentials: 'same-origin',
        redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(25000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}`,
          'x-isbn-store-id': user.storeId },
        body: JSON.stringify({ action: 'lookup', childCode: childCode.trim() }) });
      const body = await response.json();
      if (!response.ok) throw Error(body.code === 'ambiguous_pages' ? 'A lista retornada não permite confirmar páginas de forma segura.'
        : body.code === 'remote_unavailable' ? `Consulta indisponível na Magazord (HTTP ${body.remoteStatus ?? 'desconhecido'}).`
          : 'Não foi possível consultar as páginas SEO de forma segura.');
      setResult(body);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro na consulta.'); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3 rounded-lg border border-slate-300 bg-white p-4" aria-label="Diagnóstico SEO sem alterações">
    <h3 className="font-bold text-sm">Meta description — localizar página (somente leitura)</h3>
    <p className="text-xs text-slate-600">Consulta páginas na homologação pelo Código Filho, sem atualizar SEO, produto, preço ou estoque.</p>
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs">Código Filho
        <input aria-label="Código Filho para diagnóstico SEO" className="block rounded border p-2 font-mono text-sm"
          value={childCode} maxLength={25} onChange={e => { setChildCode(e.target.value); setResult(null); }} />
      </label>
      <button type="button" disabled={busy || !childCode.trim()} onClick={inspect}
        className="rounded border border-blue-600 px-3 py-2 text-sm text-blue-700 disabled:opacity-50">
        {busy ? 'Consultando...' : 'Consultar página SEO (sem alterações)'}
      </button>
    </div>
    {message && <p role="status" className="text-xs text-amber-800">{message}</p>}
    {result && <div className="space-y-2 text-xs" role="status">
      <p>{result.status === 'not_found' ? 'Nenhuma página encontrada. Nenhuma alteração realizada.'
        : result.status === 'single_candidate' ? 'Uma página candidata encontrada — vínculo ainda requer validação.'
          : 'Várias páginas candidatas encontradas — atualização bloqueada.'}</p>
      {result.pages?.map((page: any) => <div key={page.id} className="rounded border p-2">
        <p><strong>ID da página:</strong> {page.id}</p>
        <p><strong>Título atual:</strong> {page.title}</p>
        <p><strong>Meta description atual:</strong> {page.metaDescription || '(vazia)'}</p>
      </div>)}
      <p className="text-amber-800">Diagnóstico somente de leitura. Nenhum PATCH foi implementado ou executado.</p>
    </div>}
  </section>;
}
