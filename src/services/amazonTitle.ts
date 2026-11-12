import type { User } from '../types';
import { canSearchAmazonTitle, mapAmazonTitleResponse, type AmazonTitleResult } from '../../shared/amazonTitle';
import { normalizeTitleQuery } from '../../shared/googleBooks';

export async function searchAmazonByTitle(title: string, user: User | undefined, environment: string | undefined, signal?: AbortSignal): Promise<AmazonTitleResult> {
  const failed = (status: AmazonTitleResult['status'], code: string, httpStatus?: number): AmazonTitleResult => ({ status, candidates: [], diagnostic: { code, httpStatus } });
  if (!import.meta.env.DEV || !canSearchAmazonTitle(user, environment)) return failed('unauthorized', 'title_development_only');
  const query = normalizeTitleQuery(title);
  if (!query) return failed('invalid_query', 'invalid_title');
  try {
    const combined = AbortSignal.any([AbortSignal.timeout(55000), ...(signal ? [signal] : [])]);
    const { supabase } = await import('../lib/supabase');
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) return failed('unauthorized', 'session_required');
    const response = await fetch('/api/amazon/spapi/catalog?title=' + encodeURIComponent(query), { method: 'GET', signal: combined,
      credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json',
        Authorization: `Bearer ${data.session.access_token}`, 'x-isbn-store-id': user!.storeId! } });
    if (response.status === 429) return failed('rate_limited', 'upstream_rate_limited', 429);
    if ([401, 403].includes(response.status)) return failed('unauthorized', 'authorization_denied', response.status);
    const body = await response.json();
    if (!response.ok) return failed(body?.code === 'upstream_authorization' ? 'unauthorized' : 'unavailable', 'catalog_unavailable', response.status);
    if (combined.aborted || body.query !== query) return failed('unavailable', 'invalid_response');
    return mapAmazonTitleResponse(body);
  } catch { return failed('unavailable', 'transport_or_response'); }
}
