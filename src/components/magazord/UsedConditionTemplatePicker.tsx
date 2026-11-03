import { useUser } from '../../contexts/UserContext';
import { useConditionTemplates } from '../../hooks/useConditionTemplates';

export default function UsedConditionTemplatePicker({ onSelect, selectedId }: { onSelect: (text: string, id: string) => void; selectedId?: string }) {
  const { currentUser } = useUser();
  const list = useConditionTemplates(currentUser);
  const active = list.status === 'ready' ? list.data?.templates.filter(item => item.active) ?? [] : [];
  return <div className="space-y-1 text-xs">
    <label htmlFor="used-condition-template" className="block font-semibold text-slate-700">Modelo de conservação (opcional)</label>
    {list.status === 'ready' && <p className="text-slate-500">Loja de origem dos modelos: {list.data?.storeName}</p>}
    <select id="used-condition-template" value={selectedId ?? ''} disabled={!active.length || list.status !== 'ready'}
      onChange={event => {
        const selected = active.find(item => item.id === event.target.value);
        if (selected) onSelect(selected.text, selected.id);
      }} className="w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-800">
      <option value="">{list.status === 'loading' ? 'Carregando modelos...' : 'Selecionar um modelo'}</option>
      {selectedId && !active.some(item => item.id === selectedId) && <option value={selectedId}>Modelo anteriormente selecionado (indisponível)</option>}
      {active.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select>
    {list.status === 'ready' && list.data?.exists && !active.length && <p className="text-slate-500">Nenhum modelo ativo cadastrado para esta loja. As observações continuam livres.</p>}
    {list.status === 'ready' && !list.data?.exists && <div role="alert" className="text-amber-800">
      <p>Configuração dos modelos não encontrada para a loja identificada. Confira a loja de origem. As observações continuam livres.</p>
      <button type="button" onClick={list.reload} className="underline">Recarregar modelos</button>
    </div>}
    {list.status === 'ready' && active.length > 0 && <p className="text-slate-500">{active.length} modelos ativos disponíveis.</p>}
    {list.status === 'error' && <div role="alert" className="text-amber-800"><p>{list.error}</p>
      <button type="button" onClick={list.reload} className="underline">Recarregar modelos</button></div>}
  </div>;
}
