/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, UserRole, OperationEnvironment } from '../types';

export const MOCK_USERS: User[] = [
  {
    id: 'usr_proprietario_admin',
    name: 'Proprietário',
    role: 'admin',
    active: true,
    avatarColor: 'bg-emerald-600',
  },
  {
    id: 'usr_joao_operador',
    name: 'João',
    role: 'operator',
    active: true,
    avatarColor: 'bg-blue-600',
  },
  {
    id: 'usr_desenvolvimento',
    name: 'Desenvolvimento',
    role: 'developer',
    active: true,
    avatarColor: 'bg-amber-600',
  },
];

const STORAGE_KEY_CURRENT_USER = 'sebo_mock_current_user_id';

/**
 * Helpers centralizados de permissão:
 * Evita ifs soltos com strings pelos componentes e prepara para RBAC futuro.
 */
export const canViewProduction = (user?: User | null): boolean => {
  if (!user || !user.active) return false;
  return user.role === 'admin' || user.role === 'developer';
};

export const canViewSettings = (user?: User | null): boolean => {
  if (!user || !user.active) return false;
  return user.role === 'admin' || user.role === 'developer';
};

export const canViewDeveloperTools = (user?: User | null): boolean => {
  if (!user || !user.active) return false;
  return user.role === 'developer';
};

export const canViewAllHistory = (user?: User | null): boolean => {
  if (!user || !user.active) return false;
  return user.role === 'admin' || user.role === 'developer';
};

export const isOperator = (user?: User | null): boolean => {
  return user?.role === 'operator';
};

export const isAdmin = (user?: User | null): boolean => {
  return user?.role === 'admin';
};

export const isDeveloper = (user?: User | null): boolean => {
  return user?.role === 'developer';
};

export const getOperationEnvironment = (user?: User | null): OperationEnvironment => {
  return user?.role === 'developer' ? 'development' : 'production';
};

export interface UserContextType {
  currentUser: User;
  users: User[];
  setCurrentUser: (user: User) => void;
  setCurrentUserId: (id: string) => void;
  // Permissões diretas para o usuário ativo atual
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
  const [users] = useState<User[]>(MOCK_USERS);
  const [currentUserId, setCurrentUserIdState] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CURRENT_USER);
      if (saved && MOCK_USERS.some((u) => u.id === saved)) {
        return saved;
      }
    } catch {}
    // Padrão inicial: João (Operador) para validar o fluxo padrão de balcão
    return 'usr_joao_operador';
  });

  const currentUser =
    users.find((u) => u.id === currentUserId && u.active) || users[0];

  const setCurrentUserId = (id: string) => {
    setCurrentUserIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY_CURRENT_USER, id);
    } catch {}
  };

  const setCurrentUser = (user: User) => {
    setCurrentUserId(user.id);
  };

  const value: UserContextType = {
    currentUser,
    users,
    setCurrentUser,
    setCurrentUserId,
    canViewProduction: canViewProduction(currentUser),
    canViewSettings: canViewSettings(currentUser),
    canViewDeveloperTools: canViewDeveloperTools(currentUser),
    canViewAllHistory: canViewAllHistory(currentUser),
    isOperator: isOperator(currentUser),
    isAdmin: isAdmin(currentUser),
    isDeveloper: isDeveloper(currentUser),
    operationEnvironment: getOperationEnvironment(currentUser),
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser(): UserContextType {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser deve ser utilizado dentro de um UserProvider');
  }
  return context;
}
