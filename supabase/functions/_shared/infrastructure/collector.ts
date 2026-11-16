import type { SupabaseClient } from '@supabase/supabase-js';
import type { InfrastructureConfig, MetricStatus } from '../../../../src/types/infrastructure.ts';
import { createProvider, ProviderError, statusMetric, type ProviderOptions } from './providers.ts';

export async function collectConfiguration(client: SupabaseClient, config: InfrastructureConfig, options: ProviderOptions, manual = false) {
  if (config.provider === 'vercel') return { status: 'not_configured' as MetricStatus, code: 'disabled', collected: false };
  if (!config.enabled) return { status: 'not_configured' as MetricStatus, code: 'disabled', collected: false };
  const { data: runId, error } = await client.rpc('infra_claim_run', {
    p_config_id: config.id, p_version: config.version, p_manual: manual,
  });
  if (error) throw new Error('collection_unavailable');
  if (!runId) return { status: 'unavailable' as MetricStatus, code: 'refresh_limited', collected: false };
  let metrics;
  try { metrics = await createProvider(config, options).collectMetrics(config); }
  catch (error) { metrics = [statusMetric(config, error instanceof ProviderError ? error.code : 'provider_unavailable')]; }
  const runError = metrics.every(metric => !['available', 'estimated'].includes(metric.quality_status))
    ? metrics.find(metric => metric.error_code_sanitized)?.error_code_sanitized ?? null : null;
  const { error: finishError } = await client.rpc('infra_finish_run', { p_run_id: runId, p_metrics: metrics, p_error: runError });
  if (finishError) throw new Error('collection_unavailable');
  const status = metrics.every(metric => metric.quality_status === 'available') ? 'available'
    : metrics.every(metric => metric.quality_status === 'estimated') ? 'estimated'
      : metrics.find(metric => !['available', 'estimated'].includes(metric.quality_status))?.quality_status ?? 'unavailable';
  return { status: status as MetricStatus, code: metrics.find(metric => metric.error_code_sanitized)?.error_code_sanitized ?? null, collected: true };
}
