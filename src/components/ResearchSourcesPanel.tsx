import { RESEARCH_SOURCES, sourceNames, type ResearchStates, type ResearchState } from '../utils/researchSources';
import ResearchSourceIcon from './ResearchSourceIcon';

const labels: Record<ResearchState, string> = { waiting: 'Aguardando', querying: 'Consultando', found: 'Encontrado',
  not_found: 'Não encontrado', unavailable: 'Indisponível', not_consulted: 'Não consultado', review_required: 'Revisão necessária' };
const colors: Record<ResearchState, string> = { waiting: 'bg-slate-300', querying: 'bg-blue-500 motion-safe:animate-pulse',
  found: 'bg-emerald-500', not_found: 'bg-red-400', unavailable: 'bg-amber-500', not_consulted: 'bg-slate-300', review_required: 'bg-amber-500' };
export default function ResearchSourcesPanel({ states }: { states: ResearchStates }) {
  const querying = RESEARCH_SOURCES.some(source => states[source] === 'querying');
  const completed = RESEARCH_SOURCES.some(source => !['waiting', 'querying'].includes(states[source]));
  const consulted = RESEARCH_SOURCES.filter(source => ['found', 'not_found', 'unavailable', 'review_required'].includes(states[source])).length;
  return <section aria-label="Fontes da pesquisa" className="isbn-sources-panel">
    <div className="isbn-sources-heading"><strong>{querying ? 'Pesquisa em andamento' : completed ? 'Pesquisa concluída' : 'Fontes bibliográficas'}</strong><span>{querying || completed ? `Fontes consultadas: ${consulted}` : 'Aguardando pesquisa por ISBN'}</span></div>
    <ul aria-live="polite" aria-atomic="true" className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
      {RESEARCH_SOURCES.map(source => <li key={source} data-source={source} data-state={states[source]} className="min-w-0 text-xs">
        <span className="isbn-source-symbol"><ResearchSourceIcon source={source} /></span>
        <div className="min-w-0">
        <span className="block font-medium text-slate-700">{sourceNames[source]}</span>
        <span className="isbn-source-state flex items-center gap-1.5 text-slate-500"><span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${colors[states[source]]}`} />{labels[states[source]]}</span>
        {source === 'amazon' && states[source] === 'not_consulted' && <span className="isbn-source-reason">Requer usuário autenticado, ativo e vinculado à loja.</span>}
        </div>
      </li>)}
    </ul>
  </section>;
}
