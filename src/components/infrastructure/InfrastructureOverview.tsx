import type { InfrastructureConfig, MetricLimit, MetricSnapshot, SyncRun } from '../../types/infrastructure';
import { metricStatusLabels } from '../../types/infrastructure';
import { metricIdentity, metricPercentage } from '../../utils/infrastructure';

export const displayInstant = (value: string) => new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
export const displayValue = (value: number | null) => value === null ? '—' : Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

const resourceNames: Record<string, string> = { 'database.bytes': 'Banco de dados PostgreSQL', 'api.requests': 'Total de requisições' };
const priorities = ['database.bytes', 'api.requests'];
const displayQuantity = (value: number, unit: string) => unit === 'bytes' && value >= 1_000_000
  ? `${displayValue(value / (value >= 1_000_000_000 ? 1_000_000_000 : 1_000_000))} ${value >= 1_000_000_000 ? 'GB' : 'MB'}`
  : `${displayValue(value)} ${unit}`;

/** Current observations only; archived history and demonstration code remain outside this view. */
export default function InfrastructureOverview({ configs, snapshots, limits = [], runs = [], busy, onCollect }: {
  configs: InfrastructureConfig[]; snapshots: MetricSnapshot[]; limits?: MetricLimit[]; runs?: SyncRun[];
  busy: boolean; onCollect(id: string): void;
}) {
  return <div className="space-y-4">{configs.map(config => {
    if (config.provider === 'vercel') return <section key={config.id} className="rounded-xl border border-slate-200 bg-white p-4 space-y-2" aria-label="vercel">
      <h4 className="font-bold">Vercel</h4>
      <a href="https://vercel.com/silveira8393-svgs-projects/isbn/usage" target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
        className="inline-block font-semibold text-blue-700 underline underline-offset-2">Abrir Usage oficial do Projeto ISBN (nova aba)</a>
    </section>;
    const relevant = snapshots.filter(metric => metric.config_id === config.id && metric.config_version === config.version
      && !metric.is_demo && metric.quality_status !== 'estimated' && metric.source !== 'demo')
      .sort((a, b) => Date.parse(b.observed_at) - Date.parse(a.observed_at));
    const latestRun = runs.filter(run => run.config_id === config.id && run.config_version === config.version)
      .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at))[0];
    const currentRun = latestRun?.id ?? relevant[0]?.run_id;
    const current = relevant.filter(metric => metric.run_id === currentRun);
    const successfulRun = current.some(metric => metric.observed_value !== null) ? currentRun
      : relevant.find(metric => metric.observed_value !== null)?.run_id;
    const seen = new Set<string>();
    const metrics = relevant.filter(metric => {
      if ((metric.run_id !== currentRun && metric.run_id !== successfulRun) || metric.metric_key.endsWith('_status')
        || !priorities.includes(metric.metric_key)) return false;
      const key = metricIdentity(metric); if (seen.has(key)) return false; seen.add(key); return true;
    });
    const rows: Array<{ key: string; metric?: MetricSnapshot }> = metrics.map(metric => ({ key: metric.metric_key, metric }));
    if (config.provider === 'supabase') for (const key of priorities) if (!rows.some(row => row.key === key)) rows.push({ key });
    rows.sort((a, b) => (priorities.indexOf(a.key) < 0 ? 99 : priorities.indexOf(a.key)) - (priorities.indexOf(b.key) < 0 ? 99 : priorities.indexOf(b.key)));
    const lastAttempt = latestRun?.finished_at ?? latestRun?.started_at ?? relevant[0]?.observed_at;
    const collectionIssue = current.find(metric => metric.observed_value === null);
    return <section key={config.id} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 space-y-3" aria-label={config.provider}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h4 className="font-bold">Supabase · {config.plan_label || 'Plano não informado'}</h4>
          <p className="text-xs text-slate-600">{config.project_ref || 'Projeto não configurado'} · Última atualização: {lastAttempt ? displayInstant(lastAttempt) : 'Ainda não realizada'}</p></div>
        <button type="button" disabled={busy || !config.enabled || config.mode !== 'live'} onClick={() => onCollect(config.id)} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Atualizar consumo</button>
      </div>
      {!config.enabled && <p className="text-sm text-slate-600">Coleta desativada nesta configuração.</p>}
      {config.mode === 'demo' && <p className="text-sm text-amber-900">Consumo real não configurado: salve a configuração em Contas e limites. Valores demonstrativos estão ocultos.</p>}

      {collectionIssue && <p role="status" className="text-sm text-slate-600">Última coleta: {metricStatusLabels[collectionIssue.quality_status]}. {collectionIssue.error_code_sanitized}</p>}
      {!rows.length ? <p className="text-sm text-slate-600">{collectionIssue ? 'Nenhum consumo disponível na última resposta.' : 'Nenhum consumo coletado. Configure a conta e atualize o consumo.'}</p>
        : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Consumo atual de recursos {config.provider}</caption>
          <thead><tr>{['Recurso', 'Quantidade utilizada', 'Limite do plano', 'Percentual consumido', 'Atualização'].map(label => <th key={label} className="p-2 align-top">{label}</th>)}</tr></thead>
          <tbody>{rows.map(({ key, metric }, index) => {
            const candidates = limits.filter(limit => limit.config_id === config.id && limit.metric_key === key
              && (!metric || (limit.unit === metric.unit && limit.quota_scope === metric.quota_scope && limit.scope_id === metric.scope_id)));
            const compatible = metric && candidates.find(limit => metricPercentage(metric, limit) !== null);
            const limit = compatible || candidates[0];
            const percentage = metric ? metricPercentage(metric, compatible || undefined) : null;
            const oldValue = metric && metric.run_id !== currentRun;
            return <tr key={metric?.id ?? `${key}-${index}`} className={`border-t border-slate-200 align-top ${key === 'database.bytes' ? 'bg-slate-50 font-semibold' : 'text-slate-600'}`}>
              <td className="min-w-40 p-2"><p className="font-semibold">{resourceNames[key]}</p>{key === 'api.requests' && <p className="text-xs font-normal text-slate-500">Informação secundária</p>}
                {metric && <p className="text-xs text-slate-500">{metric.period_start && metric.period_end
                  ? `${displayInstant(metric.period_start)} até ${displayInstant(metric.period_end)} (fim exclusivo)` : metric.period_type === 'instant' ? 'Medição instantânea' : 'Período não informado pela API'}</p>}</td>
              <td className="min-w-36 p-2">{metric?.observed_value != null ? displayQuantity(metric.observed_value, metric.unit)
                : <><span>{metric ? metricStatusLabels[metric.quality_status] : !config.project_ref || config.mode !== 'live' ? 'Não configurado' : 'Indisponível'}</span><p className="text-xs text-slate-500">Aguardando coleta e permissões da API.</p></>}
                {oldValue && <p className="text-xs text-amber-900">Valor anterior; última coleta sem medida válida.</p>}</td>
              <td className="min-w-32 p-2">{limit ? <>{displayQuantity(Number(limit.max_value), limit.unit)}<p className="text-xs text-slate-500">Configurado manualmente</p></> : <><span>Não configurado</span><p className="text-xs text-slate-500">Informar o limite do plano</p></>}</td>
              <td className="min-w-36 p-2">{percentage !== null ? <><p>{displayValue(percentage)}%</p><progress aria-label={`Percentual consumido de ${resourceNames[key]}`} max={100} value={Math.min(100, percentage)} className="w-full accent-blue-600" /></>
                : <><span>—</span><p className="text-xs text-slate-500">{!metric ? 'Sem medida disponível' : !limit ? 'Sem limite confirmado' : 'Unidade, escopo, período ou vigência incompatíveis'}</p></>}</td>
              <td className="min-w-32 p-2 text-xs">{metric ? displayInstant(metric.observed_at) : '—'}</td>
            </tr>;
          })}</tbody></table></div>}
      <p className="text-xs text-slate-500">Banco: ocupação atual, distinta de disco total. Requisições: último ponto informado pela API; não representa consumo mensal.</p>
    </section>;
  })}</div>;
}
