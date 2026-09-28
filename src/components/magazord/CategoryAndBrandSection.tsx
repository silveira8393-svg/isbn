/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { RegistrationDraft } from '../../types';
import { CATEGORIES_BY_CONDITION } from '../../utils/draft';
import { FolderTree, Building2, Bookmark, Check } from 'lucide-react';

interface CategoryAndBrandSectionProps {
  draft: RegistrationDraft;
  onChange: (updates: Partial<RegistrationDraft>) => void;
  errors: Record<string, string>;
}

export default function CategoryAndBrandSection({
  draft,
  onChange,
  errors,
}: CategoryAndBrandSectionProps) {
  const availableCategories = CATEGORIES_BY_CONDITION[draft.condition] || [];

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-5">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-sm">
          2
        </div>
        <div>
          <h3 className="text-sm sm:text-base font-bold text-slate-900">
            Categorização, Marca & Editora
          </h3>
          <p className="text-xs text-slate-500">
            Associação de departamento comercial na Magazord e distinção entre Marca e Editora
          </p>
        </div>
      </div>

      {/* 1. SELEÇÃO DE CATEGORIA FILTRADA PELA CONDIÇÃO */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <FolderTree className="w-4 h-4 text-blue-600" />
            <span>Categoria Magazord</span>
            <span className="text-red-500">*</span>
          </label>
          <span className="text-[11px] text-slate-400">
            Filtrada para livros <strong>{draft.condition === 'novo' ? 'Novos' : 'Usados'}</strong>
          </span>
        </div>

        <select
          value={draft.category}
          onChange={(e) => onChange({ category: e.target.value })}
          className={`w-full px-3.5 py-2.5 rounded-lg border text-sm font-medium transition-colors bg-white focus:outline-none focus:ring-2 cursor-pointer ${
            errors.category
              ? 'border-red-300 bg-red-50/40 text-red-900 focus:ring-red-200 focus:border-red-500'
              : 'border-slate-300 text-slate-900 focus:ring-blue-100 focus:border-blue-600'
          }`}
        >
          {availableCategories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
        {errors.category ? (
          <p className="text-xs text-red-600 font-medium mt-1">{errors.category}</p>
        ) : (
          <p className="text-[11px] text-slate-500 mt-1">
            Futuramente mapeado com a árvore de categorias oficial Magazord.
          </p>
        )}
      </div>

      {/* 2. CAMPOS SEPARADOS: MARCA e EDITORA */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
        {/* Marca */}
        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            <span className="flex items-center gap-1.5">
              <Bookmark className="w-3.5 h-3.5 text-blue-600" />
              <span>Marca Magazord</span>
            </span>
          </label>
          <input
            type="text"
            value={draft.brand}
            onChange={(e) => onChange({ brand: e.target.value })}
            placeholder="Ex: Pão Diário, Rocco, Intrínseca"
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:ring-2 focus:ring-blue-100 focus:border-blue-600 focus:outline-none"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            Marca comercial cadastrada no ERP Magazord (pode ser o selo ou nome da editora).
          </p>
        </div>

        {/* Editora */}
        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            <span className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-blue-600" />
              <span>Editora</span>
            </span>
          </label>
          <input
            type="text"
            value={draft.publisher}
            onChange={(e) => onChange({ publisher: e.target.value })}
            placeholder="Ex: Publicações Pão Diário Ltda."
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:ring-2 focus:ring-blue-100 focus:border-blue-600 focus:outline-none"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            Razão social ou selo editorial obtido nas fontes bibliográficas (editável).
          </p>
        </div>
      </div>
    </div>
  );
}
