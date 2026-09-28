/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import {
  RegistrationDraft,
  MagazordRegistrationResult,
  BookInfo,
} from '../../types';
import { magazordMockService } from '../../services/magazordMockService';
import { buildFinalDescription } from '../../utils/draft';
import ProductIdentitySection from './ProductIdentitySection';
import CategoryAndBrandSection from './CategoryAndBrandSection';
import CommercialSection from './CommercialSection';
import BibliographicSection from './BibliographicSection';
import PhysicalAttributesSection from './PhysicalAttributesSection';
import ImagesSection from './ImagesSection';
import SynopsisSection from './SynopsisSection';
import AdvancedFiscalSection from './AdvancedFiscalSection';
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
  draft: RegistrationDraft;
  originalBook: BookInfo;
  onUpdateDraft: (updates: Partial<RegistrationDraft>) => void;
  onBackToSearch: () => void;
  onSuccessRegistration: (result: MagazordRegistrationResult, draft: RegistrationDraft) => void;
  onProcessNextBook: () => void;
}

export default function ProductRegistrationForm({
  draft,
  originalBook,
  onUpdateDraft,
  onBackToSearch,
  onSuccessRegistration,
  onProcessNextBook,
}: ProductRegistrationFormProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<MagazordRegistrationResult | null>(null);

  // Validações antes do envio
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!draft.condition) {
      newErrors.condition = 'Selecione a condição (Novo ou Usado).';
    }

    if (!draft.parentCode || !draft.parentCode.trim()) {
      newErrors.parentCode = 'Código Pai é obrigatório (etiqueta física da loja).';
    }

    if (!draft.childCode || !draft.childCode.trim()) {
      newErrors.childCode =
        draft.condition === 'novo'
          ? 'Código Filho é obrigatório (ISBN-13).'
          : 'Código Filho é obrigatório para livros usados.';
    }

    if (!draft.title || !draft.title.trim()) {
      newErrors.title = 'Título da obra é obrigatório.';
    }

    if (!draft.category || !draft.category.trim()) {
      newErrors.category = 'Selecione uma categoria Magazord.';
    }

    if (!draft.price || !draft.price.trim()) {
      newErrors.price = 'Informe o preço de venda da loja (R$).';
    } else {
      const num = Number(draft.price.replace(',', '.'));
      if (Number.isNaN(num) || num <= 0) {
        newErrors.price = 'Informe um preço de venda válido maior que zero.';
      }
    }

    if (!draft.quantity || draft.quantity < 1) {
      newErrors.quantity = 'A quantidade em estoque deve ser de pelo menos 1 exemplar.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    setSubmitError(null);

    if (!validateForm()) {
      // Rola suavemente até o primeiro erro se houver
      const firstErrorEl = document.querySelector('.border-red-300');
      if (firstErrorEl) {
        firstErrorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    setIsSubmitting(true);

    try {
      const finalDescription = buildFinalDescription(draft);
      const draftToSubmit: RegistrationDraft = {
        ...draft,
        description: finalDescription,
      };
      const result = await magazordMockService.createProduct(draftToSubmit);
      setSuccessResult(result);
      onSuccessRegistration(result, draftToSubmit);
    } catch (err: any) {
      console.error('Falha no cadastro simulado Magazord', err);
      setSubmitError(
        err.message || 'Falha ao processar cadastro na API Magazord simulada.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Se o cadastro foi concluído com sucesso, exibir a tela de confirmação
  if (successResult) {
    const sentDescription = draft.description || buildFinalDescription(draft);

    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-md p-6 sm:p-10 max-w-3xl mx-auto my-6 animate-fade-in text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto shadow-sm">
          <CheckCircle2 className="w-10 h-10 stroke-[2]" />
        </div>

        <div className="space-y-1">
          <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">
            Sucesso Operacional
          </span>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight pt-2">
            Produto Cadastrado com Sucesso!
          </h2>
          <p className="text-sm text-slate-600 max-w-lg mx-auto">
            Os dados do livro foram compilados e enviados para o Magazord. O produto está pronto para etiquetagem e distribuição aos marketplaces.
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
            <span className="font-bold text-emerald-700 text-sm">R$ {draft.price}</span>
          </div>
          <div>
            <span className="text-slate-500 block">Estoque Inicial</span>
            <span className="font-bold text-slate-900 text-sm">{draft.quantity} UN</span>
          </div>

          {/* Descrição Final Composta enviada ao Magazord */}
          {sentDescription && (
            <div className="col-span-1 sm:col-span-2 pt-2 border-t border-slate-200">
              <span className="text-slate-500 block font-semibold mb-1">
                Descrição Enviada ao Magazord (Campo Único)
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

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div className="space-y-6 animate-fade-in w-full pb-16">
      {/* Barra de Navegação e Título da Tela */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToSearch}
            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
            title="Voltar para a pesquisa de ISBN"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">
                Cadastro Magazord em Tela Única
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                Pré-preenchido
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
            onClick={onBackToSearch}
            className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
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
                <span>CADASTRAR NO MAGAZORD</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Banner de Erros no Envio se houver */}
      {hasErrors && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs text-red-800 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Por favor, revise os seguintes campos obrigatórios:</p>
            <ul className="list-disc list-inside mt-1 space-y-0.5 font-medium">
              {Object.values(errors).map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

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
              Os dados bibliográficos da edição foram reaproveitados. Por ser um exemplar usado, insira a etiqueta física deste livro (Código Pai), Código Filho manual e as observações de conservação física.
            </p>
          </div>
        </div>
      )}

      {/* Seção 1: Identificação & Condição */}
      <ProductIdentitySection
        draft={draft}
        onChange={onUpdateDraft}
        errors={errors}
      />

      {/* Seção 2: Categorização, Marca & Editora */}
      <CategoryAndBrandSection
        draft={draft}
        onChange={onUpdateDraft}
        errors={errors}
      />

      {/* Seção 3: Comercial, Estoque & Localização */}
      <CommercialSection
        draft={draft}
        onChange={onUpdateDraft}
        errors={errors}
      />

      {/* Seção 4: Dados Bibliográficos da Obra */}
      <BibliographicSection
        draft={draft}
        onChange={onUpdateDraft}
        errors={errors}
      />

      {/* Seção 5: Peso & Dimensões (sem acréscimo de 1 cm) */}
      <PhysicalAttributesSection
        draft={draft}
        onChange={onUpdateDraft}
      />

      {/* Seção 6: Galeria de Imagens */}
      <ImagesSection
        draft={draft}
        onChange={onUpdateDraft}
      />

      {/* Seção 7: Descrição Única (Sinopse e, se Usado, Estado do Exemplar) */}
      <SynopsisSection
        draft={draft}
        onChange={onUpdateDraft}
      />

      {/* Seção 8: Configurações Fiscais e Avançadas (Colapsável) */}
      <AdvancedFiscalSection
        draft={draft}
        onChange={onUpdateDraft}
      />

      {/* Barra de Ação Inferior Flutuante / Fixa */}
      <div className="sticky bottom-4 z-30 bg-slate-900 text-white rounded-2xl p-4 px-6 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4 border border-slate-700/80">
        <div className="flex items-center gap-3 text-xs">
          <div className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-sm">
                Pronto para cadastrar na Magazord?
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
            onClick={onBackToSearch}
            className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-semibold transition-colors cursor-pointer"
          >
            Voltar
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
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
                <span>CADASTRAR NO MAGAZORD</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
