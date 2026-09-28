/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BookInfo, MagazordProductCheck, MagazordRegistrationResult, RegistrationDraft } from '../types';

export type MagazordSimulationMode = 'auto' | 'force_existing' | 'force_not_found' | 'force_error';

export interface MagazordSimulationConfig {
  mode: MagazordSimulationMode;
}

const DEFAULT_CONFIG: MagazordSimulationConfig = {
  mode: 'auto', // Por padrão: se cadastrado localmente no mock retorna existente, senão não encontrado
};

// Armazenamento em memória / localStorage para produtos já cadastrados durante a sessão
const SIMULATED_MAGAZORD_STORAGE_KEY = 'sebo_magazord_simulated_db_v1';
const SIMULATION_CONFIG_KEY = 'sebo_magazord_sim_config_v1';

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

  private getSimulatedDb(): Record<string, { parentCode: string; childCode: string; title: string; registeredAt: number }> {
    try {
      const raw = localStorage.getItem(SIMULATED_MAGAZORD_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  private saveToSimulatedDb(ean: string, data: { parentCode: string; childCode: string; title: string; registeredAt: number }) {
    try {
      const db = this.getSimulatedDb();
      db[ean] = data;
      localStorage.setItem(SIMULATED_MAGAZORD_STORAGE_KEY, JSON.stringify(db));
    } catch (e) {
      console.warn('Erro ao salvar no banco simulado Magazord', e);
    }
  }

  /**
   * Simula a consulta de um produto pelo EAN/ISBN na API Magazord.
   */
  public async checkProductByEan(ean: string, bookTitle?: string): Promise<MagazordProductCheck> {
    // Delay simulado de rede (350ms a 600ms)
    await new Promise((resolve) => setTimeout(resolve, 450));

    if (this.config.mode === 'force_error') {
      throw new Error('Falha de conexão com a API Magazord (503 Service Unavailable)');
    }

    if (this.config.mode === 'force_existing') {
      return {
        exists: true,
        parentCode: 'LV-MOCK-P',
        childCode: ean || '9780000000000',
        sku: `SKU-${ean.slice(-6)}`,
        title: bookTitle || 'Produto já existente no catálogo Magazord',
        statusMessage: 'Produto localizado na base ativa do Magazord.',
      };
    }

    if (this.config.mode === 'force_not_found') {
      return {
        exists: false,
        statusMessage: 'Produto não encontrado na Magazord.',
      };
    }

    // Modo 'auto': checa se já foi cadastrado nesta sessão
    const db = this.getSimulatedDb();
    if (db[ean]) {
      const record = db[ean];
      return {
        exists: true,
        parentCode: record.parentCode,
        childCode: record.childCode,
        sku: `SKU-${record.childCode.slice(-6)}`,
        title: record.title,
        statusMessage: 'Produto localizado no catálogo (previamente cadastrado).',
      };
    }

    return {
      exists: false,
      statusMessage: 'Produto não encontrado na Magazord.',
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
        title: draft.title,
        registeredAt: Date.now(),
      });
    }

    return {
      success: true,
      parentCode: draft.parentCode,
      childCode: draft.childCode,
      message: 'Produto cadastrado com sucesso no Magazord',
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
