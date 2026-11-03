import { useEffect, useRef, useState } from 'react';
import { useUser } from '../contexts/UserContext';
import { useConditionTemplates } from '../hooks/useConditionTemplates';
import { canManageConditionTemplates, saveConditionTemplates, type ConditionTemplate, type TemplateActor } from '../services/conditionTemplatesService';

export default function ConditionTemplateManager() {
  const { currentUser } = useUser();
  return canManageConditionTemplates(currentUser)
    ? <div key={[currentUser.id, currentUser.storeId, currentUser.role, currentUser.active].join(':')}><TemplateEditor actor={currentUser} /></div> : null;
}

function TemplateEditor({ actor }: { actor: TemplateActor }) {
  const list = useConditionTemplates(actor);
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<ConditionTemplate | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const inFlight = useRef(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function persist(items: ConditionTemplate[]) {
    if (inFlight.current || list.status !== 'ready' || !list.data) return;
    inFlight.current = true;
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setNotice(null);
    try {
      const saved = await saveConditionTemplates(actor, list.data, items, controller.signal);
      if (controller.signal.aborted) return;
      list.acceptSaved(saved); setEditor(null); setDeleting(null);
      setNotice({ error: false, text: 'Modelos salvos na loja.' });
    } catch (error) {
      if (!controller.signal.aborted) setNotice({ error: true, text: error instanceof Error ? error.message : 'Não foi possível confirmar a gravação.' });
    } finally {
      inFlight.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return <section aria-label="Modelos de conservação" className="space-y-3 border-t border-slate-200 pt-4">
    <h3 className="text-sm font-bold text-slate-900">Modelos de conservação de livros usados</h3>
    {list.status === 'ready' && <p className="text-xs text-slate-500">Loja de origem dos modelos: {list.data?.storeName}</p>}
    <p className="text-xs text-slate-500">Cadastre aqui os textos aprovados pela livraria. A seleção copia o texto para as observações do exemplar; alterações nos modelos não modificam cadastros anteriores.</p>
    <button type="button" disabled={busy} onClick={() => { setEditor(null); setDeleting(null); setNotice(null); list.reload(); }}
      className="rounded border px-3 py-2 text-xs text-blue-700 disabled:opacity-50">Recarregar modelos (descarta a edição)</button>
    {list.status === 'loading' && <p role="status" className="text-xs">Carregando modelos da loja...</p>}
    {list.status === 'error' && <p role="alert" className="text-xs text-red-700">{list.error}</p>}
    {notice && <p role={notice.error ? 'alert' : 'status'} className={`text-xs ${notice.error ? 'text-red-700' : 'text-emerald-700'}`}>{notice.text}</p>}
    {list.status === 'ready' && list.data && <>
      {!list.data.templates.length && <p role="status" className="text-xs text-slate-500">Nenhum modelo cadastrado. Adicione os textos aprovados pelo proprietário; sugestões antigas não são importadas automaticamente.</p>}
      <label htmlFor="condition-template-search" className="block text-xs font-semibold">Localizar modelos por nome ou texto</label>
      <input id="condition-template-search" type="search" value={search} onChange={event => setSearch(event.target.value)} className="w-full rounded border p-2 text-sm" />
      <ul className="space-y-2">{list.data.templates.filter(item => `${item.name} ${item.text}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))).map(item => <li key={item.id} className="rounded-lg border border-slate-200 p-3 space-y-2">
        <p className="text-sm font-semibold">{item.name} <span className="text-xs font-normal">({item.active ? 'Ativo' : 'Inativo'})</span></p>
        <p className="whitespace-pre-wrap break-words text-xs text-slate-600">{item.text}</p>
        <div className="flex flex-wrap gap-3 text-xs">
          <button type="button" disabled={busy || !!editor} onClick={() => { setDeleting(null); setEditor({ ...item }); setNotice(null); }}>Editar</button>
          <button type="button" disabled={busy || !!editor} onClick={() => { setDeleting(null); void persist(list.data!.templates.map(model => model.id === item.id ? { ...model, active: !model.active } : model)); }}>{item.active ? 'Desativar' : 'Ativar'}</button>
          <button type="button" disabled={busy || !!editor} onClick={() => setDeleting(item.id)} className="text-red-700">Excluir</button>
        </div>
        {deleting === item.id && <div role="alert" className="space-x-3 text-xs">
          <span>Excluir o modelo “{item.name}”? Cadastros anteriores serão preservados.</span>
          <button type="button" disabled={busy} onClick={() => void persist(list.data!.templates.filter(model => model.id !== item.id))} className="text-red-700 underline">Confirmar exclusão</button>
          <button type="button" disabled={busy} onClick={() => setDeleting(null)}>Cancelar exclusão</button>
        </div>}
      </li>)}</ul>
      {!editor && <button type="button" disabled={busy} onClick={() => { setDeleting(null); setNotice(null); setEditor({ id: crypto.randomUUID(), name: '', text: '', active: true }); }}
        className="rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Adicionar modelo</button>}
      {editor && <form aria-label="Editar modelo de conservação" onSubmit={event => {
        event.preventDefault();
        if (!editor.name.trim() || !editor.text.trim()) { setNotice({ error: true, text: 'Informe o nome e o texto do modelo.' }); return; }
        const items = list.data!.templates.some(item => item.id === editor.id)
          ? list.data!.templates.map(item => item.id === editor.id ? { ...editor } : item) : [...list.data!.templates, { ...editor }];
        void persist(items);
      }} className="space-y-3 rounded-lg border border-slate-200 p-3">
        <label className="block text-xs font-semibold" htmlFor="condition-template-name">Nome do modelo</label>
        <input id="condition-template-name" required value={editor.name} disabled={busy} onChange={event => setEditor({ ...editor, name: event.target.value })} className="w-full rounded border p-2 text-sm" />
        <label className="block text-xs font-semibold" htmlFor="condition-template-text">Texto das observações</label>
        <textarea id="condition-template-text" required rows={4} value={editor.text} disabled={busy} onChange={event => setEditor({ ...editor, text: event.target.value })} className="w-full rounded border p-2 text-sm" />
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={editor.active} disabled={busy} onChange={event => setEditor({ ...editor, active: event.target.checked })} />Ativo</label>
        <div className="flex gap-3 text-xs"><button type="submit" disabled={busy} className="rounded bg-blue-600 px-3 py-2 text-white">{busy ? 'Salvando...' : 'Salvar modelo'}</button>
          <button type="button" disabled={busy} onClick={() => { setEditor(null); setNotice(null); }}>Cancelar edição</button></div>
      </form>}
    </>}
  </section>;
}
