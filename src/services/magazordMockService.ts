/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BookInfo,
  BookCondition,
  MagazordProductCheck,
  MagazordRegistrationResult,
  MagazordMatchItem,
  RegistrationDraft,
} from '../types';

export type MagazordSimulationMode =
  | 'auto'
  | 'force_new_not_found'
  | 'force_new_found'
  | 'force_used_known'
  | 'force_used_not_found'
  | 'force_multiple_matches'
  | 'force_error'
  // compatibilidade retroativa
  | 'force_existing'
  | 'force_not_found';

export interface MagazordSimulationConfig {
  mode: MagazordSimulationMode;
}

const DEFAULT_CONFIG: MagazordSimulationConfig = {
  mode: 'auto',
};

const SIMULATED_MAGAZORD_STORAGE_KEY = 'sebo_magazord_simulated_db_v2';
const SIMULATION_CONFIG_KEY = 'sebo_magazord_sim_config_v2';

interface SimulatedRecord {
  parentCode: string;
  childCode: string;
  condition: BookCondition;
  title: string;
  stock?: number;
  registeredAt: number;
}

class MagazordMockService {
  private config: MagazordSimulationConfig = DEFAULT_CONFIG;

  constructor() {
    try {
      const savedConfig = localStorage.getItem(SIMULATION_CONFIG_KEY);
      if (savedConfig) {
        this.config = JSON.parse(savedConfig);
      }
    } catch {
      this.config = DEFAULT_CONFIG;
    }
  }

  public getSimulationConfig(): MagazordSimulationConfig {
    return { ...this.config };
  }

  public setSimulationConfig(config: Partial<MagazordSimulationConfig>) {
    this.config = { ...this.config, ...config };
    try {
      localStorage.setItem(SIMULATION_CONFIG_KEY, JSON.stringify(this.config));
    } catch (e) {
      console.warn('Não foi possível persistir a configuração de simulação Magazord', e);
    }
  }

  private getSimulatedDb(): Record<string, SimulatedRecord> {
    try {
      const raw = localStorage.getItem(SIMULATED_MAGAZORD_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  private saveToSimulatedDb(ean: string, data: SimulatedRecord) {
    try {
      const db = this.getSimulatedDb();
      db[ean] = data;
      localStorage.setItem(SIMULATED_MAGAZORD_STORAGE_KEY, JSON.stringify(db));
    } catch (e) {
      console.warn('Erro ao salvar no banco simulado Magazord', e);
    }
  }

  /**
   * Simula a consulta de um produto pelo EAN/ISBN na API Magazord,
   * distinguindo reaproveitamento de produto NOVO vs edição conhecida para USADO.
   */
  public async checkProductByEan(
    ean: string,
    bookTitle?: string,
    inspectedCondition?: BookCondition
  ): Promise<MagazordProductCheck> {
    // Delay simulado de rede (350ms a 500ms)
    await new Promise((resolve) => setTimeout(resolve, 450));

    const mode = this.config.mode;

    if (mode === 'force_error') {
      throw new Error('Falha de conexão com a API Magazord (503 Service Unavailable)');
    }

    // 1. FORÇAR: Novo Encontrado (Cadastro Novo Compatível)
    if (mode === 'force_new_found' || mode === 'force_existing') {
      const safeEan = ean || '9788553131303';
      return {
        exists: true,
        status: 'NEW_PRODUCT_FOUND',
        catalogMatch: true,
        canReuseCommercialRegistration: true,
        existingCondition: 'novo',
        parentCode: 'LV26579-P',
        childCode: safeEan,
        sku: `SKU-NV-${safeEan.slice(-6)}`,
        title: bookTitle || 'Produto Novo Cadastrado na Magazord',
        statusMessage: 'Cadastro NOVO compatível localizado na Magazord.',
        currentStock: 3,
      };
    }

    // 2. FORÇAR: Novo Não Encontrado
    if (mode === 'force_new_not_found' || mode === 'force_not_found') {
      return {
        exists: false,
        status: 'NOT_FOUND',
        catalogMatch: false,
        canReuseCommercialRegistration: false,
        statusMessage: 'Produto novo não localizado na base Magazord.',
      };
    }

    // 3. FORÇAR: Usado / ISBN Conhecido (Edição Conhecida)
    if (mode === 'force_used_known') {
      const safeEan = ean || '9788553131303';
      return {
        exists: true,
        status: 'USED_EDITION_FOUND',
        catalogMatch: true,
        canReuseCommercialRegistration: false, // Usado NUNCA reaproveita o cadastro comercial
        existingCondition: 'usado',
        parentCode: 'LV-EDICAO-P',
        childCode: 'LV10100',
        sku: `SKU-US-${safeEan.slice(-6)}`,
        title: bookTitle || 'Edição Conhecida no Catálogo Magazord',
        statusMessage:
          'Esta edição já é conhecida no catálogo. Os dados bibliográficos existentes serão reaproveitados para preparar um novo exemplar usado.',
      };
    }

    // 4. FORÇAR: Usado Não Encontrado
    if (mode === 'force_used_not_found') {
      return {
        exists: false,
        status: 'NOT_FOUND',
        catalogMatch: false,
        canReuseCommercialRegistration: false,
        statusMessage: 'Edição não localizada no catálogo Magazord.',
      };
    }

    // 5. FORÇAR: Múltiplos Resultados
    if (mode === 'force_multiple_matches') {
      const safeEan = ean || '9788553131303';
      const matches: MagazordMatchItem[] = [
        {
          id: 'match-1',
          parentCode: 'LV26579-P',
          childCode: safeEan,
          condition: 'novo',
          title: (bookTitle || 'Obra') + ' (Cadastro Novo Padrão)',
          sku: `SKU-NV-${safeEan.slice(-4)}`,
          stock: 4,
          price: '49.90',
        },
        {
          id: 'match-2',
          parentCode: 'LV10100-P',
          childCode: 'LV10100',
          condition: 'usado',
          title: (bookTitle || 'Obra') + ' (Exemplar Usado A - Sebo)',
          sku: `SKU-US-10100`,
          stock: 1,
          price: '25.00',
        },
        {
          id: 'match-3',
          parentCode: 'LV10105-P',
          childCode: 'LV10105',
          condition: 'usado',
          title: (bookTitle || 'Obra') + ' (Exemplar Usado B - Sebo)',
          sku: `SKU-US-10105`,
          stock: 1,
          price: '19.90',
        },
      ];

      return {
        exists: true,
        status: 'MULTIPLE_MATCHES',
        catalogMatch: true,
        canReuseCommercialRegistration: false,
        statusMessage: 'Encontramos mais de um cadastro relacionado a este ISBN.',
        matches,
      };
    }

    // MODO 'auto': busca no banco simulado local
    const db = this.getSimulatedDb();
    if (db[ean]) {
      const record = db[ean];
      const isNovo = record.condition === 'novo';

      return {
        exists: true,
        status: isNovo ? 'NEW_PRODUCT_FOUND' : 'USED_EDITION_FOUND',
        catalogMatch: true,
        canReuseCommercialRegistration: isNovo,
        existingCondition: record.condition,
        parentCode: record.parentCode,
        childCode: record.childCode,
        sku: `SKU-${record.childCode.slice(-6)}`,
        title: record.title,
        currentStock: record.stock || 1,
        statusMessage: isNovo
          ? 'Cadastro NOVO compatível localizado no catálogo (previamente cadastrado).'
          : 'Edição conhecida no catálogo. Dados bibliográficos disponíveis para novo exemplar usado.',
      };
    }

    return {
      exists: false,
      status: 'NOT_FOUND',
      catalogMatch: false,
      canReuseCommercialRegistration: false,
      statusMessage: 'Produto não encontrado na Magazord.',
    };
  }

  /**
   * Simula a vinculação de entrada de estoque a um produto NOVO existente.
   */
  public async addStockToExistingProduct(
    ean: string,
    quantityToAdd: number
  ): Promise<{ success: boolean; newStock: number; message: string }> {
    await new Promise((resolve) => setTimeout(resolve, 600));

    const db = this.getSimulatedDb();
    const existing = db[ean];
    const previousStock = existing?.stock || 3;
    const newStock = previousStock + Math.max(1, quantityToAdd);

    if (existing) {
      existing.stock = newStock;
      this.saveToSimulatedDb(ean, existing);
    }

    return {
      success: true,
      newStock,
      message: `Entrada de ${quantityToAdd} unidade(s) vinculada com sucesso ao cadastro existente.`,
    };
  }

  /**
   * Simula o envio de um novo cadastro para o Magazord.
   */
  public async createProduct(draft: RegistrationDraft): Promise<MagazordRegistrationResult> {
    // Delay de processamento simulado (850ms)
    await new Promise((resolve) => setTimeout(resolve, 850));

    if (this.config.mode === 'force_error') {
      throw new Error('Falha ao processar cadastro na API Magazord: Timeout de resposta');
    }

    // Salva no banco de dados simulado local
    const key = draft.ean || draft.childCode || draft.isbn13;
    if (key) {
      this.saveToSimulatedDb(key, {
        parentCode: draft.parentCode,
        childCode: draft.childCode,
        condition: draft.condition,
        title: draft.title,
        stock: draft.quantity || 1,
        registeredAt: Date.now(),
      });
    }

    return {
      success: true,
      parentCode: draft.parentCode,
      childCode: draft.childCode,
      message:
        draft.condition === 'usado'
          ? 'Novo exemplar usado cadastrado com sucesso no Magazord'
          : 'Produto novo cadastrado com sucesso no Magazord',
      registeredAt: Date.now(),
    };
  }

  /**
   * Simula o enriquecimento de produto já existente.
   */
  public async complementExistingProduct(
    ean: string,
    book: BookInfo
  ): Promise<{ success: boolean; parentCode: string; childCode: string; message: string }> {
    await new Promise((resolve) => setTimeout(resolve, 600));

    const db = this.getSimulatedDb();
    const existing = db[ean] || {
      parentCode: 'LV-EXISTING-P',
      childCode: ean,
      condition: 'novo' as BookCondition,
      title: book.title || 'Livro',
      registeredAt: Date.now(),
    };

    return {
      success: true,
      parentCode: existing.parentCode,
      childCode: existing.childCode,
      message: 'Dados bibliográficos complementados com sucesso no catálogo Magazord.',
    };
  }
}

export const magazordMockService = new MagazordMockService();

