/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { RegistrationDraft } from '../../types';
import { Ruler, Scale, Info } from 'lucide-react';

interface PhysicalAttributesSectionProps {
  draft: RegistrationDraft;
  onChange: (updates: Partial<RegistrationDraft>) => void;
}

export default function PhysicalAttributesSection({
  draft,
  onChange,
}: PhysicalAttributesSectionProps) {
  const handleDimensionChange = (
    field: 'width' | 'height' | 'depth' | 'weight',
    valueStr: string
  ) => {
    if (!valueStr) {
      onChange({ [field]: undefined });
      return;
    }
    const normalized = Number(valueStr.replace(',', '.'));
    if (!Number.isNaN(normalized)) {
      onChange({ [field]: normalized });
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-5">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-sm">
            5
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900">
              Peso & Dimensões do Pacote
            </h3>
            <p className="text-xs text-slate-500">
              Medidas físicas para cálculo de frete no Magazord (usando valores exatos da fonte)
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200 font-medium">
          <Info className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span>Regra: Não acrescentar 1 cm (medidas exatas)</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Peso (em gramas) */}
        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            <span className="flex items-center gap-1">
              <Scale className="w-3.5 h-3.5 text-blue-600" />
              <span>Peso (g)</span>
            </span>
          </label>
          <div className="relative">
            <input
              type="number"
              min={0}
              step={1}
              value={draft.weight ?? ''}
              onChange={(e) => handleDimensionChange('weight', e.target.value)}
              placeholder="Ex: 450"
              className="w-full px-3 py-2 pr-8 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600 font-mono"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
              g
            </span>
          </div>
          <span className="text-[10px] text-slate-400 block mt-0.5">Peso líquido ou estimado</span>
        </div>

        {/* Largura (cm) */}
        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            <span className="flex items-center gap-1">
              <Ruler className="w-3.5 h-3.5 text-blue-600" />
              <span>Largura (cm)</span>
            </span>
          </label>
          <div className="relative">
            <input
              type="number"
              min={0}
              step={0.1}
              value={draft.width ?? ''}
              onChange={(e) => handleDimensionChange('width', e.target.value)}
              placeholder="Ex: 14"
              className="w-full px-3 py-2 pr-8 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600 font-mono"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
              cm
            </span>
          </div>
          <span className="text-[10px] text-slate-400 block mt-0.5">Largura da capa</span>
        </div>

        {/* Altura (cm) */}
        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            <span className="flex items-center gap-1">
              <Ruler className="w-3.5 h-3.5 text-blue-600" />
              <span>Altura (cm)</span>
            </span>
          </label>
          <div className="relative">
            <input
              type="number"
              min={0}
              step={0.1}
              value={draft.height ?? ''}
              onChange={(e) => handleDimensionChange('height', e.target.value)}
              placeholder="Ex: 21"
              className="w-full px-3 py-2 pr-8 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600 font-mono"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
              cm
            </span>
          </div>
          <span className="text-[10px] text-slate-400 block mt-0.5">Altura vertical</span>
        </div>

        {/* Espessura / Comprimento / Profundidade (cm) */}
        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            <span className="flex items-center gap-1">
              <Ruler className="w-3.5 h-3.5 text-blue-600" />
              <span>Espessura (cm)</span>
            </span>
          </label>
          <div className="relative">
            <input
              type="number"
              min={0}
              step={0.1}
              value={draft.depth ?? ''}
              onChange={(e) => handleDimensionChange('depth', e.target.value)}
              placeholder="Ex: 2.5"
              className="w-full px-3 py-2 pr-8 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600 font-mono"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
              cm
            </span>
          </div>
          <span className="text-[10px] text-slate-400 block mt-0.5">Lombada / espessura</span>
        </div>
      </div>
    </div>
  );
}
