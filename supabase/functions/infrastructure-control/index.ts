import { createClient } from '@supabase/supabase-js';
import { createInfrastructureHandler } from './handler.ts';

const runtime = (globalThis as unknown as { Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): unknown;
} }).Deno;
const get = (name: string) => runtime.env.get(name);
const client = (key: string, token?: string) => {
  const url = get('SUPABASE_URL');
  if (!url || !key) throw new Error('backend_unavailable');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}) });
};
runtime.serve(createInfrastructureHandler({
  allowedOrigins: [...new Set([
    ...(get('ISBN_ALLOWED_ORIGINS') ?? '').split(',').map(value => value.trim()).filter(Boolean),
    'https://isbn-955vjmkcb-silveira8393-svgs-projects.vercel.app',
    'https://isbn-gold.vercel.app',
  ])],
  userClient: token => client(get('SUPABASE_ANON_KEY') ?? '', token),
  adminClient: () => client(get('SUPABASE_SERVICE_ROLE_KEY') ?? ''),
  getSecret: get, fetch,
}));
