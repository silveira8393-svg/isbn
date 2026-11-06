import { RESEARCH_SOURCES, sourceNames, type ResearchStates, type ResearchState } from '../utils/researchSources';

const labels: Record<ResearchState, string> = { waiting: 'Aguardando', querying: 'Consultando', found: 'Encontrado',
  not_found: 'Não encontrado', unavailable: 'Indisponível', not_consulted: 'Não consultado' };
const colors: Record<ResearchState, string> = { waiting: 'bg-slate-300', querying: 'bg-blue-500 motion-safe:animate-pulse',
  found: 'bg-emerald-500', not_found: 'bg-slate-400', unavailable: 'bg-amber-500', not_consulted: 'bg-slate-300' };
export default function ResearchSourcesPanel({ states }: { states: ResearchStates }) {
  return <section aria-label="Fontes da pesquisa" className="rounded-lg border border-slate-200 bg-white px-3 py-2">
    <ul aria-live="polite" aria-atomic="true" className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
      {RESEARCH_SOURCES.map(source => <li key={source} data-source={source} data-state={states[source]} className="min-w-0 text-xs">
        <span className="block font-medium text-slate-700">{sourceNames[source]}</span>
        <span className="flex items-center gap-1.5 text-slate-500"><span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${colors[states[source]]}`} />{labels[states[source]]}</span>
      </li>)}
    </ul>
  </section>;
}
