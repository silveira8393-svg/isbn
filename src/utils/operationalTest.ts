import type { ProductionOperation } from '../services/productionService';

export const DEMO_BATCH_ID = 'isbn-demo-20261014-realapp-01';
// Explicit round identifier; environment continues to be assigned by the database.
export const OPERATIONAL_TEST_RUN_ID = 'isbn-operational-20261014-01';
export type RecordProvenance = 'demo' | 'operational_test' | 'unclassified';
export const provenanceLabels: Record<RecordProvenance, string> = {
  demo: 'Histórico demonstrativo',
  operational_test: 'Teste operacional realizado por usuário',
  unclassified: 'Registro sem classificação suficiente',
};

export function recordProvenance(item: Pick<ProductionOperation, 'metadata'>): RecordProvenance {
  if (item.metadata?.demo === true || typeof item.metadata?.demo_batch_id === 'string') return 'demo';
  if (item.metadata?.purpose === 'operational_test' && typeof item.metadata?.operational_test_run_id === 'string'
    && item.metadata.operational_test_run_id.length > 0) return 'operational_test';
  return 'unclassified';
}

export function isAuthorizedDemo(item: Pick<ProductionOperation, 'environment' | 'metadata'>) {
  return item.environment === 'development' && item.metadata?.demo === true && item.metadata?.mock === true
    && item.metadata?.demo_batch_id === DEMO_BATCH_ID;
}
