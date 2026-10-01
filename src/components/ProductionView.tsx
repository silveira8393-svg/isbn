/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { SearchHistoryItem, User } from '../types';
import { useUser } from '../contexts/UserContext';
import {
  calculateMetrics,
  classifyOperationForMetrics,
} from '../utils/metrics';
import {
  BarChart3,
  Calendar,
  CheckCircle2,
  PackagePlus,
  RefreshCw,
  BookOpen,
  AlertCircle,
  Search,
  Filter,
  Users,
  ShieldCheck,
  Wrench,
  Info,
  Clock,
} from 'lucide-react';

interface ProductionViewProps {
  history: SearchHistoryItem[];
}

type PeriodFilter = 'today' | '7days' | '30days' | 'all';

export default function ProductionView({ history }: ProductionViewProps) {
  const { currentUser, isDeveloper, isAdmin } = useUser();
  const [period, setPeriod] = useState<PeriodFilter>('all');
  const [selectedUserFilter, setSelectedUserFilter] = useState<string>('all');

  // Filtra por período
  const periodFilteredHistory = useMemo(() => {
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    return history.filter((item) => {
      if (period === 'today') {
        return item.timestamp >= startOfToday.getTime();
      }
      if (period === '7days') {
        return item.timestamp >= now - 7 * 24 * 60 * 60 * 1000;
      }
      if (period === '30days') {
        return item.timestamp >= now - 30 * 24 * 60 * 60 * 1000;
      }
      return true;
    });
  }, [history, period]);

  // REGRA FUNDAMENTAL: Ações de desenvolvimento NÃO contaminam as métricas de produção da loja!
  const productionItems = useMemo(() => {
    return periodFilteredHistory.filter(
      (item) => item.operationEnvironment !== 'development'
    );
  }, [periodFilteredHistory]);

  const developmentItems = useMemo(() => {
    return periodFilteredHistory.filter(
      (item) => item.operationEnvironment === 'development'
    );
  }, [periodFilteredHistory]);

  // Se o usuário for Operador, filtra exclusivamente por ele (não atribui registros legados sem usuário a João)
  const displayedItems = useMemo(() => {
    const items = productionItems;
    if (currentUser.role === 'operator') {
      return items.filter(
        (item) => item.userId === currentUser.id || item.userName === currentUser.name
      );
    }
    if (selectedUserFilter !== 'all') {
      return items.filter(
        (item) => item.userId === selectedUserFilter || item.userName === selectedUserFilter
      );
    }
    return items;
  }, [productionItems, currentUser, selectedUserFilter]);

  // Cálculo canônico das métricas de produção (baseado exclusivamente no operationType)
  const metrics = useMemo(() => {
    return calculateMetrics(displayedItems);
  }, [displayedItems]);

  // Agrupamento por Operador / Usuário
  const userBreakdown = useMemo(() => {
    const map: Record<
      string,
      {
        name: string;
        role: string;
        totalProcessed: number;
        newCreated: number;
        newReused: number;
        usedCreated: number;
        searches: number;
        errors: number;
      }
    > = {};

    for (const item of productionItems) {
      // REGRA: Registros legados sem identificação de usuário NÃO são atribuídos a nenhum operador individual
      if (!item.userId && !item.userName) {
        continue;
      }

      const key = item.userId || item.userName!;
      const name =
        item.userName ||
        (item.userId === 'usr_joao_operador'
          ? 'João'
          : item.userId === 'usr_proprietario_admin'
          ? 'Proprietário'
          : 'Operador');
      const role =
        item.userRole ||
        (item.userId === 'usr_proprietario_admin' ? 'admin' : 'operator');

      if (!map[key]) {
        map[key] = {
          name,
          role,
          totalProcessed: 0,
          newCreated: 0,
          newReused: 0,
          usedCreated: 0,
          searches: 0,
          errors: 0,
        };
      }

      const classification = classifyOperationForMetrics(item);

      if (classification.isError) {
        map[key].errors++;
        continue;
      }

      if (classification.isNewCreated) {
        map[key].newCreated++;
        map[key].totalProcessed++;
      } else if (classification.isNewReused) {
        map[key].newReused++;
        map[key].totalProcessed++;
      } else if (classification.isUsedCreated) {
        map[key].usedCreated++;
        map[key].totalProcessed++;
      } else if (classification.isSearch) {
        map[key].searches++;
      }
    }

    return Object.entries(map).map(([id, data]) => ({ id, ...data }));
  }, [productionItems]);

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 animate-fade-in pb-12">
      {/* Header do Painel */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center font-bold shadow-2xs">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">
                Painel de Produção & Catalogação
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                Auditoria Operacional
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {currentUser.role === 'operator'
                ? `Exibindo a produção pessoal de ${currentUser.name}`
                : 'Métricas consolidadas de produtividade da equipe da loja (exclui testes de desenvolvimento).'}
            </p>
          </div>
        </div>

        {/* Controles de Filtro (Operador e Período) */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Filtro de Operador (Disponível para Gestão / Admin / Dev) */}
          {(isAdmin || isDeveloper) && (
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 px-2.5 rounded-lg text-xs">
              <Users className="w-3.5 h-3.5 text-slate-500" />
              <label htmlFor="select-operator-filter" className="sr-only">
                Filtrar por Operador
              </label>
              <select
                id="select-operator-filter"
                value={selectedUserFilter}
                onChange={(e) => setSelectedUserFilter(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-700 cursor-pointer focus:outline-hidden pr-1"
              >
                <option value="all">Todos os operadores</option>
                <option value="usr_joao_operador">João (Operador)</option>
                <option value="usr_proprietario_admin">Proprietário (Admin)</option>
              </select>
            </div>
          )}

          {/* Filtros de Período */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg text-xs self-stretch sm:self-auto justify-center">
          <button
            type="button"
            onClick={() => setPeriod('today')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
              period === 'today'
                ? 'bg-white text-blue-700 font-bold shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Hoje
          </button>
          <button
            type="button"
            onClick={() => setPeriod('7days')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
              period === '7days'
                ? 'bg-white text-blue-700 font-bold shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            7 dias
          </button>
          <button
            type="button"
            onClick={() => setPeriod('30days')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
              period === '30days'
                ? 'bg-white text-blue-700 font-bold shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            30 dias
          </button>
          <button
            type="button"
            onClick={() => setPeriod('all')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
              period === 'all'
                ? 'bg-white text-blue-700 font-bold shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Todos
          </button>
        </div>
      </div>
    </div>

      {/* Grid de Métricas Principais (6 Cards) */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* 1. Total Processados */}
        <div className="bg-white border-2 border-blue-200 rounded-xl p-4 shadow-xs col-span-2 sm:col-span-1 lg:col-span-2">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-900">
              Produtos Processados
            </span>
            <CheckCircle2 className="w-4 h-4 text-blue-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-slate-900 tabular-nums">
              {metrics.totalProcessed}
            </span>
            <span className="text-xs text-slate-500 font-medium">cadastros/entradas</span>
          </div>
          <p className="text-[11px] text-blue-700/80 mt-1 font-medium">
            Soma de novos cadastros e entradas vinculadas
          </p>
        </div>

        {/* 2. Novos Cadastrados */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
              Novos Criados
            </span>
            <PackagePlus className="w-4 h-4 text-emerald-600" />
          </div>
          <span className="text-2xl font-black text-slate-900 tabular-nums">
            {metrics.newCreated}
          </span>
          <p className="text-[10px] text-slate-400 mt-1">Produtos novos completos</p>
        </div>

        {/* 3. Novos Reaproveitados */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
              Reaproveitados
            </span>
            <RefreshCw className="w-4 h-4 text-emerald-600" />
          </div>
          <span className="text-2xl font-black text-slate-900 tabular-nums">
            {metrics.newReused}
          </span>
          <p className="text-[10px] text-slate-400 mt-1">Entradas em produto novo</p>
        </div>

        {/* 4. Usados Cadastrados */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
              Usados Criados
            </span>
            <BookOpen className="w-4 h-4 text-indigo-600" />
          </div>
          <span className="text-2xl font-black text-slate-900 tabular-nums">
            {metrics.usedCreated}
          </span>
          <p className="text-[10px] text-slate-400 mt-1">Exemplares com etiqueta</p>
        </div>

        {/* 5. Pesquisas Realizadas */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
              Pesquisas
            </span>
            <Search className="w-4 h-4 text-slate-500" />
          </div>
          <span className="text-2xl font-black text-slate-900 tabular-nums">
            {metrics.searches}
          </span>
          <p className="text-[10px] text-slate-400 mt-1">Consultas de ISBN</p>
        </div>
      </div>

      {/* Regra de Gestão: Não confundir pesquisas com produtividade */}
      <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-3.5 px-4 text-xs text-blue-900 flex items-start gap-3">
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">Critério Operacional de Produtividade:</span>
          <p className="text-[11px] text-blue-800 mt-0.5">
            Apenas livros efetivamente cadastrados ou com entradas de estoque vinculadas compõem o indicador de <strong>Produtos Processados</strong>. Consultas de ISBN que não resultaram em cadastramento constam separadamente em <strong>Pesquisas</strong>.
          </p>
        </div>
      </div>

      {/* Seção de Desmembramento por Operador (para Gestão / Admin) */}
      {(isAdmin || isDeveloper) && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 px-5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900">
                Produção Individual da Equipe
              </h3>
            </div>
            <span className="text-xs text-slate-500 font-medium">
              {userBreakdown.length} operador(es) com atividade registrada
            </span>
          </div>

          {userBreakdown.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              Nenhuma atividade de produção registrada no período selecionado.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {userBreakdown.map((op) => (
                <div
                  key={op.id}
                  className="p-4 px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm shadow-2xs">
                      {op.name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{op.name}</span>
                        <span className="px-2 py-0.2 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                          {op.role === 'admin' ? 'Administrador' : 'Operador'}
                        </span>
                      </div>
                      <span className="text-xs text-slate-500">
                        {op.searches} pesquisas realizadas no balcão
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3 text-center sm:text-right text-xs">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase">Processados</span>
                      <strong className="text-slate-900 font-bold text-sm tabular-nums">
                        {op.totalProcessed}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase">Novos</span>
                      <strong className="text-emerald-700 font-bold text-sm tabular-nums">
                        {op.newCreated}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase">Entradas</span>
                      <strong className="text-emerald-700 font-bold text-sm tabular-nums">
                        {op.newReused}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase">Usados</span>
                      <strong className="text-indigo-700 font-bold text-sm tabular-nums">
                        {op.usedCreated}
                      </strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ISOLAMENTO TÉCNICO: Seção exclusiva de Desenvolvimento */}
      {isDeveloper && (
        <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-amber-200/60 pb-2.5">
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-amber-700" />
              <h4 className="text-sm font-bold text-amber-950">
                Auditoria do Ambiente de Desenvolvimento (Testes Mock)
              </h4>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-200 text-amber-900 border border-amber-300">
              Isolado da Produção da Loja
            </span>
          </div>

          <p className="text-xs text-amber-900/90 leading-relaxed">
            Conforme a especificação, todas as operações simuladas realizadas sob o perfil <strong>Desenvolvimento</strong> recebem a marcação <code>environment: development</code> e são <strong>estritamente excluídas</strong> dos totais de produtividade comercial da loja para não contaminar os relatórios da gerência.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-white/80 p-3 rounded-lg border border-amber-200/70">
            <div>
              <span className="text-slate-500 block text-[11px]">Operações de Teste</span>
              <strong className="text-amber-950 font-bold text-base tabular-nums">
                {developmentItems.length}
              </strong>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Ambiente</span>
              <span className="font-mono text-amber-800 font-semibold">development</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Impacto na Loja</span>
              <span className="text-emerald-700 font-bold">0% (Isolado)</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Auditoria Técnica</span>
              <span className="text-slate-700">Registrado localmente</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
