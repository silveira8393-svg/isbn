/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */


import { updateDraftWithMetaDescription } from './utils/metaDescription';
import { useState, useEffect, useRef } from 'react';
import Header, { NavigationTab } from './components/Header';
import SearchForm from './components/SearchForm';
import TitleSearch from './components/TitleSearch';
import { editionReferences } from './utils/editionReferences';
import BookDetailsCard from './components/BookDetailsCard';
import SearchHistoryGroup from './components/SearchHistoryGroup';
import CameraScannerModal from './components/CameraScannerModal';
import MagazordStatusCard from './components/magazord/MagazordStatusCard';
import MagazordProductLookup from './components/magazord/MagazordProductLookup';
import ProductRegistrationForm from './components/magazord/ProductRegistrationForm';
import OwnerDashboard from './components/OwnerDashboard';
import { useOperationAudit } from './hooks/useOperationAudit';
import { useLocalHistory } from './hooks/useLocalHistory';
import { formatStoreDateTime, storeDateKey } from './utils/storeTime';
import { magazordPresentation } from './utils/magazordPresentation';
import { createRegistrationSnapshot } from './utils/registrationSnapshot';
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
import { searchGoogleBooks, complementWithGoogleBooks } from './services/googleBooks';
import ResearchSourcesPanel from './components/ResearchSourcesPanel';
import { initialResearchStates, researchOutcome, type ResearchSource, type ResearchState } from './utils/researchSources';
import { attachBookSourceLinks } from './utils/bookSourceLinks';
import BookSourceLinks from './components/BookSourceLinks';
import { loadCuritibaProductLink, appendCuritibaProductLinks } from './services/curitibaProductLink';
import { searchAmazonOfficial, complementWithAmazon, complementAmazonImages } from './services/amazonOfficial';
import {
  mergeBookWithDistribuidora,
  searchBookByIsbnDistribuidoraCuritiba,
  type DistribuidoraSearchResult,
} from './services/distribuidoraCuritiba';
import { cleanIsbn, isValidIsbnFormat } from './utils/isbn';
import { createRegistrationDraft, registrationConditionUpdates } from './utils/draft';
import { loadCuritibaGallery, appendCuritibaGallery, appendCuritibaGalleryToDraft } from './services/curitibaGallery';
import { magazordMockService as sharedMagazordService, type MagazordSimulationMode } from './services/magazordMockService';
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
  const [searchMode, setSearchMode] = useState<'isbn' | 'title'>('isbn');
  const [isLoading, setIsLoading] = useState(false);
  const [foundBook, setFoundBook] = useState<BookInfo | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [bibliographicState, setBibliographicState] = useState<'found' | 'not_found' | 'error' | null>(null);
  const [researchStates, setResearchStates] = useState(initialResearchStates);
  const manualEntry = foundBook?.id === 'manual-entry' || bibliographicState === 'not_found' || bibliographicState === 'error';
  const [searchedTerm, setSearchedTerm] = useState<string>('');
  const [rawSearchedTerm, setRawSearchedTerm] = useState<string>('');
  const magazordMockService = sharedMagazordService.forStore?.(currentUser.storeId) ?? sharedMagazordService;
  const { history, setHistory, clearHistory, storageWarning: historyStorageWarning } = useLocalHistory(currentUser);
  const [activeTab, setActiveTab] = useState<NavigationTab>(currentUser.role === 'admin' && canViewProduction ? 'dashboard' : 'consultar');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const { saveOperation, pending: pendingAudit, saving: savingAudit, retry: retryAudit, storageUnavailable: auditStorageUnavailable, lastConfirmation: auditConfirmation } = useOperationAudit(currentUser);
  const searchInFlight = useRef(false);
  const stockLinkInFlight = useRef(false);
  const imageUploadInFlight = useRef(false);
  const registrationCompleted = useRef(false);
  const galleryRequest = useRef<AbortController | null>(null);
  const galleryGeneration = useRef(0);
  const registrationReviewOpen = useRef(false);
  const deferredGalleryDraft = useRef<(() => void) | null>(null);
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;
  const operationEnvironmentRef = useRef(operationEnvironment);
  operationEnvironmentRef.current = operationEnvironment;
  useEffect(() => { setResearchStates(initialResearchStates()); },
    [currentUser.id, currentUser.storeId, currentUser.role, currentUser.active, operationEnvironment]);
  useEffect(() => () => {
    galleryGeneration.current++;
    galleryRequest.current?.abort();
    deferredGalleryDraft.current = null;
  }, [currentUser.id, currentUser.storeId, currentUser.role, currentUser.active, operationEnvironment]);
  const checkActionMode = useRef<MagazordSimulationMode>('auto');

  const captureActionMode = (): MagazordSimulationMode => currentUserRef.current.role === 'developer'
    ? magazordMockService.getSimulationConfig().mode
    : 'auto';
  const canShowActionResult = (actionMode: MagazordSimulationMode) => captureActionMode() === actionMode
    && (actionMode === 'auto' || currentUserRef.current.role === 'developer');

  const visibleHistory = currentUser.role === 'developer'
    ? history
    : history.filter(item => item.historyKind !== 'test');

  // Redireciona para consulta caso o perfil atual não tenha permissão na aba ativa
  useEffect(() => {
    if (activeTab === 'dashboard' && !canViewProduction) {
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
  const canViewCheck = currentUser.role === 'developer' || checkActionMode.current === 'auto';
  const visibleMagazordCheck = canViewCheck ? magazordCheckResult : null;

  useEffect(() => {
    if (currentUser.role !== 'developer' && magazordMockService.getSimulationConfig().mode !== 'auto') {
      magazordMockService.resetModeToAuto();
    }
  }, [currentUser.role]);

  // Realiza checagem simulada na API Magazord para o livro encontrado
  const runMagazordCheck = async (
    cleanedIsbn: string,
    book: BookInfo,
    actionMode: MagazordSimulationMode = captureActionMode(),
    updateSearchHistory = true
  ) => {
    setIsCheckingMagazord(true);
    setMagazordCheckError(null);

    try {
      const check = await magazordMockService.checkProductByEan(cleanedIsbn, book.title, undefined, actionMode);
      if (canShowActionResult(actionMode)) {
        checkActionMode.current = actionMode;
        setMagazordCheckResult(check);
      }

      if (!updateSearchHistory) return;
      // Atualiza o registro no histórico com status da Magazord (apenas em consultas pendentes)
      setHistory((prevHistory) => {
        const updated = prevHistory.map((item) => {
          if (
            item.isbn === cleanedIsbn &&
            (item.historyKind ?? 'operational') === (actionMode === 'auto' ? 'operational' : 'test') &&
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
        return updated;
      });
    } catch (err: any) {
      console.error('Erro na checagem Magazord simulada.');
      saveOperation({ isbn: cleanedIsbn, title: book.title, operationType: 'operation_error', status: 'error',
        errorMessage: 'Falha na consulta ao catálogo simulado.', metadata: { flow: 'magazord_check', mock: true }, completedAt: new Date().toISOString() });
      if (canShowActionResult(actionMode)) {
        checkActionMode.current = actionMode;
        setMagazordCheckError(err.message || 'Falha de comunicação simulada com a Magazord.');
      }
    } finally {
      setIsCheckingMagazord(false);
    }
  };

  // Handler to carry out lookup
  const handleSearch = async (targetIsbn: string) => {
    if (searchInFlight.current || imageUploadInFlight.current) return;
    setSearchMode('isbn');
    const cleaned = cleanIsbn(targetIsbn);
    if (!cleaned) {
      setErrorText('Por favor, informe um código ISBN válido.');
      return;
    }

    searchInFlight.current = true;
    const generation = ++galleryGeneration.current;
    galleryRequest.current?.abort();
    deferredGalleryDraft.current = null;
    const galleryController = new AbortController();
    galleryRequest.current = galleryController;
    setResearchStates(initialResearchStates());
    const actionMode = captureActionMode();
    setIsLoading(true);
    setErrorText(null);
    setBibliographicState(null);
    setFoundBook(null);
    setRegistrationDraft(null);
    registrationCompleted.current = false;
    setMagazordCheckResult(null);
    setMagazordCheckError(null);
    setSearchedTerm(cleaned);
    setRawSearchedTerm(targetIsbn);
    setActiveTab('consultar');

    try {
      const searchActor = currentUserRef.current;
      const sameActor = () => currentUserRef.current.id === searchActor.id && currentUserRef.current.storeId === searchActor.storeId
        && currentUserRef.current.role === searchActor.role && currentUserRef.current.active && operationEnvironmentRef.current === operationEnvironment;
      const showSource = (source: ResearchSource, state: ResearchState) => {
        if (sameActor() && galleryGeneration.current === generation && !galleryController.signal.aborted)
          setResearchStates(previous => ({ ...previous, [source]: state }));
      };
      showSource('amazon', 'querying');
      const amazonPending = searchAmazonOfficial(cleaned, searchActor).then(value => {
        showSource('amazon', researchOutcome(value.book, cleaned, value.status)); return value;
      });
      showSource('google_books', 'querying');
      const googleBooksPending = searchGoogleBooks(cleaned, galleryController.signal).then(value => {
        showSource('google_books', researchOutcome(value.book, cleaned, value.status, value.diagnostic.httpStatus, value.diagnostic.code)); return value;
      });
      showSource('brasil_api', 'querying');
      const result = await searchBookByIsbnBrasilApi(cleaned).catch(() => ({
        book: null, diagnostic: { status: 'FALHA_CONEXAO' },
      }));
      showSource('brasil_api', researchOutcome(result.book, cleaned, undefined, result.diagnostic.status));
      // Preserve the source order and enrichment rules, including when BrasilAPI has no book.
      showSource('curitiba', 'querying');
      const distribuidoraResult: DistribuidoraSearchResult = await searchBookByIsbnDistribuidoraCuritiba(cleaned).catch(() => ({
        book: null, diagnostic: { provider: 'Distribuidora Curitiba', status: 'FALHA_CONEXAO', state: 'unavailable', responseTimeMs: 0 },
      }));
      showSource('curitiba', researchOutcome(distribuidoraResult.book, cleaned, distribuidoraResult.diagnostic.state, distribuidoraResult.diagnostic.status));
      const galleryPending = 'gallery' in distribuidoraResult && distribuidoraResult.gallery
        ? loadCuritibaGallery(distribuidoraResult.gallery, galleryController.signal) : null;
      const productLinkPending = distribuidoraResult.book
        ? loadCuritibaProductLink(distribuidoraResult.book, cleaned, galleryController.signal) : null;
      const identifiers = cleaned.length === 13 ? { isbn13: cleaned } : { isbn10: cleaned };
      const isbnBook: BookInfo = { id: `isbn-${cleaned}`, title: '', ...identifiers };
      const primaryBook = result.book || distribuidoraResult.book ? {
        ...(distribuidoraResult.book ? mergeBookWithDistribuidora(result.book || isbnBook, distribuidoraResult.book) : result.book!),
        ...identifiers,
      } : null;
      const amazonResult = await amazonPending;
      // Never carry an account/store's supplementary data into a newer identity.
      const amazonBook = sameActor() ? amazonResult.book : null;
      const bibliographicBook = complementWithAmazon(primaryBook, amazonBook);
      const googleBooksResult = await googleBooksPending;
      const googleBooksBook = sameActor() ? googleBooksResult.book : null;
      const googleComplement = complementWithGoogleBooks(bibliographicBook, googleBooksBook, cleaned);
      const imageBook = sameActor() && amazonResult.status !== 'ambiguous'
        ? await complementAmazonImages(googleComplement, cleaned, searchActor) : googleComplement;
      if (galleryController.signal.aborted || galleryGeneration.current !== generation) return;
      const resolvedBook = sameActor() ? imageBook : primaryBook;
      const enrichedBook = resolvedBook ? attachBookSourceLinks(resolvedBook, cleaned,
        [result.book, distribuidoraResult.book, amazonBook, googleBooksBook]) : null;
      const failedStatus = (status: number | string) => status !== 404 && !(typeof status === 'number' && status >= 200 && status < 300);
      const brasilFailure = failedStatus(result.diagnostic.status);
      const curitibaFailure = distribuidoraResult.diagnostic.state === 'unavailable' || failedStatus(distribuidoraResult.diagnostic.status);
      const amazonFailure = amazonResult.status === 'unavailable';
      const googleBooksFailure = googleBooksResult.status === 'unavailable';
      const technicalFailure = brasilFailure || curitibaFailure || amazonFailure || (!enrichedBook && googleBooksFailure);
      setBibliographicState(enrichedBook ? 'found' : technicalFailure ? 'error' : 'not_found');
      if (technicalFailure) {
        const sources = [brasilFailure ? `BrasilAPI (${typeof result.diagnostic.status === 'number' ? 'HTTP ' : ''}${result.diagnostic.status})` : null,
          curitibaFailure ? `Distribuidora Curitiba (${typeof distribuidoraResult.diagnostic.status === 'number' ? 'HTTP ' : ''}${distribuidoraResult.diagnostic.status})` : null,
          amazonFailure ? 'Amazon SP-API (indisponível)' : null,
          googleBooksFailure ? 'Google Books (indisponível)' : null].filter(Boolean).join('; ');
        setErrorText(`Falha na consulta bibliográfica: ${sources}. Isso não confirma que a obra inexiste. ${enrichedBook
          ? 'Os dados disponíveis foram preservados; complete os campos ausentes no cadastro.'
          : 'Você pode continuar com cadastro manual após a verificação do simulador abaixo.'}`);
      } else if (!enrichedBook && amazonResult.status === 'ambiguous') {
        setErrorText('A Amazon SP-API retornou múltiplos registros para este ISBN. Revisão necessária: nenhum registro Amazon foi selecionado automaticamente. Você pode continuar com cadastro manual após a verificação do simulador abaixo.');
      } else if (!enrichedBook) {
        setErrorText('Nenhuma das fontes bibliográficas consultadas localizou a obra. Você pode continuar com cadastro manual após a verificação do simulador abaixo.');
      }
      const lookupBase = enrichedBook || (isValidIsbnFormat(cleaned) ? isbnBook : null);
      const lookupBook = lookupBase && sameActor() && amazonResult.candidates?.length ? {
        ...lookupBase, amazonCandidates: amazonResult.candidates, amazonReviewRequired: amazonResult.status === 'ambiguous',
      } : lookupBase;
      setFoundBook(lookupBook);
      if (lookupBook) {
        const draft = createRegistrationDraft(lookupBook);
        setRegistrationDraft(draft);
      }
      // Secondary links never delay the bibliographic result, audit, simulated lookup or opening a form.
      if (productLinkPending) void productLinkPending.then(links => {
        const current = () => sameActor() && galleryGeneration.current === generation
          && !galleryController.signal.aborted && !registrationCompleted.current;
        if (!links.length || !current()) return;
        setFoundBook(book => current() && book ? appendCuritibaProductLinks(book, links) : book);
        setRegistrationDraft(draft => current() && draft ? appendCuritibaProductLinks(draft, links) : draft);
        const reference = distribuidoraResult.book?.reference;
        if (reference) {
          const incoming = editionReferences({ isbn13: cleaned, reference, sourceLinks: links });
          setHistory(previous => previous.map(item => item.isbn === cleaned && item.userId === currentUser.id && item.storeId === currentUser.storeId
            ? { ...item, editionReferences: [...(item.editionReferences || []), ...incoming.filter(link => !item.editionReferences?.some(prior => prior.source === link.source))] } : item));
        }
      });
      if (galleryPending) void galleryPending.then(images => {
        const current = () => sameActor() && galleryGeneration.current === generation
          && !galleryController.signal.aborted && !registrationCompleted.current;
        const sameEdition = (value: {isbn13?:string;isbn10?:string}) =>
          [value.isbn13,value.isbn10].some(isbn=>isbn && cleanIsbn(isbn)===cleaned);
        if (!images.length || !current()) return;
        setFoundBook(book => current() && book && sameEdition(book) ? appendCuritibaGallery(book,images) : book);
        const updateDraft = () => {
          if (!current()) return;
          if (imageUploadInFlight.current || registrationReviewOpen.current) { deferredGalleryDraft.current = updateDraft; return; }
          deferredGalleryDraft.current = null;
          setRegistrationDraft(draft => current() && draft && sameEdition(draft)
            ? appendCuritibaGalleryToDraft(draft,images) : draft);
        };
        updateDraft();
      });

      if (enrichedBook) {

        // Add item to history with thumbnail support and audit info
        const newItem: SearchHistoryItem = {
          timestamp: Date.now(),
          historyKind: actionMode === 'auto' ? 'operational' : 'test',
          isbn: cleaned,
          title: enrichedBook.title,
          provider: enrichedBook.provider,
          editionReferences: editionReferences(enrichedBook),
          authors: enrichedBook.authors,
          success: true,
          thumbnailUrl: enrichedBook.thumbnailUrl || enrichedBook.coverUrl,
          magazordStatus: 'nao_cadastrado',
          operationType: 'pesquisa_isbn',
          userId: currentUser.id,
          storeId: currentUser.storeId,
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
            (prevHistory[0].historyKind ?? 'operational') === newItem.historyKind &&
            Date.now() - prevHistory[0].timestamp < 3000
          ) {
            return prevHistory;
          }
          const updated = [newItem, ...prevHistory].slice(0, 50);
          return updated;
        });

        // Executa a checagem simulada da Magazord
        if (isValidIsbnFormat(cleaned)) saveOperation({
          isbn: cleaned, title: enrichedBook.title, operationType: 'isbn_search', status: 'success',
          completedAt: new Date(newItem.timestamp).toISOString(),
          metadata: { resultFound: true, sources: {
            amazonSpapi: { status: amazonResult.status, resultFound: Boolean(amazonBook) },
            googleBooks: { status: googleBooksResult.status, resultFound: Boolean(googleBooksBook) },
            brasilApi: { status: result.diagnostic.status, resultFound: Boolean(result.book), partialFailure: brasilFailure },
            distribuidoraCuritiba: { status: distribuidoraResult.diagnostic.status, resultFound: Boolean(distribuidoraResult.book),
              partialFailure: curitibaFailure },
          } },
        });
      } else {
        const newItem: SearchHistoryItem = {
          timestamp: Date.now(),
          historyKind: actionMode === 'auto' ? 'operational' : 'test',
          isbn: cleaned,
          title: technicalFailure ? `Falha na consulta (${cleaned})` : `Não localizado (${cleaned})`,
          authors: undefined,
          success: false,
          operationType: 'erro_consulta',
          userId: currentUser.id,
          storeId: currentUser.storeId,
          userName: currentUser.name,
          userRole: currentUser.role,
          operationEnvironment: operationEnvironment,
        };
        setHistory((prevHistory) => {
          const updated = [newItem, ...prevHistory].slice(0, 50);
          return updated;
        });
        if (isValidIsbnFormat(cleaned)) {
          const status = result.diagnostic.status;
          const normalCompletion = !technicalFailure;
          saveOperation({
            isbn: cleaned, operationType: normalCompletion ? 'isbn_search' : 'operation_error',
            status: normalCompletion ? 'success' : 'error',
            errorMessage: normalCompletion ? undefined : 'Falha do serviço na consulta bibliográfica.',
            completedAt: new Date(newItem.timestamp).toISOString(),
            metadata: { flow: 'isbn_search', resultFound: false, sources: {
              amazonSpapi: { status: amazonResult.status, resultFound: false },
              googleBooks: { status: googleBooksResult.status, resultFound: false },
              brasilApi: { status, resultFound: false },
              distribuidoraCuritiba: { consulted: true, status: distribuidoraResult.diagnostic.status, resultFound: false, partialFailure: curitibaFailure },
            } },
          });
        }
      }
      if (lookupBook) void runMagazordCheck(cleaned, lookupBook, actionMode, Boolean(enrichedBook));
    } catch (err: any) {
      console.error('Falha ao concluir pesquisa bibliográfica.');
      setErrorText('Não foi possível conectar ao serviço de consulta.');
      setBibliographicState('error');
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
    clearHistory();
  };

  const handleStartManualRegistration = () => {
    if (searchInFlight.current || imageUploadInFlight.current) return;
    galleryGeneration.current++;
    galleryRequest.current?.abort();
    deferredGalleryDraft.current = null;
    const book: BookInfo = { id: 'manual-entry', title: '' };
    setFoundBook(book);
    setRegistrationDraft(createRegistrationDraft(book));
    registrationCompleted.current = false;
    setMagazordCheckResult(null);
    setMagazordCheckError(null);
    setBibliographicState(null);
    setErrorText(null);
    setSearchedTerm('');
    setRawSearchedTerm('');
    setIsbnValue('');
    setResearchStates(initialResearchStates());
    setActiveTab('cadastro');
  };

  const handleConfirmTitleResult = (book: BookInfo) => {
    if (searchInFlight.current || imageUploadInFlight.current || registrationReviewOpen.current) return;
    galleryGeneration.current++;
    galleryRequest.current?.abort();
    deferredGalleryDraft.current = null;
    setFoundBook(book);
    setRegistrationDraft(createRegistrationDraft(book));
    registrationCompleted.current = false;
    setMagazordCheckResult(null);
    setMagazordCheckError(null);
    setBibliographicState('found');
    setErrorText(null);
    const isbn = book.isbn13 || book.isbn10 || '';
    const titleHistoryItem: SearchHistoryItem = { timestamp: Date.now(), isbn, title: book.title, authors: book.authors,
      provider: book.provider, editionReferences: editionReferences(book), success: true,
      historyKind: 'operational', operationType: 'pesquisa_titulo', userId: currentUser.id, storeId: currentUser.storeId,
      userName: currentUser.name, userRole: currentUser.role, operationEnvironment };
    setHistory(previous => [titleHistoryItem, ...previous].slice(0, 50));
    setSearchedTerm(isbn);
    setRawSearchedTerm('');
    setIsbnValue(isbn);
    setResearchStates(initialResearchStates());
    setActiveTab('cadastro');
  };

  // Abre a tela única de cadastro garantindo a condição desejada (Novo ou Usado)
  const handleOpenRegistration = (condition?: BookCondition) => {
    if (!foundBook || imageUploadInFlight.current) return;
    const targetCondition =
      condition ||
      (foundBook.id === 'manual-entry' ? registrationDraft?.condition : undefined) ||
      visibleMagazordCheck?.existingCondition ||
      'novo';
    // Ordinary navigation must not recreate the same edition/condition and discard manual edits.
    const sameEdition = registrationDraft && (foundBook.id === 'manual-entry' || cleanIsbn(registrationDraft.isbn13 || registrationDraft.isbn10)
      === cleanIsbn(foundBook.isbn13 || foundBook.isbn10 || ''));
    if (foundBook.id === 'manual-entry' && registrationDraft && !registrationCompleted.current) {
      setRegistrationDraft(targetCondition === registrationDraft.condition ? registrationDraft
        : updateDraftWithMetaDescription(registrationDraft, registrationConditionUpdates(registrationDraft, targetCondition)));
      setActiveTab('cadastro');
      return;
    }
    let draft = sameEdition && registrationDraft.condition === targetCondition && !registrationCompleted.current
      ? registrationDraft : createRegistrationDraft(foundBook, targetCondition);
    // Bibliographic corrections describe the edition. Commercial codes, stock and copy photographs do not.
    if (sameEdition && registrationDraft.condition !== targetCondition && !registrationCompleted.current) {
      const { title, subtitle, authors, publisher, year, edition, language, format, pageCount,
        weight, weightUnit, width, height, depth, synopsis, description } = registrationDraft;
      draft = updateDraftWithMetaDescription(draft, { title, subtitle, authors: [...authors], publisher, year, edition,
        language, format, pageCount, weight, weightUnit, width, height, depth, synopsis, description });
    }
    setRegistrationDraft(draft);
    registrationCompleted.current = false;
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
      (visibleMagazordCheck?.existingCondition === 'novo' ? visibleMagazordCheck?.childCode : undefined);

    if (stockLinkInFlight.current) throw new Error('Vinculação já em andamento.');
    const actionMode = captureActionMode();
    stockLinkInFlight.current = true;
    let result: Awaited<ReturnType<typeof magazordMockService.addStockToExistingProduct>>;
    try {
      result = await magazordMockService.addStockToExistingProduct(ean, quantityToAdd, targetChildCode, actionMode);
    } catch (err) {
      saveOperation({
        isbn: searchedTerm || foundBook.isbn13 || foundBook.isbn10, title: foundBook.title,
        condition: 'new', operationType: 'operation_error', status: 'error',
        parentCode: targetItem?.parentCode || visibleMagazordCheck?.parentCode, childCode: targetChildCode,
        errorMessage: 'Falha ao concluir a vinculação de estoque simulada.',
        metadata: { flow: 'new_product_reused', mock: true }, completedAt: new Date().toISOString(),
      });
      throw err;
    } finally {
      stockLinkInFlight.current = false;
    }

    // Atualiza imediatamente o estado de checagem em tela para refletir o novo saldo de estoque
    if (canShowActionResult(actionMode)) setMagazordCheckResult((prev) => {
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
      historyKind: actionMode === 'auto' ? 'operational' : 'test',
      isbn: searchedTerm || ean,
      title: foundBook.title,
      provider: foundBook.provider,
      editionReferences: editionReferences(foundBook),
      authors: foundBook.authors,
      thumbnailUrl: foundBook.thumbnailUrl || foundBook.coverUrl,
      success: true,
      magazordStatus: 'localizado',
      condition: 'novo',
      operationType: 'reaproveitamento_produto_novo',
      parentCode: targetItem?.parentCode || visibleMagazordCheck?.parentCode,
      childCode: targetItem?.childCode || visibleMagazordCheck?.childCode,
      userId: currentUser.id,
      storeId: currentUser.storeId,
      userName: currentUser.name,
      userRole: currentUser.role,
      operationEnvironment: operationEnvironment,
    };

    setHistory((prevHistory) => {
      const updated = [auditItem, ...prevHistory].slice(0, 50);
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
    savedDraft: RegistrationDraft,
    actionMode: MagazordSimulationMode = captureActionMode()
  ) => {
    // Registra evento de auditoria operacional do cadastro concluído
    registrationCompleted.current = result.success;
    const currentIsbn = searchedTerm || savedDraft.isbn13 || savedDraft.ean || savedDraft.isbn10;
    const opType: OperationType =
      savedDraft.condition === 'usado'
        ? 'novo_usado_com_edicao_conhecida'
        : 'novo_cadastro';

    const auditItem: SearchHistoryItem = {
      timestamp: Date.now(),
      historyKind: actionMode === 'auto' ? 'operational' : 'test',
      isbn: currentIsbn,
      title: savedDraft.title,
      provider: foundBook?.provider,
      editionReferences: savedDraft.editionReferences || (foundBook ? editionReferences(foundBook) : undefined),
      authors: foundBook?.authors || [],
      thumbnailUrl: savedDraft.mainImageUrl || foundBook?.thumbnailUrl,
      success: true,
      magazordStatus: 'cadastrado_simulado',
      parentCode: result.parentCode,
      childCode: result.childCode,
      condition: savedDraft.condition,
      operationType: opType,
      userId: currentUser.id,
      storeId: currentUser.storeId,
      userName: currentUser.name,
      userRole: currentUser.role,
      operationEnvironment: operationEnvironment,
    };

    setHistory((prevHistory) => {
      const updated = [auditItem, ...prevHistory].slice(0, 50);
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
        ...(result.success ? { registrationSnapshot: JSON.parse(JSON.stringify(createRegistrationSnapshot(savedDraft, new Date(result.registeredAt).toISOString()))) } : {}),
        bibliographicSource: foundBook?.enrichmentSource || foundBook?.provider || null },
      completedAt: new Date(result.registeredAt).toISOString(),
    });
    void magazordMockService.checkProductByEan(currentIsbn || savedDraft.childCode, savedDraft.title, undefined, actionMode).then((freshCheck) => {
      if (canShowActionResult(actionMode)) {
        checkActionMode.current = actionMode;
        setMagazordCheckResult(freshCheck);
      }
    }).catch(() => {
      saveOperation({ isbn: currentIsbn, title: savedDraft.title, operationType: 'operation_error', status: 'error',
        parentCode: result.parentCode, childCode: result.childCode, errorMessage: 'Cadastro simulado concluído; falha na reconsulta do catálogo simulado.',
        metadata: { flow: 'magazord_post_registration_check', mock: true }, completedAt: new Date().toISOString() });
      if (canShowActionResult(actionMode)) setMagazordCheckError('Falha ao atualizar a consulta ao simulador Magazord.');
    });
  };

  // Prepara interface para o próximo livro
  const handleProcessNextBook = () => {
    if (imageUploadInFlight.current) return;
    galleryGeneration.current++;
    galleryRequest.current?.abort();
    deferredGalleryDraft.current = null;
    setFoundBook(null);
    setRegistrationDraft(null);
    registrationCompleted.current = false;
    setMagazordCheckResult(null);
    setMagazordCheckError(null);
    setIsbnValue('');
    setErrorText(null);
    setBibliographicState(null);
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
    if (visibleHistory.length === 0) return;

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

    const rows = visibleHistory.map((item) => {
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
          ? 'Localizado no simulador'
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

      const timestamp = formatStoreDateTime(item.timestamp);
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
    const dateStamp = storeDateKey(Date.now());

    link.href = url;
    link.download = `historico-isbn-${dateStamp}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const operationalView = activeTab === 'consultar' || activeTab === 'cadastro';
  const lightWorkspace = operationalView || activeTab === 'historico';

  return (
    <div className={`isbn-app-shell ${lightWorkspace ? 'isbn-operational' : ''} min-h-screen bg-slate-50 flex flex-col selection:bg-blue-100 selection:text-blue-800`}>
      {/* 1. Header azul profissional com navegação Consultar | Cadastro | Histórico */}
      <div className="isbn-store-context border-b bg-white px-4 py-2 text-xs text-slate-600">Loja operacional: <strong>{currentUser.storeName}</strong>
        {magazordMockService.hasUnscopedLegacyCatalog?.() && <p>O catálogo simulado agora é separado por loja. Registros locais antigos sem identificação de loja estão preservados, sem atribuição automática.</p>}
      </div>
      <Header
        activeTab={activeTab}
        onTabChange={(tab) => { if (imageUploadInFlight.current) return; setActiveTab(
          (tab === 'dashboard' && !canViewProduction) || (tab === 'configuracoes' && !canViewSettings)
            ? 'consultar' : tab
        ); }}
        historyCount={visibleHistory.length}
        hasActiveDraft={Boolean(registrationDraft)}
      />

      {/* 2. Main Content Viewport */}
      <main className={`isbn-workspace ${activeTab === 'dashboard' ? 'max-w-[1440px]' : 'max-w-7xl'} mx-auto px-4 sm:px-6 py-6 flex-1 w-full`}>
        <p data-integration-mode={magazordPresentation.mode} className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{magazordPresentation.notice}</p>
        {savingAudit > 0 && <p role="status" className="mb-3 text-sm text-slate-600">Confirmando auditoria de {savingAudit} operação(ões)...</p>}
        {auditConfirmation && <p role="status" className="mb-3 break-words text-xs text-slate-600">Último evento com auditoria confirmada: {auditConfirmation.eventId} · {formatStoreDateTime(auditConfirmation.at)} (São Paulo). Este registro não comprova publicação na Magazord.</p>}
        {historyStorageWarning && <p role="alert" className="mb-3 rounded bg-amber-50 p-3 text-sm text-amber-900">O histórico local deste usuário e loja não pôde ser lido ou salvo. Os eventos centralizados de auditoria continuam independentes.</p>}
        {auditStorageUnavailable && <p role="alert" className="mb-3 rounded bg-rose-50 p-3 text-sm text-rose-800">Não foi possível preservar a fila de auditoria nesta sessão do navegador. Não recarregue nem encerre a sessão enquanto houver eventos pendentes; registre os IDs abaixo como evidência.</p>}
        {pendingAudit.length > 0 && <div role="alert" className="mb-4 p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-sm space-y-2">
          <p>{pendingAudit.length} operação(ões) sem confirmação de registro no Supabase. O resultado e o histórico local foram preservados quando disponíveis. O Dashboard pode estar incompleto. Mantenha esta página aberta até confirmar o reenvio.</p>
          <button type="button" onClick={retryAudit} className="font-semibold underline cursor-pointer">Reenviar auditoria pendente</button>
          <details><summary className="cursor-pointer">IDs pendentes para evidência</summary><ul>{pendingAudit.map(entry => <li key={entry.input.id}>{entry.input.id} · {entry.input.operationType} · {entry.input.completedAt}</li>)}</ul></details>
        </div>}
        {operationalView && <div className="isbn-shared-search">
          <div className="mb-3 flex gap-2" aria-label="Modo de pesquisa">
            <button type="button" disabled={isLoading} aria-pressed={searchMode === 'isbn'} onClick={() => setSearchMode('isbn')} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700">Por ISBN</button>
            <button type="button" disabled={isLoading} aria-pressed={searchMode === 'title'} onClick={() => setSearchMode('title')} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700">Por título</button>
          </div>
          {searchMode === 'title' && activeTab === 'consultar' && <div key={`${currentUser.id}:${currentUser.storeId}:${currentUser.role}:${currentUser.active}:${operationEnvironment}`}><TitleSearch user={currentUser} environment={operationEnvironment} onConfirm={handleConfirmTitleResult} disabled={isLoading} /></div>}
          {searchMode === 'isbn' && <>
          <SearchForm
            onSearch={handleSearch}
            isLoading={isLoading}
            isbnValue={isbnValue}
            setIsbnValue={setIsbnValue}
            onOpenScanner={() => setIsScannerOpen(true)}
          />
          <ResearchSourcesPanel states={researchStates} />
          </>}
        </div>}
        {/* ABA 1: CONSULTAR */}
        {activeTab === 'consultar' && searchMode === 'isbn' && (
          <div className="isbn-query-layout grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Main Area: Pesquisa e Resultado (8 cols no desktop) */}
            <div className="isbn-query-main space-y-6 lg:col-span-8">
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
                <div role={bibliographicState === 'not_found' ? 'status' : 'alert'} className="bg-white rounded-xl border border-red-200 shadow-xs p-6 animate-fade-in">
                  <div className="flex items-start gap-3.5">
                    <div className="p-2.5 bg-red-50 text-red-600 rounded-lg border border-red-100 shrink-0">
                      <AlertCircle className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold text-slate-900">
                        {bibliographicState === 'found' ? 'Consulta bibliográfica parcial' : bibliographicState === 'not_found' && researchStates.amazon === 'review_required' ? 'Revisão bibliográfica necessária' : bibliographicState === 'not_found' ? 'Obra não localizada nas fontes consultadas' : 'Falha na consulta bibliográfica'}
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
                <div className="isbn-query-result space-y-6 animate-fade-in">
                  {/* Card de Status e Ação Magazord (Regras de Novos e Usados) */}
                  <MagazordStatusCard
                    checkResult={visibleMagazordCheck}
                    isChecking={isCheckingMagazord}
                    checkError={canViewCheck ? magazordCheckError : null}
                    book={foundBook}
                    manualEntry={manualEntry}
                    onOpenRegistration={handleOpenRegistration}
                    onRetryCheck={() => runMagazordCheck(searchedTerm, foundBook, captureActionMode(), !manualEntry)}
                    onResetForNextBook={handleProcessNextBook}
                    onLinkStock={handleLinkStock}
                  />

                  <MagazordProductLookup user={currentUser} isbn={foundBook.isbn13 || foundBook.isbn10 || searchedTerm} />
                  {/* Ficha Bibliográfica Completa (Preservada do projeto original) */}
                  {!manualEntry && <BookDetailsCard book={foundBook} />}
                  {manualEntry && <BookSourceLinks book={foundBook} />}
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
                    Digite ou leia o código de barras ISBN para carregar a ficha técnica nacional e preparar o cadastro no simulador Magazord.
                  </p>
                  <div className="mt-6 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono text-slate-600">
                    <span>Dica: Use um leitor USB ou clique em</span>
                    <strong className="text-blue-700">Câmera</strong>
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar Area: Histórico Recente (4 cols no desktop) */}
            <div className="isbn-query-history hidden lg:block lg:col-span-4 space-y-6">
              <SearchHistoryGroup
                items={visibleHistory}
                onSelect={handleSelectHistoryItem}
                onClear={handleClearHistory}
                onExport={handleExportHistoryCsv}
              />
            </div>
          </div>
        )}

        {/* ABA 2: CADASTRO MAGAZORD EM TELA ÚNICA */}
        {activeTab === 'cadastro' && (
          <div className="isbn-registration-view w-full mx-auto">
            {registrationDraft && foundBook ? (
              <ProductRegistrationForm
                draft={registrationDraft}
                captureActionMode={captureActionMode}
                simulationService={magazordMockService}
                originalBook={foundBook}
                imageUser={currentUser}
                onImageUploadBusyChange={busy => { imageUploadInFlight.current = busy; if (!busy) deferredGalleryDraft.current?.(); }}
                onReviewStateChange={reviewing => { registrationReviewOpen.current = reviewing; if (!reviewing) deferredGalleryDraft.current?.(); }}
                onUpdateDraft={(updates) =>
                  setRegistrationDraft((prev) => (prev ? updateDraftWithMetaDescription(prev, updates) : null))
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
                  Consulte o ISBN para preencher os dados disponíveis ou inicie o cadastro manual de uma obra com ou sem ISBN.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('consultar')}
                  className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md transition-all cursor-pointer"
                >
                  <Search className="w-4 h-4" />
                  <span>Consultar por ISBN</span>
                </button>
                <button type="button" onClick={handleStartManualRegistration} disabled={isLoading}
                  className="mt-3 inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold text-sm transition-all cursor-pointer disabled:opacity-50">
                  <BookOpen className="w-4 h-4" />
                  <span>Iniciar cadastro manual</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ABA 3: HISTÓRICO */}
        {activeTab === 'historico' && (
          <div className="isbn-history-page max-w-4xl mx-auto">
            <SearchHistoryGroup
              items={visibleHistory}
              onSelect={(isbn) => {
                handleSelectHistoryItem(isbn);
                setActiveTab('consultar');
              }}
              onClear={handleClearHistory}
              onExport={handleExportHistoryCsv}
            />
          </div>
        )}

        {/* ABA 4: DASHBOARD OPERACIONAL (Admin e Dev) */}
        {activeTab === 'dashboard' && canViewProduction && (
          <OwnerDashboard key={`${currentUser.id}:${currentUser.storeId}:${currentUser.role}`} />
        )}

        {/* ABA 5: CONFIGURAÇÕES DA LOJA & INTEGRAÇÕES (Admin e Dev) */}
        {activeTab === 'configuracoes' && canViewSettings && (
          <SettingsView />
        )}
      </main>

      {/* Footer discreto e limpo */}
      <footer className="border-t border-slate-200/80 bg-white py-4 px-6 mt-12 text-center text-xs text-slate-500">
        <p className="font-medium text-slate-600">
          Consulta ISBN para Sebos e Livrarias · Magazord simulada
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
