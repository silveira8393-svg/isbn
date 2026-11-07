import { useEffect, useRef, useState } from 'react';
import { Search, LoaderCircle } from 'lucide-react';
import type { User } from '../../types';
import { normalizeProductQuery, type ProductLookup, type ProductQueryKind } from '../../../shared/magazordProducts';
import { lookupMagazordProducts } from '../../services/magazordProducts';

/** Read-only evidence, never an input to registration, bibliographic merging or stock actions. */
export default function MagazordProductLookup({ user, parentCode = '', childCode = '', isbn = '' }: {
  user?: User; parentCode?: string; childCode?: string; isbn?: string;
}) {
  const [choice, setChoice] = useState<'auto' | ProductQueryKind>('auto');
  const kind = choice === 'auto' ? childCode.trim() ? 'child' : parentCode.trim() ? 'parent' : 'ean' : choice;
  const value = kind === 'child' ? childCode : kind === 'parent' ? parentCode : isbn;
  const query = normalizeProductQuery(kind, value);
  const identity = JSON.stringify([user?.id, user?.storeId, kind, query?.value || value]);
  const current = useRef(identity); current.current = identity;
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const [state, setState] = useState<{ identity: string; loading: boolean; result?: ProductLookup }>({ identity, loading: false });
  useEffect(() => {
    current.current = identity; controller.current?.abort(); busy.current = false;
    return () => { controller.current?.abort(); current.current = ''; };
  }, [identity]);
  const visible = state.identity === identity ? state : { identity, loading: false, result: undefined };
  async function lookup() {
    if (!query || !user || busy.current) return;
    busy.current = true; controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    const requested = identity;
    setState({ identity, loading: true });
    const result = await lookupMagazordProducts(query, user, request.signal);
    if (!request.signal.aborted && current.current === requested) setState({ identity: requested, loading: false, result });
    if (controller.current === request) busy.current = false;
  }
  const result = visible.result;
  const rows = result?.parents.flatMap(parent => parent.children.length ? parent.children.map(child => ({ parent, child })) : [{ parent, child: null }]) || [];
  const label = kind === 'child' ? 'Código Filho' : kind === 'parent' ? 'Código Pai' : 'EAN/ISBN';
  return <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3" aria-label="Consulta real de produtos Magazord" aria-busy={visible.loading}>
    <div><h3 className="font-bold text-sm text-slate-900">Produtos na Magazord — consulta real</h3>
      <p className="text-xs text-slate-500">Somente leitura. Cadastros e estoque continuam no simulador.</p></div>
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-xs text-slate-700 flex items-center gap-2">Consultar por
        <select value={choice} onChange={event => setChoice(event.target.value as typeof choice)} className="rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-900">
          <option value="auto">Identificador disponível</option><option value="child">Código Filho</option><option value="parent">Código Pai</option><option value="ean">EAN/ISBN</option>
        </select>
      </label>
      <button type="button" onClick={lookup} disabled={!query || !user || visible.loading} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
        {visible.loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
        {visible.loading ? 'Consultando…' : 'Verificar na Magazord'}
      </button>
    </div>
    <p className="text-xs text-slate-500">{query ? `${label}: ${value}` : `Informe um ${label} válido nos campos do cadastro para consultar.`}</p>
    {result && <div role="status" className="space-y-2 text-xs text-slate-800">
      <p className="font-semibold">{result.status === 'found' ? 'Encontrado na Magazord.' : result.status === 'not_found' ? 'Consulta concluída: identificador não encontrado na Magazord.'
        : result.status === 'multiple' ? 'Múltiplos registros encontrados. Confira os códigos comerciais de cada derivação.'
        : result.code === 'unauthenticated' ? 'Sessão indisponível. Entre novamente para consultar.' : result.code === 'store_access_denied' ? 'Acesso à loja não autorizado.' : 'Consulta Magazord indisponível. Tente novamente em instantes.'}</p>
      {result.match === 'bibliographic' && result.status !== 'unavailable' && <p>EAN/ISBN é uma referência bibliográfica; nenhum exemplar foi selecionado automaticamente.</p>}
      {!!rows.length && <div className="max-h-64 overflow-auto rounded-lg border border-slate-200">
        <table className="w-full text-left text-xs"><thead><tr><th className="p-2">Código Pai</th><th className="p-2">Código Filho</th><th className="p-2">Situação Pai / Filho</th></tr></thead>
          <tbody>{rows.slice(0, 20).map(({ parent, child }) => <tr key={JSON.stringify([parent.code, child?.code])}>
            <td className="p-2 break-all">{parent.code}</td><td className="p-2 break-all">{child?.code || 'Sem derivações'}</td>
            <td className="p-2">{parent.active ? 'Ativo' : 'Inativo'} / {child ? child.active ? 'Ativo' : 'Inativo' : '—'}</td>
          </tr>)}</tbody>
        </table>
      </div>}
      {!!rows.length && <p>Derivações relevantes retornadas: {result.parents.reduce((sum, parent) => sum + parent.children.length, 0)}. A condição NOVO/USADO não é inferida pelo ISBN.</p>}
      {(result.truncated || rows.length > 20) && <p>Consulta limitada. Refine pelo Código Filho para identificar o exemplar.</p>}
    </div>}
  </section>;
}
