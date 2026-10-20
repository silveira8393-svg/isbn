import type { InfrastructureConfig, InfrastructureMetric, MetricLimit } from '../types/infrastructure.ts';

export const editableConfigKeys = ['enabled', 'mode', 'project_ref', 'account_scope_id', 'plan_label',
  'refresh_minutes', 'retention_days', 'alert_thresholds_json'] as const;
export type ConfigDraft = Pick<InfrastructureConfig, typeof editableConfigKeys[number]>;
export const configDraft = (config: InfrastructureConfig): ConfigDraft => Object.fromEntries(
  editableConfigKeys.map(key => [key, config[key]])) as ConfigDraft;

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const reference = (value: unknown) => value === null || (typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value));
const integer = (value: unknown, min: number, max: number) => Number.isInteger(value) && Number(value) >= min && Number(value) <= max;
const instant = (value: unknown) => typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value));

export function validateConfigDraft(value: unknown): ConfigDraft {
  if (!record(value) || !exactKeys(value, editableConfigKeys) || typeof value.enabled !== 'boolean'
    || !['live', 'demo'].includes(String(value.mode)) || !reference(value.project_ref) || !reference(value.account_scope_id)
    || typeof value.plan_label !== 'string' || value.plan_label.length > 80 || /[\u0000-\u001f\u007f]/.test(value.plan_label)
    || !integer(value.refresh_minutes, 5, 10080) || !integer(value.retention_days, 7, 365)
    || !record(value.alert_thresholds_json) || !exactKeys(value.alert_thresholds_json, ['warning', 'critical'])
    || typeof value.alert_thresholds_json.warning !== 'number' || typeof value.alert_thresholds_json.critical !== 'number'
    || !(value.alert_thresholds_json.warning > 0 && value.alert_thresholds_json.critical > value.alert_thresholds_json.warning
      && value.alert_thresholds_json.critical <= 100)) throw new Error('Configuração inválida. Confira referências, intervalo e limiares.');
  return value as unknown as ConfigDraft;
}

export function validateLimits(value: unknown): MetricLimit[] {
  const keys = ['metric_key', 'unit', 'quota_scope', 'scope_id', 'period_type', 'period_start', 'period_end', 'max_value', 'source', 'effective_at'];
  if (!Array.isArray(value) || value.length > 30) throw new Error('Informe até 30 limites.');
  const dimensions = new Set<string>();
  return value.map(item => {
    if (!record(item) || !exactKeys(item, keys) || typeof item.metric_key !== 'string' || !/^[a-z][a-z0-9_.-]{0,79}$/.test(item.metric_key)
      || typeof item.unit !== 'string' || !/^[A-Za-z0-9_ ./-]{1,40}$/.test(item.unit)
      || !['project', 'team', 'organization'].includes(String(item.quota_scope)) || !reference(item.scope_id) || item.scope_id === null
      || !['instant', 'window', 'billing_cycle'].includes(String(item.period_type))
      || typeof item.max_value !== 'number' || !Number.isFinite(item.max_value) || item.max_value <= 0
      || item.source !== 'manual' || !instant(item.effective_at)) throw new Error('Limite inválido. Confira métrica, valor, unidade e escopo.');
    if (item.period_type === 'instant' ? item.period_start !== null || item.period_end !== null
      : !instant(item.period_start) || !instant(item.period_end) || Date.parse(String(item.period_end)) <= Date.parse(String(item.period_start))) {
      throw new Error('Informe o período exato do limite, com início anterior ao fim.');
    }
    const key = [item.metric_key, item.unit, item.quota_scope, item.scope_id, item.period_type].join('|');
    if (dimensions.has(key)) throw new Error('Há limites repetidos para a mesma dimensão.');
    dimensions.add(key);
    return item as unknown as MetricLimit;
  });
}

/** Only exact dimensions and time windows can be compared; estimates/demo never trigger alerts. */
export function metricPercentage(metric: InfrastructureMetric, limit?: MetricLimit): number | null {
  if (!limit || metric.is_demo || metric.quality_status !== 'available' || metric.observed_value === null
    || !Number.isFinite(metric.observed_value) || metric.observed_value < 0 || !Number.isFinite(limit.max_value) || limit.max_value <= 0
    || metric.period_type === 'unknown' || !Number.isFinite(Date.parse(limit.effective_at)) || !Number.isFinite(Date.parse(metric.observed_at))
    || Date.parse(limit.effective_at) > Date.parse(metric.observed_at)) return null;
  for (const key of ['metric_key', 'unit', 'quota_scope', 'scope_id', 'period_type'] as const) if (metric[key] !== limit[key]) return null;
  for (const key of ['period_start', 'period_end'] as const) {
    if (metric[key] === null || limit[key] === null) { if (metric[key] !== limit[key]) return null; }
    else if (Date.parse(metric[key]) !== Date.parse(limit[key])) return null;
  }
  const percentage = metric.observed_value / limit.max_value * 100;
  return Number.isFinite(percentage) ? percentage : null;
}

export const metricIdentity = (metric: InfrastructureMetric) =>
  [metric.metric_key, metric.unit, metric.quota_scope, metric.scope_id, metric.period_type, metric.period_start, metric.period_end].join('|');
