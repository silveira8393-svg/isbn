/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import Header from './components/Header';
import SearchForm from './components/SearchForm';
import BookDetailsCard from './components/BookDetailsCard';
import SearchHistoryGroup from './components/SearchHistoryGroup';
import FutureExpansions from './components/FutureExpansions';
import { BookInfo, SearchHistoryItem } from './types';
import { searchBookByIsbnBrasilApi } from './services/brasilApi';
import { cleanIsbn } from './utils/isbn';
import { 
  BookMarked, 
  AlertCircle, 
  ExternalLink,
  ChevronRight, 
  HelpCircle,
  Sparkles,
  ShoppingBag,
  Store,
  BookOpen,
  Building
} from 'lucide-react';

export default function App() {
  const [isbnValue, setIsbnValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [foundBook, setFoundBook] = useState<BookInfo | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [searchedTerm, setSearchedTerm] = useState<string>('');
  const [rawSearchedTerm, setRawSearchedTerm] = useState<string>('');
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [lastDiagnostic, setLastDiagnostic] = useState<{
    endpoint: string;
    status: number | string;
    provider?: string;
    responseTimeMs: number;
    authorsCount: number;
    categoriesCount: number;
    apiErrorMessage?: string;
  } | null>(null);

  // Connection Status Indicator helper
  const getStatusIndicator = () => {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse animate-duration-1500" />
        🟢 BrasilAPI
      </span>
    );
  };

  // Load history from localStorage on startup
  useEffect(() => {
    try {
      const saved = localStorage.getItem('sebo_isbn_history_v1');
      if (saved) {
        setHistory(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Failed to load search history', e);
    }
  }, []);

  // Handler to carry out lookup
  const handleSearch = async (targetIsbn: string) => {
    const cleaned = cleanIsbn(targetIsbn);
    if (!cleaned) {
      setErrorText('Por favor, informe um código ISBN válido.');
      return;
    }

    setIsLoading(true);
    setErrorText(null);
    setFoundBook(null);
    setSearchedTerm(cleaned);
    setRawSearchedTerm(targetIsbn);

    try {
      const result = await searchBookByIsbnBrasilApi(cleaned);
      setLastDiagnostic(result.diagnostic);

      if (result.book) {
        setFoundBook(result.book);
        
        // Add item to history (limit to 12 items to prevent bloat)
        const newItem: SearchHistoryItem = {
          timestamp: Date.now(),
          isbn: cleaned,
          title: result.book.title,
          authors: result.book.authors,
          success: true
        };
        
        const updatedHistory = [newItem, ...history.filter(h => h.isbn !== cleaned)].slice(0, 12);
        setHistory(updatedHistory);
        localStorage.setItem('sebo_isbn_history_v1', JSON.stringify(updatedHistory));
      } else {
        // Handle specific errors based on API status
        let localError = 'ISBN não encontrado na BrasilAPI.';
        if (result.diagnostic.status === 404) {
          localError = 'ISBN não encontrado na BrasilAPI.';
        } else if (result.diagnostic.status === 500) {
          localError = 'Erro temporário na consulta da BrasilAPI.';
        } else if (result.diagnostic.status === 'FALHA_CONEXAO') {
          localError = 'Não foi possível conectar ao serviço de consulta.';
        } else if (result.diagnostic.apiErrorMessage) {
          localError = result.diagnostic.apiErrorMessage;
        }
        setErrorText(localError);
        
        // Record failed lookups in list as well for inspection
        const newItem: SearchHistoryItem = {
          timestamp: Date.now(),
          isbn: cleaned,
          title: `Falha na Consulta`,
          authors: undefined,
          success: false
        };
        const updatedHistory = [newItem, ...history.filter(h => h.isbn !== cleaned)].slice(0, 12);
        setHistory(updatedHistory);
        localStorage.setItem('sebo_isbn_history_v1', JSON.stringify(updatedHistory));
      }
    } catch (err: any) {
      console.error('Unhandled search exception:', err);
      setErrorText('Não foi possível conectar ao serviço de consulta.');
    } finally {
      setIsLoading(false);
    }
  };

  // Click on recent book or popular presets to autofill and reload
  const handleSelectPresetOrHistory = (targetIsbn: string) => {
    setIsbnValue(targetIsbn);
    handleSearch(targetIsbn);
  };

  const handleClearHistory = () => {
    setHistory([]);
    localStorage.removeItem('sebo_isbn_history_v1');
  };

  const escapeCsvValue = (value: string | number | undefined): string => {
    const normalized = String(value ?? '').replace(/\r?\n/g, ' ');
    const escaped = normalized.replace(/"/g, '""');
    return `"${escaped}"`;
  };

  const handleExportHistoryCsv = () => {
    if (history.length === 0) {
      return;
    }

    const headers = ['ISBN', 'Título', 'Autor(es)', 'Data/Hora', 'Status'];
    const rows = history.map((item) => {
      const authors = Array.isArray(item.authors) && item.authors.length > 0 ? item.authors.join(' | ') : '';
      const timestamp = new Date(item.timestamp).toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'medium',
      });
      const status = item.success ? 'Sucesso' : 'Falha';

      return [item.isbn, item.title, authors, timestamp, status]
        .map((value) => escapeCsvValue(value))
        .join(';');
    });

    const csv = `\uFEFF${headers.map((header) => escapeCsvValue(header)).join(';')}\r\n${rows.join('\r\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStamp = new Date().toISOString().slice(0, 10);

    link.href = url;
    link.download = `historico-isbn-${dateStamp}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  // Helper links for manual search in case Google Books has no copy loaded
  const fallbackLinks = {
    amazon: `https://www.amazon.com.br/s?k=${encodeURIComponent(searchedTerm)}`,
    mercadoLivre: `https://lista.mercadolivre.com.br/${encodeURIComponent(searchedTerm)}`,
    estanteVirtual: `https://www.estantevirtual.com.br/busca?q=${encodeURIComponent(searchedTerm)}`,
    cbl: `https://cblservicos.org.br/isbn/pesquisa/?q=${encodeURIComponent(searchedTerm)}`
  };

  return (
    <div className="min-h-screen bg-natural-bg flex flex-col selection:bg-natural-badge selection:text-natural-accent pb-12">
      {/* Premium Bookstore Header */}
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 flex-1 w-full">
        {/* Responsive Dual-column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          
          {/* Main search and details panel column */}
          <div className="lg:col-span-8 space-y-6">

            {/* Módulo Status Conexão */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white/65 border border-natural-border px-4 py-3 rounded-2xl shadow-3xs">
              <div className="flex items-center gap-2.5 text-xs">
                <div className="w-2.5 h-2.5 rounded-full bg-natural-accent shrink-0" />
                <span className="font-semibold text-natural-title font-sans">Indexador de Obras para Sebos</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-natural-subtitle">Fonte Principal:</span>
                  {getStatusIndicator()}
                </div>
                {foundBook?.provider && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-natural-subtitle">Provedor:</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-bold uppercase tracking-wider">
                      {foundBook.provider}
                    </span>
                  </div>
                )}
              </div>
            </div>
            
            {/* 1. Form component */}
            <SearchForm 
              onSearch={handleSearch} 
              isLoading={isLoading} 
              isbnValue={isbnValue}
              setIsbnValue={setIsbnValue}
            />

            {/* Loading stage */}
            {isLoading && (
              <div className="bg-white/80 border border-natural-border rounded-2xl p-12 text-center shadow-xs flex flex-col items-center justify-center min-h-[300px]">
                <div className="relative flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full border-3 border-natural-badge border-t-natural-accent animate-spin"></div>
                  <BookMarked className="w-5 h-5 text-natural-accent absolute animate-pulse" />
                </div>
                <h3 className="text-natural-title font-semibold mt-4 text-sm font-serif">Acessando a BrasilAPI</h3>
                <p className="text-natural-subtitle text-xs mt-1 max-w-[280px]">
                  Buscando dados bibliográficos pelo código <span className="font-mono bg-natural-badge px-1 py-0.5 rounded-sm text-natural-text">{cleanIsbn(isbnValue)}</span>...
                </p>
              </div>
            )}

            {/* Error stage: "Livro não encontrado na Google Books." */}
            {errorText && !isLoading && (
              <div className="bg-white/80 border border-natural-border rounded-2xl p-6 sm:p-8 shadow-xs animate-fade-in">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-amber-50 text-amber-700 rounded-xl border border-amber-200/60 shrink-0">
                    <AlertCircle className="w-6 h-6 stroke-[1.8]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-bold font-serif text-natural-title">
                      Não catalogado no Google Books
                    </h3>
                    <p className="text-sm text-natural-text mt-1.5 leading-relaxed">
                      {errorText}
                    </p>

                    {/* Metadata showing what was searched */}
                    <div className="mt-4 p-3 bg-white/40 border border-natural-border rounded-xl flex flex-wrap gap-x-6 gap-y-2 text-xs font-mono">
                      <div>
                        <span className="text-natural-subtitle mr-1.5">ISBN Consultado:</span>
                        <span className="font-bold text-natural-title bg-natural-badge/40 px-1.5 py-0.5 rounded-md border border-natural-border/60">{rawSearchedTerm || isbnValue}</span>
                      </div>
                      <div>
                        <span className="text-natural-subtitle mr-1.5">ISBN Limpo:</span>
                        <span className="font-bold text-natural-accent bg-natural-badge/40 px-1.5 py-0.5 rounded-md border border-natural-border/60">{searchedTerm || cleanIsbn(isbnValue)}</span>
                      </div>
                    </div>

                    {/* Technical search Diagnostics */}
                    {lastDiagnostic && (
                      <div className="mt-4 p-3.5 bg-amber-50/45 border border-amber-200/50 rounded-xl space-y-2.5">
                        <div className="text-[11px] font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                          <span>Relatório de Diagnóstico BrasilAPI</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-[11px] font-mono">
                          <div className="md:col-span-2">
                            <span className="text-natural-subtitle mr-1.5 font-sans font-medium">Endpoint Consultado:</span>
                            <span className="text-natural-title bg-white/60 px-1.5 py-0.5 rounded border border-natural-border/40 select-all break-all">{lastDiagnostic.endpoint}</span>
                          </div>
                          <div>
                            <span className="text-natural-subtitle mr-1.5 font-sans font-medium">HTTP Status:</span>
                            <span className="px-1.5 py-0.5 rounded border bg-white/60 border-natural-border/40 text-natural-title font-bold">
                              {lastDiagnostic.status}
                            </span>
                          </div>
                          <div>
                            <span className="text-natural-subtitle mr-1.5 font-sans font-medium">Provedor Retornado:</span>
                            <span className="font-bold text-[#004BB4] bg-white/60 px-1.5 py-0.5 rounded border border-natural-border/40 uppercase">
                              {lastDiagnostic.provider || 'N/A'}
                            </span>
                          </div>
                          <div>
                            <span className="text-natural-subtitle mr-1.5 font-sans font-medium">Tempo de Resposta:</span>
                            <span className="font-bold text-emerald-800 bg-white/60 px-1.5 py-0.5 rounded border border-natural-border/40">
                              {lastDiagnostic.responseTimeMs} ms
                            </span>
                          </div>
                          <div>
                            <span className="text-natural-subtitle mr-1.5 font-sans font-medium">Qtd de Autores:</span>
                            <span className="font-bold text-slate-800 bg-white/60 px-1.5 py-0.5 rounded border border-natural-border/40">
                              {lastDiagnostic.authorsCount}
                            </span>
                          </div>
                          <div>
                            <span className="text-natural-subtitle mr-1.5 font-sans font-medium">Qtd de Categorias:</span>
                            <span className="font-bold text-slate-800 bg-white/60 px-1.5 py-0.5 rounded border border-natural-border/40">
                              {lastDiagnostic.categoriesCount}
                            </span>
                          </div>
                          {lastDiagnostic.apiErrorMessage && (
                            <div className="md:col-span-2 mt-1">
                              <span className="text-natural-subtitle mr-1.5 font-sans font-medium">Mensagem de Erro:</span>
                              <span className="text-red-700 bg-red-50/70 px-1.5 py-0.5 rounded border border-red-100 break-words font-semibold font-sans">{lastDiagnostic.apiErrorMessage}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Highly helpful action context: letting clerks research other links straight from query */}
                    <div className="mt-5 pt-4 border-t border-natural-border">
                      <p className="text-xs font-bold text-natural-title mb-3.5 flex items-center gap-1.5 font-sans uppercase tracking-wider">
                        <Sparkles className="w-3.5 h-3.5 text-natural-accent shrink-0" />
                        Bases de Pesquisa Externa Complementares:
                      </p>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Amazon Brasil */}
                        <a
                          href={fallbackLinks.amazon}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3.5 py-3 bg-[#FF9900] hover:opacity-90 active:opacity-105 text-white text-sm font-semibold rounded-xl flex items-center justify-between shadow-xs cursor-pointer border border-[#FF9900]/20"
                          id="fallback-amazon-link"
                        >
                          <div className="flex items-center gap-2.5">
                            <ShoppingBag className="w-4 h-4 shrink-0" />
                            <span>Amazon Brasil</span>
                          </div>
                          <ExternalLink className="w-4 h-4 opacity-75" />
                        </a>

                        {/* Mercado Livre */}
                        <a
                          href={fallbackLinks.mercadoLivre}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3.5 py-3 bg-[#FFF159] hover:opacity-90 active:opacity-105 text-[#2D2823] text-sm font-semibold rounded-xl flex items-center justify-between border border-[#FFF159] cursor-pointer"
                          id="fallback-mercadolivre-link"
                        >
                          <div className="flex items-center gap-2.5">
                            <Store className="w-4 h-4 shrink-0 text-[#2D2823]" />
                            <span>Mercado Livre</span>
                          </div>
                          <ExternalLink className="w-4 h-4 text-[#2D2823] opacity-75" />
                        </a>

                        {/* Estante Virtual */}
                        <a
                          href={fallbackLinks.estanteVirtual}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3.5 py-3 bg-[#004BB4] hover:opacity-90 active:opacity-105 text-white text-sm font-semibold rounded-xl flex items-center justify-between shadow-xs cursor-pointer border border-[#004BB4]/20"
                          id="fallback-estantevirtual-link"
                        >
                          <div className="flex items-center gap-2.5">
                            <BookOpen className="w-4 h-4 shrink-0" />
                            <span>Estante Virtual</span>
                          </div>
                          <ExternalLink className="w-4 h-4 opacity-75" />
                        </a>

                        {/* Portal ISBN/CBL */}
                        <a
                          href={fallbackLinks.cbl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3.5 py-3 bg-[#0F172A] hover:bg-slate-800 active:bg-slate-900 text-white text-sm font-semibold rounded-xl flex items-center justify-between shadow-xs cursor-pointer border border-slate-700"
                          id="fallback-cbl-link"
                        >
                          <div className="flex items-center gap-2.5">
                            <Building className="w-4 h-4 shrink-0 text-slate-300" />
                            <span>Pesquisar no Portal ISBN/CBL</span>
                          </div>
                          <ExternalLink className="w-4 h-4 opacity-85" />
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Success Book details visual state */}
            {foundBook && !isLoading && (
              <BookDetailsCard book={foundBook} />
            )}

            {/* Warm, pristine default visual welcome state */}
            {!foundBook && !errorText && !isLoading && (
              <div className="bg-white/80 border border-natural-border rounded-2xl p-8 sm:p-12 text-center shadow-md flex flex-col items-center justify-center min-h-[360px] animate-fade-in relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-natural-accent" />
                
                <div className="p-4 bg-natural-badge/60 text-natural-accent rounded-full mb-4 border border-natural-border">
                  <BookMarked className="w-10 h-10 stroke-[1.2]" />
                </div>
                
                <h3 className="text-xl font-bold font-serif text-natural-title tracking-tight">Consultador de Livros Ativo</h3>
                <p className="text-sm text-natural-subtitle mt-2 max-w-[420px] leading-relaxed">
                  Digite ou cole um código de barras <span className="font-semibold text-natural-text">ISBN de 10 ou 13 dígitos</span> na caixa de texto acima para carregar instantaneamente a catalogação literária.
                </p>

                {/* Standard steps indicator */}
                <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-6 mt-8 font-mono text-[11px] text-natural-subtitle">
                  <div className="flex items-center gap-1">
                    <span className="w-5 h-5 bg-natural-badge text-natural-accent font-bold border border-natural-border rounded-full flex items-center justify-center">1</span>
                    <span>Inserir ISBN</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-natural-subtitle/40 hidden sm:inline" />
                  <div className="flex items-center gap-1">
                    <span className="w-5 h-5 bg-natural-badge text-natural-accent font-bold border border-natural-border rounded-full flex items-center justify-center">2</span>
                    <span>Consultar BrasilAPI</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-natural-subtitle/40 hidden sm:inline" />
                  <div className="flex items-center gap-1">
                    <span className="w-5 h-5 bg-natural-badge text-natural-accent font-bold border border-natural-border rounded-full flex items-center justify-center">3</span>
                    <span>Analisar Mercados</span>
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* Sidebar right panel column */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* Visual Lookup Session History list */}
            <SearchHistoryGroup 
              items={history}
              onSelect={handleSelectPresetOrHistory}
              onClear={handleClearHistory}
              onExport={handleExportHistoryCsv}
            />

            {/* Preset testing & upcoming system expansions placeholders */}
            <FutureExpansions 
              onSelectPresetIsbn={handleSelectPresetOrHistory}
            />

          </div>

        </div>
      </main>

      {/* Footer bar */}
      <footer className="max-w-7xl mx-auto px-6 mt-12 text-center text-[11px] text-natural-subtitle font-mono">
        <p>Desenvolvido para Livrarias de Obras Raras e Sebos de Livros Usados.</p>
        <p className="mt-1">© {new Date().getFullYear()} Consulta ISBN · Integrado com a BrasilAPI.</p>
      </footer>
    </div>
  );
}
