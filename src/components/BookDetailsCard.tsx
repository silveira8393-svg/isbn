/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { BookInfo } from '../types';
import {
  Building2,
  Calendar,
  BookOpen,
  Globe,
  Copy,
  Check,
  Ruler,
  Hash,
  Bookmark,
  FileText,
  Image as ImageIcon,
  Tag,
} from 'lucide-react';

interface BookDetailsCardProps {
  book: BookInfo;
}

export default function BookDetailsCard({ book }: BookDetailsCardProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [failedImageUrls, setFailedImageUrls] = useState<Set<string>>(new Set());

  // Limpa conjunto de imagens que falharam ao trocar de livro
  useEffect(() => {
    setFailedImageUrls(new Set());
  }, [book.id, book.isbn13]);

  // Lista única e sanitizada de todas as URLs brutas de imagens
  const rawImages = Array.from(
    new Set(
      [book.coverUrl, book.thumbnailUrl, ...(book.additionalImages || [])].filter(
        (img): img is string => typeof img === 'string' && img.trim().length > 0
      )
    )
  );

  // Somente URLs válidas que não falharam no carregamento
  const validImages = rawImages.filter((img) => !failedImageUrls.has(img));

  // Regra de prioridade/fallback da capa principal:
  // book.coverUrl -> book.thumbnailUrl -> primeira imagem válida restante
  const defaultCover =
    (book.coverUrl && !failedImageUrls.has(book.coverUrl) && book.coverUrl) ||
    (book.thumbnailUrl && !failedImageUrls.has(book.thumbnailUrl) && book.thumbnailUrl) ||
    validImages[0] ||
    undefined;

  const [activeCoverSrc, setActiveCoverSrc] = useState<string | undefined>(defaultCover);

  useEffect(() => {
    setActiveCoverSrc(defaultCover);
  }, [defaultCover]);

  const currentCover =
    activeCoverSrc && !failedImageUrls.has(activeCoverSrc)
      ? activeCoverSrc
      : defaultCover;

  const handleImageError = (failedUrl?: string) => {
    if (!failedUrl) return;
    setFailedImageUrls((prev) => {
      if (prev.has(failedUrl)) return prev;
      const next = new Set(prev);
      next.add(failedUrl);
      return next;
    });
  };

  const handleCopy = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => {
      setCopiedField(null);
    }, 1800);
  };

  const formatPublishedDate = (rawDate?: string, year?: number | string) => {
    if (year) return String(year);
    if (!rawDate) return undefined;
    const parts = rawDate.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return rawDate;
  };

  const formatLanguage = (lang?: string) => {
    if (!lang) return undefined;
    const clean = lang.trim().toLowerCase();
    const dict: Record<string, string> = {
      pt: 'Português',
      portugues: 'Português',
      português: 'Português',
      en: 'Inglês',
      ingles: 'Inglês',
      inglês: 'Inglês',
      es: 'Espanhol',
      espanhol: 'Espanhol',
      fr: 'Francês',
      frances: 'Francês',
      francês: 'Francês',
      de: 'Alemão',
      alemao: 'Alemão',
      alemão: 'Alemão',
      it: 'Italiano',
      italiano: 'Italiano',
    };
    return dict[clean] || lang;
  };

  const formatEdition = (edition?: string) => {
    if (!edition) return undefined;
    const trimmed = edition.trim();
    if (/^\d+$/.test(trimmed)) {
      return `${trimmed}ª edição`;
    }
    return trimmed;
  };

  const formatPages = (pages?: number) => {
    if (pages === undefined || pages === null) return undefined;
    return `${pages} páginas`;
  };

  const formatWeight = () => {
    if (book.weight === undefined || book.weight === null) return undefined;
    const num =
      typeof book.weight === 'number'
        ? book.weight
        : Number(String(book.weight).replace(',', '.'));
    if (!Number.isFinite(num) || num <= 0) return undefined;

    // Converte kg para gramas quando aplicável (ex.: 0.502 kg -> 502 g)
    let grams: number;
    if (book.weightUnit === 'kg') {
      grams = num < 15 ? Math.round(num * 1000) : Math.round(num);
    } else {
      grams = Math.round(num);
    }
    return `${grams.toLocaleString('pt-BR')} g`;
  };

  const formatDimensions = () => {
    const hasW = book.width !== undefined && book.width !== null;
    const hasH = book.height !== undefined && book.height !== null;
    const hasD = book.depth !== undefined && book.depth !== null;

    if (!hasW && !hasH && !hasD) return undefined;

    const unit = book.dimensionsUnit || 'cm';
    const fmt = (v: number) =>
      Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

    if (hasW && hasH && hasD) {
      return `${fmt(book.width!)} × ${fmt(book.height!)} × ${fmt(book.depth!)} ${unit}`;
    }
    if (hasW && hasH) {
      return `${fmt(book.width!)} × ${fmt(book.height!)} ${unit}`;
    }
    return undefined;
  };

  // Helper defensivo para checar valores válidos
  const hasValue = (val: unknown): boolean => {
    if (val === null || val === undefined) return false;
    if (typeof val === 'string') return val.trim().length > 0;
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === 'number') return !Number.isNaN(val);
    return true;
  };

  const categoryDisplay =
    book.productCategory ||
    (book.categories && book.categories.length > 0 ? book.categories.join(', ') : undefined);

  // Imagens adicionais válidas que não duplicam a capa principal padrão
  const additionalImages = validImages.filter((img) => img !== defaultCover);

  const hasAnyBibliographic =
    hasValue(book.title) ||
    hasValue(book.subtitle) ||
    hasValue(book.authors) ||
    hasValue(book.publisher) ||
    hasValue(book.year) ||
    hasValue(book.publishedDate) ||
    hasValue(book.edition) ||
    hasValue(book.language) ||
    hasValue(book.origin) ||
    hasValue(book.pageCount) ||
    hasValue(categoryDisplay) ||
    hasValue(book.department) ||
    hasValue(book.location);

  const hasAnyPhysical =
    hasValue(book.format) ||
    hasValue(formatWeight()) ||
    hasValue(book.width) ||
    hasValue(book.height) ||
    hasValue(book.depth) ||
    hasValue(formatDimensions());

  const hasAnyIdentification =
    hasValue(book.isbn13) ||
    hasValue(book.isbn10) ||
    hasValue(book.reference);

  const hasSynopsis = hasValue(book.synopsis) || hasValue(book.description);
  const synopsisText = book.synopsis || book.description;

  return (
    <div className="space-y-6 animate-fade-in w-full">
      {/* ========================================================
          1. CABEÇALHO DO LIVRO & RESUMO RÁPIDO
          ======================================================== */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 sm:p-7">
        <div className="flex flex-col md:flex-row gap-6 lg:gap-8 items-start">
          {/* Capa em destaque */}
          <div className="w-full md:w-52 shrink-0 flex flex-col items-center">
            <div className="relative group w-44 md:w-48 aspect-[3/4] bg-slate-100 rounded-xl overflow-hidden border border-slate-200 shadow-sm flex items-center justify-center">
              {currentCover ? (
                <img
                  src={currentCover}
                  alt={`Capa do livro ${book.title}`}
                  className="w-full h-full object-cover select-none"
                  referrerPolicy="no-referrer"
                  onError={() => handleImageError(currentCover)}
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-4 text-center text-slate-400">
                  <BookOpen className="w-12 h-12 stroke-[1.2] text-slate-300 mb-2" />
                  <span className="text-xs font-mono font-medium">Sem capa digital</span>
                </div>
              )}
            </div>

            {/* Miniaturas de imagens adicionais válidas abaixo da capa principal */}
            {additionalImages.length > 0 && defaultCover && (
              <div className="mt-3 flex flex-wrap gap-2 justify-center max-w-[200px]">
                <button
                  type="button"
                  onClick={() => setActiveCoverSrc(defaultCover)}
                  className={`w-10 h-14 rounded-md border overflow-hidden transition-all cursor-pointer ${
                    currentCover === defaultCover
                      ? 'border-blue-600 ring-2 ring-blue-500/20 shadow-xs'
                      : 'border-slate-200 opacity-70 hover:opacity-100'
                  }`}
                  title="Capa principal"
                >
                  <img
                    src={defaultCover}
                    alt="Capa principal"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    onError={() => handleImageError(defaultCover)}
                  />
                </button>
                {additionalImages.map((img, idx) => (
                  <button
                    key={img}
                    type="button"
                    onClick={() => setActiveCoverSrc(img)}
                    className={`w-10 h-14 rounded-md border overflow-hidden transition-all cursor-pointer ${
                      currentCover === img
                        ? 'border-blue-600 ring-2 ring-blue-500/20 shadow-xs'
                        : 'border-slate-200 opacity-70 hover:opacity-100'
                    }`}
                    title={`Imagem adicional ${idx + 1}`}
                  >
                    <img
                      src={img}
                      alt={`Miniatura adicional ${idx + 1}`}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                      onError={() => handleImageError(img)}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Informações Principais */}
          <div className="flex-1 min-w-0 w-full">
            {/* Categoria / Tags */}
            {hasValue(categoryDisplay) && (
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-0.5 rounded-md">
                  <Bookmark className="w-3 h-3 text-blue-600" />
                  {categoryDisplay}
                </span>
                {hasValue(book.department) && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded-md">
                    <Tag className="w-3 h-3 text-slate-500" />
                    {book.department}
                  </span>
                )}
              </div>
            )}

            {/* Título & Subtítulo */}
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight leading-snug">
              {book.title}
            </h2>

            {hasValue(book.subtitle) && (
              <p className="text-base text-slate-600 font-normal mt-1 leading-normal">
                {book.subtitle}
              </p>
            )}

            {/* Autores */}
            {book.authors && book.authors.length > 0 ? (
              <p className="text-sm font-semibold text-blue-700 mt-2">
                por {book.authors.join(', ')}
              </p>
            ) : (
              <p className="text-sm text-slate-400 italic mt-2">
                Autor não informado
              </p>
            )}

            {/* Metadados essenciais (Editora, Ano, Idioma) */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2.5 text-xs text-slate-600 font-medium">
              {hasValue(book.publisher) && (
                <span className="flex items-center gap-1.5 text-slate-700">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  {book.publisher}
                </span>
              )}
              {hasValue(formatPublishedDate(book.publishedDate, book.year)) && (
                <span className="flex items-center gap-1.5 text-slate-700">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  Ano: {formatPublishedDate(book.publishedDate, book.year)}
                </span>
              )}
              {hasValue(book.language) && (
                <span className="flex items-center gap-1.5 text-slate-700">
                  <Globe className="w-3.5 h-3.5 text-slate-400" />
                  {formatLanguage(book.language)}
                </span>
              )}
            </div>

            {/* 3. Cards Rápidos de Resumo Dinâmico (formato, páginas, peso, dimensões sem truncar) */}
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2.5 mt-5">
              {hasValue(book.format) && (
                <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3 min-w-0">
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 block mb-0.5">
                    Formato
                  </span>
                  <p className="text-xs font-bold text-slate-900 truncate" title={book.format}>
                    {book.format}
                  </p>
                </div>
              )}

              {hasValue(book.pageCount) && (
                <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3 min-w-0">
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 block mb-0.5">
                    Páginas
                  </span>
                  <p className="text-xs font-bold text-slate-900">
                    {formatPages(book.pageCount)}
                  </p>
                </div>
              )}

              {hasValue(formatWeight()) && (
                <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3 min-w-0">
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 block mb-0.5">
                    Peso
                  </span>
                  <p className="text-xs font-bold text-slate-900">
                    {formatWeight()}
                  </p>
                </div>
              )}

              {/* CARD DE DIMENSÕES: Apresentação ajustada para comportar o texto completo sem truncar */}
              {hasValue(formatDimensions()) && (
                <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-2.5 sm:p-3 min-w-0 flex flex-col justify-center">
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 block mb-0.5">
                    Dimensões
                  </span>
                  <p
                    className="text-xs font-bold text-slate-900 leading-tight whitespace-normal break-words select-all"
                    title={formatDimensions()}
                  >
                    {formatDimensions()}
                  </p>
                </div>
              )}
            </div>

            {/* Identificadores Rápidos com botão de cópia */}
            <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-slate-100">
              {hasValue(book.isbn13) && (
                <div className="inline-flex items-center bg-slate-50 border border-slate-200 rounded-md overflow-hidden text-xs">
                  <span className="px-2 py-1 bg-slate-100 text-[10px] font-mono font-bold text-slate-600 border-r border-slate-200">
                    ISBN-13
                  </span>
                  <span className="px-2.5 py-1 font-mono font-semibold text-slate-800">
                    {book.isbn13}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(book.isbn13!, 'header-isbn13')}
                    className="p-1 px-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 transition-colors border-l border-slate-200 cursor-pointer"
                    title="Copiar ISBN-13"
                  >
                    {copiedField === 'header-isbn13' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              )}

              {hasValue(book.isbn10) && (
                <div className="inline-flex items-center bg-slate-50 border border-slate-200 rounded-md overflow-hidden text-xs">
                  <span className="px-2 py-1 bg-slate-100 text-[10px] font-mono font-bold text-slate-600 border-r border-slate-200">
                    ISBN-10
                  </span>
                  <span className="px-2.5 py-1 font-mono font-semibold text-slate-800">
                    {book.isbn10}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(book.isbn10!, 'header-isbn10')}
                    className="p-1 px-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 transition-colors border-l border-slate-200 cursor-pointer"
                    title="Copiar ISBN-10"
                  >
                    {copiedField === 'header-isbn10' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              )}

              {hasValue(book.reference) && (
                <div className="inline-flex items-center bg-slate-50 border border-slate-200 rounded-md overflow-hidden text-xs">
                  <span className="px-2 py-1 bg-slate-100 text-[10px] font-mono font-bold text-slate-600 border-r border-slate-200">
                    REF/SKU
                  </span>
                  <span className="px-2.5 py-1 font-mono font-semibold text-slate-800">
                    {book.reference}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(book.reference!, 'header-sku')}
                    className="p-1 px-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 transition-colors border-l border-slate-200 cursor-pointer"
                    title="Copiar Referência/SKU"
                  >
                    {copiedField === 'header-sku' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================
          2. DADOS BIBLIOGRÁFICOS & CARACTERÍSTICAS FÍSICAS (Lado a lado no desktop)
          ======================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Dados Bibliográficos Completos */}
        {hasAnyBibliographic && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
              <BookOpen className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                Dados Bibliográficos
              </h3>
            </div>

            <dl className="grid grid-cols-1 gap-2.5 text-xs">
              {hasValue(book.title) && (
                <div className="flex justify-between py-1.5 border-b border-slate-50">
                  <dt className="text-slate-500 font-medium">Título</dt>
                  <dd className="font-semibold text-slate-900 text-right ml-3">{book.title}</dd>
                </div>
              )}

              {hasValue(book.subtitle) && (
                <div className="flex justify-between py-1.5 border-b border-slate-50">
                  <dt className="text-slate-500 font-medium">Subtítulo</dt>
                  <dd className="font-semibold text-slate-900 text-right ml-3">{book.subtitle}</dd>
                </div>
              )}

              {hasValue(book.authors) && (
                <div className="flex justify-between py-1.5 border-b border-slate-50">
                  <dt className="text-slate-500 font-medium">Autor(es)</dt>
                  <dd className="font-semibold text-slate-900 text-right ml-3">
                    {book.authors?.join(', ')}
                  </dd>
                </div>
              )}

              {hasValue(book.publisher) && (
                <div className="flex justify-between py-1.5 border-b border-slate-50">
                  <dt className="text-slate-500 font-medium">Editora</dt>
                  <dd className="font-semibold text-slate-900 text-right ml-3">{book.publisher}</dd>
                </div>
              )}

              {hasValue(formatPublishedDate(book.publishedDate, book.year)) && (
                <div className="flex justify-between py-1.5 border-b border-slate-50">
                  <dt className="text-slate-500 font-medium">Ano</dt>
                  <dd className="font-semibold text-slate-900 text-right ml-3">
                    {formatPublishedDate(book.publishedDate, book.year)}
                  </dd>
                </div>
              )}

              {hasValue(formatEdition(book.edition)) && (
                <div className="flex justify-between py-1.5 border-b border-slate-50">
                  <dt className="text-slate-500 font-medium">Edição</dt>
                  <dd className="font-semibold text-slate-900 text-right ml-3">
                    {formatEdition(book.edition)}
                  </dd>
                </div>
              )}

              {hasValue(book.language) && (
                <div className="flex justify-between py-1.5 border-b border-slate-50">
                  <dt className="text-slate-500 font-medium">Idioma</dt>
                  <dd className="font-semibold text-slate-900 text-right ml-3">
                    {formatLanguage(book.language)}
                  </dd>
                </div>
              )}

              {hasValue(book.origin) && (
                <div className="flex justify-between py-1.5 border-b border-slate-50">
                  <dt className="text-slate-500 font-medium">Origem</dt>
                  <dd className="font-semibold text-slate-900 text-right ml-3">{book.origin}</dd>
                </div>
              )}

              {hasValue(book.pageCount) && (
                <div className="flex justify-between py-1.5 border-b border-slate-50">
                  <dt className="text-slate-500 font-medium">Número de Páginas</dt>
                  <dd className="font-semibold text-slate-900 text-right ml-3 font-mono">
                    {book.pageCount}
                  </dd>
                </div>
              )}

              {hasValue(categoryDisplay) && (
                <div className="flex justify-between py-1.5 border-b border-slate-50">
                  <dt className="text-slate-500 font-medium">Categoria</dt>
                  <dd className="font-semibold text-slate-900 text-right ml-3">{categoryDisplay}</dd>
                </div>
              )}

              {hasValue(book.department) && (
                <div className="flex justify-between py-1.5 border-b border-slate-50">
                  <dt className="text-slate-500 font-medium">Departamento</dt>
                  <dd className="font-semibold text-slate-900 text-right ml-3">{book.department}</dd>
                </div>
              )}

              {hasValue(book.location) && (
                <div className="flex justify-between py-1.5 border-b border-slate-50">
                  <dt className="text-slate-500 font-medium">Local de Publicação</dt>
                  <dd className="font-semibold text-slate-900 text-right ml-3">{book.location}</dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {/* Características Físicas Completas */}
        {hasAnyPhysical && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
              <Ruler className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                Características Físicas
              </h3>
            </div>

            <dl className="grid grid-cols-1 gap-2.5 text-xs">
              {hasValue(book.format) && (
                <div className="flex justify-between py-1.5 border-b border-slate-50">
                  <dt className="text-slate-500 font-medium">Formato / Acabamento</dt>
                  <dd className="font-semibold text-slate-900 text-right ml-3">{book.format}</dd>
                </div>
              )}

              {hasValue(formatWeight()) && (
                <div className="flex justify-between py-1.5 border-b border-slate-50">
                  <dt className="text-slate-500 font-medium">Peso</dt>
                  <dd className="font-semibold text-slate-900 text-right ml-3 font-mono">
                    {formatWeight()}
                  </dd>
                </div>
              )}

              {hasValue(book.width) && (
                <div className="flex justify-between py-1.5 border-b border-slate-50">
                  <dt className="text-slate-500 font-medium">Largura</dt>
                  <dd className="font-semibold text-slate-900 text-right ml-3 font-mono">
                    {Number(book.width).toLocaleString('pt-BR')} cm
                  </dd>
                </div>
              )}

              {hasValue(book.height) && (
                <div className="flex justify-between py-1.5 border-b border-slate-50">
                  <dt className="text-slate-500 font-medium">Altura</dt>
                  <dd className="font-semibold text-slate-900 text-right ml-3 font-mono">
                    {Number(book.height).toLocaleString('pt-BR')} cm
                  </dd>
                </div>
              )}

              {hasValue(book.depth) && (
                <div className="flex justify-between py-1.5 border-b border-slate-50">
                  <dt className="text-slate-500 font-medium">Profundidade / Comprimento</dt>
                  <dd className="font-semibold text-slate-900 text-right ml-3 font-mono">
                    {Number(book.depth).toLocaleString('pt-BR')} cm
                  </dd>
                </div>
              )}

              {hasValue(formatDimensions()) && (
                <div className="flex justify-between py-1.5 border-b border-slate-50">
                  <dt className="text-slate-500 font-medium">Dimensões Completas</dt>
                  <dd className="font-semibold text-slate-900 text-right ml-3 font-mono">
                    {formatDimensions()}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}
      </div>

      {/* ========================================================
          3. IDENTIFICAÇÃO E CATALOGAÇÃO (Sem o card de Provider/Fonte)
          ======================================================== */}
      {hasAnyIdentification && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
            <Hash className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
              Identificação e Catalogação
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            {hasValue(book.isbn13) && (
              <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200/80 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                    ISBN-13 / EAN
                  </span>
                  <span className="font-mono font-bold text-slate-900 text-sm break-all">
                    {book.isbn13}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(book.isbn13!, 'cat-isbn13')}
                  className="mt-2.5 inline-flex items-center gap-1.5 text-xs text-blue-700 hover:text-blue-900 font-medium cursor-pointer"
                >
                  {copiedField === 'cat-isbn13' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {hasValue(book.isbn10) && (
              <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200/80 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                    ISBN-10
                  </span>
                  <span className="font-mono font-bold text-slate-900 text-sm break-all">
                    {book.isbn10}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(book.isbn10!, 'cat-isbn10')}
                  className="mt-2.5 inline-flex items-center gap-1.5 text-xs text-blue-700 hover:text-blue-900 font-medium cursor-pointer"
                >
                  {copiedField === 'cat-isbn10' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {hasValue(book.reference) && (
              <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200/80 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                    Referência / SKU
                  </span>
                  <span className="font-mono font-bold text-slate-900 text-sm break-all">
                    {book.reference}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(book.reference!, 'cat-sku')}
                  className="mt-2.5 inline-flex items-center gap-1.5 text-xs text-blue-700 hover:text-blue-900 font-medium cursor-pointer"
                >
                  {copiedField === 'cat-sku' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================
          4. SINOPSE INTEGRAL (Seção própria)
          ======================================================== */}
      {hasSynopsis && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
            <FileText className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
              Sinopse
            </h3>
          </div>
          <div className="text-slate-700 text-sm sm:text-base leading-relaxed whitespace-pre-wrap font-normal">
            {synopsisText}
          </div>
        </div>
      )}

      {/* ========================================================
          5. CAPA E IMAGENS ADICIONAIS VÁLIDAS (Seção dedicada)
          Renderizada SOMENTE se houver imagens adicionais válidas e não duplicadas
          ======================================================== */}
      {additionalImages.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
            <ImageIcon className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
              Capa e Imagens
            </h3>
            <span className="text-xs text-slate-400 font-normal">
              ({additionalImages.length} {additionalImages.length === 1 ? 'imagem adicional disponível' : 'imagens adicionais disponíveis'})
            </span>
          </div>

          <div className="flex flex-wrap gap-4 items-start">
            {additionalImages.map((img, idx) => (
              <div
                key={img}
                onClick={() => setActiveCoverSrc(img)}
                className={`group relative flex flex-col items-center p-2 rounded-xl border transition-all cursor-pointer bg-slate-50 ${
                  currentCover === img
                    ? 'border-blue-600 ring-2 ring-blue-500/20 shadow-xs bg-blue-50/20'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
                title="Clique para visualizar em destaque"
              >
                <div className="w-24 sm:w-28 aspect-[3/4] rounded-lg overflow-hidden bg-white border border-slate-200/80 shadow-xs">
                  <img
                    src={img}
                    alt={`Imagem adicional ${idx + 1}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    onError={() => handleImageError(img)}
                  />
                </div>
                <span className="text-[11px] font-medium text-slate-600 mt-2">
                  Imagem adicional {idx + 1}
                </span>
                {currentCover === img && (
                  <span className="text-[10px] font-semibold text-blue-600 mt-0.5">
                    Visualizando
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
