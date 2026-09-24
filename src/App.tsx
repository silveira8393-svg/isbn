/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import Header from './components/Header';
import SearchForm from './components/SearchForm';
import BookDetailsCard from './components/BookDetailsCard';
import SearchHistoryGroup from './components/SearchHistoryGroup';
import CameraScannerModal from './components/CameraScannerModal';
import { BookInfo, SearchHistoryItem } from './types';
import { searchBookByIsbnBrasilApi } from './services/brasilApi';
import {
  mergeBookWithDistribuidora,
  searchBookByIsbnDistribuidoraCuritiba,
  DistribuidoraDiagnostic,
} from './services/distribuidoraCuritiba';
import { cleanIsbn } from './utils/isbn';
import {
  BookOpen,
  AlertCircle,
  ExternalLink,
  ShoppingBag,
  Store,
  Building2,
  RefreshCw,
  Search,
} from 'lucide-react';

export default function App() {
  const [isbnValue, setIsbnValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [foundBook, setFoundBook] = useState<BookInfo | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [searchedTerm, setSearchedTerm] = useState<string>('');
  const [rawSearchedTerm, setRawSearchedTerm] = useState<string>('');
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [activeTab, setActiveTab] = useState<'consultar' | 'historico'>('consultar');
  const [isScannerOpen, setIsScannerOpen] = useState(false);

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
    setActiveTab('consultar');

    try {
      const result = await searchBookByIsbnBrasilApi(cleaned);

      if (result.book) {
        const distribuidoraResult = await searchBookByIsbnDistribuidoraCuritiba(cleaned);
        const enrichedBook = distribuidoraResult.book
          ? mergeBookWithDistribuidora(result.book, distribuidoraResult.book)
          : result.book;

        setFoundBook(enrichedBook);

        // Add item to history with thumbnail support
        const newItem: SearchHistoryItem = {
          timestamp: Date.now(),
          isbn: cleaned,
          title: enrichedBook.title,
          authors: enrichedBook.authors,
          success: true,
          thumbnailUrl: enrichedBook.thumbnailUrl || enrichedBook.coverUrl,
        };

        const updatedHistory = [newItem, ...history.filter((h) => h.isbn !== cleaned)].slice(0, 15);
        setHistory(updatedHistory);
        localStorage.setItem('sebo_isbn_history_v1', JSON.stringify(updatedHistory));
      } else {
        let localError = 'ISBN não encontrado na base de dados.';
        if (result.diagnostic.status === 404) {
          localError = 'ISBN não encontrado no registro nacional.';
        } else if (result.diagnostic.status === 500) {
          localError = 'Instabilidade temporária no serviço de consulta.';
        } else if (result.diagnostic.status === 'FALHA_CONEXAO') {
          localError = 'Não foi possível conectar ao serviço de consulta.';
        } else if (result.diagnostic.apiErrorMessage) {
          localError = result.diagnostic.apiErrorMessage;
        }
        setErrorText(localError);

        const newItem: SearchHistoryItem = {
          timestamp: Date.now(),
          isbn: cleaned,
          title: `Não localizado (${cleaned})`,
          authors: undefined,
          success: false,
        };
        const updatedHistory = [newItem, ...history.filter((h) => h.isbn !== cleaned)].slice(0, 15);
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

  const handleSelectHistoryItem = (targetIsbn: string) => {
    setIsbnValue(targetIsbn);
    handleSearch(targetIsbn);
  };

  const handleScanIsbn = (targetIsbn: string) => {
    const cleaned = cleanIsbn(targetIsbn);
    if (!cleaned) return;
    setIsbnValue(cleaned);
    void handleSearch(cleaned);
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
    if (history.length === 0) return;

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

  const fallbackLinks = {
    amazon: `https://www.amazon.com.br/s?k=${encodeURIComponent(searchedTerm)}`,
    mercadoLivre: `https://lista.mercadolivre.com.br/${encodeURIComponent(searchedTerm)}`,
    estanteVirtual: `https://www.estantevirtual.com.br/busca?q=${encodeURIComponent(searchedTerm)}`,
    cbl: `https://cblservicos.org.br/isbn/pesquisa/?q=${encodeURIComponent(searchedTerm)}`,
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col selection:bg-blue-100 selection:text-blue-800">
      {/* 1. Header azul profissional */}
      <Header
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
        historyCount={history.length}
      />

      {/* 2. Main Content Viewport */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex-1 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Main Area: Pesquisa e Resultado (8 cols no desktop) */}
          <div
            className={`space-y-6 ${
              activeTab === 'historico' ? 'hidden lg:block lg:col-span-8' : 'lg:col-span-8'
            }`}
          >
            {/* Search Input Card */}
            <SearchForm
              onSearch={handleSearch}
              isLoading={isLoading}
              isbnValue={isbnValue}
              setIsbnValue={setIsbnValue}
              onOpenScanner={() => setIsScannerOpen(true)}
            />

            {/* Loading State */}
            {isLoading && (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs flex flex-col items-center justify-center min-h-[320px] animate-fade-in">
                <div className="w-12 h-12 rounded-full border-3 border-slate-100 border-t-blue-600 animate-spin mb-4" />
                <h3 className="text-slate-900 font-bold text-base">
                  Consultando registro bibliográfico...
                </h3>
                <p className="text-slate-500 text-xs mt-1">
                  Buscando dados para o ISBN <span className="font-mono font-semibold text-slate-800">{cleanIsbn(isbnValue)}</span>
                </p>
              </div>
            )}

            {/* Error State */}
            {errorText && !isLoading && (
              <div className="bg-white rounded-xl border border-red-200 shadow-xs p-6 animate-fade-in">
                <div className="flex items-start gap-3.5">
                  <div className="p-2.5 bg-red-50 text-red-600 rounded-lg border border-red-100 shrink-0">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-slate-900">
                      Obra não localizada
                    </h3>
                    <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                      {errorText}
                    </p>

                    <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-600 flex flex-wrap gap-4">
                      <span>ISBN Consultado: <strong className="text-slate-900">{searchedTerm}</strong></span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Found Book: Shows ALL info automatically */}
            {foundBook && !isLoading && (
              <BookDetailsCard book={foundBook} />
            )}

            {/* Empty / Counter Welcome State */}
            {!foundBook && !errorText && !isLoading && (
              <div className="bg-white rounded-xl border border-slate-200 p-8 sm:p-12 text-center shadow-xs flex flex-col items-center justify-center min-h-[360px] animate-fade-in">
                <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4 border border-blue-100">
                  <BookOpen className="w-7 h-7 stroke-[1.7]" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                  Pronto para consulta no balcão
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 mt-1.5 max-w-[420px] leading-relaxed">
                  Digite ou leia o código de barras ISBN para carregar instantaneamente a ficha técnica, medidas físicas e links de consulta comercial.
                </p>
                <div className="mt-6 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono text-slate-600">
                  <span>Dica: Use um leitor USB ou clique em</span>
                  <strong className="text-blue-700">Câmera</strong>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar Area: Histórico Recente (4 cols no desktop) */}
          <div
            className={`space-y-6 ${
              activeTab === 'consultar' ? 'hidden lg:block lg:col-span-4' : 'lg:col-span-4'
            }`}
          >
            <SearchHistoryGroup
              items={history}
              onSelect={handleSelectHistoryItem}
              onClear={handleClearHistory}
              onExport={handleExportHistoryCsv}
            />
          </div>
        </div>
      </main>

      {/* Footer discreto e limpo */}
      <footer className="border-t border-slate-200/80 bg-white py-4 px-6 mt-12 text-center text-xs text-slate-500">
        <p className="font-medium text-slate-600">
          Consulta ISBN para Sebos e Livrarias · Balcão de Catalogação
        </p>
      </footer>

      {/* Camera Barcode Scanner Modal */}
      <CameraScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleScanIsbn}
      />
    </div>
  );
}
