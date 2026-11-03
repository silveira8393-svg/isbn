/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { User, OperationEnvironment } from '../types';
import { supabase } from '../lib/supabase';
import Login from '../components/Login';
import ResetPassword from '../components/ResetPassword';

type AuthState = 'initializing' | 'unauthenticated' | 'authenticated' | 'selecting_store' | 'recovery';

function hasRecoveryIntent() {
  const url = new URL(window.location.href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  return url.searchParams.get('auth') === 'recovery' || fragment.get('type') === 'recovery'
    || fragment.has('error') || fragment.has('error_code')
    || url.searchParams.has('error') || url.searchParams.has('error_code');
}

function hasRecoveryError() {
  const url = new URL(window.location.href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  return fragment.has('error') || fragment.has('error_code')
    || url.searchParams.has('error') || url.searchParams.has('error_code');
}

function markRecoveryUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set('auth', 'recovery');
  window.history.replaceState(window.history.state, '', url);
}

function clearRecoveryUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('auth');
  url.searchParams.delete('code');
  url.searchParams.delete('error');
  url.searchParams.delete('error_code');
  url.searchParams.delete('error_description');
  url.hash = '';
  window.history.replaceState(window.history.state, '', url);
}

export const canViewProduction = (user?: User | null) => !!user?.active && (user.role === 'admin' || user.role === 'developer');
export const canViewSettings = canViewProduction;
export const canViewAllHistory = canViewProduction;
export const canViewDeveloperTools = (user?: User | null) => !!user?.active && user.role === 'developer';
export const isOperator = (user?: User | null) => user?.role === 'operator';
export const isAdmin = (user?: User | null) => user?.role === 'admin';
export const isDeveloper = (user?: User | null) => user?.role === 'developer';
export const getOperationEnvironment = (user?: User | null): OperationEnvironment => user?.role === 'developer' ? 'development' : 'production';


/** All identities come from active memberships and visible stores, never UUID order or user metadata. */
export async function loadAuthorizedStores(userId: string): Promise<User[]> {
  const { data: profile, error: profileError } = await supabase.from('profiles').select('id, display_name, active').eq('id', userId).maybeSingle();
  if (profileError || !profile || profile.id !== userId || !profile.active) throw new Error('Seu perfil não está disponível ou ativo. Contate o administrador.');
  const { data: memberships, error } = await supabase.from('store_users').select('store_id, role, active').eq('user_id', userId).eq('active', true);
  if (error || !memberships?.length) throw new Error('Seu usuário não possui vínculo ativo com uma loja. Contate o administrador.');
  if (new Set(memberships.map(item => item.store_id)).size !== memberships.length) throw new Error('Os vínculos de loja estão inconsistentes.');
  const choices = await Promise.all(memberships.map(async member => {
    if (!member.active || !['admin', 'operator', 'developer'].includes(member.role)) throw new Error('Seu vínculo de loja não é reconhecido.');
    const { data: store, error: storeError } = await supabase.from('stores').select('id, name, slug, active').eq('id', member.store_id).maybeSingle();
    if (storeError || !store || store.id !== member.store_id) throw new Error('Não foi possível identificar sua loja autorizada.');
    if (!store.active) return null;
    const displayName = profile.display_name?.trim() || 'Usuário';
    return { id: profile.id, name: displayName, displayName, role: member.role, active: true,
      storeId: store.id, storeName: store.name, storeSlug: store.slug,
      environment: member.role === 'developer' ? 'development' : 'production' } as User;
  }));
  const active = choices.filter((choice): choice is User => choice !== null);
  if (!active.length) throw new Error('Nenhuma loja autorizada está ativa. Contate o administrador.');
  return active;
}

export interface UserContextType {
  currentUser: User;
  users: User[];
  signOut: () => Promise<void>;
  canViewProduction: boolean;
  canViewSettings: boolean;
  canViewDeveloperTools: boolean;
  canViewAllHistory: boolean;
  isOperator: boolean;
  isAdmin: boolean;
  isDeveloper: boolean;
  operationEnvironment: OperationEnvironment;
}
const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [storeChoices, setStoreChoices] = useState<User[]>([]);
  const [selectionRevision, setSelectionRevision] = useState(0);
  const selectedStore = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [authState, setAuthState] = useState<AuthState>('initializing');
  // The URL marker keeps recovery exclusive even after the SDK consumes the hash or on F5.
  const recoveryMode = useRef(hasRecoveryIntent());
  const recoveryLinkInvalid = useRef(hasRecoveryError());
  const generation = useRef(0);
  const intentionalLogout = useRef(false);
  const latestSession = useRef<Session | null>(null);

  useEffect(() => {
    let mounted = true;
    let receivedEvent = false;
    const applySession = (next: Session | null) => {
      if (!mounted) return;
      if (recoveryMode.current) {
        generation.current += 1;
        latestSession.current = next;
        setCurrentUser(null);
        setSession(next && !recoveryLinkInvalid.current ? { ...next } : null);
        setLoading(false);
        setAuthState('recovery');
        return;
      }
      if (next && latestSession.current?.access_token === next.access_token) return;
      const sameIdentity = next && latestSession.current?.user.id === next.user.id;
      latestSession.current = next;
      generation.current += 1;
      if (!sameIdentity) { setCurrentUser(null); setStoreChoices([]); selectedStore.current = null; }
      setLoading(previous => next ? (previous || !sameIdentity) : false);
      setSession(next ? { ...next } : null);
      if (!next) setAuthState('unauthenticated');
      else if (!sameIdentity) setAuthState('initializing');
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      if (!mounted) return;
      receivedEvent = true;
      if (event === 'PASSWORD_RECOVERY') {
        recoveryMode.current = true;
        recoveryLinkInvalid.current = false;
        markRecoveryUrl();
      }
      if (event === 'SIGNED_OUT' && !intentionalLogout.current) {
        setError(previous => previous ?? 'Sua sessão foi encerrada ou expirou. Entre novamente.');
      }
      if (next) setError(null);
      // Database queries run in a separate effect, outside the auth callback.
      applySession(next);
    });
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!mounted || receivedEvent) return;
      if (sessionError) setError('Não foi possível recuperar sua sessão. Entre novamente.');
      applySession(sessionError ? null : data.session);
    }).catch(() => {
      if (!mounted || receivedEvent) return;
      setError('Não foi possível recuperar sua sessão. Verifique sua conexão.');
      applySession(null);
    });
    return () => {
      mounted = false;
      latestSession.current = null;
      generation.current += 1;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session || recoveryMode.current || authState === 'recovery') return;
    let cancelled = false;
    const request = generation.current;
    const isCurrent = () => !cancelled && !recoveryMode.current && request === generation.current;
    const loadIdentity = async () => {
      let message = 'Não foi possível consultar seus dados. Verifique sua conexão e entre novamente.';
      try {
        const choices = await loadAuthorizedStores(session.user.id);
        if (!isCurrent()) return;
        setStoreChoices(choices);
        const chosen = selectedStore.current
          ? choices.find(choice => choice.storeId === selectedStore.current)
          : choices.length === 1 ? choices[0] : undefined;
        if (!chosen) {
          setCurrentUser(null); selectedStore.current = null;
          setLoading(false); setAuthState('selecting_store'); return;
        }
        selectedStore.current = chosen.storeId!;
        setCurrentUser(chosen);
        setLoading(false);
        setAuthState('authenticated');
      } catch {
        if (!isCurrent()) return;
        setError(message);
        setCurrentUser(null);
        intentionalLogout.current = true;
        try {
          const { error: logoutError } = await supabase.auth.signOut({ scope: 'local' });
          if (logoutError && isCurrent()) setError(message + ' Não foi possível encerrar a sessão. Tente novamente.');
        } catch {
          if (isCurrent()) setError(message + ' Não foi possível encerrar a sessão. Tente novamente.');
        } finally {
          intentionalLogout.current = false;
          if (isCurrent()) { setSession(null); setLoading(false); setAuthState('unauthenticated'); }
        }
      }
    };
    void loadIdentity();
    return () => { cancelled = true; };
  }, [session, authState === 'recovery', selectionRevision]);

  const leaveRecovery = async (completed: boolean) => {
    intentionalLogout.current = true;
    generation.current += 1;
    try {
      const { error: logoutError } = await supabase.auth.signOut({ scope: 'local' });
      if (logoutError) throw logoutError;
      // Leave recovery only after logout succeeds. On failure the reset screen allows retry.
      recoveryMode.current = false;
      latestSession.current = null;
      clearRecoveryUrl();
      setSession(null);
      setCurrentUser(null);
      setError(null);
      setNotice(completed ? 'Senha alterada com sucesso. Entre novamente.' : null);
      setAuthState('unauthenticated');
      setLoading(false);
    } finally {
      intentionalLogout.current = false;
    }
  };

  const signOut = async () => {
    intentionalLogout.current = true;
    generation.current += 1;
    latestSession.current = null;
    setCurrentUser(null);
    setSession(null);
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const { error: logoutError } = await supabase.auth.signOut({ scope: 'local' });
      if (logoutError) setError('Não foi possível encerrar sua sessão. Tente sair novamente antes de entrar.');
    } catch {
      setError('Não foi possível encerrar sua sessão. Verifique sua conexão.');
    } finally {
      intentionalLogout.current = false;
      setLoading(false);
      setAuthState('unauthenticated');
    }
  };

  if (authState === 'recovery') return <ResetPassword sessionValid={Boolean(session)} onComplete={() => leaveRecovery(true)} onCancel={() => leaveRecovery(false)} />;
  if (loading || authState === 'initializing') return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-600" role="status">Carregando Projeto ISBN...</div>;
  if (!currentUser && authState === 'selecting_store') return <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
    <section aria-label="Selecionar loja operacional" className="w-full max-w-lg space-y-4 rounded-xl border bg-white p-6">
      <h1 className="text-xl font-bold">Selecione a loja operacional</h1>
      <p className="text-sm text-slate-600">Operações, modelos, configurações e auditoria usarão a loja escolhida. Para mudar de loja, saia e entre novamente.</p>
      {storeChoices.map(choice => <button key={choice.storeId} type="button" className="block w-full rounded-lg border p-3 text-left hover:bg-blue-50"
        onClick={() => { selectedStore.current = choice.storeId!; setLoading(true); setSelectionRevision(value => value + 1); }}>
        <span className="font-semibold">{choice.storeName}</span><span className="block text-xs text-slate-500">{choice.role === 'developer' ? 'Desenvolvimento e laboratório disponíveis' : choice.role === 'admin' ? 'Administrador' : 'Operador'}</span>
      </button>)}
      <button type="button" onClick={() => void signOut()} className="text-sm text-blue-700">Sair</button>
    </section>
  </main>;
  if (!currentUser || authState !== 'authenticated') return <Login message={error} notice={notice} />;
  const value: UserContextType = {
    currentUser, users: [currentUser], signOut,
    canViewProduction: canViewProduction(currentUser), canViewSettings: canViewSettings(currentUser),
    canViewDeveloperTools: canViewDeveloperTools(currentUser), canViewAllHistory: canViewAllHistory(currentUser),
    isOperator: isOperator(currentUser), isAdmin: isAdmin(currentUser), isDeveloper: isDeveloper(currentUser),
    operationEnvironment: getOperationEnvironment(currentUser),
  };
  return <UserContext.Provider key={currentUser.id + ":" + currentUser.storeId} value={value}>{children}</UserContext.Provider>;
}
export function useUser(): UserContextType {
  const context = useContext(UserContext);
  if (!context) throw new Error('useUser deve ser utilizado dentro de um UserProvider');
  return context;
}
