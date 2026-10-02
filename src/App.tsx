/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */


import { useState, useEffect, useRef } from 'react';
import Header, { NavigationTab } from './components/Header';
import SearchForm from './components/SearchForm';
import BookDetailsCard from './components/BookDetailsCard';
import SearchHistoryGroup from './components/SearchHistoryGroup';
import CameraScannerModal from './components/CameraScannerModal';
import MagazordStatusCard from './components/magazord/MagazordStatusCard';
import ProductRegistrationForm from './components/magazord/ProductRegistrationForm';
import ProductionView from './components/ProductionView';
import SettingsView from './components/SettingsView';
import { useUser } from './contexts/UserContext';
import {
  BookInfo,
  BookCondition,
  SearchHistoryItem,
  RegistrationDraft,
  MagazordProductCheck,
  MagazordRegistrationResult,
  MagazordMatchItem,
  OperationType,
} from './types';
import { searchBookByIsbnBrasilApi } from './services/brasilApi';
import {
  mergeBookWithDistribuidora,
  searchBookByIsbnDistribuidoraCuritiba,
} from './services/distribuidoraCuritiba';
import { cleanIsbn, isValidIsbnFormat } from './utils/isbn';
import { recordOperation, type RecordOperationInput } from './services/operationsService';
import { createRegistrationDraft } from './utils/draft';
import { CANONICAL_CSV_DATASET } from './utils/metrics';
import { magazordMockService } from './services/magazordMockService';
import {
  BookOpen,
  AlertCircle,
  Sparkles,
  ArrowRight,
  Search,
} from 'lucide-react';

export default function App() {
  const { currentUser, canViewProduction, canViewSettings, operationEnvironment } = useUser();
  const [isbnValue, setIsbnValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [foundBook, setFoundBook] = useState<BookInfo | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [searchedTerm, setSearchedTerm] = useState<string>('');
  const [rawSearchedTerm, setRawSearchedTerm] = useState<string>('');
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [activeTab, setActiveTab] = useState<NavigationTab>('consultar');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [operationWarning, setOperationWarning] = useState(false);
  const searchInFlight = useRef(false);
  const stockLinkInFlight = useRef(false);

  const saveOperation = (operation: Omit<RecordOperationInput, 'storeId'>) => {
    // Capture the account/store of the explicit business event; never write from a React updater/effect.
    void recordOperation({ ...operation, storeId: currentUser.active ? currentUser.storeId ?? '' : '' }, currentUser.id)
      .then(saved => { if (!saved) setOperationWarning(true); });
  };

  // Redireciona para consulta caso o perfil atual não tenha permissão na aba ativa
  useEffect(() => {
    if (activeTab === 'producao' && !canViewProduction) {
      setActiveTab('consultar');
    }
    if (activeTab === 'configuracoes' && !canViewSettings) {
      setActiveTab('consultar');
    }
  }, [activeTab, canViewProduction, canViewSettings]);

  // Estados de integração e rascunho Magazord
  const [registrationDraft, setRegistrationDraft] = useState<RegistrationDraft | null>(null);
  const [magazordCheckResult, setMagazordCheckResult] = useState<MagazordProductCheck | null>(null);
  const [isCheckingMagazord, setIsCheckingMagazord] = useState(false);
  const [magazordCheckError, setMagazordCheckError] = useState<string | null>(null);

  // Load history from localStorage on startup (ou popula com o dataset canônico real se vazio)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('sebo_isbn_history_v1');
      if (saved) {
        setHistory(JSON.parse(saved));
      } else {
        setHistory(CANONICAL_CSV_DATASET);
        localStorage.setItem('sebo_isbn_history_v1', JSON.stringify(CANONICAL_CSV_DATASET));
      }
    } catch (e) {
      console.error('Failed to load search history', e);
    }
  }, []);

  // Realiza checagem simulada na API Magazord para o livro encontrado
  const runMagazordCheck = async (cleanedIsbn: string, book: BookInfo) => {
    setIsCheckingMagazord(true);
    setMagazordCheckError(null);

    try {
      const check = await magazordMockService.checkProductByEan(cleanedIsbn, book.title);
      setMagazordCheckResult(check);

      // Atualiza o registro no histórico com status da Magazord (apenas em consultas pendentes)
      setHistory((prevHistory) => {
        const updated = prevHistory.map((item) => {
          if (
            item.isbn === cleanedIsbn &&
            (!item.operationType || item.operationType === 'pesquisa_isbn')
          ) {
            return {
              ...item,
              magazordStatus: check.exists ? ('localizado' as const) : ('nao_cadastrado' as const),
              parentCode: check.parentCode || item.parentCode,
              childCode: check.childCode || item.childCode,
            };
          }
          return item;
        });
        try {
          localStorage.setItem('sebo_isbn_history_v1', JSON.stringify(updated));
        } catch {
          // ignora
        }
        return updated;
      });
    } catch (err: any) {
      console.error('Erro na checagem Magazord simulada:', err);
      setMagazordCheckError(err.message || 'Falha de comunicação simulada com a Magazord.');
    } finally {
      setIsCheckingMagazord(false);
    }
  };

  // Handler to carry out lookup
  const handleSearch = async (targetIsbn: string) => {
    if (searchInFlight.current) return;
    const cleaned = cleanIsbn(targetIsbn);
    if (!cleaned) {
      setErrorText('Por favor, informe um código ISBN válido.');
      return;
    }

    searchInFlight.current = true;
    setIsLoading(true);
    setErrorText(null);
    setFoundBook(null);
    setRegistrationDraft(null);
    setMagazordCheckResult(null);
    setMagazordCheckError(null);
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

        // Prepara automaticamente o rascunho de cadastro com os dados reais
        const draft = createRegistrationDraft(enrichedBook);
        setRegistrationDraft(draft);

        // Add item to history with thumbnail support and audit info
        const newItem: SearchHistoryItem = {
          timestamp: Date.now(),
          isbn: cleaned,
          title: enrichedBook.title,
          authors: enrichedBook.authors,
          success: true,
          thumbnailUrl: enrichedBook.thumbnailUrl || enrichedBook.coverUrl,
          magazordStatus: 'nao_cadastrado',
          operationType: 'pesquisa_isbn',
          userId: currentUser.id,
          userName: currentUser.name,
          userRole: currentUser.role,
          operationEnvironment: operationEnvironment,
        };

        setHistory((prevHistory) => {
          // Evita duplicar busca idêntica imediata se for a mesma consulta nos últimos 3 segundos
          if (
            prevHistory.length > 0 &&
            prevHistory[0].isbn === cleaned &&
            prevHistory[0].operationType === 'pesquisa_isbn' &&
            Date.now() - prevHistory[0].timestamp < 3000
          ) {
            return prevHistory;
          }
          const updated = [newItem, ...prevHistory].slice(0, 50);
          try {
            localStorage.setItem('sebo_isbn_history_v1', JSON.stringify(updated));
          } catch {
            // ignora
          }
          return updated;
        });

        // Executa a checagem simulada da Magazord
        if (isValidIsbnFormat(cleaned)) saveOperation({
          isbn: cleaned, title: enrichedBook.title, operationType: 'isbn_search', status: 'success',
          completedAt: new Date(newItem.timestamp).toISOString(),
          metadata: { resultFound: true, sources: {
            brasilApi: { status: result.diagnostic.status, resultFound: true },
            distribuidoraCuritiba: { status: distribuidoraResult.diagnostic.status, resultFound: Boolean(distribuidoraResult.book) },
          } },
        });
        void runMagazordCheck(cleaned, enrichedBook);
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
          operationType: 'erro_consulta',
          userId: currentUser.id,
          userName: currentUser.name,
          userRole: currentUser.role,
          operationEnvironment: operationEnvironment,
        };
        setHistory((prevHistory) => {
          const updated = [newItem, ...prevHistory].slice(0, 50);
          try {
            localStorage.setItem('sebo_isbn_history_v1', JSON.stringify(updated));
          } catch {
            // ignora
          }
          return updated;
        });
        if (isValidIsbnFormat(cleaned)) {
          const status = result.diagnostic.status;
          const normalCompletion = status === 404 || (typeof status === 'number' && status >= 200 && status < 300);
          saveOperation({
            isbn: cleaned, operationType: normalCompletion ? 'isbn_search' : 'operation_error',
            status: normalCompletion ? 'success' : 'error',
            errorMessage: normalCompletion ? undefined : 'Falha do serviço na consulta bibliográfica.',
            completedAt: new Date(newItem.timestamp).toISOString(),
            metadata: { flow: 'isbn_search', resultFound: false, sources: {
              brasilApi: { status, resultFound: false }, distribuidoraCuritiba: { consulted: false },
            } },
          });
        }
      }
    } catch (err: any) {
      console.error('Unhandled search exception:', err);
      setErrorText('Não foi possível conectar ao serviço de consulta.');
      if (isValidIsbnFormat(cleaned)) saveOperation({
        isbn: cleaned, operationType: 'operation_error', status: 'error',
        errorMessage: 'Falha fatal ao concluir a consulta bibliográfica.',
        metadata: { flow: 'isbn_search' }, completedAt: new Date().toISOString(),
      });
    } finally {
      searchInFlight.current = false;
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

  // Abre a tela única de cadastro garantindo a condição desejada (Novo ou Usado)
  const handleOpenRegistration = (condition?: BookCondition) => {
    if (!foundBook) return;
    const targetCondition =
      condition ||
      magazordCheckResult?.existingCondition ||
      'novo';
    const draft = createRegistrationDraft(foundBook, targetCondition);
    setRegistrationDraft(draft);
    setActiveTab('cadastro');
  };

  // Vincula entrada de estoque a um produto NOVO existente simulado (Reaproveitamento de Produto Novo)
  const handleLinkStock = async (
    quantityToAdd: number,
    targetItem?: MagazordMatchItem
  ) => {
    if (!foundBook) throw new Error('Nenhum livro selecionado');
    const ean = targetItem?.childCode || foundBook.isbn13 || foundBook.isbn10 || searchedTerm;
    const targetChildCode =
      targetItem?.childCode ||
      (magazordCheckResult?.existingCondition === 'novo' ? magazordCheckResult?.childCode : undefined);

    if (stockLinkInFlight.current) throw new Error('Vinculação já em andamento.');
    stockLinkInFlight.current = true;
    let result: Awaited<ReturnType<typeof magazordMockService.addStockToExistingProduct>>;
    try {
      result = await magazordMockService.addStockToExistingProduct(ean, quantityToAdd, targetChildCode);
    } catch (err) {
      saveOperation({
        isbn: searchedTerm || foundBook.isbn13 || foundBook.isbn10, title: foundBook.title,
        condition: 'new', operationType: 'operation_error', status: 'error',
        parentCode: targetItem?.parentCode || magazordCheckResult?.parentCode, childCode: targetChildCode,
        errorMessage: 'Falha ao concluir a vinculação de estoque simulada.',
        metadata: { flow: 'new_product_reused', mock: true }, completedAt: new Date().toISOString(),
      });
      throw err;
    } finally {
      stockLinkInFlight.current = false;
    }

    // Atualiza imediatamente o estado de checagem em tela para refletir o novo saldo de estoque
    setMagazordCheckResult((prev) => {
      if (!prev) return null;
      const updatedMatches = prev.matches?.map((m) => {
        if (
          m.condition === 'novo' ||
          (targetItem && m.id === targetItem.id) ||
          (targetChildCode && m.childCode === targetChildCode)
        ) {
          return { ...m, stock: result.newStock };
        }
        return m;
      });
      return {
        ...prev,
        currentStock: result.newStock,
        matches: updatedMatches,
      };
    });

    // Registra evento de auditoria operacional: Reaproveitamento Comercial de Produto Novo
    const auditItem: SearchHistoryItem = {
      timestamp: Date.now(),
      isbn: searchedTerm || ean,
      title: foundBook.title,
      authors: foundBook.authors,
      thumbnailUrl: foundBook.thumbnailUrl || foundBook.coverUrl,
      success: true,
      magazordStatus: 'localizado',
      condition: 'novo',
      operationType: 'reaproveitamento_produto_novo',
      parentCode: targetItem?.parentCode || magazordCheckResult?.parentCode,
      childCode: targetItem?.childCode || magazordCheckResult?.childCode,
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      operationEnvironment: operationEnvironment,
    };

    setHistory((prevHistory) => {
      const updated = [auditItem, ...prevHistory].slice(0, 50);
      try {
        localStorage.setItem('sebo_isbn_history_v1', JSON.stringify(updated));
      } catch {
        // ignora
      }
      return updated;
    });

    saveOperation({
      isbn: searchedTerm || foundBook.isbn13 || foundBook.isbn10,
      title: foundBook.title, condition: 'new', operationType: result.success ? 'new_product_reused' : 'operation_error',
      status: result.success ? 'success' : 'error', parentCode: auditItem.parentCode, childCode: auditItem.childCode,
      errorMessage: result.success ? undefined : 'Vinculação de estoque simulada não concluída.',
      metadata: { flow: 'new_product_reused', mock: true, quantity: quantityToAdd },
      completedAt: new Date(auditItem.timestamp).toISOString(),
    });
    return result;
  };

  // Sucesso no cadastro Magazord simulado
  const handleSuccessRegistration = (
    result: MagazordRegistrationResult,
    savedDraft: RegistrationDraft
  ) => {
    // Registra evento de auditoria operacional do cadastro concluído
    const currentIsbn = searchedTerm || savedDraft.isbn13 || savedDraft.ean;
    const opType: OperationType =
      savedDraft.condition === 'usado'
        ? 'novo_usado_com_edicao_conhecida'
        : 'novo_cadastro';

    const auditItem: SearchHistoryItem = {
      timestamp: Date.now(),
      isbn: currentIsbn,
      title: savedDraft.title,
      authors: foundBook?.authors || [],
      thumbnailUrl: savedDraft.mainImageUrl || foundBook?.thumbnailUrl,
      success: true,
      magazordStatus: 'cadastrado_simulado',
      parentCode: result.parentCode,
      childCode: result.childCode,
      condition: savedDraft.condition,
      operationType: opType,
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      operationEnvironment: operationEnvironment,
    };

    setHistory((prevHistory) => {
      const updated = [auditItem, ...prevHistory].slice(0, 50);
      try {
        localStorage.setItem('sebo_isbn_history_v1', JSON.stringify(updated));
      } catch {
        // ignora
      }
      return updated;
    });

    // Atualiza estado de checagem consultando o banco simulado atualizado
    saveOperation({
      isbn: currentIsbn, title: savedDraft.title,
      condition: savedDraft.condition === 'usado' ? 'used' : 'new',
      operationType: !result.success ? 'operation_error' : savedDraft.condition === 'usado' ? 'used_copy_created' : 'new_product_created',
      status: result.success ? 'success' : 'error', parentCode: result.parentCode, childCode: result.childCode,
      errorMessage: result.success ? undefined : 'Cadastro simulado não concluído.',
      metadata: { mock: true, quantity: savedDraft.quantity, registrationMode: savedDraft.condition === 'usado' ? 'used_copy' : 'new_product',
        bibliographicSource: foundBook?.enrichmentSource || foundBook?.provider || null },
      completedAt: new Date(result.registeredAt).toISOString(),
    });
    void magazordMockService.checkProductByEan(currentIsbn, savedDraft.title).then((freshCheck) => {
      setMagazordCheckResult(freshCheck);
    });
  };

  // Prepara interface para o próximo livro
  const handleProcessNextBook = () => {
    setFoundBook(null);
    setRegistrationDraft(null);
    setMagazordCheckResult(null);
    setMagazordCheckError(null);
    setIsbnValue('');
    setErrorText(null);
    setActiveTab('consultar');

    // Foca suavemente no input de ISBN
    setTimeout(() => {
      const inputEl = document.querySelector('input[type="text"]') as HTMLInputElement | null;
      inputEl?.focus();
    }, 150);
  };

  const escapeCsvValue = (value: string | number | undefined): string => {
    const normalized = String(value ?? '').replace(/\r?\n/g, ' ');
    const escaped = normalized.replace(/"/g, '""');
    return `"${escaped}"`;
  };

  const handleExportHistoryCsv = () => {
    if (history.length === 0) return;

    const headers = [
      'ISBN',
      'Título',
      'Autor(es)',
      'Condição',
      'Tipo de Operação',
      'Código Pai',
      'Código Filho',
      'Status Magazord',
      'Usuário',
      'Perfil',
      'Ambiente',
      'Data/Hora',
      'Status Consulta',
    ];

    const rows = history.map((item) => {
      const authors = Array.isArray(item.authors) && item.authors.length > 0 ? item.authors.join(' | ') : '';
      const condition = item.condition ? (item.condition === 'novo' ? 'Novo' : 'Usado') : '';
      const operationType =
        item.operationType === 'reaproveitamento_produto_novo'
          ? 'Reaproveitamento Comercial (Novo)'
          : item.operationType === 'novo_usado_com_edicao_conhecida' || item.operationType === 'novo_exemplar_usado'
          ? 'Novo Usado (Edição Conhecida)'
          : item.operationType === 'novo_cadastro'
          ? 'Novo Cadastro Completo'
          : item.operationType === 'erro_consulta' || item.operationType === 'erro_cadastro'
          ? 'Erro Operacional'
          : 'Consulta';
      const parentCode = item.parentCode || '';
      const childCode = item.childCode || '';
      const magazordStatus =
        item.magazordStatus === 'cadastrado_simulado'
          ? 'Cadastrado Simulado'
          : item.magazordStatus === 'localizado'
          ? 'Localizado Magazord'
          : item.success
          ? 'Não Cadastrado'
          : '–';

      const userName = item.userName || '–';
      const userRole =
        item.userRole === 'admin'
          ? 'Administrador'
          : item.userRole === 'developer'
          ? 'Desenvolvedor'
          : item.userRole === 'operator'
          ? 'Operador'
          : '–';
      const environment =
        item.operationEnvironment === 'development'
          ? 'Desenvolvimento'
          : item.operationEnvironment === 'production'
          ? 'Produção'
          : '–';

      const timestamp = new Date(item.timestamp).toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'medium',
      });
      const status = item.success ? 'Sucesso' : 'Falha';

      return [
        item.isbn,
        item.title,
        authors,
        condition,
        operationType,
        parentCode,
        childCode,
        magazordStatus,
        userName,
        userRole,
        environment,
        timestamp,
        status,
      ]
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

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col selection:bg-blue-100 selection:text-blue-800">
      {/* 1. Header azul profissional com navegação Consultar | Cadastro | Histórico */}
      <Header
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
        historyCount={history.length}
        hasActiveDraft={Boolean(registrationDraft)}
      />

      {/* 2. Main Content Viewport */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex-1 w-full">
        {operationWarning && <div role="status" className="mb-4 p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-sm flex items-center justify-between gap-3">
          <span>Uma operação não pôde ser registrada no Supabase. O resultado e o histórico local foram preservados.</span>
          <button type="button" onClick={() => setOperationWarning(false)} className="font-semibold cursor-pointer">Fechar</button>
        </div>}
        {/* ABA 1: CONSULTAR */}
        {activeTab === 'consultar' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Main Area: Pesquisa e Resultado (8 cols no desktop) */}
            <div className="space-y-6 lg:col-span-8">
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
                    Buscando dados para o ISBN{' '}
                    <span className="font-mono font-semibold text-slate-800">
                      {cleanIsbn(isbnValue)}
                    </span>
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
                        <span>
                          ISBN Consultado:{' '}
                          <strong className="text-slate-900">{searchedTerm}</strong>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Found Book: Status Magazord + Ficha Técnica Completa */}
              {foundBook && !isLoading && (
                <div className="space-y-6 animate-fade-in">
                  {/* Card de Status e Ação Magazord (Regras de Novos e Usados) */}
                  <MagazordStatusCard
                    checkResult={magazordCheckResult}
                    isChecking={isCheckingMagazord}
                    checkError={magazordCheckError}
                    book={foundBook}
                    onOpenRegistration={handleOpenRegistration}
                    onRetryCheck={() => runMagazordCheck(searchedTerm, foundBook)}
                    onResetForNextBook={handleProcessNextBook}
                    onLinkStock={handleLinkStock}
                  />

                  {/* Ficha Bibliográfica Completa (Preservada do projeto original) */}
                  <BookDetailsCard book={foundBook} />
                </div>
              )}

              {/* Empty / Counter Welcome State */}
              {!foundBook && !errorText && !isLoading && (
                <div className="bg-white rounded-xl border border-slate-200 p-8 sm:p-12 text-center shadow-xs flex flex-col items-center justify-center min-h-[360px] animate-fade-in">
                  <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4 border border-blue-100">
                    <BookOpen className="w-7 h-7 stroke-[1.7]" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                    Pronto para consulta e catalogação no balcão
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-500 mt-1.5 max-w-[440px] leading-relaxed">
                    Digite ou leia o código de barras ISBN para carregar a ficha técnica nacional e preparar instantaneamente o cadastro na Magazord.
                  </p>
                  <div className="mt-6 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono text-slate-600">
                    <span>Dica: Use um leitor USB ou clique em</span>
                    <strong className="text-blue-700">Câmera</strong>
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar Area: Histórico Recente (4 cols no desktop) */}
            <div className="hidden lg:block lg:col-span-4 space-y-6">
              <SearchHistoryGroup
                items={history}
                onSelect={handleSelectHistoryItem}
                onClear={handleClearHistory}
                onExport={handleExportHistoryCsv}
              />
            </div>
          </div>
        )}

        {/* ABA 2: CADASTRO MAGAZORD EM TELA ÚNICA */}
        {activeTab === 'cadastro' && (
          <div className="w-full max-w-5xl mx-auto">
            {registrationDraft && foundBook ? (
              <ProductRegistrationForm
                draft={registrationDraft}
                originalBook={foundBook}
                onUpdateDraft={(updates) =>
                  setRegistrationDraft((prev) => (prev ? { ...prev, ...updates } : null))
                }
                onBackToSearch={() => setActiveTab('consultar')}
                onSuccessRegistration={handleSuccessRegistration}
                onRegistrationError={(failedDraft) => saveOperation({
                  isbn: failedDraft.isbn13 || failedDraft.ean || searchedTerm, title: failedDraft.title,
                  condition: failedDraft.condition === 'usado' ? 'used' : 'new',
                  operationType: 'operation_error', status: 'error',
                  parentCode: failedDraft.parentCode, childCode: failedDraft.childCode,
                  errorMessage: 'Falha ao concluir o cadastro simulado.',
                  metadata: { flow: 'registration', mock: true }, completedAt: new Date().toISOString(),
                })}
                onProcessNextBook={handleProcessNextBook}
              />
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-14 text-center shadow-xs flex flex-col items-center justify-center min-h-[380px] animate-fade-in max-w-2xl mx-auto">
                <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4 border border-blue-100">
                  <Sparkles className="w-8 h-8 stroke-[1.7]" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 tracking-tight">
                  Nenhum livro carregado para cadastro
                </h3>
                <p className="text-sm text-slate-500 mt-2 max-w-md leading-relaxed">
                  O fluxo operacional do sistema começa pela consulta de ISBN para pré-preencher todos os dados bibliográficos automaticamente.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('consultar')}
                  className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md transition-all cursor-pointer"
                >
                  <Search className="w-4 h-4" />
                  <span>Iniciar Consulta de ISBN</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ABA 3: HISTÓRICO */}
        {activeTab === 'historico' && (
          <div className="max-w-3xl mx-auto">
            <SearchHistoryGroup
              items={history}
              onSelect={(isbn) => {
                handleSelectHistoryItem(isbn);
                setActiveTab('consultar');
              }}
              onClear={handleClearHistory}
              onExport={handleExportHistoryCsv}
            />
          </div>
        )}

        {/* ABA 4: PRODUÇÃO & MÉTRICAS (Admin e Dev) */}
        {activeTab === 'producao' && canViewProduction && (
          <ProductionView history={history} />
        )}

        {/* ABA 5: CONFIGURAÇÕES DA LOJA & INTEGRAÇÕES (Admin e Dev) */}
        {activeTab === 'configuracoes' && canViewSettings && (
          <SettingsView />
        )}
      </main>

      {/* Footer discreto e limpo */}
      <footer className="border-t border-slate-200/80 bg-white py-4 px-6 mt-12 text-center text-xs text-slate-500">
        <p className="font-medium text-slate-600">
          Consulta ISBN para Sebos e Livrarias · Balcão de Catalogação Magazord
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
