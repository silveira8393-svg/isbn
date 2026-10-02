/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SearchHistoryItem } from '../types';
import type { ProductionOperation } from '../services/productionService';

/** Structured database fields classify production; registrationMode is never consulted. */
export function classifyProductionOperation(item: ProductionOperation): OperationMetricClassification {
  const isError = item.status === 'error' || item.operation_type === 'operation_error';
  const completed = item.status === 'success' && !isError;
  const isNewCreated = completed && item.operation_type === 'new_product_created' && item.condition === 'new';
  const isNewReused = completed && item.operation_type === 'new_product_reused' && item.condition === 'new';
  const isUsedCreated = completed && item.operation_type === 'used_copy_created' && item.condition === 'used';
  return { isError, isNewCreated, isNewReused, isUsedCreated,
    isProcessed: isNewCreated || isNewReused || isUsedCreated,
    isSearch: completed && item.operation_type === 'isbn_search' };
}

/** Only positive safe integer quantities are units; old/invalid commercial quantities default to one. */
export function productionUnits(item: ProductionOperation): number {
  if (!classifyProductionOperation(item).isProcessed) return 0;
  const quantity = item.metadata?.quantity;
  return typeof quantity === 'number' && Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 1;
}

export function calculateProductionMetrics(items: ProductionOperation[]): MetricsResult & { units: number } {
  const result = { searches: 0, totalProcessed: 0, newCreated: 0, newReused: 0, usedCreated: 0, errors: 0, units: 0 };
  for (const item of items) {
    const classification = classifyProductionOperation(item);
    if (classification.isError) result.errors++;
    if (classification.isSearch) result.searches++;
    if (classification.isNewCreated) result.newCreated++;
    if (classification.isNewReused) result.newReused++;
    if (classification.isUsedCreated) result.usedCreated++;
    if (classification.isProcessed) { result.totalProcessed++; result.units += productionUnits(item); }
  }
  return result;
}

export interface OperationMetricClassification {
  isSearch: boolean;
  isProcessed: boolean;
  isNewCreated: boolean;
  isNewReused: boolean;
  isUsedCreated: boolean;
  isError: boolean;
}

export interface MetricsResult {
  searches: number;
  totalProcessed: number;
  newCreated: number;
  newReused: number;
  usedCreated: number;
  errors: number;
}

/**
 * Classifica uma operação de forma canônica e determinística para as métricas de produção.
 *
 * REGRA CENTRAL (CONFORME ESPECIFICAÇÃO DE AUDITORIA):
 * O Tipo de Operação (operationType) é a ÚNICA fonte primária de verdade.
 * NÃO se deve inferir a operação a partir de:
 * - Condição (Novo / Usado);
 * - Status Magazord (Cadastrado Simulado / Localizado / Não Cadastrado);
 * - Presença de Código Pai ou Filho;
 * - Preenchimento de campos ou dados textuais.
 */
export function classifyOperationForMetrics(item: SearchHistoryItem): OperationMetricClassification {
  // 1. Falha / Erro Operacional
  if (
    item.success === false ||
    item.operationType === 'erro_consulta' ||
    item.operationType === 'erro_cadastro' ||
    item.operationType === 'Erro Operacional'
  ) {
    return {
      isSearch: false,
      isProcessed: false,
      isNewCreated: false,
      isNewReused: false,
      isUsedCreated: false,
      isError: true,
    };
  }

  const op = item.operationType;

  // 2. Novo Cadastro Completo de Produto Novo
  if (op === 'novo_cadastro' || op === 'Novo Cadastro Completo') {
    return {
      isSearch: false,
      isProcessed: true,
      isNewCreated: true,
      isNewReused: false,
      isUsedCreated: false,
      isError: false,
    };
  }

  // 3. Reaproveitamento Comercial de Produto Novo (Entrada de Estoque no Novo)
  if (op === 'reaproveitamento_produto_novo' || op === 'Reaproveitamento Comercial (Novo)') {
    return {
      isSearch: false,
      isProcessed: true,
      isNewCreated: false,
      isNewReused: true,
      isUsedCreated: false,
      isError: false,
    };
  }

  // 4. Novo Exemplar Usado (Sebo / Edição Conhecida)
  if (
    op === 'novo_exemplar_usado' ||
    op === 'novo_usado_com_edicao_conhecida' ||
    op === 'Novo Usado (Edição Conhecida)'
  ) {
    return {
      isSearch: false,
      isProcessed: true,
      isNewCreated: false,
      isNewReused: false,
      isUsedCreated: true,
      isError: false,
    };
  }

  // 5. Pesquisa / Consulta de ISBN (Não gera produto processado)
  if (
    op === 'pesquisa_isbn' ||
    op === 'consulta_apenas' ||
    op === 'Consulta' ||
    !op
  ) {
    return {
      isSearch: true,
      isProcessed: false,
      isNewCreated: false,
      isNewReused: false,
      isUsedCreated: false,
      isError: false,
    };
  }

  // Fallback seguro para outros tipos legados sem erro: conta como busca, sem inflar processados
  return {
    isSearch: true,
    isProcessed: false,
    isNewCreated: false,
    isNewReused: false,
    isUsedCreated: false,
    isError: false,
  };
}

/**
 * Calcula os totais das métricas de produção a partir de uma lista de registros.
 * Fórmula conceitual mandatória:
 * totalProcessed = newCreated + newReused + usedCreated
 */
export function calculateMetrics(items: SearchHistoryItem[]): MetricsResult {
  let searches = 0;
  let newCreated = 0;
  let newReused = 0;
  let usedCreated = 0;
  let errors = 0;

  for (const item of items) {
    const classification = classifyOperationForMetrics(item);

    if (classification.isError) {
      errors++;
      continue;
    }

    if (classification.isNewCreated) {
      newCreated++;
    } else if (classification.isNewReused) {
      newReused++;
    } else if (classification.isUsedCreated) {
      usedCreated++;
    } else if (classification.isSearch) {
      searches++;
    }
  }

  const totalProcessed = newCreated + newReused + usedCreated;

  return {
    searches,
    totalProcessed,
    newCreated,
    newReused,
    usedCreated,
    errors,
  };
}

/**
 * Dataset Canônico Real exportado do sistema (7 registros de auditoria).
 * Utilizado para validação, testes de regressão e fallback inicial.
 */
export const CANONICAL_CSV_DATASET: SearchHistoryItem[] = [
  // Registro 1
  {
    timestamp: 1727650000000,
    isbn: '9786555111101',
    title: 'A psicologia financeira',
    authors: ['Morgan Housel'],
    condition: 'usado',
    operationType: 'novo_usado_com_edicao_conhecida',
    magazordStatus: 'cadastrado_simulado',
    parentCode: 'LV10101-P',
    childCode: 'LV10101',
    userId: 'usr_joao_operador',
    userName: 'João',
    userRole: 'operator',
    operationEnvironment: 'production',
    success: true,
  },
  // Registro 2
  {
    timestamp: 1727649000000,
    isbn: '9788535923698',
    title: 'A cabeça do santo',
    authors: ['Socorro Acioli'],
    condition: 'novo',
    operationType: 'novo_cadastro',
    magazordStatus: 'cadastrado_simulado',
    parentCode: 'LV26579-P',
    childCode: '9788535923698',
    userId: 'usr_joao_operador',
    userName: 'João',
    userRole: 'operator',
    operationEnvironment: 'production',
    success: true,
  },
  // Registro 3
  {
    timestamp: 1727648000000,
    isbn: '9786559210411',
    title: 'Pequena coreografia do adeus',
    authors: ['Aline Bei'],
    condition: 'novo',
    operationType: 'novo_cadastro',
    magazordStatus: 'cadastrado_simulado',
    parentCode: 'LV26580-P',
    childCode: '9786559210411',
    userId: 'usr_proprietario_admin',
    userName: 'Proprietário',
    userRole: 'admin',
    operationEnvironment: 'production',
    success: true,
  },
  // Registro 4
  {
    timestamp: 1727647000000,
    isbn: '9788501117960',
    title: 'Como um grupo de desajustados derrubou a residencia: MBL: a origem',
    authors: ['Renan Santos'],
    operationType: 'pesquisa_isbn',
    magazordStatus: 'nao_cadastrado',
    userId: 'usr_joao_operador',
    userName: 'João',
    userRole: 'operator',
    operationEnvironment: 'production',
    success: true,
  },
  // Registro 5
  {
    timestamp: 1727646000000,
    isbn: '9788532525550',
    title: 'Guerra Mundial Z: Uma história oral da guerra dos zumbis',
    authors: ['Max Brooks'],
    condition: 'usado',
    operationType: 'novo_usado_com_edicao_conhecida',
    magazordStatus: 'cadastrado_simulado',
    parentCode: 'LV10102-P',
    childCode: 'LV10102',
    userId: 'usr_joao_operador',
    userName: 'João',
    userRole: 'operator',
    operationEnvironment: 'production',
    success: true,
  },
  // Registro 6
  {
    timestamp: 1727645000000,
    isbn: '9786555651324',
    title: 'O guia do mochileiro das galáxias',
    authors: ['Douglas Adams'],
    condition: 'usado',
    operationType: 'novo_usado_com_edicao_conhecida',
    magazordStatus: 'cadastrado_simulado',
    parentCode: 'LV10103-P',
    childCode: 'LV10103',
    userId: 'usr_joao_operador',
    userName: 'João',
    userRole: 'operator',
    operationEnvironment: 'production',
    success: true,
  },
  // Registro 7 — LEGADO (Sem usuário, sem perfil, sem ambiente, mas com Tipo Consulta)
  {
    timestamp: 1727640000000,
    isbn: '9788535914849',
    title: '1984',
    authors: ['George Orwell'],
    condition: 'usado',
    operationType: 'pesquisa_isbn',
    parentCode: 'LV123456',
    childCode: 'LVF123456',
    magazordStatus: 'cadastrado_simulado',
    success: true,
  },
];
