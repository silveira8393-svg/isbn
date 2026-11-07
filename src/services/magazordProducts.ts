import type { User } from '../types';
import { normalizeProductQuery, unavailableProductLookup, type ProductLookup, type ProductQuery } from '../../shared/magazordProducts';

export async function lookupMagazordProducts(query: ProductQuery, user: User, signal?: AbortSignal): Promise<ProductLookup> {
  try {
    if (!user?.active || !user.storeId) return unavailableProductLookup(query, 'unauthenticated');
    const { supabase } = await import('../lib/supabase');
    const { data, error } = await supabase.auth.getSession();
    if (error || data.session?.user.id !== user.id || !data.session.access_token) return unavailableProductLookup(query, 'unauthenticated');
    const response = await fetch('/api/magazord/products?' + new URLSearchParams({ kind: query.kind, value: query.value }), { method: 'GET',
      headers: { Authorization: `Bearer ${data.session.access_token}`, 'x-isbn-store-id': user.storeId },
      credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(25_000)]) : AbortSignal.timeout(25_000) });
    if (!response.ok) { void response.body?.cancel(); return unavailableProductLookup(query, response.status === 401 ? 'unauthenticated' : response.status === 403 ? 'store_access_denied' : 'unavailable'); }
    const result = await response.json() as ProductLookup;
    if (result.source !== 'magazord' || result.query?.kind !== query.kind || result.query?.value !== query.value
      || !['found', 'multiple', 'not_found', 'unavailable'].includes(result.status) || !Array.isArray(result.parents) || result.parents.length > 5
      || result.match !== (query.kind === 'ean' ? 'bibliographic' : 'commercial') || typeof result.truncated !== 'boolean'
      || result.parents.some(parent => !normalizeProductQuery('parent', parent.code) || typeof parent.active !== 'boolean'
        || !Array.isArray(parent.children) || parent.children.length > 200 || parent.children.some(child => !normalizeProductQuery('child', child.code) || typeof child.active !== 'boolean')))
      return unavailableProductLookup(query, 'invalid_response');
    return result;
  } catch { return unavailableProductLookup(query, 'connection_unavailable'); }
}
