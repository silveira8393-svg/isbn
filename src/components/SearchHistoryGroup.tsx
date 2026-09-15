/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SearchHistoryItem } from '../types';
import { History, Trash2, BookOpen, Clock } from 'lucide-react';

interface SearchHistoryGroupProps {
  items: SearchHistoryItem[];
  onSelect: (isbn: string) => void;
  onClear: () => void;
  onExport: () => void;
}

export default function SearchHistoryGroup({ items, onSelect, onClear, onExport }: SearchHistoryGroupProps) {
  if (items.length === 0) {
    return (
      <div className="bg-white/80 border border-natural-border rounded-2xl p-5 shadow-xs flex flex-col items-center justify-center text-center h-full min-h-[180px]">
        <div className="w-10 h-10 rounded-full bg-natural-bg flex items-center justify-center text-natural-accent mb-3 border border-natural-border/60">
          <History className="w-5 h-5 stroke-[1.5]" />
        </div>
        <p className="text-sm font-semibold text-natural-title">Nenhum livro consultado</p>
        <p className="text-xs text-natural-subtitle mt-1 max-w-[200px]">
          O histórico das suas pesquisas de hoje aparecerá listado aqui.
        </p>
      </div>
    );
  }

  // Format time (HH:MM:SS)
  const formatTime = (timestamp: number) => {
    const d = new Date(timestamp);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  };

  return (
    <div className="bg-white/80 border border-natural-border rounded-2xl shadow-xs flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-natural-border bg-white/40 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-natural-accent" />
          <h2 className="text-sm font-semibold text-natural-title font-serif">Consultas Recentes</h2>
          <span className="bg-natural-badge text-natural-accent text-[10px] font-mono px-1.5 py-0.5 rounded-md font-bold border border-natural-border/55">
            {items.length}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={onExport}
            id="btn-export-history-csv"
            disabled={items.length === 0}
            className="text-[11px] text-natural-subtitle hover:text-natural-accent transition-colors flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-natural-badge/60 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="Exportar histórico em CSV"
          >
            <span>Exportar CSV</span>
          </button>

          <button
            onClick={onClear}
            id="btn-clear-history"
            className="text-[11px] text-natural-subtitle hover:text-red-700 transition-colors flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-red-50/50 cursor-pointer"
            title="Limpar Histórico"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Limpar</span>
          </button>
        </div>
      </div>

      <div className="divide-y divide-natural-border/50 overflow-y-auto max-h-[300px] lg:max-h-[500px] custom-scrollbar">
        {items.map((item) => (
          <button
            key={`${item.timestamp}-${item.isbn}`}
            onClick={() => onSelect(item.isbn)}
            id={`history-item-${item.isbn}`}
            className="w-full text-left p-3.5 hover:bg-natural-badge/20 transition-all flex items-start gap-3 group border-0 border-l-2 border-transparent hover:border-natural-accent cursor-pointer"
          >
            <div className="w-8 h-10 bg-natural-badge/10 border border-natural-border text-natural-subtitle rounded flex items-center justify-center flex-shrink-0 group-hover:bg-natural-badge group-hover:text-natural-accent transition-colors">
              <BookOpen className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-natural-title line-clamp-1 group-hover:text-natural-accent transition-colors">
                {item.title}
              </p>
              {item.authors && item.authors.length > 0 && (
                <p className="text-[11px] text-natural-subtitle line-clamp-1 mt-0.5">
                  {item.authors.join(', ')}
                </p>
              )}
              <div className="flex items-center justify-between mt-1 text-[10px] text-natural-subtitle font-mono">
                <span>ISBN {item.isbn}</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5 text-natural-accent/55" />
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
