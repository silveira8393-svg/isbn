import { useEffect, useRef, useState } from 'react';
import type { User } from '../types';
import type { CategoryCatalog } from '../../shared/magazordCategories';
import { loadMagazordCategories } from '../services/magazordCategories';

export function useMagazordCategories(user?: User) {
  const identity = `${user?.id || ''}:${user?.storeId || ''}`;
  const current = useRef(identity); current.current = identity;
  const [state, setState] = useState<{ identity: string; catalog?: CategoryCatalog; loading: boolean; error?: string }>({ identity, loading: true });
  const busy = useRef(false);
  async function load(refresh = false) {
    if (!user || (busy.current && state.identity === identity)) return;
    const requestedIdentity = identity;
    busy.current = true;
    setState(previous => ({ ...(previous.identity === identity ? previous : { identity }), loading: true, error: undefined }));
    try {
      const catalog = await loadMagazordCategories(user, refresh);
      if (current.current === requestedIdentity) setState({ identity, catalog, loading: false });
    } catch (error) {
      if (current.current === requestedIdentity) setState(previous => ({ ...previous, identity, loading: false,
        error: error instanceof Error ? error.message : 'Categorias indisponíveis. Tente novamente em instantes.' }));
    } finally { if (current.current === requestedIdentity) busy.current = false; }
  }
  useEffect(() => { current.current = identity; busy.current = false; void load(); return () => { current.current = ''; }; }, [identity]);
  const visible = state.identity === identity ? state : { loading: true, catalog: undefined, error: undefined };
  return { ...visible, storeId: user?.storeId, reload: () => load(true) };
}
