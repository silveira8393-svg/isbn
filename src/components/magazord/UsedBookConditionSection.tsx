/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { RegistrationDraft } from '../../types';
import { Tag, Sparkles, AlertCircle } from 'lucide-react';

interface UsedBookConditionSectionProps {
  draft: RegistrationDraft;
  onChange: (updates: Partial<RegistrationDraft>) => void;
}

const QUICK_OBSERVATIONS = [
  'Excelente estado de conservação',
  'Páginas levemente amareladas pela ação do tempo',
  'Miolo firme e limpo, sem grifos ou anotações',
  'Contém grifos discretos a lápis',
  'Pequeno desgaste natural nas bordas da capa',
  'Sem dobras, rasuras ou marcas de umidade',
  'Exemplar íntegro com lombada preservada',
  'Carimbo de posse discreto na primeira página',
];

export default function UsedBookConditionSection({
  draft,
  onChange,
}: UsedBookConditionSectionProps) {
  if (draft.condition !== 'usado') {
    return null;
  }

  const handleAppendChip = (chipText: string) => {
    const current = (draft.usedBookConditionNotes || '').trim();
    if (!current) {
      onChange({ usedBookConditionNotes: chipText });
    } else if (!current.includes(chipText)) {
      onChange({ usedBookConditionNotes: `${current}. ${chipText}` });
    }
  };

  return (
    <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-5 sm:p-6 space-y-4 animate-fade-in">
      <div className="flex items-center gap-2 border-b border-amber-200/60 pb-3">
        <div className="w-8 h-8 rounded-lg bg-amber-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
          <Tag className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-sm sm:text-base font-bold text-amber-950">
            Estado & Observações do Exemplar Usado
          </h3>
          <p className="text-xs text-amber-800">
            Descrição das particularidades físicas desta cópia (transparência essencial para clientes de sebo)
          </p>
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-amber-900 mb-1.5">
          Observações do Exemplar
        </label>
        <textarea
          rows={3}
          value={draft.usedBookConditionNotes || ''}
          onChange={(e) => onChange({ usedBookConditionNotes: e.target.value })}
          placeholder="Ex: Exemplar em ótimo estado, miolo firme e sem anotações. Páginas com leve oxidação nas bordas..."
          className="w-full px-3.5 py-2.5 rounded-lg border border-amber-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-600 shadow-2xs"
        />
      </div>

      {/* Sugestões Rápidas em Chips */}
      <div>
        <span className="block text-[11px] font-bold text-amber-900 uppercase tracking-wider mb-2">
          Atalhos de descrição rápida (clique para incluir):
        </span>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_OBSERVATIONS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => handleAppendChip(chip)}
              className="text-xs px-2.5 py-1 rounded-md bg-white border border-amber-300/80 text-amber-950 hover:bg-amber-100 hover:border-amber-400 transition-colors cursor-pointer shadow-2xs font-medium text-left"
            >
              + {chip}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
