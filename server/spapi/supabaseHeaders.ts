// Secret API keys are opaque: send them only as apikey, not as JWT Bearer.
// Legacy service_role JWTs still require Authorization for PostgREST.
export function serviceHeaders(key: string): Record<string, string> {
  return { apikey: key, ...(key.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${key}` }), 'Content-Type': 'application/json' };
}
