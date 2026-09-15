/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BookOpen, Search, Layers } from 'lucide-react';

export default function Header() {
  return (
    <header className="bg-white/60 backdrop-blur-md border-b border-natural-border shadow-xs py-4 px-6 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-natural-accent text-white rounded-xl flex items-center justify-center shadow-xs">
            <BookOpen className="w-6 h-6 stroke-[1.8]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold bg-natural-badge text-natural-text px-2 py-0.5 rounded-full border border-natural-border uppercase tracking-wider">
                Módulo Balcão
              </span>
              <span className="text-[10px] font-semibold bg-stone-100 text-natural-subtitle px-2 py-0.5 rounded-full border border-stone-200 uppercase tracking-wider">
                Sebos & Livrarias
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-serif font-bold text-natural-title tracking-tight mt-0.5 animate-fade-in">
              Consulta ISBN <span className="font-normal text-natural-subtitle">para Sebos</span>
            </h1>
          </div>
        </div>
        
        <div className="flex items-center gap-2 text-natural-subtitle text-xs font-mono bg-white/80 border border-natural-border px-3 py-1.5 rounded-lg select-none shadow-3xs">
          <Layers className="w-3.5 h-3.5 text-natural-accent/60" />
          <span>v1.0.4 · Localizador Rápido</span>
        </div>
      </div>
    </header>
  );
}
