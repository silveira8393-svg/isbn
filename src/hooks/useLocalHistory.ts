import { useEffect, useRef, useState } from 'react';
import type { SearchHistoryItem, User } from '../types';

export const localHistoryKey = (storeId: string, userId: string) =>
  `sebo_isbn_history_v2:${encodeURIComponent(storeId)}:${encodeURIComponent(userId)}`;

/** The legacy shared key is deliberately never read, migrated, reassigned or deleted. */
export function useLocalHistory(user: User) {
  const cache = useRef(new Map<string, SearchHistoryItem[]>());
  const [, render] = useState(0);
  const [failedKey, setFailedKey] = useState('');
  const key = user.active && user.id && user.storeId ? localHistoryKey(user.storeId, user.id) : '';
  const own = (items: SearchHistoryItem[]) => items.filter(item => item && item.userId === user.id
    && item.storeId === user.storeId && typeof item.timestamp === 'number' && Number.isFinite(item.timestamp)
    && typeof item.isbn === 'string' && typeof item.title === 'string').slice(0, 50);
  const load = () => {
    if (!key || cache.current.has(key)) return;
    try {
      const raw = localStorage.getItem(key);
      const items: unknown = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(items)) throw new Error();
      cache.current.set(key, own(items));
    } catch { cache.current.set(key, []); setFailedKey(key); }
  };
  useEffect(() => { load(); render(value => value + 1); }, [key]);

  // Each callback captures its original user/store key, including late asynchronous completions.
  const setHistory = (next: SearchHistoryItem[] | ((items: SearchHistoryItem[]) => SearchHistoryItem[])) => {
    if (!key) return;
    load();
    const previous = cache.current.get(key) ?? [];
    const items = own(typeof next === 'function' ? next(previous) : next);
    cache.current.set(key, items);
    try { localStorage.setItem(key, JSON.stringify(items)); setFailedKey(value => value === key ? '' : value); }
    catch { setFailedKey(key); }
    render(value => value + 1);
  };
  const clearHistory = () => {
    if (!key) return;
    cache.current.set(key, []);
    try { localStorage.removeItem(key); setFailedKey(value => value === key ? '' : value); }
    catch { setFailedKey(key); }
    render(value => value + 1);
  };
  return { history: key ? cache.current.get(key) ?? [] : [], setHistory, clearHistory,
    storageWarning: !!key && failedKey === key };
}
