/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
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
import { useUser } from '../../contexts/UserContext';
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
  const { isDeveloper } = useUser();
  const [showConfig, setShowConfig] = useState(false);
  const [currentMode, setCurrentMode] = useState<MagazordSimulationMode>(
    magazordMockService.getSimulationConfig().mode
  );

  // Sincroniza sempre o modo da simulação caso haja atualizações externas ou navegação entre abas
  useEffect(() => {
    setCurrentMode(magazordMockService.getSimulationConfig().mode);
  }, [checkResult]);

  // Se o usuário atual não for Desenvolvedor, garante que modos forçados sejam desativados para não afetar o balcão
  useEffect(() => {
    if (!isDeveloper && magazordMockService.getSimulationConfig().mode !== 'auto') {
      magazordMockService.resetModeToAuto();
      setCurrentMode('auto');
    }
  }, [isDeveloper]);

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
          stockQuantityToAdd,
          targetItem?.childCode
        );
        setStockLinkSuccess(res);
      }
    } catch (err: any) {
      console.error('Erro ao vincular estoque:', err);
    } finally {
      setIsLinkingStock(false);
    }
  };

  const getModeLabel = (mode: MagazordSimulationMode): string => {
    switch (mode) {
      case 'auto':
        return 'Padrão (Auto)';
      case 'force_new_found':
      case 'force_existing':
        return 'Novo Encontrado';
      case 'force_new_not_found':
      case 'force_not_found':
        return 'Novo Não Encontrado';
      case 'force_used_known':
        return 'Usado / Edição Conhecida';
      case 'force_multiple_matches':
        return 'Múltiplos Resultados';
      case 'force_error':
        return 'Simular Erro';
      default:
        return mode;
    }
  };

  const isbnDisplay = book.isbn13 || book.isbn10 || '–';

  // Identificação do cenário de resultado
  const isMultipleMatches =
    checkResult && checkResult.status === 'MULTIPLE_MATCHES';

  const isNewProductFound =
    !isMultipleMatches &&
    checkResult &&
    (checkResult.status === 'NEW_PRODUCT_FOUND' ||
      (checkResult.exists &&
        checkResult.canReuseCommercialRegistration &&
        checkResult.existingCondition === 'novo'));

  const isUsedEditionFound =
    !isMultipleMatches &&
    checkResult &&
    (checkResult.status === 'USED_EDITION_FOUND' ||
      (checkResult.exists && !checkResult.canReuseCommercialRegistration));

  const isNotFound =
    checkResult && !checkResult.exists && checkResult.status === 'NOT_FOUND';

  // Extração dos itens quando há múltiplos registros
  const novoMatch = checkResult?.matches?.find((m) => m.condition === 'novo');
  const usedMatches = checkResult?.matches?.filter((m) => m.condition === 'usado') || [];

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
              {currentMode === 'auto' ? (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 font-semibold">
                  Modo Padrão (Auto)
                </span>
              ) : (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-400 text-slate-950 font-bold border border-amber-300">
                  Modo Forçado: {getModeLabel(currentMode)}
                </span>
              )}
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
          className={`px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 text-xs cursor-pointer ${
            showConfig || currentMode !== 'auto'
              ? 'bg-slate-800 text-white border border-slate-700'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
          title="Configurar modo de teste da simulação"
        >
          <Settings2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Modo Teste</span>
        </button>
      </div>

      {/* Alerta de Modo de Teste Forçado ativo caso o usuário tenha esquecido ligado */}
      {currentMode !== 'auto' && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-5 py-2.5 flex items-center justify-between gap-3 text-xs text-amber-900">
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Atenção: O modo de teste <strong>{getModeLabel(currentMode)}</strong> está forçado.
              Para consultar os dados reais salvos na sessão, retorne para o modo Padrão.
            </span>
          </span>
          <button
            type="button"
            onClick={() => handleModeChange('auto')}
            className="px-3 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shrink-0 cursor-pointer shadow-xs transition-colors"
          >
            Voltar para Padrão (Auto)
          </button>
        </div>
      )}

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
                  Alterne entre o comportamento real do banco simulado ou force cenários específicos de teste.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => handleModeChange('auto')}
                className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer border transition-colors ${
                  currentMode === 'auto'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                Padrão (Auto - Banco Real)
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('force_new_found')}
                className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer border transition-colors ${
                  currentMode === 'force_new_found' || currentMode === 'force_existing'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : 'bg-white text-emerald-800 border-emerald-300 hover:bg-emerald-50'
                }`}
              >
                Forçar: Novo Encontrado
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('force_new_not_found')}
                className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer border transition-colors ${
                  currentMode === 'force_new_not_found' || currentMode === 'force_not_found'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                Forçar: Novo Não Encontrado
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('force_used_known')}
                className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer border transition-colors ${
                  currentMode === 'force_used_known'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : 'bg-white text-indigo-800 border-indigo-300 hover:bg-indigo-50'
                }`}
              >
                Forçar: Usado / Edição Conhecida
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('force_multiple_matches')}
                className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer border transition-colors ${
                  currentMode === 'force_multiple_matches'
                    ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                    : 'bg-white text-amber-800 border-amber-300 hover:bg-amber-50'
                }`}
              >
                Forçar: Múltiplos Resultados
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('force_error')}
                className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer border transition-colors ${
                  currentMode === 'force_error'
                    ? 'bg-red-600 text-white border-red-600 shadow-xs'
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
                Verificando existência de cadastro comercial NOVO compatível ou exemplares USADOS da edição.
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

        {/* 3. CENÁRIO A: APENAS PRODUTO NOVO ENCONTRADO (Reaproveitamento Comercial Puro) */}
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

        {/* 4. CENÁRIO B: APENAS EDIÇÃO CONHECIDA NO CATÁLOGO (APENAS USADO) */}
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

            {/* Detalhes bibliográficos reaproveitados e alternativa para Novo */}
            <div className="bg-indigo-50/50 border border-indigo-100 rounded-lg p-3 text-xs text-indigo-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">
                <CopyCheck className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>
                  <strong>Dados reaproveitados:</strong> Título, autores, editora, medidas, peso, capa e sinopse da obra.
                </span>
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500 font-mono">
                  ISBN: {isbnDisplay}
                </span>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => onOpenRegistration('novo')}
                  className="text-indigo-700 hover:text-indigo-900 font-semibold underline text-xs cursor-pointer"
                >
                  Cadastrar como Produto Novo
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 5. CENÁRIO C: MÚLTIPLOS CADASTROS ENCONTRADOS (NOVO + USADO(S) OU MÚLTIPLOS USADOS) */}
        {!isChecking && !checkError && isMultipleMatches && (
          <div className="space-y-5">
            {/* Header explicativo do resultado com múltiplos registros */}
            <div className="flex items-start gap-3.5 pb-1">
              <div className="p-2.5 bg-amber-50 text-amber-700 rounded-lg border border-amber-200 shrink-0">
                <Layers className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-base font-bold text-slate-900">
                    Múltiplos cadastros vinculados a este ISBN
                  </h4>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                    {checkResult.matches?.length || 0} cadastros localizados
                  </span>
                  {novoMatch && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      1 Novo Compatível
                    </span>
                  )}
                  {usedMatches.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                      {usedMatches.length} Exemplar(es) Usado(s)
                    </span>
                  )}
                </div>
                <p className="text-xs sm:text-sm text-slate-600 mt-1">
                  {novoMatch
                    ? 'Identificamos cadastro comercial NOVO existente e exemplar(es) USADO(S) anteriores. A existência de usados não oculta o cadastro Novo.'
                    : 'Identificamos múltiplos exemplares USADOS anteriores vinculados a esta edição.'}
                </p>
              </div>
            </div>

            {/* SEÇÃO 1: CADASTRO COMERCIAL NOVO EXISTENTE (se houver) */}
            {novoMatch && (
              <div className="bg-emerald-50/40 border-2 border-emerald-200 rounded-xl p-4 sm:p-5 space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200/60 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-600 text-white tracking-wide">
                      Produto Novo Compatível
                    </span>
                    <h5 className="font-bold text-emerald-950 text-sm">
                      Cadastro Comercial Novo Localizado
                    </h5>
                  </div>
                  <span className="text-xs font-semibold text-emerald-800">
                    Estoque Atual: <strong className="font-mono text-sm">{novoMatch.stock ?? checkResult.currentStock ?? 3} UN</strong>
                  </span>
                </div>

                {/* Dados do produto Novo */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-white/80 p-3 rounded-lg border border-emerald-100">
                  <div>
                    <span className="text-slate-500 block text-[11px]">Título</span>
                    <span className="font-semibold text-slate-900 line-clamp-1">
                      {novoMatch.title || book.title}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Código Pai</span>
                    <span className="font-mono font-bold text-slate-900">
                      {novoMatch.parentCode}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Código Filho (EAN)</span>
                    <span className="font-mono font-bold text-slate-900">
                      {novoMatch.childCode}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Preço Registrado</span>
                    <span className="font-semibold text-emerald-700">
                      {novoMatch.price ? `R$ ${novoMatch.price}` : 'Padrão da loja'}
                    </span>
                  </div>
                </div>

                {/* Ação de Vinculação de Entrada de Estoque no Novo */}
                {!stockLinkSuccess ? (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-emerald-950">
                        Quantidade a dar entrada no Novo:
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

                    <button
                      type="button"
                      onClick={() => handleLinkStockSubmit(novoMatch)}
                      disabled={isLinkingStock}
                      id="btn-link-stock-multiple"
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-60"
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
                ) : (
                  <div className="bg-emerald-100 border border-emerald-300 rounded-lg p-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-emerald-900 font-medium">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                      <span>{stockLinkSuccess.message} (Saldo: {stockLinkSuccess.newStock} UN).</span>
                    </div>
                    <button
                      type="button"
                      onClick={onResetForNextBook}
                      className="px-3 py-1.5 rounded-md bg-emerald-800 hover:bg-emerald-900 text-white font-semibold cursor-pointer shadow-xs inline-flex items-center gap-1.5"
                    >
                      <span>Próximo Produto</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* SEÇÃO 2: EXEMPLAR(ES) USADO(S) ANTERIORES E AÇÃO PARA CADASTRAR OUTRO USADO */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-600 text-white tracking-wide">
                    Exemplares Usados ({usedMatches.length})
                  </span>
                  <h5 className="font-bold text-slate-900 text-sm">
                    {usedMatches.length > 0
                      ? 'Exemplar(es) Usado(s) Anteriores Cadastrados nesta Edição'
                      : 'Nenhum exemplar usado cadastrado ainda'}
                  </h5>
                </div>
                <span className="text-xs text-slate-500">
                  Cada usado possui etiqueta e estado físico próprio
                </span>
              </div>

              {/* Lista dos Usados anteriores se houver */}
              {usedMatches.length > 0 && (
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden bg-white text-xs">
                  {usedMatches.map((used) => (
                    <div
                      key={used.id}
                      className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50/80 transition-colors"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 font-mono text-xs">
                            Pai: {used.parentCode}
                          </span>
                          <span className="text-slate-300">·</span>
                          <span className="font-mono text-slate-600 text-xs">
                            Filho: {used.childCode}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 line-clamp-1">{used.title}</p>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] font-mono text-slate-700 shrink-0">
                        {used.price && <span>Preço: R$ {used.price}</span>}
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 font-semibold">
                          Estoque: {used.stock ?? 1} UN
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Ação em destaque: Cadastrar Novo Exemplar Usado */}
              <div className="pt-1 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-indigo-50/70 border border-indigo-100 rounded-xl p-3.5">
                <div>
                  <span className="font-bold text-indigo-950 text-xs block">
                    Deseja catalogar um novo exemplar físico USADO?
                  </span>
                  <p className="text-[11px] text-indigo-800 mt-0.5">
                    Os dados bibliográficos da obra serão reaproveitados. Você informará a nova etiqueta (Código Pai) e o estado físico deste exemplar.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onOpenRegistration('usado')}
                  id="btn-create-another-used"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Cadastrar Novo Exemplar Usado</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Opção secundária se não houver Novo cadastrado ainda */}
              {!novoMatch && (
                <div className="pt-1 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
                  <span>Não existe cadastro de Produto Novo para esta edição.</span>
                  <button
                    type="button"
                    onClick={() => onOpenRegistration('novo')}
                    className="text-blue-700 hover:text-blue-800 font-semibold underline cursor-pointer"
                  >
                    Criar Cadastro como Produto Novo →
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 6. CENÁRIO D: PRODUTO NÃO EXISTENTE (Nem Novo, Nem Edição) */}
        {!isChecking &&
          !checkError &&
          (isNotFound ||
            (!isNewProductFound &&
              !isUsedEditionFound &&
              !isMultipleMatches &&
              !checkResult?.exists)) && (
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
