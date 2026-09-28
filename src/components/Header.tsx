/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BookOpen, Search, History, Sparkles } from 'lucide-react';

interface HeaderProps {
  activeTab?: 'consultar' | 'cadastro' | 'historico';
  onTabChange?: (tab: 'consultar' | 'cadastro' | 'historico') => void;
  historyCount?: number;
  hasActiveDraft?: boolean;
}

export default function Header({
  activeTab = 'consultar',
  onTabChange,
  historyCount = 0,
  hasActiveDraft = false,
}: HeaderProps) {
  return (
    <header className="bg-blue-600 border-b border-blue-700 shadow-sm text-white sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* DESKTOP / TABLET (md e superior): Linha única com navegação centralizada e equilibrada */}
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
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md transition-all cursor-pointer ${
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
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md transition-all cursor-pointer ${
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
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md transition-all cursor-pointer ${
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
          </nav>

          {/* Coluna direita para contrabalançar e manter o centro perfeito no desktop */}
          <div className="hidden md:block min-w-0" aria-hidden="true" />
        </div>

        {/* MOBILE (menor que md): Duas linhas organizadas sem qualquer overflow */}
        <div className="md:hidden py-2.5 space-y-2.5">
          {/* LINHA 1: Logo/ícone + identificação do sistema */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center text-white shrink-0 shadow-xs">
              <BookOpen className="w-4 h-4 stroke-[2]" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-base font-bold tracking-tight text-white leading-tight truncate">
                <span className="sm:hidden">Consulta ISBN</span>
                <span className="hidden sm:inline">Consulta ISBN para Sebos</span>
              </h1>
              <p className="text-[11px] text-blue-100 truncate">
                Balcão de Atendimento & Catalogação Magazord
              </p>
            </div>
          </div>

          {/* LINHA 2: Consultar | Cadastro | Histórico em 3 colunas proporcionais */}
          <nav className="w-full grid grid-cols-3 gap-1 p-1 bg-blue-700/70 border border-blue-500/40 rounded-lg text-xs font-medium">
            <button
              type="button"
              onClick={() => onTabChange?.('consultar')}
              className={`flex items-center justify-center gap-1.5 py-2 px-1 rounded-md transition-all cursor-pointer min-w-0 ${
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
              className={`flex items-center justify-center gap-1.5 py-2 px-1 rounded-md transition-all cursor-pointer min-w-0 ${
                activeTab === 'cadastro'
                  ? 'bg-white text-blue-700 font-semibold shadow-xs'
                  : 'text-blue-100 hover:text-white hover:bg-white/10'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Cadastro</span>
              {hasActiveDraft && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
              )}
            </button>

            <button
              type="button"
              onClick={() => onTabChange?.('historico')}
              className={`flex items-center justify-center gap-1.5 py-2 px-1 rounded-md transition-all cursor-pointer min-w-0 ${
                activeTab === 'historico'
                  ? 'bg-white text-blue-700 font-semibold shadow-xs'
                  : 'text-blue-100 hover:text-white hover:bg-white/10'
              }`}
            >
              <History className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Histórico</span>
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
          </nav>
        </div>
      </div>
    </header>
  );
}
