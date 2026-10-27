import { useEffect, useRef, useState, type FormEvent } from 'react';
import AmazonLabImageGallery from './AmazonLabImageGallery';
import {
  AMAZON_LAB_FIELDS, getAmazonLabHealth, searchAmazonLab, evaluateAmazonLab,
  type LabHealth, type LabMode, type LabResult, type LabQuality,
} from '../services/amazonLabClient';

const qualityNames = { valido: 'Válido localmente', ausente: 'Ausente', inconsistente: 'Inconsistente' };
const matches: Record<string, string> = {
  corresponde: 'ISBN corresponde ao produto', divergente: 'ISBN divergente — não atribuir os dados',
  inconsistente: 'ISBNs inconsistentes', nao_verificavel: 'Correspondência não verificável',
  isbn_pesquisado_invalido: 'ISBN pesquisado inválido',
};
const extraLabels: Record<string, string> = {
  data_publicacao: 'Data completa de publicação', peso: 'Peso (g)', dimensoes: 'Dimensões declaradas (conversão somente com eixos explícitos)',
  largura: 'Largura (cm)', altura: 'Altura (cm)', profundidade: 'Profundidade (cm)',
  subtitulo: 'Subtítulo', categorias: 'Categorias',
};
const displayValue = (value: unknown): string => value == null ? 'Não informado' : Array.isArray(value)
  ? value.join(', ') : typeof value === 'object' ? Object.entries(value).map(([axis, number]) =>
    `${({ width: 'largura', height: 'altura', depth: 'profundidade' } as Record<string, string>)[axis] || axis}: ${number} cm`).join('; ') : String(value);

// Montado somente pelo guard de Desenvolvimento em SettingsView; sem acesso ao contexto de autenticação.
export default function AmazonLab() {
  const [isbn, setIsbn] = useState('9788584390670');
  const [mode, setMode] = useState<LabMode>('http');
  const [health, setHealth] = useState<LabHealth | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LabResult | null>(null);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const searchController = useRef<AbortController | null>(null);
  const foundIsbns = result?.isbn_encontrado
    ? Object.values<{ valor: string | null; valido: boolean }>(result.isbn_encontrado).map(item => item.valor || 'ausente').join(' / ') : '';

  useEffect(() => {
    const controller = new AbortController();
    void getAmazonLabHealth(controller.signal).then(value => { if (!controller.signal.aborted) setHealth(value); }).catch(failure => {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Serviço do laboratório indisponível.');
    });
    return () => { controller.abort(); searchController.current?.abort(); };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    const controller = new AbortController();
    searchController.current = controller;
    setBusy(true); setError(''); setResult(null);
    try {
      const response = await searchAmazonLab(isbn, mode, controller.signal);
      if (!controller.signal.aborted) setResult(response);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Falha na consulta local.');
    } finally {
      inFlight.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return <section aria-labelledby="amazon-lab-heading" className="space-y-5">
    <div>
      <h3 id="amazon-lab-heading" className="text-lg font-bold text-slate-900">Laboratório Amazon</h3>
      <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs font-bold text-amber-900">
        AMBIENTE EXPERIMENTAL — NÃO INTEGRADO AO CADASTRO
      </p>
      <p className="mt-2 text-sm text-slate-600">Pesquisa isolada em memória, sem histórico, auditoria ou cadastro.</p>
    </div>

    <form onSubmit={submit} className="space-y-4">
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="amazon-lab-isbn" className="mb-1 block text-sm font-semibold">ISBN-10 ou ISBN-13</label>
          <input id="amazon-lab-isbn" value={isbn} onChange={e => { setIsbn(e.target.value); setResult(null); }}
            required maxLength={40} autoComplete="off" spellCheck={false} aria-describedby="amazon-lab-help"
            className="w-full rounded-lg border border-slate-300 p-2.5 font-mono" />
        </div>
        <div>
          <label htmlFor="amazon-lab-mode" className="mb-1 block text-sm font-semibold">Origem da consulta</label>
          <select id="amazon-lab-mode" value={mode} onChange={e => { setMode(e.target.value as LabMode); setResult(null); }}
            className="w-full rounded-lg border border-slate-300 p-2.5">
            <option value="fixture" disabled={!import.meta.env.DEV}>HTML sanitizado local</option>
            <option value="http">HTTP real — {import.meta.env.DEV ? 'somente local' : 'servidor Vercel'}</option>
          </select>
        </div>
      </fieldset>
      <p id="amazon-lab-help" className="text-xs text-slate-500">{import.meta.env.DEV
        ? 'Fixtures disponíveis: 9788535914849 (1984), 9788584390670 (O Alquimista) e 9788501014863 (O estrangeiro, galeria), ou seus ISBNs-10.'
        : 'Consulta individual por ISBN no servidor. Aguarde a conclusão antes de iniciar outra consulta.'}</p>
      <p className="text-sm text-slate-600">{health ? (import.meta.env.DEV ? 'Serviço local conectado.' : 'Function Amazon conectada.') : 'Verificando conexão com o laboratório…'}</p>
      <button type="submit" disabled={busy || !isbn.trim()}
        className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
        {busy ? 'Pesquisando…' : 'Pesquisar'}
      </button>
    </form>

    <div role="status" aria-live="polite" className="text-sm text-slate-700">
      {busy ? 'Consulta em andamento. Uma pesquisa por vez; sem fila.' : result
        ? `${result.status === 'concluida' ? 'Consulta concluída' : 'Consulta interrompida'} · ${result.duracao_ms.toLocaleString('pt-BR')} ms${result.status_http !== null ? ` · HTTP ${result.status_http}` : ' · fixture local, sem requisição externa'}`
        : 'Aguardando pesquisa.'}
    </div>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {result?.mensagem && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{result.mensagem}</p>}
    {result?.diagnostico && <details className="rounded-lg border border-slate-200 p-3 text-xs text-slate-500">
      <summary className="cursor-pointer font-semibold">Diagnóstico da consulta no servidor</summary>
      <p>Referência: {result.diagnostico.id}</p>
      <p>Function: HTTP {result.diagnostico.status_function} · Amazon: {result.diagnostico.status_http ?? 'sem resposta HTTP'}</p>
      <p>{result.diagnostico.codigo} · {result.diagnostico.duracao_ms} ms</p>
    </details>}
    {result?.campos && <div aria-label="Resultado bibliográfico experimental" className="space-y-4 border-t border-slate-200 pt-4">
      <div className="flex flex-wrap gap-3 text-sm font-semibold">
        <span>{matches[result.correspondencia || ''] || 'Correspondência não avaliada'}</span>
        <span>{result.preenchidos}/9 preenchidos ({result.percentual_preenchimento?.toLocaleString('pt-BR')}%)</span>
        <span>{result.validos_locais}/9 válidos locais ({result.percentual_validos_locais?.toLocaleString('pt-BR')}%)</span>
      </div>
      <p className="text-xs text-slate-500">ISBN pesquisado: {result.isbn_pesquisado}. Encontrados: {foundIsbns}.</p>
      <dl className="grid gap-3 sm:grid-cols-2">
        {AMAZON_LAB_FIELDS.map(([field, label]) => {
          const item = result.campos![field];
          const value = displayValue(item.valor);
          return <div key={field} className={`rounded-lg border p-4 ${field === 'sinopse' ? 'sm:col-span-2' : ''} ${item.estado === 'valido' ? 'border-slate-200' : 'border-amber-300 bg-amber-50'}`}>
            <dt className="text-sm font-bold text-slate-800">{label}</dt>
            <dd className="mt-1 space-y-2 text-sm text-slate-700">
              <p className="whitespace-pre-wrap break-words">{value}</p>
              <p className="text-xs font-semibold">{qualityNames[item.estado]}{item.revisao_humana ? ' · Exige revisão humana' : ''}</p>
              {item.motivos.map(reason => <p key={reason} className="text-xs text-amber-900">{reason}</p>)}
              <p className="break-words text-xs text-slate-500">Origem: {item.origens.join('; ') || 'Não localizada no HTML'}</p>
            </dd>
          </div>;
        })}
      </dl>
      {result.complementares && <section aria-label="Informações físicas e logísticas" className="space-y-3">
        <h4 className="font-bold">Informações físicas e logísticas</h4>
        <p className="text-xs text-slate-600">Indicadores complementares; não entram nos nove campos bibliográficos. Medidas sem ordem explícita não definem eixos.</p>
        {Object.entries(extraLabels).map(([field, label]) => {
          const item = result.complementares![field];
          return item && <div key={field} className="rounded-lg border border-slate-200 p-3 text-sm">
            <p className="font-semibold">{label}</p><p>{displayValue(item.valor)}</p>
            <p>{qualityNames[item.estado]}</p>
            {item.motivos.map(reason => <p key={reason}>{reason}</p>)}
            <p className="text-xs text-slate-500">Origem: {item.origens.join('; ') || 'Não localizada no HTML'}</p>
          </div>;
        })}
      </section>}
      {result.imagens && <section aria-label="Capa e imagens adicionais" className="space-y-2">
        <h4 className="font-bold">Capa e imagens adicionais</h4>
        <p className="text-xs text-slate-600">Capa e miniaturas carregadas diretamente das referências identificadas. URLs e origens estão no diagnóstico.</p>
        {!result.imagens.itens.length && <p className="text-sm">Capa e imagens adicionais ausentes.</p>}
        {result.imagens.itens.length > 0 && <div key={`${result.isbn_pesquisado}:${result.imagens.itens.map(item => item.referencia).join('|')}`}>
          <AmazonLabImageGallery images={result.imagens} title={result.book_info?.title || String(result.campos.titulo.valor || 'Livro')} />
        </div>}
        {result.imagens.itens.length > 0 && <details className="rounded-lg border border-slate-200 p-3 text-xs text-slate-500">
          <summary className="cursor-pointer font-semibold focus-visible:outline-blue-600">Diagnóstico das imagens ({result.imagens.itens.length} referências)</summary>
          {result.imagens.itens.map((item, index) => <div key={`${item.referencia}:${index}`} className="mt-3 break-all space-y-1 border-t border-slate-100 pt-3">
          <p>{item.papel === 'principal' ? 'Capa principal' : 'Imagem adicional'}</p>
          <p>{item.referencia}</p><p>Disponibilidade técnica: referência identificada, arquivo não verificado.</p>
          <p>Origem: {item.origem}</p>
          {item.miniatura && <><p>Miniatura: {item.miniatura}</p><p>Origem da miniatura: {item.origem_miniatura || item.origem}</p></>}
          </div>)}
        </details>}
      </section>}
      {result.book_info && <section aria-label="Origem e qualidade dos dados" className="space-y-2 text-sm">
        <h4 className="font-bold">Origem e qualidade dos dados</h4>
        <p>Projeção experimental BookInfo: {evaluateAmazonLab(result).valid}/9 campos válidos. Candidatos inconsistentes permanecem nas evidências.</p>
        <p>Edição: {result.edicao_verificacao === 'declarada_no_produto_sem_confirmacao_independente'
          ? 'Declarada no produto; sem confirmação independente.' : result.edicao_verificacao === 'inconsistente' ? 'Inconsistente.' : 'Não verificável.'}</p>
        {Object.entries(result.book_info.provenance || {}).map(([field, source]) => <p key={field}>{field}: {source}</p>)}
      </section>}
      <section aria-label="Campos ausentes ou divergentes" className="space-y-2 text-sm">
        <h4 className="font-bold">Campos ausentes ou divergentes</h4>
        {AMAZON_LAB_FIELDS.filter(([field]) => result.campos![field].estado !== 'valido').map(([field, label]) =>
          <p key={field}>{label}: {qualityNames[result.campos![field].estado]}</p>)}
        {Object.entries<LabQuality>(result.complementares || {}).filter(([, item]) => item.estado !== 'valido').map(([field, item]) =>
          <p key={field}>{extraLabels[field] || ({ capa: 'Capa principal', imagens_adicionais: 'Imagens adicionais' } as Record<string, string>)[field] || field}: {qualityNames[item.estado]}{item.motivos.length ? ` — ${item.motivos.join('; ')}` : ''}</p>)}
        {result.correspondencia !== 'corresponde' && <p>Correspondência de ISBN não confirmada; complementação bloqueada.</p>}
      </section>
      <ul className="list-disc space-y-1 pl-5 text-xs text-slate-600">{result.alertas?.map(alert => <li key={alert}>{alert}</li>)}</ul>
    </div>}
  </section>;
}
