/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useRef } from 'react';
import {
  RegistrationDraft,
  MagazordRegistrationResult,
  BookInfo,
  User,
} from '../../types';
import { magazordMockService as sharedMagazordService, type MagazordSimulationMode } from '../../services/magazordMockService';
import { buildFinalDescription, formatRegistrationPrice, parseRegistrationPrice, registrationModeForCondition, validateRegistrationDraft } from '../../utils/draft';
import { cleanIsbn } from '../../utils/isbn';
import { formatPhysicalMeasurement, normalizeLanguage, roundPhysicalMeasurement } from '../../utils/bibliographicNormalization';
import RegistrationImage from '../dashboard/RegistrationImage';
import { imageReferences } from '../../utils/imageUrls';
import ProductIdentitySection from './ProductIdentitySection';
import MagazordProductLookup from './MagazordProductLookup';
import CategoryAndBrandSection from './CategoryAndBrandSection';
import { useMagazordCategories } from '../../hooks/useMagazordCategories';
import CommercialSection from './CommercialSection';
import BibliographicSection from './BibliographicSection';
import PhysicalAttributesSection from './PhysicalAttributesSection';
import ImagesSection from './ImagesSection';
import SynopsisSection from './SynopsisSection';
import SeoSection from './SeoSection';
import AdvancedFiscalSection from './AdvancedFiscalSection';
import RegistrationSummary from './RegistrationSummary';
import {
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  Send,
  BookOpen,
} from 'lucide-react';

interface ProductRegistrationFormProps {
  simulationService?: typeof sharedMagazordService;
  draft: RegistrationDraft;
  originalBook: BookInfo;
  captureActionMode?: () => MagazordSimulationMode;
  onUpdateDraft: (updates: Partial<RegistrationDraft>) => void;
  onBackToSearch: () => void;
  onSuccessRegistration: (result: MagazordRegistrationResult, draft: RegistrationDraft, actionMode?: MagazordSimulationMode) => void;
  onRegistrationError?: (draft: RegistrationDraft) => void;
  onProcessNextBook: () => void;
  imageUser?: User;
  onImageUploadBusyChange?: (busy: boolean) => void;
  onReviewStateChange?: (reviewing: boolean) => void;
}

export default function ProductRegistrationForm({
  simulationService = sharedMagazordService,
  draft,
  originalBook,
  captureActionMode,
  onUpdateDraft,
  onBackToSearch,
  onSuccessRegistration,
  onRegistrationError,
  onProcessNextBook,
  imageUser,
  onImageUploadBusyChange,
  onReviewStateChange,
}: ProductRegistrationFormProps) {
  const magazordMockService = simulationService;
  const categories = useMagazordCategories(imageUser);
  const validateDraft = (value: RegistrationDraft) => {
    const result = validateRegistrationDraft(value, originalBook);
    if (value.categorySource !== 'magazord' || !Number.isSafeInteger(value.magazordCategoryId) || value.magazordCategoryId! <= 0
      || !imageUser?.storeId || value.magazordCategoryStoreId !== imageUser.storeId
      || (categories.catalog && !categories.catalog.categories.some(category => category.id === value.magazordCategoryId)))
      result.errors.category = 'Selecione uma categoria real da loja antes de concluir o cadastro simulado.';
    return result;
  };
  const [reviewing, setReviewing] = useState(false);
  const [reviewRequested, setReviewRequested] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [touchedCodes, setTouchedCodes] = useState<Record<string, boolean>>({});
  const [focusField, setFocusField] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<MagazordRegistrationResult | null>(null);
  const submissionInFlight = useRef(false);
  const submissionCompleted = useRef(false);
  const reviewOpen = useRef(false);
  useEffect(() => () => onReviewStateChange?.(false), []);
  const currentDraft = useRef(draft);
  currentDraft.current = draft;
  const submittedDraft = useRef<RegistrationDraft | null>(null);
  const imageUploadInFlight = useRef(false);
  const [imageUploadBusy, setImageUploadBusy] = useState(false);
  const pendingPhotos = useRef(0);
  const [pendingPhotoCount, setPendingPhotoCount] = useState(0);
  const [pendingAttention, setPendingAttention] = useState(false);
  const handleImageBusy = (busy: boolean) => {
    imageUploadInFlight.current = busy; setImageUploadBusy(busy); onImageUploadBusyChange?.(busy);
  };

  const handlePendingPhotos = (count: number) => {
    pendingPhotos.current = count; setPendingPhotoCount(count);
    if (!count) setPendingAttention(false);
  };
  const validation = validateDraft(draft);
  const visibleRequired = Object.entries(validation.errors).filter(([field]) => field !== editingField);
  const errors = Object.fromEntries(Object.entries({ ...validation.warnings, ...validation.errors }).filter(([field]) => field !== editingField
    && !(validation.errors[field] && ['parentCode', 'childCode'].includes(field) && !reviewRequested && !touchedCodes[field] && !draft[field as 'parentCode' | 'childCode']?.trim())));
  const validFields = ['parentCode', 'childCode', 'title', 'category', 'price', 'quantity', 'isbn13', 'isbn10', 'ean', 'publisher', 'year', 'edition', 'language', 'format', 'pageCount', 'weight', 'width', 'height', 'depth']
    .filter(field => !validation.errors[field] && !validation.warnings[field] && field !== editingField && draft[field as keyof RegistrationDraft] != null && String(draft[field as keyof RegistrationDraft]).trim() !== '');
  useEffect(() => {
    if (!focusField || typeof document === 'undefined') return;
    const element = document.querySelector<HTMLElement>(`[data-registration-form] [data-registration-field="${focusField}"]`);
    element?.scrollIntoView?.({ behavior: 'smooth', block: 'center' }); element?.focus?.({ preventScroll: true });
    setFocusField(null);
  }, [focusField]);

  const requestReview = () => {
    if (reviewOpen.current || submissionInFlight.current || submissionCompleted.current || imageUploadInFlight.current) return;
    setEditingField(null); setReviewRequested(true); setSubmitError(null);
    const result = validateDraft(currentDraft.current);
    const firstError = Object.keys(result.errors)[0];
    if (firstError) { setFocusField(firstError); return; }
    if (pendingPhotos.current) { setPendingAttention(true); setFocusField('pendingPhotos'); return; }
    reviewOpen.current = true; onReviewStateChange?.(true); setReviewing(true); setFocusField('review');
  };

  const handleSubmit = async () => {
    if (!reviewOpen.current || submissionInFlight.current || submissionCompleted.current || successResult || imageUploadInFlight.current) return;
    setSubmitError(null);
    const draft = currentDraft.current;
    const firstError = Object.keys(validateDraft(draft).errors)[0];
    if (firstError || pendingPhotos.current) {
      reviewOpen.current = false; onReviewStateChange?.(false); setReviewing(false); setEditingField(null); setReviewRequested(true);
      setPendingAttention(Boolean(pendingPhotos.current)); setFocusField(firstError || 'pendingPhotos'); return;
    }

    submissionInFlight.current = true;
    const actionMode = captureActionMode?.() ?? magazordMockService.getSimulationConfig().mode;
    setIsSubmitting(true);

    try {
      // Reuse the store-scoped simulator lookup. Internal codes stay out of ISBN/EAN.
      // Existing automatic registration/upsert semantics are unchanged.
      if (originalBook.id === 'manual-entry') {
        const records = magazordMockService.getRecordsForEan(draft.childCode, actionMode);
        if (records.some(record => cleanIsbn(record.childCode) === cleanIsbn(draft.childCode)))
          throw new Error('Código Filho já utilizado nesta loja. Confira o código comercial interno antes de concluir.');
      }
      const finalDescription = buildFinalDescription(draft);
      const images = imageReferences([draft.mainImageUrl, ...(draft.additionalImageUrls || [])]);
      const draftToSubmit: RegistrationDraft = {
        ...draft,
        registrationMode: registrationModeForCondition(draft.condition, draft.registrationMode),
        authors: [...(draft.authors || [])],
        mainImageUrl: images[0],
        additionalImageUrls: images.slice(1),
        description: finalDescription,
        price: parseRegistrationPrice(draft.price)!.toFixed(2).replace('.', ','),
        ean: cleanIsbn(draft.ean), isbn13: cleanIsbn(draft.isbn13), isbn10: cleanIsbn(draft.isbn10),
        language: normalizeLanguage(draft.language),
        weight: draft.weight == null ? undefined : roundPhysicalMeasurement(draft.weight * (draft.weightUnit === 'kg' ? 1000 : 1)), weightUnit: 'g',
      };
      const result = await magazordMockService.createProduct(draftToSubmit, actionMode);
      if (!result.success) throw new Error('Cadastro simulado não concluído.');
      submissionCompleted.current = true;
      submittedDraft.current = draftToSubmit;
      setSuccessResult(result);
      onSuccessRegistration(result, draftToSubmit, actionMode);
    } catch (err: any) {
      console.error('Falha no cadastro simulado Magazord.');
      setSubmitError(
        err.message || 'Falha ao processar cadastro na API Magazord simulada.'
      );
      onRegistrationError?.(draft);
    } finally {
      submissionInFlight.current = false;
      setIsSubmitting(false);
    }
  };

  // Se o cadastro foi concluído com sucesso, exibir a tela de confirmação
  if (successResult) {
    const draft = submittedDraft.current || currentDraft.current;
    const sentDescription = draft.description || buildFinalDescription(draft);

    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-md p-6 sm:p-10 max-w-3xl mx-auto my-6 animate-fade-in text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto shadow-sm">
          <CheckCircle2 className="w-10 h-10 stroke-[2]" />
        </div>

        <div className="space-y-1">
          <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">
            Simulação concluída
          </span>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight pt-2">
            Cadastro simulado concluído
          </h2>
          <p className="text-sm text-slate-600 max-w-lg mx-auto">
            Os dados foram processados pelo catálogo simulado deste navegador. Nenhum produto ou estoque foi publicado na Magazord ou nos marketplaces. A confirmação da auditoria aparece no aviso geral do aplicativo.
          </p>
        </div>

        {/* Resumo dos códigos gerados/utilizados */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-left grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto text-xs">
          <div>
            <span className="text-slate-500 block">Título do Produto</span>
            <span className="font-bold text-slate-900 text-sm line-clamp-1">{draft.title}</span>
          </div>
          <div>
            <span className="text-slate-500 block">Condição Cadastrada</span>
            <span className="font-bold text-slate-900 uppercase">
              {draft.condition === 'novo' ? 'Novo' : 'Usado (Sebo)'}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Código Pai</span>
            <span className="font-mono font-bold text-slate-900 text-sm">
              {successResult.parentCode}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Código Filho (Derivação)</span>
            <span className="font-mono font-bold text-slate-900 text-sm">
              {successResult.childCode}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Preço de Venda</span>
            <span className="font-bold text-emerald-700 text-sm">{formatRegistrationPrice(draft.price)}</span>
          </div>
          <div>
            <span className="text-slate-500 block">Estoque Inicial</span>
            <span className="font-bold text-slate-900 text-sm">{draft.quantity} UN</span>
          </div>

          {/* Descrição Final Composta enviada ao Magazord */}
          {sentDescription && (
            <div className="col-span-1 sm:col-span-2 pt-2 border-t border-slate-200">
              <span className="text-slate-500 block font-semibold mb-1">
                Descrição armazenada no simulador (campo único)
              </span>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-slate-700 whitespace-pre-line text-[11px] leading-relaxed max-h-32 overflow-y-auto">
                {sentDescription}
              </div>
            </div>
          )}
        </div>

        {/* Ação principal: Próximo livro */}
        <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={onProcessNextBook}
            id="btn-process-next-book"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md transition-all cursor-pointer"
          >
            <span>Processar Próximo Produto</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  const hasErrors = Object.keys(validation.errors).length > 0;
  const reviewedImages = imageReferences([draft.mainImageUrl, ...(draft.additionalImageUrls || [])]);
  const reviewRows: [string, unknown][] = [
    ['Título', draft.title], ['Subtítulo', draft.subtitle], ['EAN', draft.ean], ['ISBN-13', draft.isbn13], ['ISBN-10', draft.isbn10],
    ['Autores', draft.authors?.join('; ')], ['Editora', draft.publisher], ['Ano', draft.year], ['Edição', draft.edition],
    ['Idioma', normalizeLanguage(draft.language)], ['Páginas', draft.pageCount], ['Formato', draft.format],
    ['Condição', draft.condition === 'usado' ? 'USADO' : 'NOVO'], ['Modo', draft.condition === 'usado' ? 'Novo exemplar usado' : draft.registrationMode === 'reuse_existing_new' ? 'Reaproveitamento de produto novo' : 'Novo produto'],
    ...(draft.condition === 'usado' ? [['Conservação', draft.usedBookConditionNotes] as [string, unknown]] : []),
    ['Código Pai', draft.parentCode], ['Código Filho', draft.childCode], ['Preço', formatRegistrationPrice(draft.price)],
    ['Quantidade', draft.quantity], ['Localização', draft.location], ['Categoria', draft.category], ['Marca', draft.brand],
    ['Peso', draft.weight == null ? undefined : `${formatPhysicalMeasurement(draft.weight * (draft.weightUnit === 'kg' ? 1000 : 1))} g`],
    ['Largura', draft.width == null ? undefined : `${formatPhysicalMeasurement(draft.width)} cm`], ['Altura', draft.height == null ? undefined : `${formatPhysicalMeasurement(draft.height)} cm`], ['Espessura / profundidade', draft.depth == null ? undefined : `${formatPhysicalMeasurement(draft.depth)} cm`],
    ['NCM', draft.ncm], ['Origem fiscal', draft.fiscalOrigin], ['Benefício Fiscal (cBenef)', draft.fiscalBenefitCode], ['Unidade', draft.unit],
  ];

  return (
    <div data-registration-form className="space-y-6 animate-fade-in w-full pb-16">
      <style>{[
        ...validFields.map(field => `[data-registration-form] [data-registration-field="${field}"] { border-color: #6ee7b7; }`),
        ...Object.keys(errors).map(field => `[data-registration-form] [data-registration-field="${field}"] { border-color: #f87171; background-color: #361e29; }`),
      ].join('\n')}</style>
      {reviewing && <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 sm:p-7" aria-label="Revisão do cadastro">
        <h2 data-registration-field="review" tabIndex={-1} className="text-xl font-bold text-slate-900">Revisão do cadastro</h2>
        <p className="text-sm text-slate-600">Confira os dados e as imagens selecionadas. A operação será executada somente ao confirmar, no simulador existente.</p>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{reviewRows.map(([label, value]) => <div key={label} className="min-w-0">
          <dt className="text-xs text-slate-500">{label}</dt><dd className="break-words text-sm font-medium text-slate-900">{value == null || value === '' ? 'Não informado' : String(value)}</dd>
        </div>)}</dl>
        {Object.keys(validation.warnings).length > 0 && <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800" role="status">
          <p className="font-bold">Observações informativas — não impedem a confirmação</p>
          <ul className="mt-2 list-inside list-disc space-y-1">{Object.entries(validation.warnings).map(([field, message]) => <li key={field}>{message}</li>)}</ul>
        </div>}
        <div><h3 className="text-sm font-bold">Meta Description</h3><p className="whitespace-pre-wrap text-sm text-slate-700">{draft.metaDescription || 'Não informada'}</p></div>
        {draft.synopsis && <div><h3 className="text-sm font-bold">Sinopse</h3><p className="whitespace-pre-wrap text-sm text-slate-700">{draft.synopsis}</p></div>}
        {buildFinalDescription(draft) && <div><h3 className="text-sm font-bold">Descrição final</h3><p className="whitespace-pre-wrap text-sm text-slate-700">{buildFinalDescription(draft)}</p></div>}
        <div><h3 className="mb-3 text-sm font-bold">Imagens selecionadas</h3>{reviewedImages.length ? <div className="grid gap-4 sm:grid-cols-3">{reviewedImages.map((url, index) => <div key={url}><RegistrationImage url={url} label={index ? `Imagem adicional ${index}` : 'Capa principal'} /></div>)}</div> : <p className="text-sm text-slate-500">Sem imagens. O cadastro pode continuar.</p>}</div>
        {submitError && <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{submitError}</p>}
        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" id="btn-return-to-registration" disabled={isSubmitting} onClick={() => { if (submissionInFlight.current) return; reviewOpen.current = false; onReviewStateChange?.(false); setReviewing(false); }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-60">Retornar ao cadastro</button>
          <button type="button" id="btn-confirm-magazord-registration" disabled={isSubmitting || imageUploadBusy} onClick={handleSubmit} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-60">{isSubmitting ? 'Confirmando cadastro...' : 'Confirmar cadastro'}</button>
        </div>
      </section>}
      <div hidden={reviewing} className="isbn-registration-editor space-y-6" onChangeCapture={event => {
        const field = (event.target as HTMLElement).getAttribute?.('data-registration-field'); if (field) setEditingField(field);
      }} onBlurCapture={event => {
        const field = (event?.target as HTMLElement | undefined)?.getAttribute?.('data-registration-field');
        if (field === 'parentCode' || field === 'childCode') setTouchedCodes(previous => ({ ...previous, [field]: true }));
        setEditingField(null);
      }}>
      {/* Barra de Navegação e Título da Tela */}
      <div className="isbn-registration-heading bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => { if (!imageUploadInFlight.current) onBackToSearch(); }}
            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
            title="Voltar para a pesquisa de ISBN"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">
                Cadastro bibliográfico
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                {originalBook.id === 'manual-entry' ? 'Cadastro manual' : 'Pré-preenchido'}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Confira os dados bibliográficos, insira a etiqueta física (Código Pai) e o preço de venda.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
          <button
            type="button"
            onClick={() => { if (!imageUploadInFlight.current) onBackToSearch(); }}
            className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={requestReview}
            disabled={isSubmitting || imageUploadBusy}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Preparando cadastro...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Revisar cadastro</span>
              </>
            )}
          </button>
        </div>
      </div>

      <nav aria-label="Seções do cadastro" className="isbn-registration-sections">
        <a href="#registration-identification">Identificação</a><a href="#registration-category">Categoria</a>
        <a href="#registration-commercial">Preço e estoque</a><a href="#registration-images">Imagens</a>
        <a href="#registration-description">Descrição</a><a href="#registration-seo">SEO</a>
      </nav>

      {/* Banner de Erros no Envio se houver */}
      {visibleRequired.length > 0 && reviewRequested && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs text-red-800 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Por favor, revise os seguintes campos obrigatórios:</p>
            <ul className="list-disc list-inside mt-1 space-y-0.5 font-medium">
              {visibleRequired.map(([field, err]) => (
                <li key={field}>{err}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {!hasErrors && <p className="flex items-center gap-2 text-xs text-emerald-700"><CheckCircle2 className="h-4 w-4" />Dados essenciais válidos para revisão. As observações continuam disponíveis nos campos.</p>}
      {pendingAttention && pendingPhotoCount > 0 && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
        Há {pendingPhotoCount} foto(s) local(is) ainda não enviada(s). Confirme o upload na galeria ou remova as prévias antes de revisar.
        <button type="button" onClick={() => setFocusField('pendingPhotos')} className="ml-2 font-semibold underline">Ver fotos e confirmar envio</button>
      </div>}

      {/* Erro de API Simulado */}
      {submitError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs text-red-800 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Erro ao enviar cadastro:</p>
            <p className="mt-0.5">{submitError}</p>
          </div>
        </div>
      )}

      {/* Banner de Contexto Operacional para Livros Usados (Edição Conhecida) */}
      {draft.condition === 'usado' && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3.5 px-4 text-xs text-indigo-900 flex items-start gap-3">
          <BookOpen className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Cadastro de Novo Exemplar Usado:</span>
            <p className="mt-0.5 text-indigo-800">
              {originalBook.id === 'manual-entry'
                ? 'Preencha os dados da obra quando disponíveis, a etiqueta física (Código Pai), o sequencial interno (Código Filho) e as observações de conservação. ISBN é opcional.'
                : 'Os dados bibliográficos da edição foram reaproveitados. Por ser um exemplar usado, insira a etiqueta física deste livro (Código Pai), Código Filho manual e as observações de conservação física.'}
            </p>
          </div>
        </div>
      )}

      <div className="isbn-registration-grid">
      <div className="isbn-registration-column">
      <BibliographicSection
        variant="identity"
        draft={draft}
        onChange={onUpdateDraft}
        errors={errors}
      />
      <ProductIdentitySection
        draft={draft}
        onChange={onUpdateDraft}
        errors={errors}
      />
      <MagazordProductLookup user={imageUser} parentCode={draft.parentCode} childCode={draft.childCode} isbn={draft.isbn13 || draft.isbn10 || draft.ean} />
      <CategoryAndBrandSection
        originalBook={originalBook}
        categories={categories}
        draft={draft}
        onChange={onUpdateDraft}
        errors={errors}
      />
      <CommercialSection
        draft={draft}
        onChange={onUpdateDraft}
        errors={errors}
      />
      <BibliographicSection variant="metadata" draft={draft} onChange={onUpdateDraft} errors={errors} />
      <PhysicalAttributesSection
        draft={draft}
        onChange={onUpdateDraft}
        errors={errors}
      />
      <AdvancedFiscalSection
        draft={draft}
        onChange={onUpdateDraft}
      />
      </div>
      <div className="isbn-registration-column">
      <ImagesSection
        draft={draft}
        onChange={onUpdateDraft}
        user={imageUser}
        onUploadBusyChange={handleImageBusy}
        onPendingPhotosChange={handlePendingPhotos}
        errors={errors}
      />
      <SynopsisSection
        draft={draft}
        onChange={onUpdateDraft}
      />
      <SeoSection draft={draft} onChange={onUpdateDraft} />
      </div>
      <aside className="isbn-registration-column isbn-registration-aside" aria-label="Resumo e acoes do cadastro">
      <RegistrationSummary draft={draft} />
      {/* Barra de Ação Inferior Flutuante / Fixa */}
      <div className="isbn-registration-actions bg-slate-900 text-white rounded-2xl p-4 px-6 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4 border border-slate-700/80">
        <div className="flex items-center gap-3 text-xs">
          <div className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-sm">
                Pronto para concluir o cadastro no simulador?
              </span>
              <span className="px-2 py-0.2 rounded text-[10px] bg-slate-800 text-slate-300 font-mono">
                {draft.condition === 'novo' ? 'Livro Novo' : 'Livro Usado'}
              </span>
            </div>
            <p className="text-slate-400 text-[11px]">
              {draft.parentCode
                ? `Código Pai: ${draft.parentCode} · Filho: ${draft.childCode || 'Pendente'}`
                : 'Lembre-se de preencher o Código Pai da etiqueta física.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => { if (!imageUploadInFlight.current) onBackToSearch(); }}
            className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-semibold transition-colors cursor-pointer"
          >
            Voltar
          </button>

          <button
            type="button"
            onClick={requestReview}
            disabled={isSubmitting || imageUploadBusy}
            id="btn-submit-magazord-registration"
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-7 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-bold shadow-lg transition-all cursor-pointer disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Preparando cadastro...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Revisar cadastro</span>
              </>
            )}
          </button>
        </div>
      </div>
      </aside>
      </div>
      </div>
    </div>
  );
}
