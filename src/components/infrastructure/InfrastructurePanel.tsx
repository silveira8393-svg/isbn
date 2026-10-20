import { useState } from 'react';
import { useInfrastructure } from '../../hooks/useInfrastructure';
import type { InfraEnvironment } from '../../types/infrastructure';
import InfrastructureOverview from './InfrastructureOverview';
import InfrastructureSettings from './InfrastructureSettings';

export default function InfrastructurePanel() {
  const { allowed, data, error, busy, notice, act, refresh } = useInfrastructure();
  const [environment, setEnvironment] = useState<InfraEnvironment>('development');
  const [tab, setTab] = useState<'overview' | 'settings'>('overview');
  if (!allowed) return null;
  const configs = data?.configs.filter(config => config.environment === environment) ?? [];
  return <section className="min-w-0 space-y-4" aria-labelledby="infrastructure-title" aria-busy={busy}>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 id="infrastructure-title" className="font-bold text-slate-900">Infraestrutura</h3>
      <p className="text-xs text-slate-600">Monitoramento exclusivo de Desenvolvimento · plataformas externas somente leitura.</p></div>
      <button type="button" disabled={busy} onClick={refresh} className="rounded-lg border px-3 py-2 text-xs">Recarregar painel</button></div>
    <label className="block text-sm font-semibold">Ambiente monitorado <select className="ml-2 rounded-lg border px-3 py-2" value={environment} disabled={busy}
      onChange={e => setEnvironment(e.target.value as InfraEnvironment)}><option value="development">Desenvolvimento</option><option value="commercial_production">Produção Comercial</option></select></label>
    <p className="text-xs text-slate-600">Esta seleção altera somente o alvo do monitoramento. A conexão do aplicativo ao banco permanece independente.</p>
    <nav aria-label="Áreas de infraestrutura" className="flex flex-wrap gap-2">{([['overview', 'Consumo atual'], ['settings', 'Contas e limites']] as const).map(([value, label]) =>
      <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${tab === value ? 'bg-blue-600 text-white' : 'border text-slate-700'}`}>{label}</button>)}</nav>
    {notice && <p role="status" className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">{notice}</p>}
    {error ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : !data ? <p role="status" className="text-sm text-slate-600">Carregando snapshots...</p>
      : !data.configs.length ? <div className="space-y-3 text-sm"><p>O módulo ainda não tem configurações nesta loja.</p><button type="button" disabled={busy} onClick={() => void act({ action: 'initialize' })} className="rounded-lg bg-blue-600 px-3 py-2 text-white">Preparar ambientes de monitoramento</button></div>
        : tab === 'overview' ? <InfrastructureOverview configs={configs} snapshots={data.snapshots} limits={data.limits} runs={data.runs} busy={busy} onCollect={configId => void act({ action: 'collect', configId })} />
          : <InfrastructureSettings configs={configs} limits={data.limits} busy={busy}
            onSave={(config, draft, limits) => void act({ action: 'save', configId: config.id, version: config.version, config: draft, limits })}
            onTest={configId => void act({ action: 'test_connection', configId })} />}
    <p className="text-xs text-slate-500">Atualização manual · horários em America/Sao_Paulo. Limites do plano informados nas configurações; sem alertas ou agendamento ativos.</p>
  </section>;
}
