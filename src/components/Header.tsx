/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  BookOpen,
  Search,
  History,
  Sparkles,
  BarChart3,
  Settings,
} from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import UserSwitcher from './UserSwitcher';

export type NavigationTab =
  | 'consultar'
  | 'cadastro'
  | 'historico'
  | 'producao'
  | 'configuracoes';

interface HeaderProps {
  activeTab?: NavigationTab;
  onTabChange?: (tab: NavigationTab) => void;
  historyCount?: number;
  hasActiveDraft?: boolean;
}

export default function Header({
  activeTab = 'consultar',
  onTabChange,
  historyCount = 0,
  hasActiveDraft = false,
}: HeaderProps) {
  const { canViewProduction, canViewSettings, isOperator } = useUser();

  return (
    <header className="bg-blue-600 border-b border-blue-700 shadow-sm text-white sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* DESKTOP / TABLET (md e superior): Linha única com navegação centralizada e perfil à direita */}
        <div className="hidden md:grid md:grid-cols-[1fr_auto_1fr] items-center h-16 gap-4">
          {/* Logo / Identidade à esquerda */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center text-white shrink-0 shadow-xs">
              <BookOpen className="w-5 h-5 stroke-[2]" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg lg:text-xl font-bold tracking-tight text-white leading-tight truncate">
                Consulta ISBN para Sebos
              </h1>
              <p className="text-xs text-blue-100 truncate">
                Balcão de Atendimento & Catalogação Magazord
              </p>
            </div>
          </div>

          {/* Navegação centralizada e equilibrada */}
          <nav className="flex items-center gap-1.5 p-1 bg-blue-700/70 border border-blue-500/40 rounded-lg text-xs font-medium justify-center shrink-0">
            <button
              type="button"
              onClick={() => onTabChange?.('consultar')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                activeTab === 'consultar'
                  ? 'bg-white text-blue-700 font-semibold shadow-xs'
                  : 'text-blue-100 hover:text-white hover:bg-white/10'
              }`}
            >
              <Search className="w-3.5 h-3.5 shrink-0" />
              <span>Consultar</span>
            </button>

            <button
              type="button"
              onClick={() => onTabChange?.('cadastro')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                activeTab === 'cadastro'
                  ? 'bg-white text-blue-700 font-semibold shadow-xs'
                  : 'text-blue-100 hover:text-white hover:bg-white/10'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>Cadastro</span>
              {hasActiveDraft && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
              )}
            </button>

            <button
              type="button"
              onClick={() => onTabChange?.('historico')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                activeTab === 'historico'
                  ? 'bg-white text-blue-700 font-semibold shadow-xs'
                  : 'text-blue-100 hover:text-white hover:bg-white/10'
              }`}
            >
              <History className="w-3.5 h-3.5 shrink-0" />
              <span>Histórico</span>
              {historyCount > 0 && (
                <span
                  className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold tabular-nums shrink-0 ${
                    activeTab === 'historico'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-blue-800 text-blue-100'
                  }`}
                >
                  {historyCount}
                </span>
              )}
            </button>

            {/* Abas exclusivas para Gestão/Admin e Dev */}
            {canViewProduction && (
              <button
                type="button"
                onClick={() => onTabChange?.('producao')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                  activeTab === 'producao'
                    ? 'bg-white text-blue-700 font-semibold shadow-xs'
                    : 'text-blue-100 hover:text-white hover:bg-white/10'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5 shrink-0" />
                <span>Produção</span>
              </button>
            )}

            {canViewSettings && (
              <button
                type="button"
                onClick={() => onTabChange?.('configuracoes')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                  activeTab === 'configuracoes'
                    ? 'bg-white text-blue-700 font-semibold shadow-xs'
                    : 'text-blue-100 hover:text-white hover:bg-white/10'
                }`}
              >
                <Settings className="w-3.5 h-3.5 shrink-0" />
                <span>Configurações</span>
              </button>
            )}
          </nav>

          {/* Coluna direita: Identificação e Seletor do Usuário */}
          <div className="flex items-center justify-end min-w-0">
            <UserSwitcher />
          </div>
        </div>

        {/* MOBILE (menor que md): Duas linhas organizadas sem qualquer overflow */}
        <div className="md:hidden py-2.5 space-y-2">
          {/* LINHA 1: Logo/ícone + identificação do sistema à esquerda e Perfil à direita */}
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center text-white shrink-0 shadow-xs">
                <BookOpen className="w-4 h-4 stroke-[2]" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-sm font-bold tracking-tight text-white leading-tight truncate">
                  Consulta ISBN para Sebos
                </h1>
                <p className="text-[10px] text-blue-100 truncate">
                  Balcão & Catalogação Magazord
                </p>
              </div>
            </div>

            {/* Identificação do Usuário no Mobile */}
            <div className="shrink-0">
              <UserSwitcher />
            </div>
          </div>

          {/* LINHA 2: Navegação responsiva proporcional sem overflow */}
          <nav
            className={`w-full grid gap-1 p-1 bg-blue-700/70 border border-blue-500/40 rounded-lg text-xs font-medium ${
              isOperator ? 'grid-cols-3' : 'grid-cols-5'
            }`}
          >
            <button
              type="button"
              onClick={() => onTabChange?.('consultar')}
              className={`flex items-center justify-center gap-1 py-1.5 px-0.5 rounded-md transition-all cursor-pointer min-w-0 ${
                activeTab === 'consultar'
                  ? 'bg-white text-blue-700 font-semibold shadow-xs'
                  : 'text-blue-100 hover:text-white hover:bg-white/10'
              }`}
            >
              <Search className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Consultar</span>
            </button>

            <button
              type="button"
              onClick={() => onTabChange?.('cadastro')}
              className={`flex items-center justify-center gap-1 py-1.5 px-0.5 rounded-md transition-all cursor-pointer min-w-0 ${
                activeTab === 'cadastro'
                  ? 'bg-white text-blue-700 font-semibold shadow-xs'
                  : 'text-blue-100 hover:text-white hover:bg-white/10'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Cadastro</span>
              {hasActiveDraft && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
              )}
            </button>

            <button
              type="button"
              onClick={() => onTabChange?.('historico')}
              className={`flex items-center justify-center gap-1 py-1.5 px-0.5 rounded-md transition-all cursor-pointer min-w-0 ${
                activeTab === 'historico'
                  ? 'bg-white text-blue-700 font-semibold shadow-xs'
                  : 'text-blue-100 hover:text-white hover:bg-white/10'
              }`}
            >
              <History className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Histórico</span>
              {historyCount > 0 && (
                <span
                  className={`px-1 rounded-full text-[9px] font-bold tabular-nums shrink-0 ${
                    activeTab === 'historico'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-blue-800 text-blue-100'
                  }`}
                >
                  {historyCount}
                </span>
              )}
            </button>

            {/* Produção e Configurações no Mobile para Admin/Dev */}
            {canViewProduction && (
              <button
                type="button"
                onClick={() => onTabChange?.('producao')}
                className={`flex items-center justify-center gap-1 py-1.5 px-0.5 rounded-md transition-all cursor-pointer min-w-0 ${
                  activeTab === 'producao'
                    ? 'bg-white text-blue-700 font-semibold shadow-xs'
                    : 'text-blue-100 hover:text-white hover:bg-white/10'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Produção</span>
              </button>
            )}

            {canViewSettings && (
              <button
                type="button"
                onClick={() => onTabChange?.('configuracoes')}
                className={`flex items-center justify-center gap-1 py-1.5 px-0.5 rounded-md transition-all cursor-pointer min-w-0 ${
                  activeTab === 'configuracoes'
                    ? 'bg-white text-blue-700 font-semibold shadow-xs'
                    : 'text-blue-100 hover:text-white hover:bg-white/10'
                }`}
              >
                <Settings className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Config.</span>
              </button>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
