import { useState } from 'react';
import type { InfrastructureConfig, MetricSnapshot, SyncRun } from '../../types/infrastructure';
import { metricStatusLabels } from '../../types/infrastructure';
import { displayInstant, displayValue } from './InfrastructureOverview';

export default function InfrastructureHistory({ configs, snapshots, runs }: { configs: InfrastructureConfig[]; snapshots: MetricSnapshot[]; runs: SyncRun[] }) {
  const [provider, setProvider] = useState('all'); const [page, setPage] = useState(0);
  const ids = new Set(configs.filter(c => provider === 'all' || c.provider === provider).map(c => c.id));
  const filtered = snapshots.filter(snapshot => ids.has(snapshot.config_id));
  const pages = Math.max(1, Math.ceil(filtered.length / 20)); const current = Math.min(page, pages - 1);
  return <div className="min-w-0 space-y-4">
    <label className="text-sm">Provedor <select className="rounded-lg border px-3 py-2" value={provider} onChange={e => { setProvider(e.target.value); setPage(0); }}><option value="all">Todos</option><option value="supabase">Supabase</option><option value="vercel">Vercel</option></select></label>
    <p className="text-xs text-slate-600">Janela de até 500 snapshots e 100 execuções mais recentes da loja. Valores repetidos são observações; não devem ser somados. Versões anteriores permanecem identificadas.</p>
    {!filtered.length ? <p className="text-sm text-slate-600">Nenhum snapshot neste ambiente e filtro.</p> : <>
      <div className="overflow-x-auto"><table className="w-full text-left text-xs"><caption className="sr-only">Histórico de infraestrutura</caption><thead><tr>{['Coleta (São Paulo)', 'Métrica / versão', 'Valor', 'Origem / estado', 'Escopo / período'].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead>
        <tbody>{filtered.slice(current * 20, current * 20 + 20).map(metric => <tr key={metric.id} className="border-t border-slate-200 align-top">
          <td className="p-2 whitespace-nowrap">{displayInstant(metric.observed_at)}</td><td className="p-2 break-words">{metric.metric_key}<br />v{metric.config_version}</td>
          <td className="p-2">{displayValue(metric.observed_value)} {metric.unit}</td><td className="p-2">{metric.source}<br />{metricStatusLabels[metric.quality_status]}{metric.is_demo && ' · Demonstração'}<br />{metric.error_code_sanitized}</td>
          <td className="p-2 break-words">{metric.quota_scope}: {metric.scope_id}<br />{metric.period_start && metric.period_end ? `${displayInstant(metric.period_start)} até ${displayInstant(metric.period_end)}` : metric.period_type}</td>
        </tr>)}</tbody></table></div>
      <div className="flex items-center gap-3 text-xs"><button type="button" disabled={current === 0} onClick={() => setPage(current - 1)}>Anterior</button><span>Página {current + 1} de {pages}</span><button type="button" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>Próxima</button></div>
    </>}
    <details><summary className="cursor-pointer text-sm font-semibold">Execuções e erros</summary><ul className="mt-2 space-y-2 text-xs">{runs.filter(run => ids.has(run.config_id)).map(run => <li key={run.id} className="rounded-lg bg-slate-50 p-2">{displayInstant(run.started_at)} · v{run.config_version} · {run.status}{run.error_code_sanitized && ` · ${run.error_code_sanitized}`}</li>)}</ul></details>
  </div>;
}
