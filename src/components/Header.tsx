/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BookOpen, Search, History } from 'lucide-react';

interface HeaderProps {
  activeTab?: 'consultar' | 'historico';
  onTabChange?: (tab: 'consultar' | 'historico') => void;
  historyCount?: number;
}

export default function Header({ activeTab = 'consultar', onTabChange, historyCount = 0 }: HeaderProps) {
  return (
    <header className="bg-blue-600 border-b border-blue-700 shadow-sm text-white sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Identity */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center text-white shrink-0 shadow-xs">
            <BookOpen className="w-5 h-5 stroke-[2]" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white leading-tight">
              Consulta ISBN para Sebos
            </h1>
            <p className="text-xs text-blue-100 hidden sm:block">
              Balcão de Atendimento & Catalogação
            </p>
          </div>
        </div>

        {/* Simple Navigation: Consultar | Histórico */}
        <nav className="flex items-center gap-1.5 p-1 bg-blue-700/70 border border-blue-500/40 rounded-lg text-xs font-medium">
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
                className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold tabular-nums ${
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
    </header>
  );
}
