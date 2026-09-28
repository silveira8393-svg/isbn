/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { MagazordProductCheck, BookInfo } from '../../types';
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
  ExternalLink,
  BookOpen,
} from 'lucide-react';

interface MagazordStatusCardProps {
  checkResult: MagazordProductCheck | null;
  isChecking: boolean;
  checkError: string | null;
  book: BookInfo;
  onOpenRegistration: () => void;
  onRetryCheck: () => void;
  onResetForNextBook: () => void;
}

export default function MagazordStatusCard({
  checkResult,
  isChecking,
  checkError,
  book,
  onOpenRegistration,
  onRetryCheck,
  onResetForNextBook,
}: MagazordStatusCardProps) {
  const [showConfig, setShowConfig] = useState(false);
  const [currentMode, setCurrentMode] = useState<MagazordSimulationMode>(
    magazordMockService.getSimulationConfig().mode
  );

  const handleModeChange = (newMode: MagazordSimulationMode) => {
    setCurrentMode(newMode);
    magazordMockService.setSimulationConfig({ mode: newMode });
    onRetryCheck();
  };

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
              Verificação de catálogo e preparação de cadastro
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

      {/* Painel opcional de controle de teste */}
      {showConfig && (
        <div className="bg-slate-50 border-b border-slate-200 p-3.5 px-5 text-xs text-slate-700">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
            <div>
              <span className="font-semibold text-slate-900">Alternar comportamento simulado:</span>
              <p className="text-[11px] text-slate-500">
                Alterne entre estados para validar os diferentes fluxos operacionais da tela.
              </p>
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
                Padrão (Inexistente)
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('force_existing')}
                className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer border transition-colors ${
                  currentMode === 'force_existing'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                Forçar Existente
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('force_not_found')}
                className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer border transition-colors ${
                  currentMode === 'force_not_found'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                Forçar Não Encontrado
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

      {/* Conteúdo do Card Conforme Estado */}
      <div className="p-5 sm:p-6">
        {/* 1. Verificando */}
        {isChecking && (
          <div className="flex items-center gap-3.5 py-2">
            <div className="w-5 h-5 rounded-full border-2 border-slate-200 border-t-blue-600 animate-spin shrink-0" />
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Consultando catálogo Magazord...
              </p>
              <p className="text-xs text-slate-500">
                Verificando se o EAN/ISBN já possui cadastro ativo ou derivação existente.
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
                Erro ao verificar no Magazord
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

        {/* 3. PRODUTO EXISTENTE (Regra 3 do usuário) */}
        {!isChecking && !checkError && checkResult?.exists && (
          <div className="space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-200 shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-base font-bold text-emerald-950">
                    Produto localizado na Magazord
                  </h4>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    Cadastro Existente
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-emerald-800 mt-1">
                  Os dados bibliográficos disponíveis foram utilizados para complementar o cadastro.
                </p>
              </div>
            </div>

            {/* Ficha sintética do retorno simulado */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-slate-500 block text-[11px]">ISBN / EAN</span>
                <span className="font-mono font-bold text-slate-800">
                  {book.isbn13 || book.isbn10 || '–'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Código Pai</span>
                <span className="font-mono font-bold text-slate-800">
                  {checkResult.parentCode || 'LV-MOCK-P'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Código Filho</span>
                <span className="font-mono font-bold text-slate-800">
                  {checkResult.childCode || book.isbn13 || '–'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[11px]">Status</span>
                <span className="text-emerald-700 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Sincronizado
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-slate-500">
                Nenhuma ação adicional é obrigatória para esta obra.
              </span>
              <button
                type="button"
                onClick={onResetForNextBook}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors shadow-xs cursor-pointer"
              >
                <span>Processar próximo produto</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* 4. PRODUTO NÃO EXISTENTE (Regra 4 do usuário) */}
        {!isChecking && !checkError && checkResult && !checkResult.exists && (
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
              <div className="shrink-0 flex items-center">
                <button
                  type="button"
                  onClick={onOpenRegistration}
                  id="btn-open-magazord-registration"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all cursor-pointer transform hover:-translate-y-0.5"
                >
                  <Sparkles className="w-4 h-4 fill-white/20" />
                  <span>CRIAR NOVO CADASTRO</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Dica operacional rápida */}
            <div className="bg-blue-50/70 border border-blue-100 rounded-lg p-3 text-xs text-blue-900 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                <span>
                  Título, autores, medidas, peso, capa e descrição já foram pré-preenchidos a partir da pesquisa ISBN.
                </span>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
