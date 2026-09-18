/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { BookInfo } from '../types';
import { getMarketplaceLinks } from '../utils/isbn';
import { 
  Building, 
  Calendar, 
  BookOpen, 
  Globe, 
  Copy, 
  Check, 
  ExternalLink, 
  Tag, 
  Bookmark,
  ShoppingBag,
  Store,
  ChevronDown,
  ChevronUp,
  Ruler,
  Scale
} from 'lucide-react';

interface BookDetailsCardProps {
  book: BookInfo;
}

export default function BookDetailsCard({ book }: BookDetailsCardProps) {
  const [copiedField, setCopiedField] = useState<'isbn10' | 'isbn13' | null>(null);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [showCompleteRecord, setShowCompleteRecord] = useState(false);
  const [coverSrc, setCoverSrc] = useState(book.thumbnailUrl);
  const [searchMode, setSearchMode] = useState<'isbn' | 'title'>('title');

  const links = getMarketplaceLinks({
    isbn13: book.isbn13,
    isbn10: book.isbn10,
    title: book.title,
    authors: book.authors,
    publisher: book.publisher
  }, searchMode);

  useEffect(() => {
    setCoverSrc(book.thumbnailUrl);
  }, [book.thumbnailUrl]);

  const handleCopy = (text: string, field: 'isbn10' | 'isbn13') => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => {
      setCopiedField(null);
    }, 1800);
  };

  // Process and sanitize published date
  const formatPublishedDate = (rawDate?: string) => {
    if (!rawDate) return 'Sem data';
    // If format is YYYY-MM-DD, try to extract year or make it cleaner
    const parts = rawDate.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`; // standard Brazilian format DD/MM/YYYY
    }
    return rawDate;
  };

  // Convert language codes to recognizable words
  const formatLanguage = (lang?: string) => {
    if (!lang) return 'Indefinido';
    const dict: Record<string, string> = {
      pt: 'Português',
      en: 'Inglês',
      es: 'Espanhol',
      fr: 'Francês',
      de: 'Alemão',
      it: 'Italiano',
    };
    return dict[lang.toLowerCase()] || lang.toUpperCase();
  };

  const formatWeight = () => {
    if (book.weight === undefined) return undefined;
    const grams = book.weightUnit === 'kg' ? book.weight * 1000 : book.weight;
    return `${grams.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} g`;
  };

  const formatDimensions = () => {
    if (book.width === undefined || book.height === undefined || book.depth === undefined) return undefined;
    return `${book.width.toLocaleString('pt-BR')} × ${book.height.toLocaleString('pt-BR')} × ${book.depth.toLocaleString('pt-BR')} ${book.dimensionsUnit || 'cm'}`;
  };

  const isDescriptionLong = (book.description?.length || 0) > 280;
  const renderedDescription = showFullDescription 
    ? book.description 
    : (book.description ? `${book.description.substring(0, 280).trim()}...` : undefined);

  return (
    <div className="bg-white/80 border border-natural-border rounded-2xl shadow-md overflow-hidden animate-fade-in">
      {/* Upper header color band */}
      <div className="h-2.5 bg-gradient-to-r from-natural-accent via-natural-subtitle to-natural-badge" />
      
      <div className="p-5 sm:p-7">
        <div className="flex flex-col md:flex-row gap-6 lg:gap-8">
          
          {/* Cover Art Wrapper */}
          <div className="w-full md:w-52 flex-shrink-0 flex flex-col items-center">
            <div className="relative group w-40 md:w-48 aspect-[3/4] bg-white rounded-xl overflow-hidden transition-all duration-300 shadow-md border border-natural-border flex items-center justify-center">
              {coverSrc ? (
                <img
                  src={coverSrc}
                  alt={`Capa do livro ${book.title}`}
                  className="w-full h-full object-cover select-none"
                  referrerPolicy="no-referrer"
                  id={`book-cover-${book.id}`}
                  onError={() => {
                    const fallback = book.additionalImages?.[0];
                    setCoverSrc(fallback);
                  }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-4 text-center text-natural-subtitle">
                  <BookOpen className="w-12 h-12 stroke-[1.2] text-natural-border mb-2" />
                  <span className="text-xs font-mono font-medium">Sem imagem de capa registrada</span>
                </div>
              )}
            </div>
          </div>

          {/* Book Information Fields */}
          <div className="flex-1 min-w-0">
            {/* Tag/Categories List */}
            {book.categories && book.categories.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {book.categories.map((cat, idx) => (
                  <span 
                    key={idx} 
                    className="inline-flex items-center gap-1 text-[11px] font-semibold bg-natural-badge text-natural-accent border border-natural-border px-2.5 py-0.5 rounded-full"
                    id={`badge-category-${idx}`}
                  >
                    <Bookmark className="w-2.5 h-2.5 shrink-0" />
                    {cat}
                  </span>
                ))}
              </div>
            )}

            {/* Title & Subtitle */}
            <h2 className="text-2xl sm:text-3xl font-serif font-bold text-natural-title tracking-tight leading-tight">
              {book.title}
            </h2>
            {book.subtitle && (
              <p className="text-sm sm:text-base font-sans font-medium text-natural-subtitle mt-1 leading-normal">
                {book.subtitle}
              </p>
            )}

            {/* Authors */}
            {book.authors && book.authors.length > 0 ? (
              <p className="text-sm font-semibold text-natural-accent mt-2">
                por <span className="underline decoration-natural-accent/30">{book.authors.join(', ')}</span>
              </p>
            ) : (
              <p className="text-sm text-natural-subtitle italic mt-2">
                Autor desconhecido ou não informado
              </p>
            )}

            {/* Core Specs Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-5 p-4 bg-white/40 border border-natural-border rounded-xl">
              <div className="space-y-0.5">
                <span className="text-[10px] text-natural-subtitle uppercase tracking-widest font-mono">Editora</span>
                <p className="text-xs font-semibold text-natural-text flex items-center gap-1.5 truncate" title={book.publisher}>
                  <Building className="w-3.5 h-3.5 text-natural-accent/60 shrink-0" />
                  {book.publisher || 'Não informada'}
                </p>
              </div>

              <div className="space-y-0.5">
                <span className="text-[10px] text-natural-subtitle uppercase tracking-widest font-mono">Publicado em</span>
                <p className="text-xs font-semibold text-natural-text flex items-center gap-1.5 truncate">
                  <Calendar className="w-3.5 h-3.5 text-natural-accent/60 shrink-0" />
                  {formatPublishedDate(book.publishedDate)}
                </p>
              </div>

              <div className="space-y-0.5">
                <span className="text-[10px] text-natural-subtitle uppercase tracking-widest font-mono">Páginas</span>
                <p className="text-xs font-semibold text-natural-text flex items-center gap-1.5 truncate">
                  <BookOpen className="w-3.5 h-3.5 text-natural-accent/60 shrink-0" />
                  {book.pageCount ? `${book.pageCount} págs` : 'Não informado'}
                </p>
              </div>

              <div className="space-y-0.5">
                <span className="text-[10px] text-natural-subtitle uppercase tracking-widest font-mono">Idioma</span>
                <p className="text-xs font-semibold text-natural-text flex items-center gap-1.5 truncate">
                  <Globe className="w-3.5 h-3.5 text-natural-accent/60 shrink-0" />
                  {formatLanguage(book.language)}
                </p>
              </div>

              <div className="space-y-0.5">
                <span className="text-[10px] text-natural-subtitle uppercase tracking-widest font-mono">Formato</span>
                <p className="text-xs font-semibold text-natural-text flex items-center gap-1.5 truncate" title={book.format}>
                  <BookOpen className="w-3.5 h-3.5 text-natural-accent/60 shrink-0" />
                  {book.format || 'Físico'}
                </p>
              </div>

              {book.edition && (
                <div className="space-y-0.5">
                  <span className="text-[10px] text-natural-subtitle uppercase tracking-widest font-mono">Edição</span>
                  <p className="text-xs font-semibold text-natural-text flex items-center gap-1.5 truncate">
                    <Bookmark className="w-3.5 h-3.5 text-natural-accent/60 shrink-0" />
                    {book.edition}ª
                  </p>
                </div>
              )}

              {formatWeight() && (
                <div className="space-y-0.5">
                  <span className="text-[10px] text-natural-subtitle uppercase tracking-widest font-mono">Peso</span>
                  <p className="text-xs font-semibold text-natural-text flex items-center gap-1.5 truncate">
                    <Scale className="w-3.5 h-3.5 text-natural-accent/60 shrink-0" />
                    {formatWeight()}
                  </p>
                </div>
              )}

              {formatDimensions() && (
                <div className="space-y-0.5 md:col-span-2">
                  <span className="text-[10px] text-natural-subtitle uppercase tracking-widest font-mono">Dimensões</span>
                  <p className="text-xs font-semibold text-natural-text flex items-center gap-1.5 truncate">
                    <Ruler className="w-3.5 h-3.5 text-natural-accent/60 shrink-0" />
                    {formatDimensions()}
                  </p>
                </div>
              )}

              <div className="space-y-0.5">
                <span className="text-[10px] text-natural-subtitle uppercase tracking-widest font-mono">Localização</span>
                <p className="text-xs font-semibold text-natural-text flex items-center gap-1.5 truncate" title={book.location}>
                  <Globe className="w-3.5 h-3.5 text-natural-accent/60 shrink-0" />
                  {book.location || 'Não informada'}
                </p>
              </div>

              <div className="space-y-0.5">
                <span className="text-[10px] text-natural-subtitle uppercase tracking-widest font-mono">Provedor</span>
                <p className="text-xs font-bold text-natural-accent flex items-center gap-1.5 truncate">
                  <Bookmark className="w-3.5 h-3.5 text-natural-accent/60 shrink-0" />
                  <span className="uppercase">{book.provider || 'Não informado'}</span>
                </p>
              </div>
            </div>

            {/* Synopsis / Description Area */}
            {book.description ? (
              <div className="mt-5">
                <h3 className="text-xs font-semibold text-natural-subtitle uppercase tracking-widest font-mono mb-1.5">Sinopse / Descrição</h3>
                <div className="text-xs text-natural-text leading-relaxed font-normal bg-white/50 p-3.5 rounded-xl border border-natural-border">
                  <p className="whitespace-pre-wrap">{renderedDescription}</p>
                  
                  {isDescriptionLong && (
                    <button
                      onClick={() => setShowFullDescription(!showFullDescription)}
                      id="btn-toggle-description"
                      className="mt-2 text-natural-accent hover:text-natural-accent-hover font-bold flex items-center gap-1 text-[11px] hover:underline cursor-pointer select-none"
                    >
                      {showFullDescription ? (
                        <>
                          <span>Ler menos</span>
                          <ChevronUp className="w-3 h-3" />
                        </>
                      ) : (
                        <>
                          <span>Ler sinopse completa</span>
                          <ChevronDown className="w-3 h-3" />
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-5">
                <h3 className="text-xs font-semibold text-natural-subtitle uppercase tracking-widest font-mono mb-1.5">Sinopse</h3>
                <p className="text-xs text-natural-subtitle italic">Nenhuma descrição ou sinopse enviada pela editora.</p>
              </div>
            )}

            <div className="mt-5 border-t border-natural-border pt-4">
              <button
                type="button"
                onClick={() => setShowCompleteRecord(!showCompleteRecord)}
                className="text-xs font-bold text-natural-accent hover:text-natural-accent-hover flex items-center gap-1.5 cursor-pointer"
                aria-expanded={showCompleteRecord}
              >
                <span>{showCompleteRecord ? 'Ocultar ficha completa' : 'Ver ficha completa'}</span>
                {showCompleteRecord ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {showCompleteRecord && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs animate-fade-in">
                  <div className="space-y-2 rounded-xl border border-natural-border bg-white/45 p-3">
                    <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-natural-subtitle">Dados bibliográficos</h3>
                    <p><strong>Título:</strong> {book.title}</p>
                    {book.authors?.length ? <p><strong>Autor(es):</strong> {book.authors.join(', ')}</p> : null}
                    {book.publisher ? <p><strong>Editora:</strong> {book.publisher}</p> : null}
                    {book.year ? <p><strong>Ano:</strong> {book.year}</p> : null}
                    {book.edition ? <p><strong>Edição:</strong> {book.edition}</p> : null}
                    {book.language ? <p><strong>Idioma:</strong> {formatLanguage(book.language)}</p> : null}
                    {book.origin ? <p><strong>Origem:</strong> {book.origin}</p> : null}
                    {book.pageCount ? <p><strong>Páginas:</strong> {book.pageCount}</p> : null}
                  </div>

                  <div className="space-y-2 rounded-xl border border-natural-border bg-white/45 p-3">
                    <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-natural-subtitle">Características físicas</h3>
                    {book.format ? <p><strong>Formato:</strong> {book.format}</p> : null}
                    {formatWeight() ? <p><strong>Peso:</strong> {formatWeight()}</p> : null}
                    {book.width !== undefined ? <p><strong>Largura:</strong> {book.width.toLocaleString('pt-BR')} cm</p> : null}
                    {book.height !== undefined ? <p><strong>Altura:</strong> {book.height.toLocaleString('pt-BR')} cm</p> : null}
                    {book.depth !== undefined ? <p><strong>Profundidade:</strong> {book.depth.toLocaleString('pt-BR')} cm</p> : null}
                    {formatDimensions() ? <p><strong>Dimensões:</strong> {formatDimensions()}</p> : null}
                  </div>

                  <div className="space-y-2 rounded-xl border border-natural-border bg-white/45 p-3">
                    <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-natural-subtitle">Identificação</h3>
                    {book.isbn13 ? <p><strong>ISBN-13:</strong> {book.isbn13}</p> : null}
                    {book.isbn10 ? <p><strong>ISBN-10:</strong> {book.isbn10}</p> : null}
                    {book.reference ? <p><strong>Referência:</strong> {book.reference}</p> : null}
                    {book.productCategory ? <p><strong>Categoria:</strong> {book.productCategory}</p> : null}
                    {book.department ? <p><strong>Departamento:</strong> {book.department}</p> : null}
                  </div>

                  <div className="space-y-2 rounded-xl border border-natural-border bg-white/45 p-3">
                    <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-natural-subtitle">Conteúdo e imagens</h3>
                    {book.synopsis ? <p><strong>Sinopse:</strong> disponível</p> : null}
                    {book.coverUrl ? <p><strong>Capa:</strong> disponível</p> : null}
                    {book.additionalImages?.length ? (
                      <div>
                        <strong>Imagens adicionais:</strong>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {book.additionalImages.map((image, index) => (
                            <img key={image} src={image} alt={`Imagem adicional ${index + 1}`} className="h-16 w-12 rounded border border-natural-border object-cover" loading="lazy" />
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </div>

            {/* ISBNs Badges with Copy To Clipboard support */}
            <div className="mt-5 pt-4 border-t border-natural-border flex flex-col sm:flex-row sm:items-center gap-4">
              <div>
                <span className="text-[10px] text-natural-subtitle uppercase tracking-widest font-mono block mb-1">Registros de Identificação</span>
                <div className="flex flex-wrap gap-2">
                  {book.isbn13 && (
                    <div className="inline-flex items-center bg-white border border-natural-border rounded-lg overflow-hidden shrink-0 shadow-3xs">
                      <span className="text-[10px] font-mono font-bold bg-natural-badge text-natural-accent px-2 py-1 select-none">
                        ISBN-13
                      </span>
                      <span className="text-xs font-mono font-medium px-2.5 py-1 text-natural-title">
                        {book.isbn13}
                      </span>
                      <button
                        onClick={() => handleCopy(book.isbn13!, 'isbn13')}
                        id="copy-isbn13-btn"
                        className="p-1 px-1.5 bg-natural-bg/30 border-l border-natural-border hover:bg-natural-badge text-natural-text hover:text-natural-title transition-colors select-none cursor-pointer"
                        title="Copiar ISBN-13 para a Área de Trabalho"
                      >
                        {copiedField === 'isbn13' ? (
                          <Check className="w-3.5 h-3.5 text-emerald-800" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  )}

                  {book.isbn10 && (
                    <div className="inline-flex items-center bg-white border border-natural-border rounded-lg overflow-hidden shrink-0 shadow-3xs">
                      <span className="text-[10px] font-mono font-bold bg-natural-badge text-natural-accent px-2 py-1 select-none">
                        ISBN-10
                      </span>
                      <span className="text-xs font-mono font-medium px-2.5 py-1 text-natural-title">
                        {book.isbn10}
                      </span>
                      <button
                        onClick={() => handleCopy(book.isbn10!, 'isbn10')}
                        id="copy-isbn10-btn"
                        className="p-1 px-1.5 bg-natural-bg/30 border-l border-natural-border hover:bg-natural-badge text-natural-text hover:text-natural-title transition-colors select-none cursor-pointer"
                        title="Copiar ISBN-10 para a Área de Trabalho"
                      >
                        {copiedField === 'isbn10' ? (
                          <Check className="w-3.5 h-3.5 text-emerald-800" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  )}

                  {!book.isbn13 && !book.isbn10 && (
                    <span className="text-xs text-natural-subtitle font-mono italic">Sem registro correspondente</span>
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* 5. Marketplace Search Grid */}
        <div className="mt-8 pt-6 border-t border-natural-border">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-natural-accent" />
              <h3 className="text-sm font-serif font-semibold text-natural-title">
                Disponibilidade em Marketplaces (Pesquisa Rápida)
              </h3>
              <span className="text-[10px] text-natural-subtitle font-normal font-sans ml-1 hidden sm:inline">
                (Abre em nova aba)
              </span>
            </div>
            
            {/* Mode selection buttons */}
            <div className="inline-flex bg-natural-badge/70 p-1 rounded-xl border border-natural-border text-xs font-semibold shrink-0">
              <button
                type="button"
                onClick={() => setSearchMode('title')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  searchMode === 'title' 
                    ? 'bg-natural-accent text-white shadow-3xs font-bold' 
                    : 'text-natural-text hover:text-natural-title'
                }`}
              >
                Título + Editora
              </button>
              <button
                type="button"
                onClick={() => setSearchMode('isbn')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  searchMode === 'isbn' 
                    ? 'bg-natural-accent text-white shadow-3xs font-bold' 
                    : 'text-natural-text hover:text-natural-title'
                }`}
              >
                Código ISBN
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Amazon.com.br Button */}
            <a
              href={links.amazon.url}
              target="_blank"
              rel="noopener noreferrer"
              id="search-amazon-link"
              className="bg-[#FF9900] hover:opacity-90 active:opacity-105 text-white font-semibold text-sm flex items-center justify-between p-3.5 rounded-xl transition-all shadow-sm group cursor-pointer border border-[#FF9900]/20"
              title="Pesquisar este livro na Amazon"
            >
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 shrink-0" />
                <span className="font-bold text-xs sm:text-sm">Amazon Brasil</span>
              </div>
              <ExternalLink className="w-4 h-4 opacity-90 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform shrink-0" />
            </a>

            {/* Mercado Livre Button */}
            <a
              href={links.mercadoLivre.url}
              target="_blank"
              rel="noopener noreferrer"
              id="search-mercadolivre-link"
              className="bg-[#FFF159] hover:opacity-90 active:opacity-105 text-[#2D2823] font-semibold text-sm flex items-center justify-between p-3.5 rounded-xl transition-all shadow-sm group cursor-pointer border border-[#FFF159]"
              title="Pesquisar este livro no Mercado Livre"
            >
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4 shrink-0 text-[#2D2823]" />
                <span className="font-bold text-xs sm:text-sm text-[#2D2823]">Mercado Livre</span>
              </div>
              <ExternalLink className="w-4 h-4 text-[#2D2823] opacity-80 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform shrink-0" />
            </a>

            {/* Estante Virtual Button */}
            <a
              href={links.estanteVirtual.url}
              target="_blank"
              rel="noopener noreferrer"
              id="search-estantevirtual-link"
              className="bg-[#004BB4] hover:opacity-90 active:opacity-105 text-white font-semibold text-sm flex items-center justify-between p-3.5 rounded-xl transition-all shadow-sm group cursor-pointer border border-[#004BB4]/20"
              title="Pesquisar este livro na Estante Virtual (Maior rede de sebos do BR)"
            >
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 shrink-0" />
                <span className="font-bold text-xs sm:text-sm">Estante Virtual</span>
              </div>
              <ExternalLink className="w-4 h-4 opacity-90 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform shrink-0" />
            </a>

            {/* Portal ISBN/CBL Button */}
            <a
              href={links.cbl.url}
              target="_blank"
              rel="noopener noreferrer"
              id="search-cbl-link"
              className="bg-[#0F172A] hover:bg-slate-800 active:bg-slate-900 text-white font-semibold text-sm flex items-center justify-between p-3.5 rounded-xl transition-all shadow-sm group cursor-pointer border border-slate-700"
              title="Pesquisar este livro no Portal ISBN/CBL"
            >
              <div className="flex items-center gap-2">
                <Building className="w-4 h-4 shrink-0 text-slate-300" />
                <span className="font-bold text-xs sm:text-sm">Portal ISBN/CBL</span>
              </div>
              <ExternalLink className="w-4 h-4 opacity-90 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform shrink-0" />
            </a>
          </div>

          {/* Secondary alternative search note in case ISBN lookup yields empty items */}
          <div className="mt-4 p-3 bg-white/40 border border-natural-border rounded-xl text-[11px] text-natural-text leading-relaxed flex items-start gap-2 shadow-3xs">
            <span className="font-bold text-natural-accent font-mono">Dica de Sebo:</span>
            <span>
              Se a busca preferencial por código numérico de barras (ISBN) retornar poucos resultados no Mercado Livre ou Amazon, utilize as abas de busca adicionais ou digite o título em nosso buscador acima para orçamentar edições raras ou alternativas.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
