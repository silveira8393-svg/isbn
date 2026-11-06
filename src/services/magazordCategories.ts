import type { User } from '../types';
import type { CategoryCatalog } from '../../shared/magazordCategories';

const cache = new Map<string, { value?: CategoryCatalog; expires: number; pending?: Promise<CategoryCatalog> }>();
export async function loadMagazordCategories(user: User, refresh = false): Promise<CategoryCatalog> {
  if (!user?.active || !user.storeId) throw new Error('Entre novamente e selecione sua loja.');
  const { supabase } = await import('../lib/supabase');
  const { data, error } = await supabase.auth.getSession();
  if (error || data.session?.user.id !== user.id || !data.session.access_token) throw new Error('Entre novamente para consultar as categorias.');
  const key = `${user.id}:${user.storeId}`;
  const entry = cache.get(key);
  if (entry?.pending) return entry.pending;
  if (!refresh && entry?.value && entry.expires > Date.now()) return entry.value;
  const next = entry || { expires: 0 };
  next.pending = (async () => {
    const response = await fetch('/api/magazord/categories' + (refresh ? '?refresh=1' : ''), { method: 'GET',
      headers: { Authorization: `Bearer ${data.session!.access_token}`, 'x-isbn-store-id': user.storeId },
      credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30_000) });
    if (!response.ok) {
      void response.body?.cancel();
      throw new Error(response.status === 401 ? 'Sua sessão expirou. Entre novamente.' : response.status === 403
        ? 'Seu vínculo com a loja não permite consultar as categorias.' : 'Não foi possível carregar as categorias Magazord. Tente novamente em instantes.');
    }
    const result = await response.json() as CategoryCatalog;
    if (result.source !== 'magazord' || !Array.isArray(result.categories) || typeof result.fetchedAt !== 'string'
      || !Number.isSafeInteger(result.invalidCount) || result.invalidCount < 0
      || new Set(result.categories.map(c => c.id)).size !== result.categories.length
      || result.categories.some(c => !Number.isSafeInteger(c.id) || c.id <= 0 || typeof c.nome !== 'string' || typeof c.path !== 'string'
        || !Number.isSafeInteger(c.depth) || c.depth < 0 || (c.pai !== null && !Number.isSafeInteger(c.pai))))
      throw new Error('A resposta de categorias está indisponível. Tente novamente.');
    next.value = result; next.expires = Date.now() + 5 * 60_000;
    return result;
  })().finally(() => { next.pending = undefined; });
  cache.set(key, next);
  return next.pending;
}
