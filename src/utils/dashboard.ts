import type { ProductionOperation } from '../services/productionService';
import { calculateProductionMetrics, classifyProductionOperation } from './metrics';
import { storeDateKey } from './storeTime';

export type OperationOrigin = 'simulated' | 'declared' | 'unknown';
export const operationOrigins: { value: OperationOrigin; label: string }[] = [
  { value: 'simulated', label: 'Simuladas' },
  { value: 'declared', label: 'Declaradas não simuladas' },
  { value: 'unknown', label: 'Origem não identificada' },
];

export function classifyOperationOrigin(item: ProductionOperation): OperationOrigin {
  if (item.metadata?.mock === true) return 'simulated';
  if (item.metadata?.mock === false) return 'declared';
  return 'unknown';
}

export function metricsByOrigin(items: ProductionOperation[]) {
  return operationOrigins.map(origin => {
    const records = items.filter(item => classifyOperationOrigin(item) === origin.value);
    return { ...origin, records: records.length, metrics: calculateProductionMetrics(records) };
  });
}

/** Preserve completion precedence; presentation/grouping uses the store timezone. */
export function operationDate(item: ProductionOperation): Date | null {
  const date = new Date(item.completed_at ?? item.created_at);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function dailyOperationCounts(items: ProductionOperation[]) {
  const days = new Map<string, { day: string; total: number; simulated: number; declared: number; unknown: number }>();
  for (const item of items) {
    const date = operationDate(item);
    if (!date) continue;
    const day = storeDateKey(date);
    const group = days.get(day) ?? { day, total: 0, simulated: 0, declared: 0, unknown: 0 };
    group.total++;
    group[classifyOperationOrigin(item)]++;
    days.set(day, group);
  }
  return [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
}

export function userOriginMetrics(items: ProductionOperation[]) {
  const groups = new Map<string, { userId: string | null; origin: OperationOrigin; items: ProductionOperation[] }>();
  for (const item of items) {
    const origin = classifyOperationOrigin(item);
    const key = JSON.stringify([item.user_id, origin]);
    const group = groups.get(key) ?? { userId: item.user_id, origin, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, group]) => ({
    key, userId: group.userId, origin: group.origin, records: group.items.length,
    metrics: calculateProductionMetrics(group.items),
  }));
}

export const operationLabels: Record<ProductionOperation['operation_type'], string> = {
  isbn_search: 'Pesquisa ISBN', new_product_created: 'Cadastro de livro novo',
  new_product_reused: 'Reaproveitamento de produto novo', used_copy_created: 'Cadastro de exemplar usado',
  operation_error: 'Erro operacional',
};

export const activitySeries = [
  { key: 'searches', label: 'Pesquisas ISBN', color: '#0369a1' },
  { key: 'newCreated', label: 'Novos', color: '#2563eb' },
  { key: 'usedCreated', label: 'Usados', color: '#0f766e' },
  { key: 'newReused', label: 'Reaproveitamentos', color: '#7c3aed' },
  { key: 'errors', label: 'Erros', color: '#be123c' },
  { key: 'other', label: 'Outros / pendentes', color: '#64748b' },
] as const;
export type ActivityKey = typeof activitySeries[number]['key'];
export type DailyActivity = ReturnType<typeof dailyOperationCounts>[number] & Record<ActivityKey, number>;

/** Each valid-date record appears once, including unfinished or inconsistent records. */
export function dailyActivityCounts(items: ProductionOperation[]): DailyActivity[] {
  const days = new Map(dailyOperationCounts(items).map(day => [day.day, {
    ...day, searches: 0, newCreated: 0, usedCreated: 0, newReused: 0, errors: 0, other: 0,
  }]));
  for (const item of items) {
    const date = operationDate(item);
    if (!date) continue;
    const day = storeDateKey(date);
    const group = days.get(day)!;
    const metric = classifyProductionOperation(item);
    const key: ActivityKey = metric.isError ? 'errors' : metric.isSearch ? 'searches'
      : metric.isNewCreated ? 'newCreated' : metric.isUsedCreated ? 'usedCreated'
      : metric.isNewReused ? 'newReused' : 'other';
    group[key]++;
  }
  return [...days.values()];
}

export function processedDistribution(metrics: ReturnType<typeof calculateProductionMetrics>) {
  return (['newCreated', 'usedCreated', 'newReused'] as const).map(key => ({
    ...activitySeries.find(series => series.key === key)!, key, value: metrics[key],
    percentage: metrics.totalProcessed === 0 ? 0 : metrics[key] / metrics.totalProcessed * 100,
  }));
}

/** UUID identity remains separate from the optional display name and null authorship. */
export function userDashboardMetrics(items: ProductionOperation[]) {
  const groups = new Map<string | null, ProductionOperation[]>();
  for (const item of items) {
    const group = groups.get(item.user_id) ?? [];
    group.push(item);
    groups.set(item.user_id, group);
  }
  return [...groups].map(([userId, records]) => ({
    userId, metrics: calculateProductionMetrics(records), origins: metricsByOrigin(records),
  }));
}

/** Recorded results are declarations, never validation of bibliographic accuracy. */
export function bibliographicSearchEvidence(items: ProductionOperation[]) {
  return operationOrigins.map(origin => {
    const evidence = { ...origin, found: 0, notFound: 0, unidentified: 0 };
    for (const item of items) {
      if (!classifyProductionOperation(item).isSearch || classifyOperationOrigin(item) !== origin.value) continue;
      if (item.metadata?.resultFound === true) evidence.found++;
      else if (item.metadata?.resultFound === false) evidence.notFound++;
      else evidence.unidentified++;
    }
    return evidence;
  });
}
