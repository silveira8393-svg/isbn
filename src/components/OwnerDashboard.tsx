import { useEffect, useMemo, useState } from 'react';
import { useUser } from '../contexts/UserContext';
import { loadProduction, type ProductionData, type ProductionPeriod } from '../services/productionService';
import { calculateProductionMetrics } from '../utils/metrics';
import { DailyOperationsChart, ProcessedDistributionChart } from './dashboard/DashboardCharts';
import { recordProvenance, provenanceLabels, type RecordProvenance } from '../utils/operationalTest';
import RegistrationLookup from './dashboard/RegistrationLookup';
import { formatStoreDate, formatStoreTime, formatStoreDateTime } from '../utils/storeTime';
import {
  bibliographicSearchEvidence, classifyOperationOrigin, dailyActivityCounts, metricsByOrigin, operationDate,
  operationLabels, operationOrigins, processedDistribution, userDashboardMetrics, type OperationOrigin,
} from '../utils/dashboard';

const periods: { value: ProductionPeriod; label: string }[] = [
  { value: 'today', label: 'Hoje' }, { value: '7days', label: '7 dias' },
  { value: '30days', label: '30 dias' }, { value: 'all', label: 'Todos' },
];
const originStyles: Record<OperationOrigin, { badge: string }> = {
  simulated: { badge: 'bg-amber-50 text-amber-900 border-amber-200' },
  declared: { badge: 'bg-blue-50 text-blue-900 border-blue-200' },
  unknown: { badge: 'bg-slate-100 text-slate-700 border-slate-200' },
};
const focusStyle = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600';
const dashboardTabs = [
  { value: 'overview', label: 'Visão Geral' },
  { value: 'automation', label: 'Eficiência da Automação' },
  { value: 'records', label: 'Registros' },
  { value: 'operators', label: 'Operadores' },
  { value: 'registrations', label: 'Consulta de Cadastros' },
] as const;
type DashboardTab = typeof dashboardTabs[number]['value'];
const bibliographicFields = ['Título', 'Autores', 'Editora', 'Ano', 'Edição', 'Idioma', 'Formato', 'Páginas', 'Sinopse'];
const unavailable = 'Dados ainda não disponíveis';
const cards = [
  { key: 'totalProcessed', label: 'Ações processadas', detail: 'Cadastros e entradas vinculadas concluídos' },
  { key: 'newCreated', label: 'Livros novos', detail: 'Ações de cadastro de livros novos concluídas' },
  { key: 'usedCreated', label: 'Exemplares usados', detail: 'Ações de cadastro de exemplares usados concluídas' },
  { key: 'newReused', label: 'Reaproveitamentos', detail: 'Entradas vinculadas a produtos novos' },
  { key: 'searches', label: 'Pesquisas ISBN', detail: 'Pesquisas concluídas, inclusive sem livro localizado' },
  { key: 'errors', label: 'Erros', detail: 'Falhas registradas nas operações' },
] as const;
const recordTypes = [
  { value: 'all', label: 'Todos' }, { value: 'searches', label: 'Pesquisas' },
  { value: 'registrations', label: 'Cadastros' }, { value: 'reused', label: 'Reaproveitamentos' },
  { value: 'errors', label: 'Erros' }, { value: 'other', label: 'Outros / pendentes' },
] as const;
type RecordType = typeof recordTypes[number]['value'];
const pageSize = 20;

// Local presentation categories partition the loaded records; they do not redefine KPIs.
function recordType(item: ProductionData['operations'][number]): RecordType {
  if (item.status === 'error' || item.operation_type === 'operation_error') return 'errors';
  if (item.operation_type === 'isbn_search') return 'searches';
  if (item.operation_type === 'new_product_created' || item.operation_type === 'used_copy_created') return 'registrations';
  if (item.operation_type === 'new_product_reused') return 'reused';
  return 'other';
}

function fullText(value: string) {
  return <span tabIndex={0} title={value} className={`block truncate rounded-sm hover:whitespace-normal hover:[overflow-wrap:anywhere] focus:whitespace-normal focus:[overflow-wrap:anywhere] ${focusStyle}`}>{value}</span>;
}

function unavailableValue() {
  return <span className="text-slate-500"><span aria-hidden="true">— </span>{unavailable}</span>;
}

function OriginBadge({ origin }: { origin: OperationOrigin }) {
  return <span title={operationOrigins.find(item => item.value === origin)?.label} className={`inline-flex items-center gap-1.5 text-xs ${origin === 'simulated' ? 'text-amber-800' : origin === 'declared' ? 'text-blue-700' : 'text-slate-500'}`}>
    <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${origin === 'simulated' ? 'bg-amber-600' : origin === 'declared' ? 'bg-blue-600' : 'bg-slate-400'}`} />
    {origin === 'simulated' ? 'Simulada' : origin === 'declared' ? 'Declarada não simulada' : 'Não identificada'}
  </span>;
}

export default function OwnerDashboard() {
  const { currentUser, canViewProduction, isDeveloper, operationEnvironment } = useUser();
  const [period, setPeriod] = useState<ProductionPeriod>('all');
  const [selectedUserFilter, setSelectedUserFilter] = useState('all');
  const [selectedOrigin, setSelectedOrigin] = useState<OperationOrigin | 'all'>('all');
  const [selectedProvenance, setSelectedProvenance] = useState<RecordProvenance | 'all'>('all');
  const [selectedTab, setSelectedTab] = useState<DashboardTab>('overview');
  const [retry, setRetry] = useState(0);
  const [selectedRecordType, setSelectedRecordType] = useState<RecordType>('all');
  const [recordPage, setRecordPage] = useState(1);
  const [evidenceSelection, setEvidenceSelection] = useState<{ id: string; context: string } | null>(null);
  const [loadState, setLoadState] = useState<{
    key: string; status: 'loading' | 'success' | 'error'; data: ProductionData; updatedAt?: string;
  }>({ key: '', status: 'loading', data: { operations: [], names: {} } });
  // A direct mount must refuse reads too; permissions remain controlled by UserContext.
  const contextKey = [currentUser.id, currentUser.storeId, currentUser.role, canViewProduction, operationEnvironment, period, retry].join(':');

  useEffect(() => {
    if (!canViewProduction) return;
    const controller = new AbortController();
    let cancelled = false;
    setLoadState({ key: contextKey, status: 'loading', data: { operations: [], names: {} } });
    void loadProduction(currentUser.storeId ?? '', operationEnvironment, period, controller.signal, currentUser.role === 'admin')
      .then(data => { if (!cancelled) setLoadState({ key: contextKey, status: 'success', data, updatedAt: new Date().toISOString() }); })
      .catch(() => { if (!cancelled) setLoadState({ key: contextKey, status: 'error', data: { operations: [], names: {} } }); });
    return () => { cancelled = true; controller.abort(); };
  }, [contextKey, currentUser.storeId, operationEnvironment, period, canViewProduction]);

  const status = loadState.key === contextKey && canViewProduction ? loadState.status : 'loading';
  const items = useMemo(() => status === 'success' ? loadState.data.operations : [], [status, loadState.data]);
  const userOptions = useMemo(() => [...new Set(items.flatMap(item => item.user_id ? [item.user_id] : []))], [items]);
  const displayedItems = useMemo(() => items.filter(item =>
    (selectedUserFilter === 'all' || item.user_id === selectedUserFilter)
    && (selectedOrigin === 'all' || classifyOperationOrigin(item) === selectedOrigin)
    && (selectedProvenance === 'all' || recordProvenance(item) === selectedProvenance)
  ), [items, selectedUserFilter, selectedOrigin, selectedProvenance]);
  const metrics = useMemo(() => calculateProductionMetrics(displayedItems), [displayedItems]);
  const evidence = evidenceSelection?.context === contextKey ? displayedItems.find(item => item.id === evidenceSelection.id) : undefined;
  const origins = useMemo(() => metricsByOrigin(displayedItems), [displayedItems]);
  const namedUser = (id: string | null) => id ? loadState.data.names[id] || id : 'Sem autoria identificada';
  const users = useMemo(() => userDashboardMetrics(displayedItems).sort((a, b) =>
    namedUser(a.userId).localeCompare(namedUser(b.userId), 'pt-BR') || (a.userId ?? '').localeCompare(b.userId ?? '')
  ), [displayedItems, loadState.data.names]);
  const daily = useMemo(() => dailyActivityCounts(displayedItems), [displayedItems]);
  const distribution = useMemo(() => processedDistribution(metrics), [metrics]);
  const searchEvidence = useMemo(() => bibliographicSearchEvidence(displayedItems), [displayedItems]);
  const searchResults = useMemo(() => searchEvidence.reduce((total, origin) => ({
    found: total.found + origin.found,
    notFound: total.notFound + origin.notFound,
    unidentified: total.unidentified + origin.unidentified,
  }), { found: 0, notFound: 0, unidentified: 0 }), [searchEvidence]);
  const orderedRecords = useMemo(() => [...displayedItems].sort((a, b) =>
    (operationDate(b)?.getTime() ?? 0) - (operationDate(a)?.getTime() ?? 0) || a.id.localeCompare(b.id)
  ), [displayedItems]);
  const typeCounts = useMemo(() => Object.fromEntries(recordTypes.map(type => [type.value,
    type.value === 'all' ? displayedItems.length : displayedItems.filter(item => recordType(item) === type.value).length,
  ])), [displayedItems]);
  const filteredRecords = useMemo(() => orderedRecords.filter(item => selectedRecordType === 'all' || recordType(item) === selectedRecordType), [orderedRecords, selectedRecordType]);
  const pageCount = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const currentPage = Math.min(recordPage, pageCount);
  const recent = filteredRecords.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  useEffect(() => { setRecordPage(1); }, [contextKey, selectedUserFilter, selectedOrigin, selectedRecordType, selectedProvenance]);
  const clearFilters = () => { setPeriod('all'); setSelectedUserFilter('all'); setSelectedOrigin('all'); setSelectedProvenance('all'); setSelectedRecordType('all'); setRecordPage(1); };
  const knownSearchResults = searchResults.found + searchResults.notFound;
  const searchFailures = displayedItems.filter(item => (item.status === 'error' && item.operation_type === 'isbn_search')
    || (item.operation_type === 'operation_error' && item.metadata?.flow === 'isbn_search')).length;
  const undatedRecords = displayedItems.length - daily.reduce((total, day) => total + day.total, 0);

  if (!canViewProduction) return null;

  return <div className="mx-auto w-full min-w-0 max-w-[1440px] space-y-4 pb-6 animate-fade-in">
    <header className="rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-3 px-4 py-2 lg:flex-nowrap">
        <div className="min-w-0 lg:mr-auto">
          <h2 className="text-base font-semibold text-slate-900">Dashboard do Proprietário</h2>
          <p className="truncate text-xs text-slate-500" title={currentUser.storeName || 'Loja atual'}>{currentUser.storeName || 'Loja atual'}</p>
        </div>
        <span aria-label={`Ambiente de leitura: ${operationEnvironment}`} className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${isDeveloper ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-blue-200 bg-blue-50 text-blue-700'}`}>{currentUser.role === 'admin' ? 'production + lote demonstrativo' : operationEnvironment}</span>
        <button type="button" disabled={status === 'loading'} onClick={() => setRetry(value => value + 1)} className={`rounded border border-slate-200 px-3 py-1 text-xs disabled:opacity-50 ${focusStyle}`}>Atualizar</button>
        <div className="flex flex-wrap gap-3 max-lg:w-full lg:items-center">
          <div className="flex shrink-0 overflow-hidden rounded-lg border border-slate-200" aria-label="Período">
            {periods.map(option => <button key={option.value} type="button" aria-pressed={period === option.value} onClick={() => setPeriod(option.value)}
              className={`cursor-pointer px-2.5 py-1.5 text-xs ${focusStyle} ${period === option.value ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}>{option.label}</button>)}
          </div>
          <label className="sr-only" htmlFor="select-operator-filter">Filtrar por usuário</label>
          <select id="select-operator-filter" value={selectedUserFilter} onChange={event => setSelectedUserFilter(event.target.value)} className={`w-40 min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 ${focusStyle}`}>
            <option value="all">Todos os usuários</option>
            {userOptions.map(id => <option key={id} value={id}>{namedUser(id)}</option>)}
            {selectedUserFilter !== 'all' && !userOptions.includes(selectedUserFilter) && <option value={selectedUserFilter}>Usuário sem registros neste período</option>}
          </select>
          <label className="sr-only" htmlFor="select-origin-filter">Origem dos registros</label>
          <select id="select-origin-filter" value={selectedOrigin} onChange={event => setSelectedOrigin(event.target.value as OperationOrigin | 'all')} className={`w-48 min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 ${focusStyle}`}>
            <option value="all">Todas as origens</option>
            {operationOrigins.map(origin => <option key={origin.value} value={origin.value}>{origin.label}</option>)}
          </select>
          <label className="sr-only" htmlFor="select-provenance-filter">Natureza da atividade</label>
          <select id="select-provenance-filter" value={selectedProvenance} onChange={event => setSelectedProvenance(event.target.value as RecordProvenance | 'all')} className={`w-48 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs ${focusStyle}`}>
            <option value="all">Todas as atividades</option>
            {Object.entries(provenanceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>
      <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500" role="status">
        Última atualização: {status === 'success' && loadState.updatedAt ? formatStoreDateTime(loadState.updatedAt) : 'aguardando leitura confirmada'} (São Paulo).
        {' '}Totais seguem os filtros; incluem dados fictícios quando selecionados. Ambiente não comprova produção comercial.
        {' '}{Object.entries(provenanceLabels).map(([value, label]) => `${label}: ${displayedItems.filter(item => recordProvenance(item) === value).length}`).join(' · ')}
      </div>
      <div role="tablist" aria-label="Abas do dashboard" className="flex flex-wrap gap-x-4 border-t border-slate-100 px-4 sm:gap-x-6">
        {dashboardTabs.map((tab, index) => <button key={tab.value} type="button" role="tab"
          id={`dashboard-tab-${tab.value}`} aria-controls={`dashboard-panel-${tab.value}`}
          aria-selected={selectedTab === tab.value} tabIndex={selectedTab === tab.value ? 0 : -1}
          onClick={() => setSelectedTab(tab.value)}
          onKeyDown={event => {
            let nextIndex: number;
            if (event.key === 'ArrowRight') nextIndex = (index + 1) % dashboardTabs.length;
            else if (event.key === 'ArrowLeft') nextIndex = (index + dashboardTabs.length - 1) % dashboardTabs.length;
            else if (event.key === 'Home') nextIndex = 0;
            else if (event.key === 'End') nextIndex = dashboardTabs.length - 1;
            else return;
            event.preventDefault();
            setSelectedTab(dashboardTabs[nextIndex].value);
            const tabButton = event.currentTarget as HTMLButtonElement;
            tabButton.parentElement?.querySelector<HTMLButtonElement>(`#dashboard-tab-${dashboardTabs[nextIndex].value}`)?.focus();
          }}
          className={`min-h-10 cursor-pointer border-b-2 py-2 text-xs ${focusStyle} ${selectedTab === tab.value ? 'border-blue-600 font-semibold text-blue-700' : 'border-transparent font-medium text-slate-500 hover:text-slate-800'}`}>{tab.label}</button>)}
      </div>
    </header>

    {dashboardTabs.map(tab => <div key={tab.value} role="tabpanel" id={`dashboard-panel-${tab.value}`} aria-labelledby={`dashboard-tab-${tab.value}`}
      hidden={selectedTab !== tab.value} tabIndex={0} className={`space-y-4 rounded-sm ${focusStyle}`}>
      {selectedTab === tab.value && <>
        {status === 'loading' && <p role="status" className="py-3 text-sm text-slate-500">Carregando dashboard...</p>}
        {status === 'error' && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <p>Não foi possível carregar o dashboard. Tente novamente mais tarde.</p>
          <button type="button" onClick={() => setRetry(value => value + 1)} className={`cursor-pointer rounded-md border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold ${focusStyle}`}>Tentar novamente</button>
        </div>}
        {status === 'success' && displayedItems.length === 0 && <div role="status" className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <p>Nenhuma operação nos filtros selecionados.</p><button type="button" onClick={clearFilters} className={`cursor-pointer rounded-sm text-blue-700 ${focusStyle}`}>Limpar filtros</button>
        </div>}

        {status === 'success' && <>
          {selectedTab === 'registrations' && <div key={contextKey}><RegistrationLookup operations={displayedItems} names={loadState.data.names} /></div>}
          {selectedTab === 'overview' && <>
            <section aria-label="Indicadores operacionais" className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
              {cards.map(card => <article key={card.key} data-metric={card.key} title={card.detail} className="flex h-20 min-w-0 flex-col justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
                <h3 className="text-xs leading-4 text-slate-600">{card.label}</h3>
                <p className={`text-[26px] leading-none font-semibold tabular-nums ${metrics[card.key] === 0 ? 'text-slate-500' : card.key === 'errors' ? 'text-rose-700' : 'text-slate-900'}`}>{metrics[card.key]}</p>
              </article>)}
            </section>
            <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
                <h3 className="text-[15px] font-semibold text-slate-900">Atividade por dia</h3>
                <DailyOperationsChart days={daily} />
                {undatedRecords > 0 && <p className="mt-2 text-xs text-slate-500">{undatedRecords} registros sem data válida não aparecem na evolução.</p>}
              </section>
              <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
                <h3 className="text-[15px] font-semibold text-slate-900">Composição das ações</h3>
                <ProcessedDistributionChart distribution={distribution} />
              </section>
            </div>
            <div aria-label="Quantidade e classificação" className="text-xs text-slate-500">
              <p><strong className="font-medium text-slate-700">{metrics.units}</strong> unidades informadas nos cadastros e entradas vinculadas. Quantidade ausente ou inválida estimada como uma unidade, conforme a regra existente.</p>
              <details className="mt-1">
                <summary className={`w-fit cursor-pointer rounded-sm py-1 text-blue-700 ${focusStyle}`}>Detalhar indicadores por origem</summary>
                <div className="mt-2 grid gap-3 sm:grid-cols-3">{origins.map(origin => <div key={origin.value} className={`rounded-lg border p-3 ${originStyles[origin.value].badge}`}>
                  <p className="font-semibold">{origin.label}</p><p className="mt-1">{origin.records} registros · {origin.metrics.units} unidades</p>
                  <dl className="mt-2 space-y-1">{cards.map(card => <div key={card.key} className="flex justify-between gap-2"><dt>{card.label}</dt><dd className="tabular-nums">{origin.metrics[card.key]}</dd></div>)}</dl>
                </div>)}</div>
              </details>
            </div>
          </>}

          {selectedTab === 'automation' && <>
            <section aria-label="Resultados registrados das pesquisas ISBN" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {[
                { key: 'searches', label: 'Pesquisas realizadas', value: metrics.searches, detail: 'Concluídas registradas' },
                { key: 'found', label: 'Livros encontrados', value: knownSearchResults > 0 ? searchResults.found : null, detail: 'Resultado registrado' },
                { key: 'notFound', label: 'Não encontrados nas fontes consultadas', value: knownSearchResults > 0 ? searchResults.notFound : null, detail: 'Resultado registrado' },
                { key: 'fill', label: 'Preenchimento automático', value: null, detail: '' },
              ].map(card => <article key={card.key} data-search-result={card.key} className="flex min-h-20 min-w-0 flex-col justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
                <dl><dt className="text-xs leading-4 text-slate-600">{card.label}</dt>
                  <dd className={`mt-2 font-semibold tabular-nums ${card.value === null ? 'text-xs text-slate-500' : `text-[26px] leading-none ${card.value === 0 ? 'text-slate-500' : 'text-slate-900'}`}`}>{card.value === null ? unavailableValue() : card.value}</dd>
                </dl>
                {card.detail && <p className="mt-1 text-[11px] text-slate-500">{card.detail}</p>}
              </article>)}
            </section>
            <div className="space-y-1 text-xs text-slate-500">
              <p>{metrics.searches} pesquisas concluídas registradas. Inconclusivas por falha técnica: {searchFailures} erros identificados no fluxo de pesquisa, fora dos resultados. Tentativas totais ainda não disponíveis.</p>
              {searchResults.unidentified > 0 && <p data-unidentified-count={searchResults.unidentified}>{searchResults.unidentified} registros sem resultado identificado, fora dos contadores de encontrados e não encontrados.</p>}
              <p>O preenchimento mede completude, não precisão bibliográfica. Aguardando instrumentação da Etapa 5B.</p>
            </div>
            <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
              <h3 className="px-4 py-3 text-[15px] font-semibold text-slate-900">Preenchimento automático por campo</h3>
              <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-[13px]">
                <caption className="sr-only">Nove campos bibliográficos; métricas ainda não instrumentadas</caption>
                <thead className="bg-slate-50 text-xs text-slate-500"><tr>{['Campo', 'Preenchidos', '% preenchido', 'Não preenchidos'].map((label, index) => <th key={label} scope="col" className={`px-4 py-2 font-semibold ${index > 0 ? 'text-right' : ''}`}>{label}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">{bibliographicFields.map(field => <tr key={field} data-bibliographic-field={field} className="h-10">
                  <th scope="row" className="px-4 py-2 font-medium text-slate-700">{field}</th>
                  {[0, 1, 2].map(column => <td key={column} className="px-4 py-2 text-right text-xs">{unavailableValue()}</td>)}
                </tr>)}</tbody>
              </table></div>
            </section>
          </>}

          {selectedTab === 'records' && <section aria-label="Atividades recentes" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2" aria-label="Tipo de operação">
                {recordTypes.filter(type => type.value !== 'other' || typeCounts.other > 0 || selectedRecordType === 'other').map(type => <button key={type.value} type="button" data-record-type={type.value}
                  aria-pressed={selectedRecordType === type.value} onClick={() => { setSelectedRecordType(type.value); setRecordPage(1); }}
                  className={`cursor-pointer rounded-full border px-3 py-1 text-xs ${focusStyle} ${selectedRecordType === type.value ? 'border-blue-600 bg-blue-50 font-semibold text-blue-700' : 'border-slate-200 bg-white text-slate-500'}`}>{type.label} <span className="tabular-nums">{typeCounts[type.value]}</span></button>)}
              </div><p className="text-xs text-slate-500">{filteredRecords.length} registros · {pageSize} por página</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white">
              <div className="overflow-x-auto"><table className="w-full min-w-[900px] table-fixed text-left text-[13px] [&_td]:py-1 [&_td]:leading-4">
                <caption className="sr-only">Registros operacionais, sem associação presumida entre pesquisa e cadastro</caption>
                <colgroup><col className="w-32" /><col className="w-40" /><col /><col className="w-32 xl:w-40" /><col className="w-32 xl:w-40" /><col className="w-24" /></colgroup>
                <thead className="bg-slate-50 text-xs text-slate-500"><tr>{['Data/hora', 'Operação', 'Título/ISBN', 'Operador', 'Origem', 'Situação'].map(label => <th key={label} scope="col" className="px-3 py-2 font-semibold first:sticky first:left-0 first:z-10 first:bg-slate-50 lg:first:static">{label}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">{recent.map(item => {
                  const error = item.status === 'error' || item.operation_type === 'operation_error';
                  const date = operationDate(item);
                  return <tr key={item.id} data-record-id={item.id} className={`h-10 ${error ? 'bg-rose-50' : 'bg-white'}`}>
                    <td className={`sticky left-0 z-10 px-3 py-2 text-xs tabular-nums lg:static ${error ? 'bg-rose-50' : 'bg-white'}`} title={date ? `${formatStoreDateTime(date)} (São Paulo)` : undefined}>
                      {date ? <><span className="block">{formatStoreDate(date)}</span><span className="text-slate-500">{formatStoreTime(date)}</span></> : 'Data não identificada'}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-700">{fullText(operationLabels[item.operation_type] || 'Operação não identificada')}</td>
                    <td className="px-3 py-2 text-slate-700">{fullText(item.title || item.isbn || 'Sem título ou ISBN informado')}{item.title && item.isbn && <span className="block truncate text-[11px] text-slate-500">{item.isbn}</span>}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{fullText(namedUser(item.user_id))}</td>
                    <td className="px-3 py-2"><OriginBadge origin={classifyOperationOrigin(item)} /><span className="block text-[11px] text-slate-600">{provenanceLabels[recordProvenance(item)]}</span></td>
                    <td className={`px-3 py-2 text-xs ${error ? 'font-semibold text-rose-700' : 'text-slate-600'}`}>{error ? 'Erro registrado' : item.status === 'success' ? 'Concluída' : 'Pendente'}
                      <button type="button" onClick={() => setEvidenceSelection({ id: item.id, context: contextKey })} className={`mt-1 block cursor-pointer rounded-sm text-[11px] text-blue-700 underline ${focusStyle}`}>Evidência</button>
                    </td>
                  </tr>;
                })}</tbody>
              </table></div>
              {recent.length === 0 && displayedItems.length > 0 && <p role="status" className="px-4 py-3 text-xs text-slate-500">Nenhum registro deste tipo. <button type="button" onClick={() => setSelectedRecordType('all')} className={`cursor-pointer rounded-sm text-blue-700 ${focusStyle}`}>Mostrar todos os tipos</button></p>}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
                <p role="status" aria-live="polite">Exibindo {filteredRecords.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredRecords.length)} de {filteredRecords.length}</p>
                <nav aria-label="Paginação dos registros" className="flex items-center gap-3">
                  <button type="button" disabled={currentPage === 1} onClick={() => setRecordPage(currentPage - 1)} className={`cursor-pointer rounded-sm text-blue-700 disabled:cursor-default disabled:text-slate-400 ${focusStyle}`}>Anterior</button>
                  <span className="tabular-nums">{currentPage} / {pageCount}</span>
                  <button type="button" disabled={currentPage === pageCount} onClick={() => setRecordPage(currentPage + 1)} className={`cursor-pointer rounded-sm text-blue-700 disabled:cursor-default disabled:text-slate-400 ${focusStyle}`}>Próxima</button>
                </nav>
              </div>
            </div>
            {evidence && <section role="region" aria-label="Evidência da operação" className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex justify-between gap-3"><h3 className="font-semibold text-sm">Evidência da operação</h3><button type="button" onClick={() => setEvidenceSelection(null)} className={`rounded text-xs text-blue-700 underline ${focusStyle}`}>Fechar evidência</button></div>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                {Object.entries({ 'ID do evento': evidence.id, 'Operador': namedUser(evidence.user_id), 'UUID do operador': evidence.user_id,
                  'Data/hora (São Paulo)': operationDate(evidence) ? formatStoreDateTime(operationDate(evidence)!) : null, 'ISBN': evidence.isbn, 'Título': evidence.title, 'Ambiente': evidence.environment,
                  'Natureza': provenanceLabels[recordProvenance(evidence)], 'Código Pai': evidence.parent_code, 'Código Filho': evidence.child_code,
                  'Fluxo': typeof evidence.metadata?.flow === 'string' ? evidence.metadata.flow : null,
                  'Rodada': typeof evidence.metadata?.operational_test_run_id === 'string' ? evidence.metadata.operational_test_run_id : null,
                  'Mensagem de erro': evidence.error_message }).map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="break-words whitespace-pre-wrap">{value || 'Não informado'}</dd></div>)}
              </dl>
              {evidence.metadata?.sources && <details><summary className={`cursor-pointer rounded text-xs text-blue-700 ${focusStyle}`}>Diagnóstico por fonte</summary><pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(evidence.metadata.sources, null, 2)}</pre></details>}
            </section>}
            <p className="text-xs text-slate-500">Contagens por tipo incluem pendências. Pesquisas e cadastros permanecem separados, sem vínculo presumido.</p>
          </section>}

          {selectedTab === 'operators' && <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <h3 className="sr-only">Produtividade por usuário</h3>
            <div className="overflow-x-auto"><table className="w-full min-w-[660px] table-fixed text-left text-[13px]">
              <caption className="sr-only">Ações consolidadas por UUID de usuário em ordem alfabética, com detalhamento de origens</caption>
              <colgroup><col className="w-[34%]" />{cards.map(card => <col key={card.key} />)}</colgroup>
              <thead className="bg-slate-50 text-xs text-slate-500"><tr><th scope="col" className="sticky left-0 z-10 bg-slate-50 px-3 py-2 font-semibold lg:static">Operador</th>
                {['Ações', 'Novos', 'Usados', 'Reaprov.', 'Pesquisas', 'Erros'].map((label, index) => <th key={label} scope="col" title={cards[index].detail} className="px-3 py-2 text-right font-semibold">{label}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-slate-100">{users.map(user => <tr key={user.userId ?? 'without-author'} data-user-id={user.userId ?? 'without-author'} className="h-10">
                <th scope="row" className="sticky left-0 z-10 bg-white px-3 py-2 align-top text-left font-medium text-slate-700 lg:static">{fullText(namedUser(user.userId))}
                  <details className="mt-1 text-[11px] font-normal text-slate-500">
                    <summary className={`w-fit cursor-pointer rounded-sm py-0.5 text-blue-700 ${focusStyle}`}>Detalhar origens<span className="sr-only"> de {namedUser(user.userId)}</span></summary>
                    <p className="mt-2">{user.metrics.units} unidades informadas</p>
                    <p className="mt-2">{Object.entries(provenanceLabels).map(([value, label]) => `${label}: ${displayedItems.filter(item => item.user_id === user.userId && recordProvenance(item) === value).length}`).join(' · ')}</p>
                    <ul className="mt-2 space-y-3">{user.origins.map(origin => <li key={origin.value}>
                      <OriginBadge origin={origin.value} /><p className="mt-1">{origin.records} registros · {origin.metrics.units} unidades</p>
                      <dl className="mt-1 space-y-1">{cards.map(card => <div key={card.key} className="flex justify-between gap-2"><dt>{card.label}</dt><dd className="tabular-nums">{origin.metrics[card.key]}</dd></div>)}</dl>
                    </li>)}</ul>
                  </details>
                </th>
                {cards.map(card => <td key={card.key} className={`px-3 py-2 text-right align-top tabular-nums ${user.metrics[card.key] === 0 ? 'text-slate-500' : card.key === 'errors' ? 'text-rose-700' : 'text-slate-700'}`}>{user.metrics[card.key]}</td>)}
              </tr>)}</tbody>
              <tfoot className="border-t border-slate-300 bg-slate-50 font-semibold"><tr data-operator-totals="true" className="h-10"><th scope="row" className="sticky left-0 z-10 bg-slate-50 px-3 py-2 lg:static">Total</th>
                {cards.map(card => <td key={card.key} className={`px-3 py-2 text-right tabular-nums ${metrics[card.key] === 0 ? 'text-slate-500' : 'text-slate-800'}`}>{metrics[card.key]}</td>)}
              </tr></tfoot>
            </table></div>
            {users.length === 0 && <p className="px-3 py-3 text-xs text-slate-500">Nenhuma atividade para os filtros selecionados.</p>}
          </section>}
        </>}
      </>}
    </div>)}
    <footer className="border-t border-slate-200 pt-2 text-xs leading-5 text-slate-500">
      <span className={`mr-2 font-medium ${isDeveloper ? 'text-amber-800' : 'text-blue-700'}`}>{operationEnvironment}</span>
      {isDeveloper && <span>{status === 'success' ? `${displayedItems.length} registros nos filtros · ` : ''}leitura exclui produção · registros simulados classificados à parte · </span>}
      Registros operacionais; não confirmam publicação, estoque ou venda na Magazord.
    </footer>
  </div>;
}
