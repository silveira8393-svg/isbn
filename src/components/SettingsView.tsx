/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useUser } from '../contexts/UserContext';
import MagazordTestMode from './magazord/MagazordTestMode';
import {
  Settings,
  Store,
  Layers,
  ShoppingBag,
  Sliders,
  Users,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Info,
} from 'lucide-react';

type SettingsTab = 'loja' | 'magazord' | 'amazon' | 'parametros' | 'usuarios';

export default function SettingsView() {
  const { currentUser, users } = useUser();
  const [activeSubTab, setActiveSubTab] = useState<SettingsTab>('loja');

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 animate-fade-in pb-12">
      {/* Header de Configurações */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center font-bold shadow-2xs">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">
                Configurações da Loja & Integrações
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                Administrativo
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Estrutura de parâmetros operacionais e preparação para integração Magazord e Amazon.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Acesso: {currentUser.name} ({currentUser.role})</span>
        </div>
      </div>

      {/* Navegação entre seções de configuração */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveSubTab('loja')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            activeSubTab === 'loja'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Store className="w-3.5 h-3.5" />
          <span>Loja & Filial</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('magazord')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            activeSubTab === 'magazord'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Magazord ERP</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('amazon')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            activeSubTab === 'amazon'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <ShoppingBag className="w-3.5 h-3.5" />
          <span>Amazon Marketplace</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('parametros')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            activeSubTab === 'parametros'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Parâmetros Padrão</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('usuarios')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            activeSubTab === 'usuarios'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Usuários ({users.length})</span>
        </button>
      </div>

      {/* Conteúdo Conforme Subaba */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
        {/* 1. LOJA */}
        {activeSubTab === 'loja' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Identificação da Filial / Loja</h3>
              <p className="text-xs text-slate-500">Configurações institucionais e ponto de venda físico.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nome da Loja</label>
                <input
                  type="text"
                  readOnly
                  value="Sebo Livraria Sul"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 font-medium cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Identificador de Localização</label>
                <input
                  type="text"
                  readOnly
                  value="Sebo Livraria Sul - Matriz"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-slate-800 font-medium cursor-not-allowed"
                />
              </div>
            </div>
          </div>
        )}

        {/* 2. MAGAZORD */}
        {activeSubTab === 'magazord' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Integração Magazord ERP</h3>
                <p className="text-xs text-slate-500">Credenciais e endpoints de comunicação.</p>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                Camada Simulada (Mock)
              </span>
            </div>

            <MagazordTestMode />

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-3">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <p className="text-slate-600">
                  Nesta etapa de protótipo, as consultas e cadastros utilizam o serviço simulado <code>magazordMockService</code>. Quando as credenciais de produção forem disponibilizadas, a transição para a API REST da Magazord será feita via rotas de proxy no backend.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <span className="text-slate-500 block text-[11px]">Endpoint Planejado</span>
                  <code className="text-slate-800 font-mono">/api/magazord/v1/produtos</code>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Autenticação</span>
                  <span className="text-slate-800 font-mono flex items-center gap-1">
                    <Lock className="w-3 h-3 text-slate-400" />
                    Bearer Token (Servidor)
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3. AMAZON */}
        {activeSubTab === 'amazon' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Amazon Marketplace (SP-API)</h3>
              <p className="text-xs text-slate-500">Módulo reservado para consulta comparativa de preços e catálogo Amazon.</p>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <p className="text-slate-600">
                Integração planejada para etapas futuras. As buscas manuais de preço na Amazon já continuam operacionais através dos links rápidos da ficha técnica bibliográfica.
              </p>
            </div>
          </div>
        )}

        {/* 4. PARÂMETROS PADRÃO */}
        {activeSubTab === 'parametros' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Parâmetros Padrão de Cadastro</h3>
              <p className="text-xs text-slate-500">Valores pré-carregados automaticamente na tela de cadastro.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[11px]">NCM Padrão (Livros)</span>
                <strong className="text-slate-900 font-mono text-sm">4901.99.00</strong>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[11px]">Origem Fiscal</span>
                <strong className="text-slate-900 text-sm">0 - Nacional</strong>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-500 block text-[11px]">Unidade Comercial</span>
                <strong className="text-slate-900 font-mono text-sm">UN</strong>
              </div>
            </div>
          </div>
        )}

        {/* 5. GESTÃO DE USUÁRIOS */}
        {activeSubTab === 'usuarios' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Usuários & Perfis do Sistema</h3>
                <p className="text-xs text-slate-500">Identidade autenticada nesta sessão.</p>
              </div>
              <span className="text-xs text-slate-500 font-medium">
                {users.length} usuário autenticado
              </span>
            </div>

            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden text-xs">
              {users.map((u) => (
                <div key={u.id} className="p-3.5 flex items-center justify-between gap-3 bg-white">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs ${
                        u.role === 'admin'
                          ? 'bg-emerald-600'
                          : u.role === 'developer'
                          ? 'bg-amber-600'
                          : 'bg-blue-600'
                      }`}
                    >
                      {u.name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <strong className="text-slate-900">{u.name}</strong>
                        <span className="px-2 py-0.2 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                          {u.role}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500 font-mono">{u.id}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 text-emerald-700 font-semibold text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Ativo
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900">
              <strong>Supabase Auth:</strong> Perfil e vínculo com a loja carregados do Supabase. A gestão de outros usuários será implementada em uma etapa futura.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
