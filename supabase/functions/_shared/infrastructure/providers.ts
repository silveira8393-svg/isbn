import type { InfrastructureConfig, InfrastructureMetric, InfrastructureProvider, MetricStatus } from '../../../../src/types/infrastructure.ts';

export class ProviderError extends Error {
  constructor(readonly code: 'not_configured' | 'forbidden' | 'provider_unavailable' | 'invalid_response' | 'rate_limited' | 'timeout') { super(code); }
}
export interface ProviderOptions {
  getSecret(name: string): string | undefined;
  fetch: typeof fetch;
  now?: () => Date;
}
const statusFor = (code: string): MetricStatus => code === 'not_configured' ? 'not_configured' : code === 'forbidden' ? 'forbidden' : 'unavailable';
export function statusMetric(config: InfrastructureConfig, code: ProviderError['code']): InfrastructureMetric {
  return { metric_key: 'connection.status', observed_value: null, unit: 'count', quota_scope: 'project',
    scope_id: config.project_ref || 'unconfigured', period_type: 'unknown', period_start: null, period_end: null,
    observed_at: new Date().toISOString(), source: 'provider_status', quality_status: statusFor(code), is_demo: false, error_code_sanitized: code };
}
const obj = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const numeric = (value: unknown): number => {
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim())) throw new ProviderError('invalid_response');
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) throw new ProviderError('invalid_response');
  return result;
};
const date = (value: unknown): string => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new ProviderError('invalid_response');
  return new Date(value).toISOString();
};

/** Streaming size bound applies before parsing. No response bodies or upstream messages escape. */
async function readBody(response: Response, maxBytes = 2_000_000): Promise<string> {
  if (!response.body) throw new ProviderError('invalid_response');
  const reader = response.body.getReader(); const decoder = new TextDecoder();
  let size = 0, result = '';
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new ProviderError('invalid_response'); }
      result += decoder.decode(chunk.value, { stream: true });
    }
    return result + decoder.decode();
  } finally { reader.releaseLock(); }
}

class LiveProvider implements InfrastructureProvider {
  constructor(readonly provider: 'supabase' | 'vercel', readonly options: ProviderOptions) {}
  private token(config: InfrastructureConfig): string {
    const env = config.environment === 'development' ? 'DEVELOPMENT' : 'COMMERCIAL_PRODUCTION';
    const token = this.options.getSecret(`ISBN_INFRA_${env}_${this.provider.toUpperCase()}_TOKEN`);
    if (!token || !config.project_ref || (this.provider === 'vercel' && !config.account_scope_id)) throw new ProviderError('not_configured');
    return token;
  }
  private async request(url: URL, token: string, databaseSize = false): Promise<string> {
    // URLs are constructed only by this adapter. Redirects cannot forward credentials.
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await this.options.fetch(url, { method: databaseSize ? 'POST' : 'GET', headers: {
        Authorization: `Bearer ${token}`, ...(databaseSize ? { 'Content-Type': 'application/json' } : {}),
      },
        // Fixed aggregate only, through the official read-only endpoint; no client SQL or identifiers.
        ...(databaseSize ? { body: JSON.stringify({ query: 'SELECT pg_catalog.pg_database_size(pg_catalog.current_database()) AS database_bytes' }) } : {}),
        signal: controller.signal, redirect: 'error' });
      if (response.status === 401 || response.status === 403) throw new ProviderError('forbidden');
      if (response.status === 429) throw new ProviderError('rate_limited');
      if (!response.ok) throw new ProviderError('provider_unavailable');
      return await readBody(response);
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(controller.signal.aborted ? 'timeout' : 'provider_unavailable');
    } finally { clearTimeout(timer); }
  }
  async testConnection(config: InfrastructureConfig): Promise<MetricStatus> {
    try {
      const metrics = await this.collectMetrics(config);
      return metrics.find(metric => metric.quality_status !== 'available')?.quality_status ?? 'available';
    }
    catch (error) { return statusFor(error instanceof ProviderError ? error.code : 'provider_unavailable'); }
  }
  async collectMetrics(config: InfrastructureConfig): Promise<InfrastructureMetric[]> {
    const token = this.token(config);
    if (this.provider === 'supabase') {
      // Default API windows are not documented precisely enough to compare with monthly quotas.
      // Keep period=unknown rather than inventing a billing interval from collection timestamps.
      const base = `https://api.supabase.com/v1/projects/${encodeURIComponent(config.project_ref!)}/analytics/endpoints/`;
      const endpoints = ['usage.api-counts', 'usage.api-requests-count', 'database.size'];
      const results = await Promise.allSettled(endpoints.map(async endpoint => {
        const url = endpoint === 'database.size' ? `https://api.supabase.com/v1/projects/${encodeURIComponent(config.project_ref!)}/database/query/read-only` : base + endpoint;
        const text = await this.request(new URL(url), token, endpoint === 'database.size');
        try { return this.normalizeMetrics({ endpoint, body: JSON.parse(text) }, config); }
        catch (error) { throw error instanceof ProviderError ? error : new ProviderError('invalid_response'); }
      }));
      const metrics: InfrastructureMetric[] = [];
      for (const [index, result] of results.entries()) {
        if (result.status === 'fulfilled') metrics.push(...result.value);
        else metrics.push({ ...statusMetric(config, result.reason instanceof ProviderError ? result.reason.code : 'provider_unavailable'),
          metric_key: ['api.services_status', 'api.requests_status', 'database.bytes'][index],
          ...(index === 2 ? { unit: 'bytes', period_type: 'instant' as const } : {}) });
      }
      return metrics;
    }
    const now = this.options.now?.() ?? new Date();
    // Complete UTC days only; this is an observation window, not an assumed billing cycle.
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const start = new Date(end.getTime() - 7 * 86400000);
    const url = new URL('https://api.vercel.com/v1/billing/charges');
    url.search = new URLSearchParams({ teamId: config.account_scope_id!, from: start.toISOString(), to: end.toISOString() }).toString();
    const body = await this.request(url, token);
    try { return this.normalizeMetrics(body.split('\n').filter(line => line.trim()).map(line => JSON.parse(line)), config); }
    catch (error) { throw error instanceof ProviderError ? error : new ProviderError('invalid_response'); }
  }
  normalizeMetrics(raw: unknown, config: InfrastructureConfig): InfrastructureMetric[] {
    const observed_at = (this.options.now?.() ?? new Date()).toISOString();
    const base = { observed_at, is_demo: false, error_code_sanitized: null };
    if (this.provider === 'supabase') {
      if (obj(raw) && raw.endpoint === 'database.size') {
        if (!Array.isArray(raw.body) || raw.body.length !== 1 || !obj(raw.body[0])) throw new ProviderError('invalid_response');
        const size = numeric(raw.body[0].database_bytes);
        if (!Number.isSafeInteger(size)) throw new ProviderError('invalid_response');
        return [{ ...base, metric_key: 'database.bytes', observed_value: size, unit: 'bytes', quota_scope: 'project',
          scope_id: config.project_ref!, period_type: 'instant', period_start: null, period_end: null,
          source: 'supabase_database_size', quality_status: 'available' }];
      }
      if (!obj(raw) || !obj(raw.body) || raw.body.error || !Array.isArray(raw.body.result) || !raw.body.result.length) throw new ProviderError('invalid_response');
      const fields = raw.endpoint === 'usage.api-counts'
        ? ['total_auth_requests', 'total_realtime_requests', 'total_rest_requests', 'total_storage_requests'] : ['count'];
      const rows = raw.body.result;
      if (!rows.every(obj)) throw new ProviderError('invalid_response');
      // Preserve a provider observation, never sum possibly overlapping/cumulative buckets.
      // Multiple undated counts have no safe aggregation contract.
      if (rows.length > 1 && !rows.every(row => typeof row.timestamp === 'string' && Number.isFinite(Date.parse(row.timestamp)))) {
        throw new ProviderError('invalid_response');
      }
      const row = [...rows].sort((a, b) => Date.parse(String(b.timestamp)) - Date.parse(String(a.timestamp)))[0];
      const pointTime = typeof row.timestamp === 'string' ? date(row.timestamp) : observed_at;
      return fields.map(field => {
        if (!Object.hasOwn(row, field)) throw new ProviderError('invalid_response');
        const observed_value = numeric(row[field]);
        if (!Number.isSafeInteger(observed_value)) throw new ProviderError('invalid_response');
        return { ...base, observed_at: pointTime, metric_key: field === 'count' ? 'api.requests' : `api.${field.replace('total_', '')}`,
          observed_value, unit: 'requests', quota_scope: 'project', scope_id: config.project_ref!, period_type: 'unknown',
          period_start: null, period_end: null, source: 'supabase_usage_api', quality_status: 'available' };
      });
    }
    if (!Array.isArray(raw) || !raw.length || raw.length > 10000) throw new ProviderError('invalid_response');
    const grouped = new Map<string, InfrastructureMetric>();
    for (const row of raw) {
      if (!obj(row) || typeof row.SkuId !== 'string' || !/^[A-Za-z0-9_.-]{1,50}$/.test(row.SkuId)) throw new ProviderError('invalid_response');
      const tags = obj(row.Tags) ? row.Tags : {};
      const project = tags.ProjectId ?? tags.projectId;
      if (project !== undefined && typeof project !== 'string') throw new ProviderError('invalid_response');
      if (project && project !== config.project_ref) continue;
      const period_start = date(row.ChargePeriodStart), period_end = date(row.ChargePeriodEnd);
      if (period_end <= period_start) throw new ProviderError('invalid_response');
      const scope_id = project ? config.project_ref! : config.account_scope_id!;
      const quota_scope = project ? 'project' : 'team';
      // Adjustments/refunds are omitted from positive consumption KPIs; never coerce into zero.
      if (row.ChargeCategory !== 'Usage') continue;
      const items: Array<[string, unknown, string]> = [];
      if (row.BillingCurrency === 'USD' && row.BilledCost !== null && row.BilledCost !== undefined) items.push(['billed_cost', row.BilledCost, 'USD']);
      if (row.ConsumedQuantity !== null && row.ConsumedQuantity !== undefined && typeof row.ConsumedUnit === 'string'
        && /^[A-Za-z0-9_ ./-]{1,40}$/.test(row.ConsumedUnit)) items.push(['consumption', row.ConsumedQuantity, row.ConsumedUnit]);
      for (const [kind, value, unit] of items) {
        const metric: InfrastructureMetric = { ...base, metric_key: `vercel.${row.SkuId.toLowerCase()}.${kind}`,
          observed_value: numeric(value), unit, quota_scope, scope_id, period_type: 'window', period_start, period_end,
          source: 'vercel_billing_charges', quality_status: 'available' };
        const key = [metric.metric_key, unit, quota_scope, scope_id, period_start, period_end].join('|');
        const existing = grouped.get(key);
        if (existing) existing.observed_value! += metric.observed_value!; else grouped.set(key, metric);
      }
    }
    if (!grouped.size || grouped.size > 200) throw new ProviderError('invalid_response');
    return [...grouped.values()];
  }
}

class DemoProvider implements InfrastructureProvider {
  async testConnection(): Promise<MetricStatus> { return 'estimated'; }
  async collectMetrics(config: InfrastructureConfig) { return this.normalizeMetrics(null, config); }
  normalizeMetrics(_raw: unknown, config: InfrastructureConfig): InfrastructureMetric[] {
    return [{ metric_key: 'demo.requests', observed_value: 42, unit: 'requests', quota_scope: 'project',
      scope_id: config.project_ref || 'demonstration', period_type: 'unknown', period_start: null, period_end: null,
      observed_at: new Date().toISOString(), source: 'demo', quality_status: 'estimated', is_demo: true }];
  }
}

export function createProvider(config: InfrastructureConfig, options: ProviderOptions): InfrastructureProvider {
  return config.mode === 'demo' ? new DemoProvider() : new LiveProvider(config.provider, options);
}
