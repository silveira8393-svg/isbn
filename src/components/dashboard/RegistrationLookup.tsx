import { useState } from 'react';
import { useUser } from '../../contexts/UserContext';
import type { ProductionOperation } from '../../services/productionService';
import { isAuthorizedDemo, recordProvenance, provenanceLabels } from '../../utils/operationalTest';
import { operationDate } from '../../utils/dashboard';
import { readRegistrationSnapshot, registrationFields } from '../../utils/registrationSnapshot';

export function registrationRows(items: ProductionOperation[], search: string) {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  const term = normalize(search.trim());
  const isbn = /^[\d\sXx-]+$/.test(term) ? term.replace(/[\s-]/g, '') : null;
  return items.filter(item => item.status === 'success'
    && ((item.operation_type === 'new_product_created' && item.condition === 'new')
      || (item.operation_type === 'used_copy_created' && item.condition === 'used'))
    && (!term || normalize(item.title || '').includes(term) || (isbn !== null && (item.isbn || '').replace(/[\s-]/g, '').toLowerCase().includes(isbn))))
    .sort((a, b) => (operationDate(b)?.getTime() ?? 0) - (operationDate(a)?.getTime() ?? 0) || a.id.localeCompare(b.id));
}

export default function RegistrationLookup({ operations, names }: { operations: ProductionOperation[]; names: Record<string, string> }) {
  const { currentUser, canViewProduction } = useUser();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState<{ id: string; context: string } | null>(null);
  const authorized = currentUser.active && canViewProduction && ['admin', 'developer'].includes(currentUser.role);
  const context = `${currentUser.id}:${currentUser.storeId}:${currentUser.role}`;
  // Defence in depth, including direct mounts, role revocation and changed stores.
  const items = authorized ? operations.filter(item => item.store_id === currentUser.storeId
    && (currentUser.role === 'admin' ? item.environment === 'production' || isAuthorizedDemo(item) : item.environment === 'development')) : [];
  const rows = registrationRows(items, search);
  const selected = selection?.context === context ? rows.find(item => item.id === selection.id) : undefined;
  const snapshot = readRegistrationSnapshot(selected?.metadata?.registrationSnapshot);
  const pageCount = Math.max(1, Math.ceil(rows.length / 20));
  const currentPage = Math.min(page, pageCount);
  const name = (id: string | null) => id ? names[id] || id : 'Sem autoria identificada';
  if (!authorized) return null;
  return <section aria-label="Consulta de Cadastros" className="space-y-3">
    <label htmlFor="registration-search" className="block text-sm font-medium text-slate-700">Pesquisar por ISBN ou título</label>
    <input id="registration-search" type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(1); setSelection(null); }}
      placeholder="ISBN ou parte do título" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-blue-600" />
    <p className="text-xs text-slate-500">{rows.length} cadastros nos filtros do Dashboard. Exemplares usados permanecem individuais. Entradas vinculadas são movimentações e aparecem em Registros. Consulta somente dos dados armazenados.</p>
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white"><table className="w-full min-w-[1000px] text-left text-xs">
      <caption className="sr-only">Cadastros concluídos; um registro por evento de cadastro, sem agrupar exemplares por ISBN</caption>
      <thead className="bg-slate-50 text-slate-600"><tr>{['Título', 'ISBN', 'Condição', 'Código Pai', 'Código Filho', 'Operador responsável', 'Data do cadastro', 'Natureza', 'Ação'].map(label => <th scope="col" key={label} className="px-3 py-2">{label}</th>)}</tr></thead>
      <tbody className="divide-y divide-slate-100">{rows.slice((currentPage - 1) * 20, currentPage * 20).map(item => <tr key={item.id} data-registration-id={item.id}>
        <td className="px-3 py-2">{item.title || 'Não armazenado'}</td><td className="px-3 py-2">{item.isbn || 'Não armazenado'}</td>
        <td className="px-3 py-2">{item.condition === 'used' ? 'Usado' : 'Novo'}</td><td className="px-3 py-2">{item.parent_code || 'Não armazenado'}</td><td className="px-3 py-2">{item.child_code || 'Não armazenado'}</td>
        <td className="px-3 py-2">{name(item.user_id)}</td><td className="px-3 py-2">{operationDate(item)?.toLocaleString('pt-BR') || 'Não armazenada'}</td>
        <td className="px-3 py-2">{provenanceLabels[recordProvenance(item)]}</td>
        <td className="px-3 py-2"><button type="button" aria-expanded={selected?.id === item.id} aria-controls="registration-detail" onClick={() => setSelection({ id: item.id, context })} className="cursor-pointer rounded text-blue-700 underline focus-visible:outline-blue-600">Visualizar ficha</button></td>
      </tr>)}</tbody>
    </table></div>
    {!rows.length && <p role="status" className="text-sm text-slate-500">Nenhum cadastro encontrado.</p>}
    <nav aria-label="Paginação de cadastros" className="flex items-center gap-3 text-xs">
      <button type="button" disabled={currentPage === 1} onClick={() => { setPage(currentPage - 1); setSelection(null); }} className="rounded px-2 py-1 text-blue-700 disabled:text-slate-400">Anterior</button>
      <span>{currentPage} / {pageCount}</span>
      <button type="button" disabled={currentPage === pageCount} onClick={() => { setPage(currentPage + 1); setSelection(null); }} className="rounded px-2 py-1 text-blue-700 disabled:text-slate-400">Próxima</button>
    </nav>
    {selected && <section id="registration-detail" role="region" aria-label="Ficha do cadastro em leitura" className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-3"><h3 className="font-semibold text-slate-900">Ficha do cadastro — somente leitura</h3><button type="button" onClick={() => setSelection(null)} className="rounded text-sm text-blue-700 underline">Fechar ficha</button></div>
      <p className="text-xs text-slate-600">{provenanceLabels[recordProvenance(selected)]} · {selected.metadata?.mock === true ? 'Integração simulada; sem publicação real na Magazord.' : 'Este registro não comprova publicação ou estoque real na Magazord.'}</p>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {Object.entries({ 'ID do evento': selected.id, 'Operador': name(selected.user_id), 'UUID do operador': selected.user_id, 'Ambiente': selected.environment,
          'Data do cadastro': operationDate(selected)?.toLocaleString('pt-BR'), 'Título registrado': selected.title, 'ISBN registrado': selected.isbn,
          'Condição registrada': selected.condition === 'used' ? 'Usado' : 'Novo', 'Código Pai registrado': selected.parent_code, 'Código Filho registrado': selected.child_code }).map(([label, value]) =>
          <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="break-words whitespace-pre-wrap text-slate-800">{value || 'Não armazenado'}</dd></div>)}
      </dl>
      {snapshot ? <><p className="text-xs text-slate-500">Ficha armazenada, versão {snapshot.version}, capturada em {new Date(snapshot.capturedAt).toLocaleString('pt-BR')}. URLs são apresentadas como texto, sem carregar imagens.</p>
        <dl className="grid gap-4 sm:grid-cols-2">{Object.entries(registrationFields).map(([key, label]) => {
          const value = snapshot.fields[key as keyof typeof registrationFields];
          return <div key={key}><dt className="text-xs text-slate-500">{label}</dt><dd className="whitespace-pre-wrap break-words text-sm text-slate-800">{Array.isArray(value) ? value.join(' · ') || 'Não armazenado' : value === undefined || value === '' ? 'Não armazenado' : value}</dd></div>;
        })}</dl></> : <><p role="status" className="rounded bg-amber-50 p-3 text-sm text-amber-900">Ficha completa não armazenada ou versão não suportada. Exibindo somente o resumo persistido, sem reconstrução bibliográfica.</p>
        <p className="text-sm text-slate-600">Quantidade informada: {typeof selected.metadata?.quantity === 'number' ? selected.metadata.quantity : 'Não armazenada'}. Preço, dados bibliográficos completos e observações do exemplar: não disponíveis no resumo.</p></>}
    </section>}
  </section>;
}
