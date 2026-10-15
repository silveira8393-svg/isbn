import { useState } from 'react';
import { activitySeries, operationOrigins, type DailyActivity, type processedDistribution } from '../../utils/dashboard';

const dateLabel = (day: string) => day.split('-').reverse().join('/');
const percentageLabel = (value: number) => `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const focusStyle = 'cursor-pointer rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600';
const chartSeries = [
  { label: 'Pesquisas', color: '#2563eb', value: (day: DailyActivity) => day.searches },
  { label: 'Cadastros e reaproveitamentos', color: '#94a3b8', value: (day: DailyActivity) => day.newCreated + day.usedCreated + day.newReused },
  { label: 'Erros', color: '#be123c', value: (day: DailyActivity) => day.errors },
];

/** SVG geometry stays inside its viewBox; disclosure provides the complete text alternative. */
export function DailyOperationsChart({ days }: { days: DailyActivity[] }) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const visibleDays = days.slice(-30);
  const counts = days.reduce((total, day) => ({
    records: total.records + day.total, searches: total.searches + day.searches,
    processed: total.processed + day.newCreated + day.usedCreated + day.newReused,
    errors: total.errors + day.errors, other: total.other + day.other,
  }), { records: 0, searches: 0, processed: 0, errors: 0, other: 0 });
  const active = visibleDays.find(day => day.day === selectedDay);
  const maximum = Math.max(1, ...visibleDays.map(day => day.total));
  const step = Math.max(1, Math.ceil(maximum / 4));
  const ceiling = step * 4;
  const plot = { left: 64, top: 26, width: 508, height: 176 };
  const slot = plot.width / Math.max(1, visibleDays.length);
  const ticks = [0, 1, 2, 3, 4];
  const labelledDays = new Set([0, Math.floor((visibleDays.length - 1) / 3), Math.floor((visibleDays.length - 1) * 2 / 3), visibleDays.length - 1]);
  const describe = (day: DailyActivity) => `${dateLabel(day.day)}: ${day.total} registros. ${activitySeries.map(series => `${series.label}: ${day[series.key]}`).join('; ')}. ${operationOrigins.map(origin => `${origin.label}: ${day[origin.value]}`).join('; ')}`;

  return <div className="min-w-0">
    {days.length < 7 ? <div className="mt-2 text-sm leading-6 text-slate-700">
      <p>{counts.records} registros em {days.length} dias com dados{days.length > 0 && ` (${dateLabel(days[0].day)} a ${dateLabel(days[days.length - 1].day)})`}.</p>
      <p>Pesquisas: {counts.searches} · Cadastros e reaproveitamentos: {counts.processed} · Erros: {counts.errors}.</p>
      <p className="mt-2 text-xs text-slate-500">O gráfico diário aparece a partir de 7 dias com registros.</p>
    </div> : <>
      <ul aria-label="Legenda da evolução" className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {chartSeries.map(series => <li key={series.label} className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-sm" style={{ backgroundColor: series.color }} />{series.label}</li>)}
      </ul>
      <svg viewBox="0 0 600 268" className="mx-auto mt-2 block w-full max-w-xl" role="group" aria-label="Evolução diária por tipo de operação" preserveAspectRatio="xMidYMid meet">
        <text x="64" y="17" className="text-[22px] sm:text-[12px]" fill="#475569">Registros</text>
        {ticks.map(tick => {
          const y = plot.top + plot.height - tick / 4 * plot.height;
          return <g key={tick} aria-hidden="true"><line x1={plot.left} y1={y} x2={plot.left + plot.width} y2={y} stroke="#e2e8f0" />
            <text x={plot.left - 8} y={y + 5} textAnchor="end" className="text-[22px] sm:text-[12px]" fill="#475569">{(tick * step).toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })}</text></g>;
        })}
        {visibleDays.map((day, index) => {
          const x = plot.left + index * slot + slot * 0.15;
          let offset = 0;
          const bars = chartSeries.map(series => {
            const height = series.value(day) / ceiling * plot.height;
            offset += height;
            return <rect key={series.label} x={x} y={plot.top + plot.height - offset} width={slot * 0.7} height={height} fill={series.color} />;
          });
          return <g key={day.day} tabIndex={0} role="img" aria-label={describe(day)} className={`group ${focusStyle}`}
            onMouseEnter={() => setSelectedDay(day.day)} onMouseLeave={() => setSelectedDay(null)}
            onFocus={() => setSelectedDay(day.day)} onBlur={() => setSelectedDay(null)}
            onClick={() => setSelectedDay(day.day)}>
            <title>{describe(day)}</title>
            <rect x={plot.left + index * slot} y={plot.top} width={slot} height={plot.height} fill="#eff6ff" className="opacity-0 group-hover:opacity-100 group-focus:opacity-100" />
            {bars}
            {labelledDays.has(index) && <text x={x + slot * 0.35} y="229" textAnchor={index === 0 ? 'start' : index === visibleDays.length - 1 ? 'end' : 'middle'} className="text-[22px] sm:text-[12px]" fill="#475569">{dateLabel(day.day).slice(0, 5)}</text>}
          </g>;
        })}
        <text x="318" y="252" textAnchor="middle" className="text-[22px] sm:text-[12px]" fill="#475569">Data operacional</text>
      </svg>
      <div role="status" aria-live="polite" className="mt-1 min-h-10 text-xs leading-5 text-slate-600">
        {active ? <><strong>{dateLabel(active.day)} · {active.total} registros</strong><p>{activitySeries.map(series => `${series.label}: ${active[series.key]}`).join(' · ')}</p><p>{operationOrigins.map(origin => `${origin.label}: ${active[origin.value]}`).join(' · ')}</p></>
          : 'Passe o cursor, toque ou use Tab nas barras para consultar valores e origens.'}
      </div>
    </>}
    {counts.other > 0 && <p className="mt-2 text-xs text-slate-500">Outros / pendentes: {counts.other} registros fora das três séries, preservados nos valores diários.</p>}
    <p className="mt-2 text-xs text-slate-500">Conclusão ou criação no fuso do navegador; até 30 dias com registros, sem inventar dias vazios.</p>
    {visibleDays.length > 0 && <details className="mt-2 text-xs text-slate-600">
      <summary className={`w-fit py-1 font-semibold text-blue-700 ${focusStyle}`}>Consultar valores diários e origens</summary>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">{visibleDays.map(day => <li key={day.day} className="rounded-lg border border-slate-200 p-3 leading-5">{describe(day)}</li>)}</ul>
    </details>}
  </div>;
}

export function ProcessedDistributionChart({ distribution }: { distribution: ReturnType<typeof processedDistribution> }) {
  const total = distribution.reduce((sum, item) => sum + item.value, 0);
  const description = `${total} ações processadas. ${distribution.map(item => `${item.label}: ${item.value}, ${percentageLabel(item.percentage)}`).join('; ')}`;
  const colors = ['#2563eb', '#94a3b8', '#93c5fd'];
  return <div className="mt-2 min-w-0">
    <p className="text-xs tabular-nums text-slate-500">{total} ações processadas no total</p>
    {total === 0 ? <p role="status" className="mt-2 text-sm text-slate-500">Nenhuma ação processada para distribuir.</p>
      : <div role="img" aria-label={description} className="my-3 flex h-3.5 overflow-hidden rounded-sm bg-slate-100">
        {distribution.map((item, index) => item.value > 0 && <span key={item.key} data-distribution-key={item.key} title={`${item.label}: ${item.value} de ${total} (${percentageLabel(item.percentage)})`} style={{ width: `${item.percentage}%`, backgroundColor: colors[index] }} />)}
      </div>}
    <dl className="mt-2 flex flex-wrap gap-x-3 gap-y-2 text-xs text-slate-600">{distribution.map((item, index) => <div key={item.key} className="flex flex-wrap items-center gap-1">
      <dt className="flex items-center gap-1"><span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: colors[index] }} />{item.label}</dt>
      <dd className="tabular-nums">{item.value} de {total} · {percentageLabel(item.percentage)}</dd>
    </div>)}</dl>
    <p className="mt-3 text-xs text-slate-500">Pesquisas, erros e pendências não entram no denominador.</p>
  </div>;
}
