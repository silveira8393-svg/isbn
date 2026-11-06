import { useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import type { RegistrationDraft } from '../../types';
import type { useMagazordCategories } from '../../hooks/useMagazordCategories';
import { searchCategories } from '../../../shared/magazordCategories';

export default function MagazordCategoryPicker({ draft, onChange, categories, error }: {
  draft: RegistrationDraft; onChange: (updates: Partial<RegistrationDraft>) => void;
  categories: ReturnType<typeof useMagazordCategories>; error?: string;
}) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const options = searchCategories(categories.catalog?.categories || [], query);
  const selected = draft.magazordCategoryId && draft.categorySource === 'magazord' && draft.magazordCategoryStoreId === categories.storeId;
  return <div className="space-y-2" aria-busy={categories.loading}>
    <div className="flex items-center justify-between gap-2">
      <label htmlFor="magazord-category-search" className="text-xs font-bold text-slate-800">Categoria Magazord <span className="text-red-500">*</span></label>
      <button type="button" onClick={categories.reload} disabled={categories.loading} className="text-xs text-blue-600 inline-flex items-center gap-1 disabled:opacity-50">
        <RefreshCw className={'h-3 w-3 ' + (categories.loading ? 'animate-spin' : '')} />Atualizar categorias
      </button>
    </div>
    {selected ? <p data-category-selected className="text-xs rounded-lg border border-slate-300 bg-slate-50 p-2 text-slate-900">
      <strong>Selecionada:</strong> {draft.category} <span className="text-slate-500">(ID {draft.magazordCategoryId})</span>
    </p> : draft.category ? <p className="text-xs text-amber-700">Seleção anterior simulada: {draft.category}. Escolha uma categoria real antes de concluir.</p> : null}
    <div className="relative">
      <Search aria-hidden="true" className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
      <input id="magazord-category-search" data-registration-field="category" type="search" autoComplete="off" value={query}
        onFocus={() => setExpanded(true)} onChange={event => { setQuery(event.target.value); setExpanded(true); }}
        placeholder="Pesquisar na árvore da loja…" aria-controls="magazord-category-options" aria-expanded={expanded}
        className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:ring-2 focus:ring-blue-100 focus:outline-none" />
    </div>
    {categories.loading && <p role="status" className="text-xs text-slate-500">Carregando categorias da loja…</p>}
    {categories.error && <p role="status" className="text-xs text-amber-700">{categories.error} Os dados do formulário e a seleção foram preservados.</p>}
    {categories.catalog && <p className="text-[11px] text-slate-500">{categories.catalog.categories.length} categorias reais. Pesquise pelo nome ou pelo caminho na árvore.</p>}
    {!!categories.catalog?.invalidCount && <p role="status" className="text-xs text-amber-700">Algumas categorias têm hierarquia inconsistente e não estão disponíveis para seleção.</p>}
    {expanded && categories.catalog && <div id="magazord-category-options" className="max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1">
      <p className="px-2 py-1 text-[11px] text-slate-500">{options.length} resultado(s){options.length > 40 ? ' — refine a pesquisa para ver outros' : ''}</p>
      {options.slice(0, 40).map(option => <button type="button" key={option.id} title={option.path} aria-pressed={draft.magazordCategoryId === option.id}
        onClick={() => { onChange({ category: option.path, magazordCategoryId: option.id, magazordCategoryStoreId: categories.storeId, categorySource: 'magazord' }); setExpanded(false); setQuery(''); }}
        className="block w-full text-left px-3 py-2 rounded-md text-xs text-slate-800 hover:bg-blue-50 focus:bg-blue-50 focus:outline-none">
        <span className="text-slate-500">{'› '.repeat(option.depth)}</span>{option.path}
      </button>)}
    </div>}
    {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
  </div>;
}
