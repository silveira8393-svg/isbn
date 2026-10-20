import { useState } from 'react';
import type { InfrastructureConfig, MetricLimit } from '../../types/infrastructure';
import { configDraft, validateConfigDraft, validateLimits, type ConfigDraft } from '../../utils/infrastructure';

const fieldStyle = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
const cleanLimit = (limit: MetricLimit): MetricLimit => ({ metric_key: limit.metric_key, unit: limit.unit,
  quota_scope: limit.quota_scope, scope_id: limit.scope_id, period_type: limit.period_type,
  period_start: limit.period_start, period_end: limit.period_end, max_value: Number(limit.max_value), source: 'manual', effective_at: limit.effective_at });

function ConfigForm({ config, limits, busy, onSave, onTest }: {
  config: InfrastructureConfig; limits: MetricLimit[]; busy: boolean;
  onSave(config: InfrastructureConfig, draft: ConfigDraft, limits: MetricLimit[]): void; onTest(id: string): void;
}) {
  // Existing demonstration configuration is preserved until an explicit save switches it to live.
  const [draft, setDraft] = useState(() => ({ ...configDraft(config), mode: 'live' as const }));
  const [rows, setRows] = useState(() => limits.map(cleanLimit));
  const [error, setError] = useState('');
  const change = (key: keyof ConfigDraft, value: unknown) => setDraft(previous => ({ ...previous, [key]: value }));
  const changeLimit = (index: number, key: keyof MetricLimit, value: unknown) => setRows(previous => previous.map((row, i) => i === index ? { ...row, [key]: value } : row));
  return <form className="rounded-xl border border-slate-200 p-4 space-y-4" onSubmit={event => {
    event.preventDefault(); setError('');
    try { onSave(config, validateConfigDraft(draft), validateLimits(rows)); }
    catch (error) { setError(error instanceof Error ? error.message : 'Confira os campos.'); }
  }}>
    <fieldset disabled={busy} className="space-y-4">
      <legend className="font-bold">{config.provider === 'vercel' ? 'Vercel' : 'Supabase'} · versão {config.version}</legend>
      <div className="flex flex-wrap gap-4 text-sm">
        <label><input type="checkbox" checked={draft.enabled} onChange={e => change('enabled', e.target.checked)} /> Monitoramento ativo</label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Referência do projeto<input className={fieldStyle} value={draft.project_ref ?? ''} maxLength={100} onChange={e => change('project_ref', e.target.value.trim() || null)} /></label>
        <label className="text-sm">ID da equipe / organização<input className={fieldStyle} value={draft.account_scope_id ?? ''} maxLength={100} onChange={e => change('account_scope_id', e.target.value.trim() || null)} /></label>
        <label className="text-sm">Plano informativo<input className={fieldStyle} value={draft.plan_label} maxLength={80} onChange={e => change('plan_label', e.target.value)} /></label>
      </div>
      <div className="space-y-3">
        <p className="text-sm font-semibold">Limites do plano (configuração manual)</p>
        <p className="text-xs text-slate-600">Use a chave, unidade, ID do escopo e período exatos da métrica. Período desconhecido não admite percentual. Estes limites não alteram seu plano no provedor.</p>
        {rows.map((row, index) => <fieldset key={index} className="rounded-lg bg-slate-50 p-3">
          <legend className="text-xs font-semibold">Limite {index + 1}</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs">Chave da métrica<input required className={fieldStyle} value={row.metric_key} onChange={e => changeLimit(index, 'metric_key', e.target.value)} /></label>
            <label className="text-xs">Unidade exata da fonte<input required maxLength={40} className={fieldStyle} value={row.unit} onChange={e => changeLimit(index, 'unit', e.target.value)} /></label>
            <label className="text-xs">Valor máximo<input required type="number" min="0.000001" step="any" className={fieldStyle} value={row.max_value} onChange={e => changeLimit(index, 'max_value', Number(e.target.value))} /></label>
            <label className="text-xs">Escopo<select className={fieldStyle} value={row.quota_scope} onChange={e => changeLimit(index, 'quota_scope', e.target.value)}>{['project', 'team', 'organization'].map(scope => <option key={scope}>{scope}</option>)}</select></label>
            <label className="text-xs">ID do escopo<input required className={fieldStyle} value={row.scope_id} onChange={e => changeLimit(index, 'scope_id', e.target.value)} /></label>
            <label className="text-xs">Tipo de período<select className={fieldStyle} value={row.period_type} onChange={e => {
              const value = e.target.value;
              setRows(previous => previous.map((item, i) => i === index ? { ...item, period_type: value as MetricLimit['period_type'], period_start: value === 'instant' ? null : item.period_start, period_end: value === 'instant' ? null : item.period_end } : item));
            }}><option value="instant">Instantâneo</option><option value="window">Janela exata</option><option value="billing_cycle">Ciclo de cobrança</option></select></label>
            {row.period_type !== 'instant' && (['period_start', 'period_end'] as const).map(key => <label key={key} className="text-xs">{key === 'period_start' ? 'Início ISO UTC' : 'Fim ISO UTC (exclusivo)'}<input required className={fieldStyle} placeholder="2026-10-01T00:00:00Z" value={row[key] ?? ''} onChange={e => changeLimit(index, key, e.target.value || null)} /></label>)}
            <label className="text-xs">Vigência a partir de (ISO UTC)<input required className={fieldStyle} value={row.effective_at} onChange={e => changeLimit(index, 'effective_at', e.target.value)} /></label>
          </div>
          <button type="button" className="mt-2 text-xs font-semibold text-rose-700" onClick={() => setRows(previous => previous.filter((_, i) => i !== index))}>Remover limite {index + 1}</button>
        </fieldset>)}
        <button type="button" disabled={rows.length >= 30} className="rounded-lg border px-3 py-2 text-xs" onClick={() => setRows(previous => [...previous, {
          metric_key: '', unit: 'requests', quota_scope: 'project', scope_id: draft.project_ref ?? '', period_type: 'window',
          period_start: null, period_end: null, max_value: 1, source: 'manual', effective_at: new Date().toISOString(),
        }])}>Adicionar limite</button>
      </div>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <p className="text-xs text-slate-600">Credenciais são provisionadas e mantidas no servidor. Não insira tokens nos campos deste formulário.</p>
      {config.mode === 'demo' && <p className="text-xs text-amber-900">Esta configuração antiga está em demonstração. Salve para passar à coleta real; nenhum valor demonstrativo será mostrado no consumo atual.</p>}
      <div className="flex flex-wrap gap-2"><button type="submit" className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white">Salvar configurações</button>
        <button type="button" disabled={!config.enabled || config.mode !== 'live'} onClick={() => onTest(config.id)} className="rounded-lg border px-3 py-2 text-sm">Testar conexão salva</button></div>
    </fieldset>
  </form>;
}

export default function InfrastructureSettings(props: { configs: InfrastructureConfig[]; limits: MetricLimit[]; busy: boolean;
  onSave(config: InfrastructureConfig, draft: ConfigDraft, limits: MetricLimit[]): void; onTest(id: string): void }) {
  return <div className="space-y-4">{props.configs.filter(config => config.provider === 'supabase').map(config => <div key={`${config.id}:${config.version}`}><ConfigForm config={config}
    limits={props.limits.filter(limit => limit.config_id === config.id)} busy={props.busy} onSave={props.onSave} onTest={props.onTest} /></div>)}</div>;
}
