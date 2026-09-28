/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { RegistrationDraft } from '../../types';
import { FileCode, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react';

interface AdvancedFiscalSectionProps {
  draft: RegistrationDraft;
  onChange: (updates: Partial<RegistrationDraft>) => void;
}

export default function AdvancedFiscalSection({
  draft,
  onChange,
}: AdvancedFiscalSectionProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Botão de abrir/fechar seção colapsável */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-5 sm:px-6 py-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-sm">
            <FileCode className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-2">
              <span>Configurações Fiscais & Avançadas</span>
              <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                Padrões da Loja
              </span>
            </h4>
            <p className="text-[11px] text-slate-500">
              NCM de livros, origem e unidade tributária (pré-configurados para a loja)
            </p>
          </div>
        </div>

        <div className="text-slate-400 p-1">
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Conteúdo colapsável */}
      {isOpen && (
        <div className="p-5 sm:p-6 border-t border-slate-100 bg-slate-50/50 space-y-4 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                NCM (Classificação Fiscal)
              </label>
              <input
                type="text"
                value={draft.ncm}
                onChange={(e) => onChange({ ncm: e.target.value })}
                placeholder="4901.99.00"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600"
              />
              <span className="text-[10px] text-slate-400 block mt-0.5">
                4901.99.00 padrão para livros impressos
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Origem Fiscal
              </label>
              <select
                value={draft.fiscalOrigin}
                onChange={(e) => onChange({ fiscalOrigin: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600 cursor-pointer"
              >
                <option value="0 - Nacional">0 - Nacional</option>
                <option value="1 - Estrangeira (Importação direta)">1 - Estrangeira (Importação direta)</option>
                <option value="2 - Estrangeira (Adquirida no mercado interno)">2 - Estrangeira (Mercado interno)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Unidade Comercial
              </label>
              <input
                type="text"
                value={draft.unit}
                onChange={(e) => onChange({ unit: e.target.value })}
                placeholder="UN"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600"
              />
              <span className="text-[10px] text-slate-400 block mt-0.5">Padrão da loja: UN</span>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 italic">
            * Em versões futuras, estas configurações fiscais serão salvas no perfil da empresa para evitar digitação.
          </p>
        </div>
      )}
    </div>
  );
}
