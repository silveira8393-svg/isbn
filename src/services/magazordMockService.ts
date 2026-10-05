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
import { cleanIsbn } from '../utils/isbn';

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

const SIMULATED_MAGAZORD_STORAGE_KEY_V3 = 'sebo_magazord_simulated_db_v3';
const SIMULATED_MAGAZORD_STORAGE_KEY_LEGACY = 'sebo_magazord_simulated_db_v2';
const SANDBOX_MAGAZORD_STORAGE_KEY = 'sebo_magazord_sandbox_db_v1';
const SIMULATION_CONFIG_KEY = 'sebo_magazord_sim_config_v2';

export interface SimulatedRecord {
  id: string;
  ean: string;
  parentCode: string;
  childCode: string;
  condition: BookCondition;
  title: string;
  price?: string;
  stock: number;
  description?: string;
  sku?: string;
  registeredAt: number;
}

type SimulatedCatalog = Record<string, SimulatedRecord[]>;
type SandboxCatalogs = Partial<Record<MagazordSimulationMode, SimulatedCatalog>>;

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

  public resetModeToAuto(): void {
    this.setSimulationConfig({ mode: 'auto' });
  }

  private normalizeMode(mode: MagazordSimulationMode): MagazordSimulationMode {
    if (mode === 'force_existing') return 'force_new_found';
    if (mode === 'force_not_found') return 'force_new_not_found';
    return mode;
  }

  private getSandboxCatalogs(): SandboxCatalogs {
    try {
      const raw = localStorage.getItem(SANDBOX_MAGAZORD_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  /**
   * Carrega o banco de dados simulado local, com suporte a múltiplos registros por EAN/ISBN
   * e migração transparente de versões legadas de formato único.
   */
  private getSimulatedDb(actionMode: MagazordSimulationMode): SimulatedCatalog {
    if (actionMode !== 'auto') {
      return this.getSandboxCatalogs()[this.normalizeMode(actionMode)] || {};
    }
    try {
      const rawV3 = localStorage.getItem(SIMULATED_MAGAZORD_STORAGE_KEY_V3);
      if (rawV3) {
        const parsed = JSON.parse(rawV3);
        if (parsed && typeof parsed === 'object') return parsed;
      }

      // Migração de V2 legado se existir
      const rawV2 = localStorage.getItem(SIMULATED_MAGAZORD_STORAGE_KEY_LEGACY);
      if (rawV2) {
        const parsedV2 = JSON.parse(rawV2);
        const migrated: Record<string, SimulatedRecord[]> = {};
        for (const [key, val] of Object.entries(parsedV2)) {
          if (Array.isArray(val)) {
            migrated[key] = val as SimulatedRecord[];
          } else if (val && typeof val === 'object') {
            const item = val as any;
            const cleanKey = cleanIsbn(key) || key;
            migrated[cleanKey] = [
              {
                id: `legacy-${cleanKey}-${Date.now()}`,
                ean: cleanKey,
                parentCode: item.parentCode || 'LV26579-P',
                childCode: item.childCode || cleanKey,
                condition: item.condition || 'novo',
                title: item.title || 'Obra Cadastrada',
                stock: item.stock || 1,
                registeredAt: item.registeredAt || Date.now(),
              },
            ];
          }
        }
        return migrated;
      }
      return {};
    } catch {
      return {};
    }
  }

  private saveSimulatedDb(db: SimulatedCatalog, actionMode: MagazordSimulationMode) {
    try {
      if (actionMode !== 'auto') {
        const catalogs = this.getSandboxCatalogs();
        catalogs[this.normalizeMode(actionMode)] = db;
        localStorage.setItem(SANDBOX_MAGAZORD_STORAGE_KEY, JSON.stringify(catalogs));
        return;
      }
      localStorage.setItem(SIMULATED_MAGAZORD_STORAGE_KEY_V3, JSON.stringify(db));
      localStorage.setItem(SIMULATED_MAGAZORD_STORAGE_KEY_LEGACY, JSON.stringify(db));
    } catch (e) {
      console.warn('Erro ao salvar no banco simulado Magazord', e);
    }
  }

  /** Materializa somente fixtures do cenário sandbox, sem copiar dados operacionais. */
  private ensureSandboxFixtures(ean: string, bookTitle: string | undefined, actionMode: MagazordSimulationMode): SimulatedRecord[] {
    const mode = this.normalizeMode(actionMode);
    const safeEan = cleanIsbn(ean) || '9788553131303';
    const db = this.getSimulatedDb(mode);
    const records = db[safeEan] || [];
    const fixture = (condition: BookCondition, parentCode: string, childCode: string, title: string, stock: number, sku: string, price?: string): SimulatedRecord => ({
      id: `fixture-${mode}-${safeEan}-${childCode}`, ean: safeEan, condition,
      parentCode, childCode, title, stock, sku, price, registeredAt: Date.now(),
    });
    let fixtures: SimulatedRecord[] = [];
    if (mode === 'force_new_found' && !records.some(record => record.condition === 'novo')) {
      fixtures = [fixture('novo', 'LV26579-P', safeEan, bookTitle || 'Produto Novo Cadastrado na Magazord', 3, `SKU-NV-${safeEan.slice(-6)}`)];
    } else if (mode === 'force_used_known' && !records.some(record => record.condition === 'usado')) {
      fixtures = [fixture('usado', 'LV-EDICAO-P', 'LV10100', bookTitle || 'Edição Conhecida no Catálogo Magazord', 1, `SKU-US-${safeEan.slice(-6)}`)];
    } else if (mode === 'force_multiple_matches') {
      fixtures = [
        fixture('novo', 'LV26579-P', safeEan, (bookTitle || 'Obra') + ' (Cadastro Novo Padrão)', 4, `SKU-NV-${safeEan.slice(-4)}`, '49.90'),
        fixture('usado', 'LV10100-P', 'LV10100', (bookTitle || 'Obra') + ' (Exemplar Usado A - Sebo)', 1, 'SKU-US-10100', '25.00'),
        fixture('usado', 'LV10105-P', 'LV10105', (bookTitle || 'Obra') + ' (Exemplar Usado B - Sebo)', 1, 'SKU-US-10105', '19.90'),
      ].filter(candidate => !records.some(record => record.condition === candidate.condition && record.childCode === candidate.childCode));
    }
    if (fixtures.length > 0) {
      db[safeEan] = [...records, ...fixtures];
      this.saveSimulatedDb(db, mode);
      return db[safeEan];
    }
    return records;
  }

  /**
   * Obtém a lista de registros para determinado ISBN/EAN (ou código filho).
   */
  public getRecordsForEan(ean: string, actionMode: MagazordSimulationMode = this.config.mode): SimulatedRecord[] {
    const cleanKey = cleanIsbn(ean) || ean;
    const db = this.getSimulatedDb(actionMode);
    if (db[cleanKey] && Array.isArray(db[cleanKey]) && db[cleanKey].length > 0) {
      return db[cleanKey];
    }

    // Busca secundária caso registrado com formatação diferente ou childCode
    for (const list of Object.values(db)) {
      if (Array.isArray(list)) {
        const match = list.filter(
          (r) => cleanIsbn(r.ean) === cleanKey || cleanIsbn(r.childCode) === cleanKey
        );
        if (match.length > 0) {
          return list;
        }
      }
    }
    return [];
  }

  /**
   * Simula a consulta de um produto pelo EAN/ISBN na API Magazord,
   * distinguindo reaproveitamento de produto NOVO vs criação de novo exemplar USADO.
   */
  public async checkProductByEan(
    ean: string,
    bookTitle?: string,
    inspectedCondition?: BookCondition,
    actionMode: MagazordSimulationMode = this.config.mode
  ): Promise<MagazordProductCheck> {
    // O parâmetro padrão captura o modo antes do primeiro await; chamadas compostas podem repassá-lo.
    // Delay simulado de rede (300ms a 450ms)
    await new Promise((resolve) => setTimeout(resolve, 380));

    const mode = this.normalizeMode(actionMode);

    if (mode === 'force_error') {
      throw new Error('Falha de conexão com a API Magazord (503 Service Unavailable)');
    }

    // 1. FORÇAR: Novo Encontrado (Cadastro Novo Compatível)
    if (mode === 'force_new_found' || mode === 'force_existing') {
      const record = this.ensureSandboxFixtures(ean, bookTitle, mode).find(item => item.condition === 'novo')!;
      return {
        exists: true,
        status: 'NEW_PRODUCT_FOUND',
        catalogMatch: true,
        canReuseCommercialRegistration: true,
        existingCondition: 'novo',
        parentCode: record.parentCode,
        childCode: record.childCode,
        sku: record.sku || `SKU-NV-${record.childCode.slice(-6)}`,
        title: record.title,
        statusMessage: 'Cadastro NOVO compatível localizado na Magazord.',
        currentStock: record.stock,
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
      const record = this.ensureSandboxFixtures(ean, bookTitle, mode).find(item => item.condition === 'usado')!;
      return {
        exists: true,
        status: 'USED_EDITION_FOUND',
        catalogMatch: true,
        canReuseCommercialRegistration: false, // Usado NUNCA reaproveita o cadastro comercial
        existingCondition: 'usado',
        parentCode: record.parentCode,
        childCode: record.childCode,
        sku: record.sku || `SKU-US-${record.childCode.slice(-6)}`,
        title: record.title,
        currentStock: record.stock,
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
      const records = this.ensureSandboxFixtures(ean, bookTitle, mode);
      const novoRecord = records.find(record => record.condition === 'novo')!;
      const matches: MagazordMatchItem[] = records.map(record => ({
        id: record.id, parentCode: record.parentCode, childCode: record.childCode,
        condition: record.condition, title: record.title,
        sku: record.sku || `SKU-${record.condition === 'novo' ? 'NV' : 'US'}-${record.childCode.slice(-6)}`,
        stock: record.stock, price: record.price,
      }));

      return {
        exists: true,
        status: 'MULTIPLE_MATCHES',
        catalogMatch: true,
        canReuseCommercialRegistration: true, // Possui produto novo
        existingCondition: 'novo',
        parentCode: novoRecord.parentCode,
        childCode: novoRecord.childCode,
        currentStock: novoRecord.stock,
        statusMessage: 'Encontramos cadastro comercial NOVO e exemplar(es) USADO(S) vinculados a este ISBN.',
        matches,
      };
    }

    // -------------------------------------------------------------
    // MODO 'auto': busca no banco simulado local real
    // -------------------------------------------------------------
    const cleanKey = cleanIsbn(ean) || ean;
    const records = this.getRecordsForEan(cleanKey, mode);

    if (records.length === 0) {
      return {
        exists: false,
        status: 'NOT_FOUND',
        catalogMatch: false,
        canReuseCommercialRegistration: false,
        statusMessage: 'Produto não encontrado na Magazord.',
      };
    }

    const novoRecord = records.find((r) => r.condition === 'novo');
    const usedRecords = records.filter((r) => r.condition === 'usado');

    // REGRA FUNDAMENTAL DO NEGÓCIO:
    // 1. Se houver Produto NOVO e um ou mais Exemplares USADOS:
    //    Classificar SEMPRE como MULTIPLE_MATCHES!
    //    A existência de um Usado NUNCA deve ocultar o cadastro comercial Novo compatível.
    if (novoRecord && usedRecords.length > 0) {
      const matches: MagazordMatchItem[] = records.map((r) => ({
        id: r.id,
        parentCode: r.parentCode,
        childCode: r.childCode,
        condition: r.condition,
        title: r.title,
        sku: `SKU-${r.condition === 'novo' ? 'NV' : 'US'}-${r.childCode.slice(-6)}`,
        stock: r.stock,
        price: r.price,
      }));

      return {
        exists: true,
        status: 'MULTIPLE_MATCHES',
        catalogMatch: true,
        canReuseCommercialRegistration: true, // Permite entrada de estoque no cadastro Novo
        existingCondition: 'novo',
        parentCode: novoRecord.parentCode,
        childCode: novoRecord.childCode,
        sku: `SKU-NV-${novoRecord.childCode.slice(-6)}`,
        title: novoRecord.title || bookTitle || 'Produto no Catálogo Magazord',
        currentStock: novoRecord.stock,
        statusMessage: `Cadastro comercial NOVO localizado (${novoRecord.parentCode}) juntamente com ${usedRecords.length} exemplar(es) USADO(S).`,
        matches,
      };
    }

    // 2. Se houver apenas NOVO:
    if (novoRecord && usedRecords.length === 0) {
      return {
        exists: true,
        status: 'NEW_PRODUCT_FOUND',
        catalogMatch: true,
        canReuseCommercialRegistration: true,
        existingCondition: 'novo',
        parentCode: novoRecord.parentCode,
        childCode: novoRecord.childCode,
        sku: `SKU-NV-${novoRecord.childCode.slice(-6)}`,
        title: novoRecord.title || bookTitle || 'Produto Novo Cadastrado na Magazord',
        currentStock: novoRecord.stock,
        statusMessage: 'Cadastro NOVO compatível localizado na Magazord.',
      };
    }

    // 3. Se houver apenas 1 exemplar USADO (nenhum Novo):
    if (!novoRecord && usedRecords.length === 1) {
      const singleUsed = usedRecords[0];
      return {
        exists: true,
        status: 'USED_EDITION_FOUND',
        catalogMatch: true,
        canReuseCommercialRegistration: false,
        existingCondition: 'usado',
        parentCode: singleUsed.parentCode,
        childCode: singleUsed.childCode,
        sku: `SKU-US-${singleUsed.childCode.slice(-6)}`,
        title: singleUsed.title || bookTitle || 'Edição Conhecida na Magazord',
        currentStock: singleUsed.stock,
        statusMessage:
          'Edição conhecida no catálogo. Dados bibliográficos disponíveis para novo exemplar usado.',
        matches: [
          {
            id: singleUsed.id,
            parentCode: singleUsed.parentCode,
            childCode: singleUsed.childCode,
            condition: 'usado',
            title: singleUsed.title,
            sku: `SKU-US-${singleUsed.childCode.slice(-6)}`,
            stock: singleUsed.stock,
            price: singleUsed.price,
          },
        ],
      };
    }

    // 4. Se houver 2 ou mais USADOS (e nenhum Novo):
    if (!novoRecord && usedRecords.length > 1) {
      const matches: MagazordMatchItem[] = usedRecords.map((r) => ({
        id: r.id,
        parentCode: r.parentCode,
        childCode: r.childCode,
        condition: 'usado',
        title: r.title,
        sku: `SKU-US-${r.childCode.slice(-6)}`,
        stock: r.stock,
        price: r.price,
      }));

      return {
        exists: true,
        status: 'MULTIPLE_MATCHES',
        catalogMatch: true,
        canReuseCommercialRegistration: false, // Nenhum cadastro comercial Novo
        existingCondition: 'usado',
        parentCode: usedRecords[0].parentCode,
        childCode: usedRecords[0].childCode,
        title: usedRecords[0].title || bookTitle || 'Edição com Exemplares Usados',
        statusMessage: `Edição conhecida com ${usedRecords.length} exemplares USADOS cadastrados anteriormente.`,
        matches,
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
   * Altera EXCLUSIVAMENTE o estoque do produto Novo correspondente.
   */
  public async addStockToExistingProduct(
    ean: string,
    quantityToAdd: number,
    targetChildCode?: string,
    actionMode: MagazordSimulationMode = this.config.mode
  ): Promise<{ success: boolean; newStock: number; message: string }> {
    await new Promise((resolve) => setTimeout(resolve, 500));

    const cleanKey = cleanIsbn(ean) || ean;
    if (actionMode !== 'auto') this.ensureSandboxFixtures(ean, undefined, actionMode);
    const db = this.getSimulatedDb(actionMode);
    let records = db[cleanKey] || [];
    let targetKey = cleanKey;

    if (records.length === 0) {
      for (const [k, list] of Object.entries(db)) {
        if (
          Array.isArray(list) &&
          list.some(
            (r) =>
              r.ean === cleanKey ||
              r.childCode === cleanKey ||
              (targetChildCode && r.childCode === targetChildCode)
          )
        ) {
          records = list;
          targetKey = k;
          break;
        }
      }
    }

    // Localiza o produto NOVO (por targetChildCode ou condição 'novo')
    const targetRecord = targetChildCode
      ? records.find((r) => r.childCode === targetChildCode) ||
        records.find((r) => r.condition === 'novo')
      : records.find((r) => r.condition === 'novo');

    const previousStock = targetRecord?.stock || 3;
    const newStock = previousStock + Math.max(1, quantityToAdd);

    if (targetRecord) {
      targetRecord.stock = newStock;
      db[targetKey] = records;
      this.saveSimulatedDb(db, actionMode);
    } else {
      // Se não havia registro Novo no banco (ex: teste forçado), cria registro Novo padrão
      const fallbackRecord: SimulatedRecord = {
        id: `rec-novo-${cleanKey}`,
        ean: cleanKey,
        parentCode: 'LV26579-P',
        childCode: cleanKey,
        condition: 'novo',
        title: 'Produto Novo Cadastrado na Magazord',
        stock: newStock,
        registeredAt: Date.now(),
      };
      db[targetKey] = [fallbackRecord, ...records];
      this.saveSimulatedDb(db, actionMode);
    }

    return {
      success: true,
      newStock,
      message: `Entrada de ${quantityToAdd} unidade(s) vinculada com sucesso ao produto Novo (${targetRecord?.parentCode || 'LV26579-P'} / ${targetRecord?.childCode || cleanKey}).`,
    };
  }

  /**
   * Simula o envio de um novo cadastro para o Magazord.
   * - Para NOVO: atualiza ou cadastra o registro comercial Novo da edição.
   * - Para USADO: SEMPRE cria um exemplar físico independente (novo id, Código Pai próprio, etc.),
   *   preservando integralmente o produto Novo e quaisquer Usados anteriores.
   */
  public async createProduct(draft: RegistrationDraft, actionMode: MagazordSimulationMode = this.config.mode): Promise<MagazordRegistrationResult> {
    // Delay de processamento simulado (850ms)
    await new Promise((resolve) => setTimeout(resolve, 850));

    if (actionMode === 'force_error') {
      throw new Error('Falha ao processar cadastro na API Magazord: Timeout de resposta');
    }

    const cleanEan =
      cleanIsbn(draft.ean || draft.isbn13 || draft.isbn10 || '') ||
      cleanIsbn(draft.childCode) ||
      'SEM_EAN';

    const db = this.getSimulatedDb(actionMode);
    const existingList = db[cleanEan] ? [...db[cleanEan]] : [];

    const newRecord: SimulatedRecord = {
      id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ean: cleanEan,
      parentCode: draft.parentCode.trim(),
      childCode: draft.childCode.trim(),
      condition: draft.condition,
      title: draft.title.trim(),
      price: draft.price ? draft.price.trim() : undefined,
      stock: draft.quantity || 1,
      description: draft.description,
      registeredAt: Date.now(),
    };

    if (draft.condition === 'novo') {
      // Se já existe produto NOVO cadastrado, atualizamos os dados dele sem duplicar o Novo
      const novoIndex = existingList.findIndex((r) => r.condition === 'novo');
      if (novoIndex >= 0) {
        existingList[novoIndex] = {
          ...existingList[novoIndex],
          ...newRecord,
          id: existingList[novoIndex].id,
          stock: draft.quantity || existingList[novoIndex].stock,
        };
      } else {
        existingList.unshift(newRecord);
      }
    } else {
      // Se é USADO: Cada exemplar usado é FÍSICA E COMERCIALMENTE INDEPENDENTE.
      // Adicionamos o novo exemplar à lista, PRESERVANDO o produto Novo e os Usados anteriores!
      existingList.push(newRecord);
    }

    db[cleanEan] = existingList;
    this.saveSimulatedDb(db, actionMode);

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
    book: BookInfo,
    actionMode: MagazordSimulationMode = this.config.mode
  ): Promise<{ success: boolean; parentCode: string; childCode: string; message: string }> {
    await new Promise((resolve) => setTimeout(resolve, 500));

    const cleanKey = cleanIsbn(ean) || ean;
    const records = this.getRecordsForEan(cleanKey, actionMode);
    const existing = records[0] || {
      parentCode: 'LV-EXISTING-P',
      childCode: cleanKey,
      condition: 'novo' as BookCondition,
      title: book.title || 'Livro',
      stock: 3,
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
