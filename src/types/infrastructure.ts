/** Non-secret contracts shared by the panel and server adapters. */
export type InfraEnvironment = 'development' | 'commercial_production';
export type InfraProvider = 'supabase' | 'vercel';
export type MetricStatus = 'available' | 'not_configured' | 'forbidden' | 'unavailable' | 'estimated';
export type QuotaScope = 'project' | 'team' | 'organization';
export type MetricPeriod = 'instant' | 'window' | 'billing_cycle' | 'unknown';

export interface InfrastructureConfig {
  id: string;
  store_id: string;
  environment: InfraEnvironment;
  provider: InfraProvider;
  enabled: boolean;
  mode: 'live' | 'demo';
  project_ref: string | null;
  account_scope_id: string | null;
  plan_label: string;
  refresh_minutes: number;
  retention_days: number;
  alert_thresholds_json: { warning: number; critical: number };
  version: number;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface MetricLimit {
  id?: string;
  config_id?: string;
  metric_key: string;
  unit: string;
  quota_scope: QuotaScope;
  scope_id: string;
  period_type: MetricPeriod;
  period_start: string | null;
  period_end: string | null;
  max_value: number;
  source: 'manual';
  effective_at: string;
}

export interface InfrastructureMetric {
  metric_key: string;
  observed_value: number | null;
  unit: string;
  quota_scope: QuotaScope;
  scope_id: string;
  period_type: MetricPeriod;
  period_start: string | null;
  period_end: string | null;
  observed_at: string;
  source: string;
  quality_status: MetricStatus;
  is_demo: boolean;
  error_code_sanitized?: string | null;
}

export interface MetricSnapshot extends InfrastructureMetric {
  id: string;
  config_id: string;
  config_version: number;
  run_id: string;
  limit_max_value: number | null;
  usage_percent: number | null;
}

export interface SyncRun {
  id: string;
  config_id: string;
  config_version: number;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'success' | 'partial' | 'failed';
  error_code_sanitized: string | null;
}

export interface InfrastructureData {
  configs: InfrastructureConfig[];
  limits: MetricLimit[];
  snapshots: MetricSnapshot[];
  runs: SyncRun[];
}

export interface InfrastructureProvider {
  testConnection(config: InfrastructureConfig): Promise<MetricStatus>;
  collectMetrics(config: InfrastructureConfig): Promise<InfrastructureMetric[]>;
  normalizeMetrics(raw: unknown, config: InfrastructureConfig): InfrastructureMetric[];
}

export const metricStatusLabels: Record<MetricStatus, string> = {
  available: 'Disponível', not_configured: 'Não configurado', forbidden: 'Sem permissão',
  unavailable: 'Indisponível', estimated: 'Estimado',
};
