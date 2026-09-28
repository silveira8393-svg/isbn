/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { RegistrationDraft } from '../../types';
import {
  ImageIcon,
  Plus,
  Trash2,
  Star,
  ExternalLink,
  BookOpen,
} from 'lucide-react';

interface ImagesSectionProps {
  draft: RegistrationDraft;
  onChange: (updates: Partial<RegistrationDraft>) => void;
}

export default function ImagesSection({
  draft,
  onChange,
}: ImagesSectionProps) {
  const [newImageUrl, setNewImageUrl] = useState('');
  const [showAddInput, setShowAddInput] = useState(false);
  const [failedUrls, setFailedUrls] = useState<Set<string>>(new Set());

  const handleImageError = (url: string) => {
    setFailedUrls((prev) => {
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  };

  const handleSetMain = (url: string) => {
    const currentMain = draft.mainImageUrl;
    const newAdditionals = draft.additionalImageUrls.filter((u) => u !== url);
    if (currentMain && currentMain !== url) {
      newAdditionals.unshift(currentMain);
    }
    onChange({
      mainImageUrl: url,
      additionalImageUrls: newAdditionals,
    });
  };

  const handleRemoveImage = (url: string, isMain: boolean) => {
    if (isMain) {
      const remaining = draft.additionalImageUrls;
      const nextMain = remaining[0] || undefined;
      const nextAdditionals = remaining.slice(1);
      onChange({
        mainImageUrl: nextMain,
        additionalImageUrls: nextAdditionals,
      });
    } else {
      onChange({
        additionalImageUrls: draft.additionalImageUrls.filter((u) => u !== url),
      });
    }
  };

  const handleAddManualImage = () => {
    const trimmed = newImageUrl.trim();
    if (!trimmed) return;
    if (!draft.mainImageUrl) {
      onChange({ mainImageUrl: trimmed });
    } else if (!draft.additionalImageUrls.includes(trimmed)) {
      onChange({ additionalImageUrls: [...draft.additionalImageUrls, trimmed] });
    }
    setNewImageUrl('');
    setShowAddInput(false);
  };

  const hasAnyImages =
    (draft.mainImageUrl && !failedUrls.has(draft.mainImageUrl)) ||
    draft.additionalImageUrls.some((url) => !failedUrls.has(url));

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-5">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-sm">
            6
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900">
              Galeria de Imagens do Produto
            </h3>
            <p className="text-xs text-slate-500">
              Capa principal e fotos adicionais do exemplar para exibição na loja e marketplaces
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowAddInput(!showAddInput)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Adicionar URL</span>
        </button>
      </div>

      {/* Input para adicionar nova imagem por URL */}
      {showAddInput && (
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex gap-2">
          <input
            type="url"
            value={newImageUrl}
            onChange={(e) => setNewImageUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddManualImage();
              }
            }}
            placeholder="Cole o link da imagem (ex: https://.../capa.jpg)"
            className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600"
          />
          <button
            type="button"
            onClick={handleAddManualImage}
            className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
          >
            Adicionar
          </button>
        </div>
      )}

      {/* Visualização de Imagens */}
      {!hasAnyImages && !draft.mainImageUrl ? (
        <div className="border border-dashed border-slate-300 rounded-xl p-8 text-center flex flex-col items-center justify-center bg-slate-50/50">
          <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mb-2">
            <BookOpen className="w-6 h-6 stroke-[1.4]" />
          </div>
          <p className="text-sm font-semibold text-slate-700">Sem fotos no momento</p>
          <p className="text-xs text-slate-500 max-w-sm mt-0.5">
            A pesquisa não encontrou imagens digitais para este ISBN. Você pode inserir um link ou o produto será cadastrado com capa padrão.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-start">
          {/* Imagem Principal em Destaque */}
          <div className="sm:col-span-5 flex flex-col items-center">
            <span className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5 self-start">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
              <span>Capa Principal</span>
            </span>

            <div className="w-full max-w-[220px] aspect-[3/4] rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shadow-sm relative group">
              {draft.mainImageUrl && !failedUrls.has(draft.mainImageUrl) ? (
                <>
                  <img
                    src={draft.mainImageUrl}
                    alt="Capa principal"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    onError={() => handleImageError(draft.mainImageUrl!)}
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(draft.mainImageUrl!, true)}
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white hover:bg-red-600 transition-colors opacity-90 sm:opacity-0 group-hover:opacity-100 cursor-pointer"
                    title="Remover capa principal"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center text-slate-400">
                  <ImageIcon className="w-10 h-10 text-slate-300 mb-1" />
                  <span className="text-xs font-mono">Sem capa principal</span>
                </div>
              )}
            </div>
          </div>

          {/* Miniaturas Adicionais */}
          <div className="sm:col-span-7">
            <span className="text-xs font-bold text-slate-700 mb-2 block">
              Fotos Adicionais ({draft.additionalImageUrls.length})
            </span>

            {draft.additionalImageUrls.length === 0 ? (
              <p className="text-xs text-slate-400 italic bg-slate-50 p-4 rounded-lg border border-slate-100">
                Nenhuma foto adicional no momento. O produto usará apenas a capa principal.
              </p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {draft.additionalImageUrls.map((imgUrl, idx) => (
                  <div
                    key={`${imgUrl}-${idx}`}
                    className="group relative aspect-[3/4] rounded-lg border border-slate-200 bg-slate-100 overflow-hidden shadow-2xs"
                  >
                    {!failedUrls.has(imgUrl) ? (
                      <>
                        <img
                          src={imgUrl}
                          alt=""
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                          onError={() => handleImageError(imgUrl)}
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-between p-1.5">
                          <button
                            type="button"
                            onClick={() => handleSetMain(imgUrl)}
                            className="p-1 rounded bg-white text-slate-800 text-[10px] font-bold flex items-center gap-1 hover:bg-amber-100 cursor-pointer shadow-xs"
                            title="Tornar capa principal"
                          >
                            <Star className="w-3 h-3 text-amber-500 fill-amber-400" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveImage(imgUrl, false)}
                            className="p-1 rounded bg-red-600 text-white hover:bg-red-700 cursor-pointer shadow-xs"
                            title="Remover foto"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400">
                        Indisponível
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
