/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { RegistrationDraft } from '../../types';
import { DollarSign, Package, MapPin, AlertCircle } from 'lucide-react';

interface CommercialSectionProps {
  draft: RegistrationDraft;
  onChange: (updates: Partial<RegistrationDraft>) => void;
  errors: Record<string, string>;
}

export default function CommercialSection({
  draft,
  onChange,
  errors,
}: CommercialSectionProps) {
  // Formata valor digitado para estilo moeda amigável se desejado
  const handlePriceChange = (val: string) => {
    // Permite digitação livre de números e vírgula/ponto
    const clean = val.replace(/[^0-9.,]/g, '');
    onChange({ price: clean });
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-5">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-sm">
          3
        </div>
        <div>
          <h3 className="text-sm sm:text-base font-bold text-slate-900">
            Comercial, Estoque & Localização
          </h3>
          <p className="text-xs text-slate-500">
            Definição de preço de venda da loja, estoque inicial e filial
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Preço de Venda */}
        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            <span className="flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              <span>Preço de Venda (R$)</span>
              <span className="text-red-500">*</span>
            </span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
              R$
            </span>
            <input
              type="text"
              value={draft.price}
              onChange={(e) => handlePriceChange(e.target.value)}
              placeholder="0,00"
              className={`w-full pl-9 pr-3.5 py-2.5 rounded-lg border text-sm font-bold text-slate-900 transition-colors focus:outline-none focus:ring-2 ${
                errors.price
                  ? 'border-red-300 bg-red-50/40 text-red-900 focus:ring-red-200 focus:border-red-500'
                  : 'border-slate-300 bg-white focus:ring-blue-100 focus:border-blue-600'
              }`}
            />
          </div>
          {errors.price ? (
            <p className="text-xs text-red-600 font-medium mt-1">{errors.price}</p>
          ) : (
            <p className="text-[11px] text-slate-500 mt-1">
              Decisão comercial da loja (não pré-preenchido por preços externos).
            </p>
          )}
        </div>

        {/* Quantidade / Estoque */}
        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            <span className="flex items-center gap-1.5">
              <Package className="w-4 h-4 text-blue-600" />
              <span>Quantidade Inicial</span>
              <span className="text-red-500">*</span>
            </span>
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onChange({ quantity: Math.max(1, draft.quantity - 1) })}
              className="w-10 h-10 rounded-lg border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 flex items-center justify-center cursor-pointer transition-colors"
            >
              -
            </button>
            <input
              type="number"
              min={1}
              value={draft.quantity}
              onChange={(e) => {
                const parsed = parseInt(e.target.value, 10);
                onChange({ quantity: Number.isNaN(parsed) ? 1 : Math.max(1, parsed) });
              }}
              className="flex-1 text-center py-2.5 rounded-lg border border-slate-300 bg-white font-bold text-sm text-slate-900 focus:ring-2 focus:ring-blue-100 focus:border-blue-600 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => onChange({ quantity: draft.quantity + 1 })}
              className="w-10 h-10 rounded-lg border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 flex items-center justify-center cursor-pointer transition-colors"
            >
              +
            </button>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Geralmente 1 para exemplares usados de sebo.
          </p>
        </div>

        {/* Localização da Filial */}
        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            <span className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-blue-600" />
              <span>Localização / Loja</span>
            </span>
          </label>
          <input
            type="text"
            value={draft.location}
            onChange={(e) => onChange({ location: e.target.value })}
            placeholder="Sebo Livraria Sul"
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-slate-50 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-blue-100 focus:border-blue-600 focus:outline-none"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            Fixo da operação (Sebo Livraria Sul). Editável se necessário.
          </p>
        </div>
      </div>
    </div>
  );
}
