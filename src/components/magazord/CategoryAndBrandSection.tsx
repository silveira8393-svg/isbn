/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BookInfo, RegistrationDraft } from '../../types';
import { amazonBrowseNodes, amazonCategoryPath } from '../../../shared/amazonCategories';
import { canonicalBookIsbn } from '../../utils/isbn';
import MagazordCategoryPicker from './MagazordCategoryPicker';
import type { useMagazordCategories } from '../../hooks/useMagazordCategories';
import { FolderTree, Building2, Bookmark, Check } from 'lucide-react';

interface CategoryAndBrandSectionProps {
  draft: RegistrationDraft;
  originalBook?: BookInfo;
  categories: ReturnType<typeof useMagazordCategories>;
  onChange: (updates: Partial<RegistrationDraft>) => void;
  errors: Record<string, string>;
}

export default function CategoryAndBrandSection({
  draft,
  originalBook,
  categories,
  onChange,
  errors,
}: CategoryAndBrandSectionProps) {
  const classifications = (values: unknown[]) => [...new Set(values.filter((value): value is string => typeof value === 'string' && !!value.trim()).map(value => value.trim()))];
  const references = [
    { source: 'BrasilAPI', values: classifications(originalBook?.categories || []) },
    { source: 'Distribuidora Curitiba', values: classifications([originalBook?.productCategory, originalBook?.department]) },
    { source: 'Google Books', values: classifications([originalBook?.googleBooksReference?.mainCategory, ...(originalBook?.googleBooksReference?.categories || [])]) },
    { source: 'Amazon — categoria de navegação', values: originalBook?.amazonCategoryReference
      && originalBook.amazonCategoryReference.marketplaceId === 'A2Q3Y263D00KWC'
      && originalBook.amazonCategoryReference.asin === originalBook.amazonCatalogReference?.asin
      && originalBook.amazonCategoryReference.isbn === canonicalBookIsbn(originalBook.isbn13 || originalBook.isbn10)
      ? classifications(amazonBrowseNodes(originalBook.amazonCategoryReference.classifications).map(amazonCategoryPath)) : [] },
  ].filter(reference => reference.values.length);
  return (
    <div id="registration-category" className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-5">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-sm">
          <FolderTree className="h-5 w-5" aria-hidden="true" />
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

      <MagazordCategoryPicker draft={draft} onChange={onChange} categories={categories} error={errors.category} />
      {references.length > 0 && <aside aria-label="Referências das fontes" className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        <h4 className="font-semibold text-slate-700 mb-1">Referências das fontes</h4>
        <dl className="space-y-2">{references.map(reference => <div key={reference.source}>
          <dt className="font-semibold">{reference.source}:</dt>
          <dd className="mt-0.5"><ul className="space-y-1">{reference.values.map(value => {
            const kind = reference.source === 'Amazon — categoria de navegação'
              ? /^Loja Kindle(?:\s*>|$)/i.test(value) ? 'Kindle' : /^Livros(?:\s*>|$)/i.test(value) ? 'Livro físico' : undefined
              : undefined;
            return <li key={value} className="flex items-start gap-2">
              {kind && <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">{kind}</span>}
              <span className="min-w-0 [overflow-wrap:anywhere]">{value}</span>
            </li>;
          })}</ul></dd>
        </div>)}</dl>
      </aside>}

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
            Marca comercial do cadastro simulado (pode ser o selo ou nome da editora).
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
            data-registration-field="publisher"
            onChange={(e) => onChange({ publisher: e.target.value })}
            placeholder="Ex: Publicações Pão Diário Ltda."
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:ring-2 focus:ring-blue-100 focus:border-blue-600 focus:outline-none"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            Razão social ou selo editorial obtido nas fontes bibliográficas (editável).
          </p>
          {errors.publisher && <p className="mt-1 text-xs font-medium text-red-600">{errors.publisher}</p>}
        </div>
      </div>
    </div>
  );
}
