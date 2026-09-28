/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import {
  MagazordProductCheck,
  BookInfo,
  BookCondition,
  MagazordMatchItem,
} from '../../types';
import {
  magazordMockService,
  MagazordSimulationMode,
} from '../../services/magazordMockService';
import {
  CheckCircle2,
  AlertTriangle,
  Layers,
  ArrowRight,
  Settings2,
  RefreshCw,
  Sparkles,
  BookOpen,
  Plus,
  Minus,
  PackageCheck,
  Info,
  CopyCheck,
  ExternalLink,
} from 'lucide-react';

interface MagazordStatusCardProps {
  checkResult: MagazordProductCheck | null;
  isChecking: boolean;
  checkError: string | null;
  book: BookInfo;
  onOpenRegistration: (condition?: BookCondition) => void;
  onRetryCheck: () => void;
  onResetForNextBook: () => void;
  onLinkStock?: (
    quantity: number,
    targetItem?: MagazordMatchItem
  ) => Promise<{ success: boolean; newStock: number; message: string }>;
}

export default function MagazordStatusCard({
  checkResult,
  isChecking,
  checkError,
  book,
  onOpenRegistration,
  onRetryCheck,
  onResetForNextBook,
  onLinkStock,
}: MagazordStatusCardProps) {
  const [showConfig, setShowConfig] = useState(false);
  const [currentMode, setCurrentMode] = useState<MagazordSimulationMode>(
    magazordMockService.getSimulationConfig().mode
  );

  // Estado para vinculação de estoque ao produto NOVO existente
  const [stockQuantityToAdd, setStockQuantityToAdd] = useState(1);
  const [isLinkingStock, setIsLinkingStock] = useState(false);
  const [stockLinkSuccess, setStockLinkSuccess] = useState<{
    success: boolean;
    newStock: number;
    message: string;
  } | null>(null);

  const handleModeChange = (newMode: MagazordSimulationMode) => {
    setCurrentMode(newMode);
    setStockLinkSuccess(null);
    magazordMockService.setSimulationConfig({ mode: newMode });
    onRetryCheck();
  };

  const handleLinkStockSubmit = async (targetItem?: MagazordMatchItem) => {
    setIsLinkingStock(true);
    try {
      if (onLinkStock) {
        const res = await onLinkStock(stockQuantityToAdd, targetItem);
        setStockLinkSuccess(res);
      } else {
        const ean = book.isbn13 || book.isbn10 || '';
        const res = await magazordMockService.addStockToExistingProduct(
          ean,
          stockQuantityToAdd
        );
        setStockLinkSuccess(res);
      }
    } catch (err: any) {
      console.error('Erro ao vincular estoque:', err);
    } finally {
      setIsLinkingStock(false);
    }
  };

  const isbnDisplay = book.isbn13 || book.isbn10 || '–';

  // Identificação do cenário de resultado
  const isNewProductFound =
    checkResult &&
    (checkResult.status === 'NEW_PRODUCT_FOUND' ||
      (checkResult.exists &&
        checkResult.canReuseCommercialRegistration &&
        checkResult.existingCondition !== 'usado'));

  const isUsedEditionFound =
    checkResult && checkResult.status === 'USED_EDITION_FOUND';

  const isMultipleMatches =
    checkResult && checkResult.status === 'MULTIPLE_MATCHES';

  const isNotFound =
    checkResult && !checkResult.exists && checkResult.status === 'NOT_FOUND';

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-fade-in">
      {/* Barra superior de status Magazord */}
      <div className="bg-slate-900 text-white px-5 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-400">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tracking-wide uppercase text-blue-300">
                Integração Magazord
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30 font-semibold">
                Simulação Ativa
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Verificação de catálogo: reaproveitamento comercial (Novo) vs novo exemplar (Usado)
            </p>
          </div>
        </div>

        {/* Botão de alternância da simulação de teste */}
        <button
          type="button"
          onClick={() => setShowConfig(!showConfig)}
          className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-1.5 text-xs cursor-pointer"
          title="Configurar modo de teste da simulação"
        >
          <Settings2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Modo Teste</span>
        </button>
      </div>

      {/* Painel de controle de teste com todos os cenários da regra de negócio */}
      {showConfig && (
        <div className="bg-slate-50 border-b border-slate-200 p-3.5 px-5 text-xs text-slate-700">
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-slate-900">
                  Simulação de Cenários Magazord:
                </span>
                <p className="text-[11px] text-slate-500">
                  Valide como o sistema lida com reaproveitamento comercial de Novos e criação de Usados.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => handleModeChange('auto')}
                className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer border transition-colors ${
                  currentMode === 'auto'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                Padrão (Auto)
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('force_new_found')}
                className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer border transition-colors ${
                  currentMode === 'force_new_found' || currentMode === 'force_existing'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-emerald-800 border-emerald-300 hover:bg-emerald-50'
                }`}
              >
                Novo Encontrado (Reaproveitar)
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('force_new_not_found')}
                className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer border transition-colors ${
                  currentMode === 'force_new_not_found' || currentMode === 'force_not_found'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                Novo Não Encontrado
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('force_used_known')}
                className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer border transition-colors ${
                  currentMode === 'force_used_known'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-indigo-800 border-indigo-300 hover:bg-indigo-50'
                }`}
              >
                Usado / Edição Conhecida
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('force_multiple_matches')}
                className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer border transition-colors ${
                  currentMode === 'force_multiple_matches'
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-white text-amber-800 border-amber-300 hover:bg-amber-50'
                }`}
              >
                Múltiplos Resultados
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('force_error')}
                className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer border transition-colors ${
                  currentMode === 'force_error'
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                Simular Erro
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Conteúdo Conforme Estado */}
      <div className="p-5 sm:p-6">
        {/* 1. Verificando em andamento */}
        {isChecking && (
          <div className="flex items-center gap-3.5 py-2">
            <div className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-blue-600 animate-spin shrink-0" />
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Consultando catálogo Magazord...
              </p>
              <p className="text-xs text-slate-500">
                Verificando existência de cadastro comercial NOVO compatível ou dados bibliográficos de edição.
              </p>
            </div>
          </div>
        )}

        {/* 2. Erro de Conexão Simulado */}
        {checkError && !isChecking && (
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 bg-red-50 text-red-600 rounded-lg border border-red-100 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-bold text-red-900">
                Erro ao verificar na Magazord
              </h4>
              <p className="text-xs text-red-700 mt-0.5">{checkError}</p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={onRetryCheck}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-100 text-red-800 text-xs font-medium hover:bg-red-200 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Tentar novamente
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 3. CENÁRIO A: PRODUTO NOVO ENCONTRADO (Reaproveitamento Comercial) */}
        {!isChecking && !checkError && isNewProductFound && (
          <div className="space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-200 shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-base font-bold text-emerald-950">
                    Cadastro existente localizado
                  </h4>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    Produto Novo Compatível
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-emerald-800 mt-1 font-medium">
                  Este produto novo já possui cadastro compatível na Magazord. Uma nova entrada poderá ser vinculada ao cadastro existente.
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Não é necessário criar novo Produto Pai, novo Código Filho ou novo formulário completo de cadastro.
                </p>
              </div>
            </div>

            {/* Ficha sintética do cadastro comercial existente */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-slate-500 block text-[11px]">Título / Obra</span>
                <span className="font-semibold text-slate-900 line-clamp-1">
                  {checkResult.title || book.title}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">ISBN / EAN</span>
                <span className="font-mono font-bold text-slate-800">
                  {isbnDisplay}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Código Pai Existente</span>
                <span className="font-mono font-bold text-slate-800">
                  {checkResult.parentCode || 'LV26579-P'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Código Filho (Derivação)</span>
                <span className="font-mono font-bold text-slate-800">
                  {checkResult.childCode || isbnDisplay}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Condição</span>
                <span className="font-bold text-emerald-700 uppercase">
                  Novo
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Estoque Atual</span>
                <span className="font-mono font-bold text-slate-800">
                  {checkResult.currentStock !== undefined
                    ? `${checkResult.currentStock} UN`
                    : '3 UN'}
                </span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-500 block text-[11px]">Status Comercial</span>
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <PackageCheck className="w-3.5 h-3.5" />
                  Pronto para incremento de entrada
                </span>
              </div>
            </div>

            {/* Ação: Vincular Entrada de Estoque */}
            {!stockLinkSuccess ? (
              <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-emerald-950">
                    Quantidade a dar entrada:
                  </span>
                  <div className="inline-flex items-center border border-emerald-300 rounded-lg bg-white overflow-hidden shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setStockQuantityToAdd(Math.max(1, stockQuantityToAdd - 1))}
                      className="px-2.5 py-1.5 text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="px-3 py-1 font-mono font-bold text-xs text-slate-900 min-w-8 text-center">
                      {stockQuantityToAdd}
                    </span>
                    <button
                      type="button"
                      onClick={() => setStockQuantityToAdd(stockQuantityToAdd + 1)}
                      className="px-2.5 py-1.5 text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => handleLinkStockSubmit()}
                    disabled={isLinkingStock}
                    id="btn-link-stock"
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {isLinkingStock ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Vinculando entrada...</span>
                      </>
                    ) : (
                      <>
                        <PackageCheck className="w-4 h-4" />
                        <span>Vincular Entrada ao Cadastro Existente</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-emerald-100/70 border border-emerald-300 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 animate-fade-in">
                <div className="flex items-center gap-2 text-xs text-emerald-900 font-medium">
                  <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
                  <span>
                    {stockLinkSuccess.message} (Novo saldo simulado: {stockLinkSuccess.newStock} UN).
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onResetForNextBook}
                  className="px-4 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer shadow-xs"
                >
                  <span>Processar próximo produto</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Alternativa: O exemplar em mãos é USADO? */}
            <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs text-slate-600">
              <span className="flex items-center gap-1.5 text-slate-500">
                <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>
                  O exemplar físico que você tem em mãos no balcão é <strong>Usado</strong>?
                </span>
              </span>
              <button
                type="button"
                onClick={() => onOpenRegistration('usado')}
                id="btn-switch-to-used-registration"
                className="text-blue-700 hover:text-blue-800 font-semibold underline underline-offset-2 hover:bg-blue-50 px-2 py-1 rounded transition-colors cursor-pointer"
              >
                Cadastrar como Novo Exemplar Usado →
              </button>
            </div>
          </div>
        )}

        {/* 4. CENÁRIO B: EDIÇÃO CONHECIDA NO CATÁLOGO (USADO) */}
        {!isChecking && !checkError && isUsedEditionFound && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="p-2.5 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-200 shrink-0">
                  <BookOpen className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-base font-bold text-slate-900">
                      Edição conhecida no catálogo Magazord
                    </h4>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                      Novo Exemplar Usado
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-600 mt-1 font-medium">
                    Esta edição já é conhecida no catálogo. Os dados bibliográficos existentes serão reaproveitados para preparar um novo exemplar usado.
                  </p>
                  <p className="text-xs text-indigo-700/90 mt-0.5">
                    Regra operacional: Cada exemplar usado possui seu próprio Código Pai (etiqueta física), Código Filho, preço e descrição de estado de conservação.
                  </p>
                </div>
              </div>

              {/* Botão em destaque: CRIAR NOVO EXEMPLAR USADO */}
              <div className="shrink-0 flex items-center">
                <button
                  type="button"
                  onClick={() => onOpenRegistration('usado')}
                  id="btn-create-used-copy"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm shadow-md transition-all cursor-pointer transform hover:-translate-y-0.5"
                >
                  <Sparkles className="w-4 h-4 fill-white/20" />
                  <span>CADASTRAR NOVO EXEMPLAR USADO</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Detalhes bibliográficos reaproveitados */}
            <div className="bg-indigo-50/50 border border-indigo-100 rounded-lg p-3 text-xs text-indigo-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">
                <CopyCheck className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>
                  <strong>Dados reaproveitados:</strong> Título, autores, editora, medidas, peso, capa e sinopse da obra.
                </span>
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                ISBN: {isbnDisplay}
              </span>
            </div>
          </div>
        )}

        {/* 5. CENÁRIO C: MÚLTIPLOS CADASTROS ENCONTRADOS */}
        {!isChecking && !checkError && isMultipleMatches && (
          <div className="space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 bg-amber-50 text-amber-700 rounded-lg border border-amber-200 shrink-0">
                <Layers className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-base font-bold text-slate-900">
                    Múltiplos cadastros vinculados a este ISBN
                  </h4>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                    {checkResult.matches?.length || 0} cadastros
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-600 mt-1">
                  Existem cadastros anteriores vinculados a este ISBN na Magazord. Selecione se deseja dar entrada em um cadastro existente ou criar um novo exemplar.
                </p>
              </div>
            </div>

            {/* Lista dos registros encontrados */}
            <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden bg-slate-50 text-xs">
              {checkResult.matches?.map((match) => (
                <div
                  key={match.id}
                  className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white hover:bg-slate-50/80 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.2 rounded text-[10px] font-bold uppercase ${
                          match.condition === 'novo'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-indigo-100 text-indigo-800'
                        }`}
                      >
                        {match.condition === 'novo' ? 'Novo' : 'Exemplar Usado'}
                      </span>
                      <span className="font-semibold text-slate-900">{match.title}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-500 text-[11px] font-mono">
                      <span>Pai: <strong className="text-slate-700">{match.parentCode}</strong></span>
                      <span>Filho: <strong className="text-slate-700">{match.childCode}</strong></span>
                      {match.price && <span>Preço: R$ {match.price}</span>}
                      {match.stock !== undefined && <span>Estoque: {match.stock} UN</span>}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    {match.condition === 'novo' ? (
                      <button
                        type="button"
                        onClick={() => handleLinkStockSubmit(match)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                      >
                        <PackageCheck className="w-3.5 h-3.5" />
                        <span>Vincular Entrada (+1)</span>
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-400 italic">
                        Exemplar Usado independente
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Ação para novo exemplar usado */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-xs text-slate-500">
                Deseja catalogar um novo exemplar físico que acabou de chegar?
              </span>
              <button
                type="button"
                onClick={() => onOpenRegistration('usado')}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs inline-flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Cadastrar Novo Exemplar Usado</span>
              </button>
            </div>
          </div>
        )}

        {/* 6. CENÁRIO D: PRODUTO NÃO EXISTENTE (Nem Novo, Nem Edição) */}
        {!isChecking && !checkError && (isNotFound || (!isNewProductFound && !isUsedEditionFound && !isMultipleMatches && !checkResult?.exists)) && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="p-2.5 bg-blue-50 text-blue-700 rounded-lg border border-blue-200 shrink-0">
                  <Sparkles className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-base font-bold text-slate-900">
                      Produto não encontrado na Magazord
                    </h4>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                      Pendente de Cadastro
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-600 mt-1">
                    Os dados bibliográficos foram pré-carregados automaticamente. Revise e cadastre em tela única.
                  </p>
                </div>
              </div>

              {/* Botão em destaque "CRIAR NOVO CADASTRO" */}
              <div className="shrink-0 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenRegistration('novo')}
                  id="btn-open-magazord-registration"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm shadow-md hover:shadow-lg transition-all cursor-pointer transform hover:-translate-y-0.5"
                >
                  <Sparkles className="w-4 h-4 fill-white/20" />
                  <span>CRIAR NOVO CADASTRO</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Opções rápidas de condição inicial */}
            <div className="bg-blue-50/70 border border-blue-100 rounded-lg p-3 text-xs text-blue-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                <span>
                  Título, autores, medidas, peso, capa e descrição já foram pré-preenchidos a partir da pesquisa ISBN.
                </span>
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-slate-500 text-[11px]">Abrir como:</span>
                <button
                  type="button"
                  onClick={() => onOpenRegistration('novo')}
                  className="px-2.5 py-1 rounded bg-white border border-blue-200 text-blue-700 font-semibold hover:bg-blue-50 transition-colors cursor-pointer text-xs"
                >
                  Novo
                </button>
                <button
                  type="button"
                  onClick={() => onOpenRegistration('usado')}
                  className="px-2.5 py-1 rounded bg-white border border-indigo-200 text-indigo-700 font-semibold hover:bg-indigo-50 transition-colors cursor-pointer text-xs"
                >
                  Usado
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
