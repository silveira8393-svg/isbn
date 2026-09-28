/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { RegistrationDraft } from '../../types';
import { sanitizeSynopsis } from '../../utils/sanitizer';
import { buildFinalDescription } from '../../utils/draft';
import { FileText, Sparkles, Check, Info, Tag, Eye } from 'lucide-react';

interface SynopsisSectionProps {
  draft: RegistrationDraft;
  onChange: (updates: Partial<RegistrationDraft>) => void;
}

const QUICK_OBSERVATIONS = [
  'Excelente estado',
  'Páginas levemente amareladas',
  'Miolo firme e limpo, sem grifos',
  'Contém grifos a lápis',
  'Leve desgaste nas bordas da capa',
  'Lombada íntegra sem vincos',
];

export default function SynopsisSection({
  draft,
  onChange,
}: SynopsisSectionProps) {
  const [justSanitized, setJustSanitized] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const handleSanitizeSynopsis = () => {
    const cleaned = sanitizeSynopsis(draft.synopsis);
    onChange({
      synopsis: cleaned,
      description: buildFinalDescription({
        ...draft,
        synopsis: cleaned,
      }),
    });
    setJustSanitized(true);
    setTimeout(() => setJustSanitized(false), 2000);
  };

  const handleAppendChip = (chipText: string) => {
    const current = (draft.usedBookConditionNotes || '').trim();
    const updatedNotes = current ? `${current}. ${chipText}` : chipText;
    onChange({
      usedBookConditionNotes: updatedNotes,
      description: buildFinalDescription({
        ...draft,
        usedBookConditionNotes: updatedNotes,
      }),
    });
  };

  const handleConditionNotesChange = (text: string) => {
    onChange({
      usedBookConditionNotes: text,
      description: buildFinalDescription({
        ...draft,
        usedBookConditionNotes: text,
      }),
    });
  };

  const handleSynopsisChange = (text: string) => {
    onChange({
      synopsis: text,
      description: buildFinalDescription({
        ...draft,
        synopsis: text,
      }),
    });
  };

  const isUsado = draft.condition === 'usado';
  const finalPreview = buildFinalDescription(draft);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-5">
      {/* Cabeçalho da Seção */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-sm">
            7
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
              <span>{isUsado ? 'Descrição da Obra (Livro Usado)' : 'Descrição & Sinopse da Obra'}</span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  isUsado
                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                    : 'bg-blue-100 text-blue-800'
                }`}
              >
                {isUsado ? 'Usado: Campo Único Composto' : 'Novo: Sinopse'}
              </span>
            </h3>
            <p className="text-xs text-slate-500">
              {isUsado
                ? 'Campo único de descrição no Magazord: estado físico do exemplar + linha em branco + sinopse'
                : 'Texto comercial único exibido na página do produto na Magazord e marketplaces'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isUsado && (
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
              title="Pré-visualizar como o texto final será composto para o Magazord"
            >
              <Eye className="w-3.5 h-3.5 text-slate-500" />
              <span>{showPreview ? 'Ocultar Prévia' : 'Prévia Magazord'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleSanitizeSynopsis}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
            title="Remove tags HTML estranhas da sinopse e normaliza quebras de linha"
          >
            {justSanitized ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-700 font-semibold">Sinopse Sanitizada!</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                <span>Limpar Sinopse</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Alerta explicativo quando USADO: Destino Único na Magazord */}
      {isUsado && (
        <div className="bg-amber-50/80 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-bold">
              Essas informações serão unidas na descrição final do produto.
            </p>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              O Magazord utiliza um campo único de descrição. No envio, o <strong>Estado do exemplar</strong> será posicionado no topo, seguido de uma <strong>linha em branco</strong> e da <strong>sinopse da obra</strong>.
            </p>
          </div>
        </div>
      )}

      {/* ÁREA 1: ESTADO DO EXEMPLAR (Exibida SOMENTE quando USADO) */}
      {isUsado && (
        <div className="space-y-2 bg-slate-50/70 p-4 rounded-xl border border-slate-200">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-amber-600" />
              <span>Estado do exemplar</span>
              <span className="text-[10px] font-normal text-slate-500 font-mono">(edição manual e livre)</span>
            </label>
            <span className="text-[11px] text-slate-400">
              Topo da descrição Magazord
            </span>
          </div>

          <textarea
            rows={3}
            value={draft.usedBookConditionNotes || ''}
            onChange={(e) => handleConditionNotesChange(e.target.value)}
            placeholder="Ex: Bom estado de conservação, páginas amareladas pelo tempo, miolo firme e sem anotações..."
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-600"
          />

          {/* Atalhos opcionais em chips (sem obrigar modelos prontos) */}
          <div>
            <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Sugestões rápidas de preenchimento (opcional):
            </span>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_OBSERVATIONS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleAppendChip(chip)}
                  className="text-[11px] px-2.5 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700 hover:bg-amber-50 hover:border-amber-300 transition-colors cursor-pointer shadow-2xs font-medium"
                >
                  + {chip}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ÁREA 2: SINOPSE / RESUMO (Tanto para NOVO quanto para USADO) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-blue-600" />
            <span>{isUsado ? 'Sinopse / resumo da obra' : 'Sinopse / resumo'}</span>
            <span className="text-[10px] font-normal text-slate-500 font-mono">(pré-preenchida e editável)</span>
          </label>
          <span className="text-[11px] text-slate-400">
            {isUsado ? 'Abaixo do estado do exemplar' : 'Conteúdo exclusivo da descrição'}
          </span>
        </div>

        <textarea
          rows={isUsado ? 5 : 6}
          value={draft.synopsis}
          onChange={(e) => handleSynopsisChange(e.target.value)}
          placeholder="Sinopse ou descrição do livro (pré-preenchida das fontes oficiais)..."
          className="w-full px-3.5 py-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600"
        />

        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
          <span>Preserva parágrafos limpos para envio à API Magazord.</span>
          <span>{draft.synopsis ? `${draft.synopsis.length} caracteres` : '0 caracteres'}</span>
        </div>
      </div>

      {/* PRÉVIA DO TEXTO FINAL COMPOSTO (Quando acionado ou quando houver notas) */}
      {(showPreview || (isUsado && Boolean((draft.usedBookConditionNotes || '').trim()))) && (
        <div className="border border-slate-200 bg-slate-50 rounded-xl p-3.5 space-y-1.5 text-xs animate-fade-in">
          <div className="flex items-center justify-between text-slate-600 font-semibold text-[11px]">
            <span className="flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-blue-600" />
              <span>Prévia da Descrição Final Composta no Envio:</span>
            </span>
            <span className="font-mono text-slate-400">
              {finalPreview.length} caracteres totais
            </span>
          </div>

          <div className="p-3 bg-white rounded-lg border border-slate-200 text-slate-700 whitespace-pre-line leading-relaxed font-sans text-xs max-h-48 overflow-y-auto">
            {finalPreview || <span className="text-slate-400 italic">Nenhum texto preenchido ainda.</span>}
          </div>
        </div>
      )}
    </div>
  );
}
