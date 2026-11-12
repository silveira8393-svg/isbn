import { useEffect, useRef, useState } from 'react';
import type { BookInfo, User } from '../types';
import type { TitleSearchCandidate, TitleSearchSource } from '../../shared/googleBooks';
import { searchGoogleBooksByTitle } from '../services/googleBooks';
import { searchAmazonByTitle } from '../services/amazonTitle';
import { canSearchAmazonTitle } from '../../shared/amazonTitle';
import { searchCuritibaByTitle, type CuritibaTitleResult } from '../services/distribuidoraCuritiba';
import { completeTitleEdition } from '../services/titleEditionDetails';
import { canonicalBookIsbn } from '../utils/isbn';
const candidateId = (candidate: TitleSearchCandidate) => candidate.source + ':' + candidate.key;
const coverOf = (book: BookInfo) => book.amazonTitleReference?.coverUrl || book.googleBooksReference?.coverUrl
  || (book.curitibaTitleReference ? book.thumbnailUrl || book.coverUrl : undefined);

const sources: { id: 'all' | TitleSearchSource; label: string; enabled: boolean }[] = [
  { id: 'all', label: 'Todos', enabled: true },
  { id: 'google_books', label: 'Google Books', enabled: true },
  { id: 'curitiba', label: 'Distribuidora Curitiba', enabled: true },
  { id: 'amazon', label: 'Amazon', enabled: false },
];

export default function TitleSearch({ onConfirm, disabled = false, user, environment }: { user?: User; environment?: string; onConfirm: (book: BookInfo) => void; disabled?: boolean }) {
  const amazonEnabled = (import.meta.env.DEV || import.meta.env.ISBN_AMAZON_TITLE_PREVIEW) && canSearchAmazonTitle(user, environment);
  const [amazonMessage, setAmazonMessage] = useState('');
  const [curitibaMessage, setCuritibaMessage] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const completion = useRef<AbortController | null>(null);
  const detailGeneration = useRef(0);
  const curitibaDetail = useRef<CuritibaTitleResult['loadDetail']>(undefined);
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<TitleSearchCandidate[]>([]);
  const [source, setSource] = useState<'all' | TitleSearchSource>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const confirmationDialog = useRef<HTMLDialogElement | null>(null);
  const selectionTrigger = useRef<HTMLButtonElement | null>(null);
  const chosen = candidates.find(candidate => candidateId(candidate) === selected);
  useEffect(() => () => { generation.current++; request.current?.abort(); completion.current?.abort(); }, []);
  useEffect(() => {
    const dialog = confirmationDialog.current;
    if (!dialog) return;
    if (disabled) { if (dialog.open) dialog.close(); return; }
    if (chosen && !dialog.open) dialog.showModal();
  }, [chosen, disabled]);

  const cancelSelection = () => {
    completion.current?.abort(); completion.current = null; setCompleting(false);
    confirmationDialog.current?.close();
    setSelected(null);
    selectionTrigger.current?.focus({ preventScroll: true });
  };

  const selectEdition = async (candidate: TitleSearchCandidate, trigger: HTMLButtonElement) => {
    if (disabled || completion.current || (selecting && candidate.source === 'curitiba')) return;
    const selection = ++detailGeneration.current;
    selectionTrigger.current = trigger;
    if (candidate.source !== 'curitiba') { setSelecting(false); setSelected(candidateId(candidate)); return; }
    const current = generation.current;
    setSelecting(true); setCuritibaMessage('Distribuidora Curitiba: Consultando ficha da edição...');
    const result = await curitibaDetail.current?.(candidate.key, request.current?.signal).catch(() => null);
    if (current !== generation.current || selection !== detailGeneration.current || request.current?.signal.aborted) return;
    setSelecting(false);
    if (!result) { setCuritibaMessage('Distribuidora Curitiba: Ficha indisponível. Selecione novamente para tentar outra vez.'); return; }
    setCandidates(previous => previous.map(item => candidateId(item) === candidateId(candidate) ? result : item));
    setSelected(candidateId(result)); setCuritibaMessage('Distribuidora Curitiba: Ficha carregada. Confira a edição.');
  };

  const confirmEdition = async () => {
    if (disabled || !chosen || completion.current) return;
    const selectedEdition = structuredClone(chosen);
    if (!canonicalBookIsbn(chosen.book.isbn13) && !canonicalBookIsbn(chosen.book.isbn10)) {
      confirmationDialog.current?.close(); onConfirm(selectedEdition.book); return;
    }
    const current = generation.current;
    const controller = new AbortController(); completion.current = controller; setCompleting(true);
    const book = await completeTitleEdition(selectedEdition, user, controller.signal);
    if (controller.signal.aborted || current !== generation.current || completion.current !== controller) return;
    completion.current = null; setCompleting(false);
    confirmationDialog.current?.close(); onConfirm(book);
  };

  const search = async () => {
    if (disabled) return;
    const current = ++generation.current;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setLoading(true); setCandidates([]); setSelected(null); setMessage('');
    setSelecting(false); curitibaDetail.current = undefined;
    setCuritibaMessage('Distribuidora Curitiba: Consultando...');
    setAmazonMessage(amazonEnabled ? 'Amazon SP-API: Consultando...' : '');
    const valid = () => current === generation.current && !controller.signal.aborted;
    const google = async () => {
      try {
        const result = await searchGoogleBooksByTitle(query, controller.signal);
        if (!valid()) return;
        setCandidates(previous => [...previous, ...result.candidates]);
        setMessage(result.status === 'not_found' ? 'Google Books: Nenhum resultado utiliz?vel.'
          : result.status === 'invalid_query' ? 'Informe um título entre 2 e 200 caracteres.'
          : result.status === 'unavailable' ? 'Google Books indisponível ou resposta incompleta. Tente novamente.'
          : result.candidates.length + ' resultado(s) do Google Books, limitados aos primeiros 20.');
      } catch { if (valid()) setMessage('Google Books indisponível. Tente novamente.'); }
    };
    const amazon = async () => {
      try {
        const result = await searchAmazonByTitle(query, user, environment, controller.signal);
        if (!valid()) return;
        setCandidates(previous => [...previous, ...result.candidates]);
        setAmazonMessage(result.status === 'success' ? 'Amazon SP-API: ' + result.candidates.length + ' resultado(s), até 20.' + (result.hasMore ? ' Há mais resultados; refine o título.' : '')
          : result.status === 'not_found' ? 'Amazon SP-API: Nenhum resultado utiliz?vel.'
          : result.status === 'unauthorized' ? 'Amazon SP-API: Consulta não autorizada pelos controles existentes.'
          : result.status === 'rate_limited' ? 'Amazon SP-API: Limite de consultas atingido. Aguarde antes de tentar novamente.'
          : result.status === 'invalid_query' ? 'Amazon SP-API: Informe um título entre 2 e 200 caracteres.'
          : 'Amazon SP-API indisponível ou resposta incompleta. Tente novamente.');
      } catch { if (valid()) setAmazonMessage('Amazon SP-API indisponível. Tente novamente.'); }
    };
    const curitiba = async () => {
      try {
        const result = await searchCuritibaByTitle(query, controller.signal);
        if (!valid()) return;
        curitibaDetail.current = result.loadDetail;
        setCandidates(previous => [...previous, ...result.candidates]);
        setCuritibaMessage(result.status === 'success' ? `Distribuidora Curitiba: ${result.candidates.length} resultado(s), até 20. Confira a edição.`
          : result.status === 'not_found' ? 'Distribuidora Curitiba: Nenhum resultado utilizável.'
          : result.status === 'invalid_query' ? 'Distribuidora Curitiba: Informe um título entre 2 e 200 caracteres.'
          : 'Distribuidora Curitiba indisponível ou resposta incompleta.');
      } catch { if (valid()) setCuritibaMessage('Distribuidora Curitiba indisponível.'); }
    };
    await Promise.allSettled([google(), curitiba(), ...(amazonEnabled ? [amazon()] : [])]);
    if (valid()) setLoading(false);
  };
  return <section aria-label="Pesquisa por título" className="mb-6 rounded-xl border border-slate-200 bg-white p-4 space-y-4">
    <form onSubmit={event => { event.preventDefault(); void search(); }} className="flex flex-wrap items-end gap-3">
      <label className="flex-1 min-w-48 text-sm font-semibold text-slate-700">Título do livro
        <input value={query} onChange={event => { completion.current?.abort(); completion.current = null; setCompleting(false); setQuery(event.target.value); setSelected(null); setCandidates([]); setMessage(''); setAmazonMessage(''); setCuritibaMessage(''); setSelecting(false); curitibaDetail.current = undefined; generation.current++; request.current?.abort(); setLoading(false); }}
          minLength={2} maxLength={200} required disabled={disabled} className="mt-1 w-full rounded-lg border border-slate-300 p-3" />
      </label>
      <button disabled={disabled || loading || completing} className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{loading ? 'Pesquisando...' : 'Pesquisar título'}</button>
    </form>
    <div aria-label="Fontes de pesquisa por título" className="flex flex-wrap gap-2">
      {sources.map(item => { const enabled = item.id === 'amazon' ? amazonEnabled : item.enabled; return <button key={item.id} type="button" disabled={!enabled} aria-pressed={source === item.id}
        onClick={() => setSource(item.id)} className={`rounded-lg border px-3 py-2 text-sm disabled:opacity-50 ${source === item.id ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-600'}`}>
        {item.label}{!enabled && ' (em breve)'}
      </button>; })}
    </div>
    <p className="text-xs text-slate-500">As fontes são consultadas separadamente. Confira a edição antes de selecionar. A seleção abre o cadastro para conferência e edição.</p>
    <p role="status" aria-live="polite" className="text-sm text-slate-700">{message}</p>
    {amazonEnabled && <p role="status" aria-live="polite" className="text-sm text-slate-700">{amazonMessage}</p>}
    <p role="status" aria-live="polite" className="text-sm text-slate-700">{curitibaMessage}</p>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {candidates.filter(candidate => source === 'all' || candidate.source === source).map(candidate => {
        const book = candidate.book, cover = coverOf(book);
        return <article key={`${candidate.source}:${candidate.key}`} className={`rounded-xl border p-4 ${selected === candidateId(candidate) ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
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
              {book.edition && <p>Edição: {book.edition}</p>}
              {book.format && <p>Formato: {book.format}</p>}
              {book.language && <p>Idioma: {book.language}</p>}
              {book.pageCount && <p>Páginas: {book.pageCount}</p>}
              <p>Fonte: {book.provider}</p>
              {book.bibliographicWarnings?.map(warning => <p key={warning} className="text-xs text-amber-800">{warning}</p>)}
            </div>
          </div>
          <button type="button" disabled={disabled || (selecting && candidate.source === 'curitiba')} aria-pressed={selected === candidateId(candidate)} aria-haspopup="dialog"
            onClick={event => { void selectEdition(candidate, event.currentTarget); }}
            className="mt-3 rounded-lg border border-blue-300 px-3 py-2 text-sm font-semibold text-blue-800">Selecionar esta edição</button>
        </article>;
      })}
    </div>
    {chosen && <dialog ref={confirmationDialog} aria-labelledby="edition-confirmation-title" aria-describedby="edition-confirmation-help"
      onCancel={event => { event.preventDefault(); cancelSelection(); }} onClose={() => setSelected(null)}
      onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const buttons = event.currentTarget.querySelectorAll('button:not([disabled])');
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 text-slate-700 shadow-xl backdrop:bg-slate-900/50">
      <h2 id="edition-confirmation-title" className="text-lg font-bold text-slate-900">Confirmar edição</h2>
      <p id="edition-confirmation-help" className="mt-2 text-sm">Confira a edição selecionada. O cadastro será aberto para revisão e edição manual.</p>
      <div className="mt-4 flex items-start gap-4 text-sm">
        {coverOf(chosen.book) && <img src={coverOf(chosen.book)} alt={`Capa de ${chosen.book.title}`}
          referrerPolicy="no-referrer" className="h-36 w-24 shrink-0 object-contain" />}
        <div className="min-w-0 space-y-2 break-words">
          <h3 className="font-bold text-slate-900">{chosen.book.title}</h3>
          {chosen.book.subtitle && <p>{chosen.book.subtitle}</p>}
          <p>Autores: {chosen.book.authors?.join(', ') || 'Não informados'}</p>
          <p>Editora: {chosen.book.publisher || 'Não informada'}</p>
          <p>Ano: {chosen.book.year || 'Não informado'}</p>
          <p>ISBN-13: {chosen.book.isbn13 || 'Não informado'}</p>
          <p>ISBN-10: {chosen.book.isbn10 || 'Não informado'}</p>
          {chosen.book.edition && <p>Edição: {chosen.book.edition}</p>}
          {chosen.book.format && <p>Formato: {chosen.book.format}</p>}
          <p>Fonte: {chosen.book.provider}</p>
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
        <button type="button" autoFocus onClick={cancelSelection} className="rounded-lg border border-slate-300 px-4 py-3 font-semibold text-slate-700">Cancelar</button>
        {completing && <p role="status">Consultando detalhes da edição…</p>}
        <button type="button" disabled={disabled || completing} onClick={() => { void confirmEdition(); }} className="rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50">Confirmar edição e abrir cadastro</button>
      </div>
    </dialog>}
  </section>;
}
