import { useEffect, useRef, useState } from 'react';
import type { User } from '../types';
import { recordOperation, type RecordOperationInput } from '../services/operationsService';
import { OPERATIONAL_TEST_RUN_ID } from '../utils/operationalTest';

type Entry = { input: RecordOperationInput; actorId: string; state: 'saving' | 'pending' };

/** Retry the audit INSERT only, never repeat a search, registration or stock action. */
export function useOperationAudit(user: User) {
  const entries = useRef(new Map<string, Entry>());
  const current = useRef(user);
  current.current = user;
  const [revision, setRevision] = useState(0);
  const [storageFailure, setStorageFailure] = useState('');
  const [lastConfirmation, setLastConfirmation] = useState<{ actorId: string; storeId: string; eventId: string; at: string } | null>(null);
  const storageKey = (actorId: string, storeId: string) => `isbn_audit_outbox_v1:${actorId}:${storeId}`;
  const persist = (entry: Entry) => {
    const key = storageKey(entry.actorId, entry.input.storeId);
    try {
      if (typeof sessionStorage === 'undefined') { if (typeof window !== 'undefined') setStorageFailure(key); return; }
      const own = [...entries.current.values()].filter(item => item.actorId === entry.actorId && item.input.storeId === entry.input.storeId);
      if (own.length) sessionStorage.setItem(key, JSON.stringify(own));
      else sessionStorage.removeItem(key);
      setStorageFailure(previous => previous === key ? '' : previous);
    } catch { setStorageFailure(key); }
  };
  const changed = () => setRevision(value => value + 1);
  const belongs = (entry: Entry) => current.current.active && entry.actorId === current.current.id
    && entry.input.storeId === current.current.storeId;
  const send = async (entry: Entry) => {
    if (!belongs(entry)) return;
    entry.state = 'saving'; changed();
    let saved = false;
    try { saved = await recordOperation(entry.input, entry.actorId); } catch { /* Visible pending state below. */ }
    if (saved) {
      entries.current.delete(entry.input.id!);
      setLastConfirmation({ actorId: entry.actorId, storeId: entry.input.storeId, eventId: entry.input.id!, at: new Date().toISOString() });
    }
    else entry.state = 'pending';
    persist(entry);
    changed();
  };
  const saveOperation = (operation: Omit<RecordOperationInput, 'storeId' | 'id'>) => {
    const id = crypto.randomUUID();
    // Freeze the event before any asynchronous attempt; all retries reuse this payload/UUID.
    const input: RecordOperationInput = JSON.parse(JSON.stringify({ ...operation, id,
      storeId: user.active ? user.storeId ?? '' : '',
      metadata: { ...operation.metadata, purpose: 'operational_test', operational_test_run_id: OPERATIONAL_TEST_RUN_ID },
    }));
    const entry: Entry = { input, actorId: user.id, state: 'pending' };
    entries.current.set(id, entry);
    persist(entry);
    // An expired/replaced identity must not turn an old result into a new actor's event.
    if (belongs(entry)) void send(entry);
    else changed();
  };
  const ownEntries = [...entries.current.values()].filter(belongs);
  const pending = ownEntries.filter(entry => entry.state === 'pending');
  const saving = ownEntries.length - pending.length;
  const retry = () => { for (const entry of entries.current.values()) if (belongs(entry) && entry.state === 'pending') void send(entry); };

  useEffect(() => {
    if (!user.active || !user.storeId) return;
    const key = storageKey(user.id, user.storeId);
    try {
      if (typeof sessionStorage === 'undefined') return;
      const raw = sessionStorage.getItem(key);
      if (!raw) return;
      const restored: unknown = JSON.parse(raw);
      if (!Array.isArray(restored)) throw new Error();
      for (const entry of restored as Entry[]) {
        if (entry?.actorId !== user.id || entry.input?.storeId !== user.storeId || typeof entry.input.id !== 'string') throw new Error();
        if (!entries.current.has(entry.input.id)) entries.current.set(entry.input.id, { ...entry, state: 'pending' });
      }
      changed();
    } catch { setStorageFailure(key); }
  }, [user.id, user.storeId, user.active]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const warn = (event: BeforeUnloadEvent) => {
      if (entries.current.size) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  // revision intentionally triggers recalculation after asynchronous status transitions.
  void revision;
  return { saveOperation, pending, saving, retry, storageUnavailable: storageFailure === storageKey(user.id, user.storeId ?? ''),
    lastConfirmation: lastConfirmation?.actorId === user.id && lastConfirmation.storeId === user.storeId && user.active ? lastConfirmation : null };
}
