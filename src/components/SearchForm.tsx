/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Search, Barcode, Camera, RefreshCw, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { cleanIsbn } from '../utils/isbn';

interface SearchFormProps {
  onSearch: (isbn: string) => void;
  isLoading: boolean;
  isbnValue: string;
  setIsbnValue: (val: string) => void;
  onOpenScanner?: () => void;
}

export default function SearchForm({
  onSearch,
  isLoading,
  isbnValue,
  setIsbnValue,
  onOpenScanner,
}: SearchFormProps) {
  const [cleanLength, setCleanLength] = useState(0);

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

  const isCorrectSize = cleanLength === 10 || cleanLength === 13;
  const isTooSmall = cleanLength > 0 && cleanLength < 10;
  const isTooBig = cleanLength > 13;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center">
            <Barcode className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Consulta de Livros por ISBN
            </h2>
          </div>
        </div>

        <span className="text-xs text-slate-500 font-mono hidden sm:inline">
          Padrão ISBN-10 / ISBN-13
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Main Input Container */}
          <div className="relative flex-1">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              <Search className="w-4 h-4" />
            </div>

            <input
              type="text"
              id="isbn-input-field"
              value={isbnValue}
              onChange={(e) => setIsbnValue(e.target.value)}
              disabled={isLoading}
              placeholder="Digite ou cole o ISBN (ex: 9788575427583)"
              className="w-full pl-10 pr-10 py-3 bg-slate-50 hover:bg-white focus:bg-white text-slate-900 placeholder-slate-400 font-mono text-sm sm:text-base font-medium rounded-lg border border-slate-200 focus:border-blue-600 focus:ring-3 focus:ring-blue-500/15 focus:outline-hidden transition-all"
              maxLength={30}
              autoFocus
              autoComplete="off"
            />

            {isbnValue && (
              <button
                type="button"
                onClick={handleClear}
                disabled={isLoading}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                title="Limpar campo"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {onOpenScanner && (
              <button
                type="button"
                onClick={onOpenScanner}
                disabled={isLoading}
                className="py-3 px-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 font-medium text-sm rounded-lg border border-slate-200 flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                title="Ler código de barras via câmera"
              >
                <Camera className="w-4 h-4 text-blue-600" />
                <span className="hidden sm:inline">Câmera</span>
              </button>
            )}

            <button
              type="submit"
              id="search-submit-button"
              disabled={isLoading || !isbnValue.trim()}
              className={`py-3 px-6 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer ${
                isLoading
                  ? 'bg-blue-400 text-white cursor-not-allowed'
                  : !isbnValue.trim()
                    ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 text-white active:bg-blue-800'
              }`}
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                  <span>Consultando...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 shrink-0" />
                  <span>Buscar</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Real-time validation strip if user is typing */}
        {isbnValue.trim() && (
          <div className="flex items-center justify-between text-xs pt-2 text-slate-500 font-mono animate-fade-in">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Código limpo:</span>
              <span className="font-semibold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                {cleanIsbn(isbnValue) || '—'}
              </span>
            </div>

            <div className="flex items-center gap-1">
              {isCorrectSize && (
                <span className="text-emerald-700 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Formato válido ({cleanLength} dígitos)
                </span>
              )}

              {isTooSmall && (
                <span className="text-amber-700 font-medium flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {cleanLength}/10 ou 13 dígitos
                </span>
              )}

              {isTooBig && (
                <span className="text-red-600 font-medium flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Mais de 13 dígitos ({cleanLength})
                </span>
              )}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
