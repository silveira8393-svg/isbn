/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SearchHistoryItem } from '../types';
import { History, Trash2, Download, BookOpen, Clock, AlertCircle } from 'lucide-react';

interface SearchHistoryGroupProps {
  items: SearchHistoryItem[];
  onSelect: (isbn: string) => void;
  onClear: () => void;
  onExport: () => void;
}

export default function SearchHistoryGroup({
  items,
  onSelect,
  onClear,
  onExport,
}: SearchHistoryGroupProps) {
  const formatTime = (timestamp: number) => {
    const d = new Date(timestamp);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 flex flex-col items-center justify-center text-center min-h-[220px]">
        <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
          <History className="w-5 h-5 stroke-[1.5]" />
        </div>
        <p className="text-sm font-semibold text-slate-800">Nenhum livro consultado</p>
        <p className="text-xs text-slate-500 mt-1 max-w-[210px] leading-relaxed">
          As consultas realizadas no balcão ficarão salvas aqui para acesso rápido.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-3.5 px-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-blue-600" />
          <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
            Histórico Recente
          </h2>
          <span className="bg-blue-50 text-blue-700 text-[11px] font-mono px-1.5 py-0.2 rounded font-bold border border-blue-100">
            {items.length}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onExport}
            id="btn-export-history-csv"
            disabled={items.length === 0}
            className="text-xs text-slate-600 hover:text-blue-700 flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-100 transition-colors disabled:opacity-40 cursor-pointer"
            title="Exportar histórico em CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">CSV</span>
          </button>

          <button
            type="button"
            onClick={onClear}
            id="btn-clear-history"
            className="text-xs text-slate-500 hover:text-red-600 flex items-center gap-1 px-2 py-1 rounded hover:bg-red-50 transition-colors cursor-pointer"
            title="Limpar histórico"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Limpar</span>
          </button>
        </div>
      </div>

      {/* List */}
      <div className="divide-y divide-slate-100 overflow-y-auto max-h-[480px] xl:max-h-[640px] custom-scrollbar">
        {items.map((item) => (
          <button
            key={`${item.timestamp}-${item.isbn}`}
            type="button"
            onClick={() => onSelect(item.isbn)}
            id={`history-item-${item.isbn}`}
            className="w-full text-left p-3 hover:bg-slate-50/80 transition-colors flex items-start gap-3 group border-l-2 border-transparent hover:border-blue-600 cursor-pointer"
          >
            {/* Thumbnail */}
            <div className="w-9 h-12 rounded bg-slate-100 border border-slate-200 text-slate-400 flex items-center justify-center shrink-0 overflow-hidden">
              {item.thumbnailUrl ? (
                <img
                  src={item.thumbnailUrl}
                  alt=""
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <BookOpen className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
              )}
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <p
                className={`text-xs font-semibold line-clamp-1 group-hover:text-blue-700 transition-colors ${
                  item.success ? 'text-slate-900' : 'text-slate-600 italic'
                }`}
              >
                {item.title}
              </p>

              {item.authors && item.authors.length > 0 && (
                <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                  {item.authors.join(', ')}
                </p>
              )}

              <div className="flex items-center justify-between mt-1 text-[10px] text-slate-400 font-mono">
                <span className="text-blue-700 font-medium">ISBN {item.isbn}</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" />
                  {formatTime(item.timestamp)}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
