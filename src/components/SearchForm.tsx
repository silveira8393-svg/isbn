/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Search, Sparkles, RefreshCw, Barcode, HelpCircle, Delete } from 'lucide-react';
import { cleanIsbn } from '../utils/isbn';

interface SearchFormProps {
  onSearch: (isbn: string) => void;
  isLoading: boolean;
  isbnValue: string;
  setIsbnValue: (val: string) => void;
}

export default function SearchForm({ onSearch, isLoading, isbnValue, setIsbnValue }: SearchFormProps) {
  const [cleanLength, setCleanLength] = useState(0);

  // Monitor cleaned input length
  useEffect(() => {
    const cleaned = cleanIsbn(isbnValue);
    setCleanLength(cleaned.length);
  }, [isbnValue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isbnValue.trim() && !isLoading) {
      onSearch(isbnValue);
    }
  };

  const handleClear = () => {
    setIsbnValue('');
  };

  // Quick helper to determine validation styling
  const isCorrectSize = cleanLength === 10 || cleanLength === 13;
  const isTooSmall = cleanLength > 0 && cleanLength < 10;
  const isTooBig = cleanLength > 13;

  return (
    <div className="bg-white/80 border border-natural-border rounded-2xl p-5 sm:p-7 shadow-xs">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Barcode className="w-5 h-5 text-natural-accent" />
          <h2 className="text-base font-semibold text-natural-title font-serif">Consulte Código ISBN</h2>
        </div>
        <span className="text-[10px] bg-natural-badge text-natural-text font-mono px-2 py-0.5 rounded-full border border-natural-border font-semibold select-none">
          EAN-13 / UPC / Livros
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          {/* Main search Input field */}
          <input
            type="text"
            value={isbnValue}
            onChange={(e) => setIsbnValue(e.target.value)}
            disabled={isLoading}
            placeholder="Digite ou cole o ISBN (ex: 9788575427583)"
            id="isbn-input-field"
            className="w-full pl-12 pr-12 py-4 bg-white/70 hover:bg-white focus:bg-white text-natural-title placeholder-natural-subtitle font-mono font-medium rounded-xl border border-natural-border focus:border-natural-accent focus:ring-2 focus:ring-natural-accent/15 focus:outline-hidden transition-all text-base sm:text-lg"
            maxLength={30}
            autoFocus
            autoComplete="off"
          />

          {/* Barcode graphic vector indicator */}
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-natural-subtitle select-none pointer-events-none">
            <Search className="w-5 h-5" />
          </div>

          {/* Clear Input Shortcut Button */}
          {isbnValue && (
            <button
              type="button"
              onClick={handleClear}
              id="clear-input-btn"
              disabled={isLoading}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 rounded-md hover:bg-natural-badge text-natural-text hover:text-natural-title transition-colors cursor-pointer"
              title="Limpar campo"
            >
              <span className="text-xs font-semibold mr-1 font-sans hidden sm:inline select-none">Limpar</span>
              <span className="text-lg leading-none">×</span>
            </button>
          )}
        </div>

        {/* Action Button & Loader Indicator */}
        <button
          type="submit"
          id="search-submit-button"
          disabled={isLoading || !isbnValue.trim()}
          className={`w-full py-3.5 px-6 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer ${
            isLoading 
              ? 'bg-natural-subtitle text-white cursor-not-allowed' 
              : !isbnValue.trim()
                ? 'bg-stone-100 text-stone-400 cursor-not-allowed border border-natural-border/30'
                : 'bg-natural-accent text-white hover:bg-natural-accent-hover hover:shadow-md active:opacity-90'
          }`}
        >
          {isLoading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
              <span>Buscando na BrasilAPI...</span>
            </>
          ) : (
            <>
              <Search className="w-4 h-4 shrink-0" />
              <span>Consultar Registro de Livro</span>
            </>
          )}
        </button>
      </form>

      {/* Dynamic formatting checker bar */}
      {isbnValue.trim() && (
        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 text-xs pt-3 border-t border-natural-border animate-fade-in">
          <div className="flex items-center gap-1.5">
            <span className="text-natural-subtitle">ISBN limpo:</span>
            <span className="font-mono font-bold text-natural-title bg-natural-badge/40 px-1.5 py-0.5 rounded-md border border-natural-border/60">
              {cleanIsbn(isbnValue) || '—'}
            </span>
          </div>

          <div className="flex items-center gap-2 font-mono text-[11px]">
            {isCorrectSize && (
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                ✔ Formato Válido ({cleanLength} dígitos)
              </span>
            )}
            
            {isTooSmall && (
              <span className="text-amber-800 font-semibold flex items-center gap-1">
                ⚠ Muito curto ({cleanLength}/10 ou 13)
              </span>
            )}
            
            {isTooBig && (
              <span className="text-red-700 font-semibold flex items-center gap-1">
                ⚠ Muito longo ({cleanLength}/13 máx)
              </span>
            )}
          </div>
        </div>
      )}

      {/* Helper guide / documentation snippet */}
      <div className="mt-4 pt-3.5 border-t border-natural-border text-xs text-natural-subtitle flex items-start gap-2 leading-relaxed">
        <HelpCircle className="w-4 h-4 text-natural-accent/50 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-natural-text">Dica de uso rápido:</span> Cole o código copiado de caneta ou leitor sem se preocupar com hífens (ex: <code className="font-mono bg-natural-bg px-1 py-0.5 border border-natural-border rounded-md text-natural-text">978-8575427583</code> ou <code className="font-mono bg-natural-bg px-1 py-0.5 border border-natural-border rounded-md text-natural-text">8575427586</code>). A ferramenta remove pontuações automaticamente para acelerar o processo.
        </div>
      </div>
    </div>
  );
}
