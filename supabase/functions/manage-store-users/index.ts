import { createClient } from '@supabase/supabase-js';
import { createManageStoreUsersHandler } from './handler.ts';

// Runtime boundary keeps frontend tooling independent of Deno-specific global declarations.
const runtime = (globalThis as unknown as { Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): unknown;
} }).Deno;

runtime.serve(createManageStoreUsersHandler({
  allowedOrigins: (runtime.env.get('ISBN_ALLOWED_ORIGINS') ?? '').split(',').map(value => value.trim()).filter(Boolean),
  inviteRedirectTo: runtime.env.get('ISBN_INVITE_REDIRECT_URL') ?? '',
  getAdminClient: () => {
    const url = runtime.env.get('SUPABASE_URL');
    const serviceKey = runtime.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey) throw new Error('Backend configuration unavailable');
    // Never attach the caller JWT to this client's default headers or persist sessions.
    return createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  },
}));
