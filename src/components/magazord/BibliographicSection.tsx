/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { RegistrationDraft } from '../../types';
import {
  BookOpen,
  Users,
  Plus,
  X,
  Calendar,
  Globe,
  FileText,
  BookmarkCheck,
} from 'lucide-react';

interface BibliographicSectionProps {
  draft: RegistrationDraft;
  onChange: (updates: Partial<RegistrationDraft>) => void;
  errors: Record<string, string>;
}

const COMMON_FORMATS = [
  'Brochura',
  'Capa dura',
  'Capa comum',
  'Encadernação especial',
  'Espiral',
  'Bolso',
];

export default function BibliographicSection({
  draft,
  onChange,
  errors,
}: BibliographicSectionProps) {
  const [newAuthorInput, setNewAuthorInput] = useState('');

  const handleAddAuthor = () => {
    const trimmed = newAuthorInput.trim();
    if (!trimmed) return;
    if (!draft.authors.includes(trimmed)) {
      onChange({ authors: [...draft.authors, trimmed] });
    }
    setNewAuthorInput('');
  };

  const handleRemoveAuthor = (index: number) => {
    const updated = draft.authors.filter((_, i) => i !== index);
    onChange({ authors: updated });
  };

  const handleAuthorEdit = (index: number, val: string) => {
    const updated = [...draft.authors];
    updated[index] = val;
    onChange({ authors: updated });
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-5">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-sm">
          4
        </div>
        <div>
          <h3 className="text-sm sm:text-base font-bold text-slate-900">
            Dados Bibliográficos da Obra
          </h3>
          <p className="text-xs text-slate-500">
            Ficha técnica pré-carregada das fontes nacionais. Todos os campos são editáveis.
          </p>
        </div>
      </div>

      {/* Título e Subtítulo */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
        <div className="sm:col-span-8">
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            <span>Título da Obra</span>
            <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={draft.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="Título do livro"
            className={`w-full px-3.5 py-2.5 rounded-lg border text-sm font-semibold transition-colors focus:outline-none focus:ring-2 ${
              errors.title
                ? 'border-red-300 bg-red-50/40 text-red-900 focus:ring-red-200 focus:border-red-500'
                : 'border-slate-300 bg-white text-slate-900 focus:ring-blue-100 focus:border-blue-600'
            }`}
          />
          {errors.title && (
            <p className="text-xs text-red-600 font-medium mt-1">{errors.title}</p>
          )}
        </div>

        <div className="sm:col-span-4">
          <label className="block text-xs font-bold text-slate-800 mb-1.5">
            Subtítulo (opcional)
          </label>
          <input
            type="text"
            value={draft.subtitle || ''}
            onChange={(e) => onChange({ subtitle: e.target.value })}
            placeholder="Ex: Uma reflexão..."
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:ring-2 focus:ring-blue-100 focus:border-blue-600 focus:outline-none"
          />
        </div>
      </div>

      {/* Múltiplos Autores */}
      <div>
        <label className="block text-xs font-bold text-slate-800 mb-1.5">
          <span className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-blue-600" />
            <span>Autores / Organizadores</span>
          </span>
        </label>

        {/* Lista de Autores com Chips/Inputs editáveis */}
        <div className="flex flex-wrap gap-2 mb-2">
          {draft.authors.map((author, idx) => (
            <div
              key={idx}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-xs font-semibold text-blue-900 shadow-xs"
            >
              <input
                type="text"
                value={author}
                onChange={(e) => handleAuthorEdit(idx, e.target.value)}
                className="bg-transparent border-none focus:outline-none focus:ring-0 text-blue-900 font-semibold text-xs min-w-[120px]"
              />
              <button
                type="button"
                onClick={() => handleRemoveAuthor(idx)}
                className="text-blue-500 hover:text-red-600 p-0.5 rounded cursor-pointer"
                title="Remover autor"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          {draft.authors.length === 0 && (
            <span className="text-xs text-slate-400 italic">Nenhum autor cadastrado ainda.</span>
          )}
        </div>

        {/* Adicionar autor manualmente */}
        <div className="flex gap-2 max-w-md">
          <input
            type="text"
            value={newAuthorInput}
            onChange={(e) => setNewAuthorInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddAuthor();
              }
            }}
            placeholder="Adicionar outro autor..."
            className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600"
          />
          <button
            type="button"
            onClick={handleAddAuthor}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1 transition-colors cursor-pointer border border-slate-200"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Adicionar</span>
          </button>
        </div>
      </div>

      {/* Grid de Metadados: Ano, Edição, Idioma, Formato, Páginas */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1">
        {/* Ano */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Ano</label>
          <input
            type="text"
            value={draft.year || ''}
            onChange={(e) => onChange({ year: e.target.value })}
            placeholder="Ex: 2021"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600"
          />
        </div>

        {/* Edição */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Edição</label>
          <input
            type="text"
            value={draft.edition || ''}
            onChange={(e) => onChange({ edition: e.target.value })}
            placeholder="Ex: 2ª edição"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600"
          />
        </div>

        {/* Idioma */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Idioma</label>
          <input
            type="text"
            value={draft.language || 'Português'}
            onChange={(e) => onChange({ language: e.target.value })}
            placeholder="Ex: Português"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600"
          />
        </div>

        {/* Formato */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Formato</label>
          <input
            type="text"
            list="formats-list"
            value={draft.format || ''}
            onChange={(e) => onChange({ format: e.target.value })}
            placeholder="Brochura"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600"
          />
          <datalist id="formats-list">
            {COMMON_FORMATS.map((fmt) => (
              <option key={fmt} value={fmt} />
            ))}
          </datalist>
        </div>

        {/* Páginas */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Páginas</label>
          <input
            type="number"
            min={1}
            value={draft.pageCount ?? ''}
            onChange={(e) => {
              const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
              onChange({ pageCount: val });
            }}
            placeholder="Ex: 240"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600"
          />
        </div>
      </div>
    </div>
  );
}
