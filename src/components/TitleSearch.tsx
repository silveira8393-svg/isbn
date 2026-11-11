import { useEffect, useRef, useState } from 'react';
import type { BookInfo } from '../types';
import type { TitleSearchCandidate, TitleSearchSource } from '../../shared/googleBooks';
import { searchGoogleBooksByTitle } from '../services/googleBooks';

const sources: { id: 'all' | TitleSearchSource; label: string; enabled: boolean }[] = [
  { id: 'all', label: 'Todos', enabled: true },
  { id: 'google_books', label: 'Google Books', enabled: true },
  { id: 'curitiba', label: 'Distribuidora Curitiba', enabled: false },
  { id: 'amazon', label: 'Amazon', enabled: false },
];

export default function TitleSearch({ onConfirm, disabled = false }: { onConfirm: (book: BookInfo) => void; disabled?: boolean }) {
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<TitleSearchCandidate[]>([]);
  const [source, setSource] = useState<'all' | TitleSearchSource>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; request.current?.abort(); }, []);

  const search = async () => {
    if (disabled) return;
    const current = ++generation.current;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setLoading(true); setCandidates([]); setSelected(null); setMessage('');
    const result = await searchGoogleBooksByTitle(query, controller.signal);
    if (current !== generation.current || controller.signal.aborted) return;
    setLoading(false); setCandidates(result.candidates);
    setMessage(result.status === 'not_found' ? 'Nenhum resultado utilizável. Tente outro título ou acrescente palavras do subtítulo.'
      : result.status === 'invalid_query' ? 'Informe um título entre 2 e 200 caracteres.'
      : result.status === 'unavailable' ? 'Google Books indisponível ou resposta incompleta. Tente novamente.'
      : `${result.candidates.length} resultado(s) do Google Books, limitados aos primeiros 20. Confira a edição antes de selecionar.`);
  };
  const chosen = candidates.find(candidate => candidate.key === selected);
  return <section aria-label="Pesquisa por título" className="mb-6 rounded-xl border border-slate-200 bg-white p-4 space-y-4">
    <form onSubmit={event => { event.preventDefault(); void search(); }} className="flex flex-wrap items-end gap-3">
      <label className="flex-1 min-w-48 text-sm font-semibold text-slate-700">Título do livro
        <input value={query} onChange={event => { setQuery(event.target.value); setSelected(null); setCandidates([]); setMessage(''); generation.current++; request.current?.abort(); setLoading(false); }}
          minLength={2} maxLength={200} required disabled={disabled} className="mt-1 w-full rounded-lg border border-slate-300 p-3" />
      </label>
      <button disabled={disabled || loading} className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{loading ? 'Pesquisando...' : 'Pesquisar título'}</button>
    </form>
    <div aria-label="Fontes de pesquisa por título" className="flex flex-wrap gap-2">
      {sources.map(item => <button key={item.id} type="button" disabled={!item.enabled} aria-pressed={source === item.id}
        onClick={() => setSource(item.id)} className={`rounded-lg border px-3 py-2 text-sm disabled:opacity-50 ${source === item.id ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-600'}`}>
        {item.label}{!item.enabled && ' (em breve)'}
      </button>)}
    </div>
    <p className="text-xs text-slate-500">Somente Google Books é consultado nesta etapa. A seleção abre o cadastro para conferência e edição.</p>
    <p role="status" aria-live="polite" className="text-sm text-slate-700">{message}</p>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {candidates.filter(candidate => source === 'all' || candidate.source === source).map(candidate => {
        const book = candidate.book, cover = book.googleBooksReference?.coverUrl;
        return <article key={`${candidate.source}:${candidate.key}`} className={`rounded-xl border p-4 ${selected === candidate.key ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
          <div className="flex gap-3">
            {cover ? <img src={cover} alt={`Capa de ${book.title}`} loading="lazy" referrerPolicy="no-referrer" className="h-32 w-20 object-contain" />
              : <span className="flex h-32 w-20 shrink-0 items-center justify-center bg-slate-100 text-xs text-slate-500">Sem capa</span>}
            <div className="min-w-0 text-sm text-slate-700 space-y-1 break-words">
              <h3 className="font-bold text-slate-900">{book.title}</h3>
              {book.subtitle && <p>{book.subtitle}</p>}
              <p>Autores: {book.authors?.join(', ') || 'Não informados'}</p>
              <p>Editora: {book.publisher || 'Não informada'}</p>
              <p>Ano: {book.year || 'Não informado'}</p>
              <p>ISBN-13: {book.isbn13 || 'Não informado'}</p>
              <p>ISBN-10: {book.isbn10 || 'Não informado'}</p>
              <p>Fonte: {book.provider}</p>
              {book.bibliographicWarnings?.map(warning => <p key={warning} className="text-xs text-amber-800">{warning}</p>)}
            </div>
          </div>
          <button type="button" disabled={disabled || loading} aria-pressed={selected === candidate.key} onClick={() => setSelected(candidate.key)} className="mt-3 rounded-lg border border-blue-300 px-3 py-2 text-sm font-semibold text-blue-800">Selecionar esta edição</button>
        </article>;
      })}
    </div>
    {chosen && <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm space-y-3">
      <p>Confirmar “{chosen.book.title}” — {chosen.book.publisher || 'editora não informada'}, {chosen.book.year || 'ano não informado'}, ISBN {chosen.book.isbn13 || chosen.book.isbn10 || 'não informado'}? Confira os dados no formulário antes de cadastrar.</p>
      <button type="button" disabled={disabled || loading} onClick={() => onConfirm(structuredClone(chosen.book))} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white">Confirmar seleção e abrir cadastro</button>
      <button type="button" onClick={() => setSelected(null)} className="ml-3 text-slate-700 underline">Cancelar seleção</button>
    </div>}
  </section>;
}
