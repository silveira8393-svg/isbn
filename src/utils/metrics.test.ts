/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CANONICAL_CSV_DATASET,
  calculateMetrics,
  classifyOperationForMetrics,
} from './metrics';
import { SearchHistoryItem } from '../types';

export function runCanonicalMetricsRegressionTests(): {
  success: boolean;
  results: Record<string, any>;
} {
  console.log('--- INICIANDO TESTES DE REGRESSÃO DE MÉTRICAS (PROMETIDOS NO CSV) ---');

  // 1. Teste Global (Todos os 7 registros)
  const globalMetrics = calculateMetrics(CANONICAL_CSV_DATASET);
  console.log('Resultado Global:', globalMetrics);

  const globalExpected = {
    searches: 2,
    totalProcessed: 5,
    newCreated: 2,
    newReused: 0,
    usedCreated: 3,
    errors: 0,
  };

  const isGlobalValid =
    globalMetrics.searches === globalExpected.searches &&
    globalMetrics.totalProcessed === globalExpected.totalProcessed &&
    globalMetrics.newCreated === globalExpected.newCreated &&
    globalMetrics.newReused === globalExpected.newReused &&
    globalMetrics.usedCreated === globalExpected.usedCreated &&
    globalMetrics.errors === globalExpected.errors;

  if (!isGlobalValid) {
    throw new Error(
      `Falha no teste GLOBAL: esperado ${JSON.stringify(globalExpected)}, obtido ${JSON.stringify(globalMetrics)}`
    );
  }

  // 2. Teste para João (Filtrando por Operador = João)
  const joaoItems = CANONICAL_CSV_DATASET.filter(
    (item) => item.userId === 'usr_joao_operador' || item.userName === 'João'
  );
  const joaoMetrics = calculateMetrics(joaoItems);
  console.log('Resultado João:', joaoMetrics);

  const joaoExpected = {
    searches: 1,
    totalProcessed: 4,
    newCreated: 1,
    newReused: 0,
    usedCreated: 3,
    errors: 0,
  };

  const isJoaoValid =
    joaoMetrics.searches === joaoExpected.searches &&
    joaoMetrics.totalProcessed === joaoExpected.totalProcessed &&
    joaoMetrics.newCreated === joaoExpected.newCreated &&
    joaoMetrics.newReused === joaoExpected.newReused &&
    joaoMetrics.usedCreated === joaoExpected.usedCreated &&
    joaoMetrics.errors === joaoExpected.errors;

  if (!isJoaoValid) {
    throw new Error(
      `Falha no teste JOÃO: esperado ${JSON.stringify(joaoExpected)}, obtido ${JSON.stringify(joaoMetrics)}`
    );
  }

  // 3. Teste para Proprietário (Filtrando por Operador = Proprietário)
  const proprietarioItems = CANONICAL_CSV_DATASET.filter(
    (item) => item.userId === 'usr_proprietario_admin' || item.userName === 'Proprietário'
  );
  const proprietarioMetrics = calculateMetrics(proprietarioItems);
  console.log('Resultado Proprietário:', proprietarioMetrics);

  const proprietarioExpected = {
    searches: 0,
    totalProcessed: 1,
    newCreated: 1,
    newReused: 0,
    usedCreated: 0,
    errors: 0,
  };

  const isProprietarioValid =
    proprietarioMetrics.searches === proprietarioExpected.searches &&
    proprietarioMetrics.totalProcessed === proprietarioExpected.totalProcessed &&
    proprietarioMetrics.newCreated === proprietarioExpected.newCreated &&
    proprietarioMetrics.newReused === proprietarioExpected.newReused &&
    proprietarioMetrics.usedCreated === proprietarioExpected.usedCreated &&
    proprietarioMetrics.errors === proprietarioExpected.errors;

  if (!isProprietarioValid) {
    throw new Error(
      `Falha no teste PROPRIETÁRIO: esperado ${JSON.stringify(proprietarioExpected)}, obtido ${JSON.stringify(proprietarioMetrics)}`
    );
  }

  // 4. Teste de Isolamento do Registro Legado 1984
  const legacyRecord = CANONICAL_CSV_DATASET.find((item) => item.isbn === '9788535914849');
  if (!legacyRecord) throw new Error('Registro legado de 1984 não encontrado no dataset.');
  const legacyClassification = classifyOperationForMetrics(legacyRecord);

  if (
    !legacyClassification.isSearch ||
    legacyClassification.isProcessed ||
    legacyClassification.isUsedCreated ||
    legacyClassification.isNewCreated
  ) {
    throw new Error(
      `Registro legado classificado incorretamente: ${JSON.stringify(legacyClassification)}`
    );
  }

  // 5. Teste de Cenário Limpo (Seção 21)
  // João: 1. Pesquisa ISBN A. 2. Cria A como Novo. 3. Pesquisa ISBN B. 4. Cria B como Usado.
  const cleanScenarioItems: SearchHistoryItem[] = [
    {
      timestamp: 1000,
      isbn: '9780000000001',
      title: 'Livro A',
      success: true,
      operationType: 'pesquisa_isbn',
      userId: 'usr_joao_operador',
      userName: 'João',
      userRole: 'operator',
      operationEnvironment: 'production',
    },
    {
      timestamp: 2000,
      isbn: '9780000000001',
      title: 'Livro A',
      condition: 'novo',
      success: true,
      operationType: 'novo_cadastro',
      userId: 'usr_joao_operador',
      userName: 'João',
      userRole: 'operator',
      operationEnvironment: 'production',
    },
    {
      timestamp: 3000,
      isbn: '9780000000002',
      title: 'Livro B',
      success: true,
      operationType: 'pesquisa_isbn',
      userId: 'usr_joao_operador',
      userName: 'João',
      userRole: 'operator',
      operationEnvironment: 'production',
    },
    {
      timestamp: 4000,
      isbn: '9780000000002',
      title: 'Livro B',
      condition: 'usado',
      success: true,
      operationType: 'novo_usado_com_edicao_conhecida',
      userId: 'usr_joao_operador',
      userName: 'João',
      userRole: 'operator',
      operationEnvironment: 'production',
    },
  ];

  const cleanMetrics = calculateMetrics(cleanScenarioItems);
  console.log('Resultado Cenário Limpo:', cleanMetrics);
  const cleanExpected = {
    searches: 2,
    totalProcessed: 2,
    newCreated: 1,
    newReused: 0,
    usedCreated: 1,
    errors: 0,
  };

  const isCleanValid =
    cleanMetrics.searches === cleanExpected.searches &&
    cleanMetrics.totalProcessed === cleanExpected.totalProcessed &&
    cleanMetrics.newCreated === cleanExpected.newCreated &&
    cleanMetrics.newReused === cleanExpected.newReused &&
    cleanMetrics.usedCreated === cleanExpected.usedCreated &&
    cleanMetrics.errors === cleanExpected.errors;

  if (!isCleanValid) {
    throw new Error(
      `Falha no teste CENÁRIO LIMPO: esperado ${JSON.stringify(cleanExpected)}, obtido ${JSON.stringify(cleanMetrics)}`
    );
  }

  console.log('--- TODOS OS TESTES PASSARAM COM 100% DE CONFORMIDADE! ---');

  return {
    success: true,
    results: {
      globalMetrics,
      joaoMetrics,
      proprietarioMetrics,
      cleanMetrics,
    },
  };
}

if (typeof require !== 'undefined' && require.main === module) {
  runCanonicalMetricsRegressionTests();
}
