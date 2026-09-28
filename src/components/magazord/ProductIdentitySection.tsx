/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { BookCondition, RegistrationDraft } from '../../types';
import {
  Tag,
  Barcode,
  AlertCircle,
  HelpCircle,
  Hash,
  Sparkles,
} from 'lucide-react';

interface ProductIdentitySectionProps {
  draft: RegistrationDraft;
  onChange: (updates: Partial<RegistrationDraft>) => void;
  errors: Record<string, string>;
}

export default function ProductIdentitySection({
  draft,
  onChange,
  errors,
}: ProductIdentitySectionProps) {
  const [modifiedSensitiveFields, setModifiedSensitiveFields] = useState<Set<string>>(new Set());

  const markSensitiveField = (field: string) => {
    setModifiedSensitiveFields((prev) => {
      const next = new Set(prev);
      next.add(field);
      return next;
    });
  };

  const handleConditionChange = (newCondition: BookCondition) => {
    if (newCondition === draft.condition) return;

    if (newCondition === 'novo') {
      // Se NOVO: Código Filho preenchido automaticamente com ISBN-13 ou EAN
      const autoChild = draft.isbn13 || draft.ean || '';
      onChange({
        condition: 'novo',
        childCode: autoChild,
        category: draft.category.replace('Usado >', 'Novo >'),
      });
    } else {
      // Se USADO: Código Filho deve ser manual (limpa preenchimento automático se coincidia com ISBN)
      const currentChildIsIsbn =
        draft.childCode === draft.isbn13 || draft.childCode === draft.ean;
      onChange({
        condition: 'usado',
        childCode: currentChildIsIsbn ? '' : draft.childCode,
        category: draft.category.replace('Novo >', 'Usado >'),
      });
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-5">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-sm">
            1
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900">
              Identificação & Condição
            </h3>
            <p className="text-xs text-slate-500">
              Condição física do exemplar e códigos identificadores da loja e Magazord
            </p>
          </div>
        </div>

        {/* Alerta de campos sensíveis */}
        {modifiedSensitiveFields.size > 0 && (
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-medium">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
            Códigos de identificação conferidos
          </span>
        )}
      </div>

      {/* 1. SELETOR DE CONDIÇÃO: [ NOVO ] [ USADO ] */}
      <div>
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
          Condição do Produto <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <button
            type="button"
            onClick={() => handleConditionChange('novo')}
            className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm transition-all border cursor-pointer ${
              draft.condition === 'novo'
                ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>NOVO</span>
          </button>

          <button
            type="button"
            onClick={() => handleConditionChange('usado')}
            className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm transition-all border cursor-pointer ${
              draft.condition === 'usado'
                ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Tag className="w-4 h-4" />
            <span>USADO (SEBO)</span>
          </button>
        </div>
        <p className="text-[11px] text-slate-500 mt-1.5">
          {draft.condition === 'novo'
            ? 'Livro novo: Código Filho será preenchido automaticamente com o ISBN-13.'
            : 'Livro usado: Código Filho é o código sequencial interno da loja para este exemplar.'}
        </p>
      </div>

      {/* 2. CÓDIGO PAI & CÓDIGO FILHO */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
        {/* Código Pai */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <span>Código Pai</span>
              <span className="text-red-500">*</span>
            </label>
            <span className="text-[11px] text-slate-400 font-mono">Etiqueta interna</span>
          </div>
          <div className="relative">
            <input
              type="text"
              value={draft.parentCode}
              onChange={(e) => {
                markSensitiveField('parentCode');
                onChange({ parentCode: e.target.value.toUpperCase() });
              }}
              placeholder="Ex: LV26579-P"
              className={`w-full px-3.5 py-2.5 rounded-lg border text-sm font-mono font-semibold uppercase tracking-wider transition-colors focus:outline-none focus:ring-2 ${
                errors.parentCode
                  ? 'border-red-300 bg-red-50/40 text-red-900 focus:ring-red-200 focus:border-red-500'
                  : 'border-slate-300 bg-white text-slate-900 focus:ring-blue-100 focus:border-blue-600'
              }`}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              <Barcode className="w-4 h-4" />
            </div>
          </div>
          {errors.parentCode ? (
            <p className="text-xs text-red-600 font-medium mt-1">{errors.parentCode}</p>
          ) : (
            <p className="text-[11px] text-slate-500 mt-1">
              Informe o sequencial da etiqueta física colada na loja (leitura por câmera disponível em breve).
            </p>
          )}
        </div>

        {/* Código Filho / Derivação */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <span>Código Filho (Derivação)</span>
              <span className="text-red-500">*</span>
            </label>
            <span className="text-[11px] text-slate-400 font-mono">
              {draft.condition === 'novo' ? 'Automático (ISBN-13)' : 'Sequencial Manual'}
            </span>
          </div>
          <div className="relative">
            <input
              type="text"
              value={draft.childCode}
              onChange={(e) => {
                markSensitiveField('childCode');
                onChange({ childCode: e.target.value });
              }}
              placeholder={draft.condition === 'novo' ? '9786553508675' : 'Ex: LV10100'}
              className={`w-full px-3.5 py-2.5 rounded-lg border text-sm font-mono font-semibold transition-colors focus:outline-none focus:ring-2 ${
                errors.childCode
                  ? 'border-red-300 bg-red-50/40 text-red-900 focus:ring-red-200 focus:border-red-500'
                  : 'border-slate-300 bg-white text-slate-900 focus:ring-blue-100 focus:border-blue-600'
              }`}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              <Hash className="w-4 h-4" />
            </div>
          </div>
          {errors.childCode ? (
            <p className="text-xs text-red-600 font-medium mt-1">{errors.childCode}</p>
          ) : (
            <p className="text-[11px] text-slate-500 mt-1">
              {draft.condition === 'novo'
                ? 'Para livro novo, coincide com o ISBN-13 (editável).'
                : 'Para livro usado, informe o código da derivação do exemplar.'}
            </p>
          )}
        </div>
      </div>

      {/* 3. EAN, ISBN-13 e ISBN-10 (EDITÁVEIS) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            EAN <span className="text-slate-400 font-normal font-mono">(ISBN-13)</span>
          </label>
          <input
            type="text"
            value={draft.ean}
            onChange={(e) => {
              markSensitiveField('ean');
              onChange({ ean: e.target.value });
            }}
            placeholder="EAN do livro"
            className="w-full px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-sm font-mono text-slate-900 focus:ring-2 focus:ring-blue-100 focus:border-blue-600 focus:outline-none"
          />
          <span className="text-[10px] text-slate-400 block mt-0.5">Identificador comercial do produto</span>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            ISBN-13
          </label>
          <input
            type="text"
            value={draft.isbn13}
            onChange={(e) => {
              markSensitiveField('isbn13');
              onChange({ isbn13: e.target.value });
            }}
            placeholder="978..."
            className="w-full px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-sm font-mono text-slate-900 focus:ring-2 focus:ring-blue-100 focus:border-blue-600 focus:outline-none"
          />
          <span className="text-[10px] text-slate-400 block mt-0.5">Registro padrão internacional</span>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            ISBN-10
          </label>
          <input
            type="text"
            value={draft.isbn10}
            onChange={(e) => {
              markSensitiveField('isbn10');
              onChange({ isbn10: e.target.value });
            }}
            placeholder="85..."
            className="w-full px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-sm font-mono text-slate-900 focus:ring-2 focus:ring-blue-100 focus:border-blue-600 focus:outline-none"
          />
          <span className="text-[10px] text-slate-400 block mt-0.5">Formato legado (se houver)</span>
        </div>
      </div>
    </div>
  );
}
