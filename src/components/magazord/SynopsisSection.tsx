/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { RegistrationDraft } from '../../types';
import { sanitizeSynopsis } from '../../utils/sanitizer';
import { FileText, Sparkles, Check } from 'lucide-react';

interface SynopsisSectionProps {
  draft: RegistrationDraft;
  onChange: (updates: Partial<RegistrationDraft>) => void;
}

export default function SynopsisSection({
  draft,
  onChange,
}: SynopsisSectionProps) {
  const [justSanitized, setJustSanitized] = useState(false);

  const handleSanitizeClick = () => {
    const cleaned = sanitizeSynopsis(draft.synopsis);
    onChange({ synopsis: cleaned });
    setJustSanitized(true);
    setTimeout(() => setJustSanitized(false), 2000);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-sm">
            7
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900">
              Descrição & Sinopse do Livro
            </h3>
            <p className="text-xs text-slate-500">
              Texto comercial exibido na página do produto e marketplaces integrados
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSanitizeClick}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
          title="Remove tags HTML estranhas e normaliza quebras de linha"
        >
          {justSanitized ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-emerald-700">Texto Sanitizado!</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>Limpar Formatação</span>
            </>
          )}
        </button>
      </div>

      <div>
        <textarea
          rows={6}
          value={draft.synopsis}
          onChange={(e) => onChange({ synopsis: e.target.value })}
          placeholder="Sinopse ou descrição do livro (pré-preenchida das fontes oficiais)..."
          className="w-full px-3.5 py-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600"
        />
        <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
          <span>Preserva parágrafos limpos para envio à API Magazord.</span>
          <span>{draft.synopsis ? `${draft.synopsis.length} caracteres` : '0 caracteres'}</span>
        </div>
      </div>
    </div>
  );
}
