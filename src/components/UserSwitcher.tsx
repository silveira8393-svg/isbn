/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { useUser } from '../contexts/UserContext';
import { UserRole } from '../types';
import {
  User as UserIcon,
  ShieldCheck,
  Wrench,
  ChevronDown,
  Check,
  AlertCircle,
  Sparkles,
} from 'lucide-react';

export default function UserSwitcher() {
  const { currentUser, users, setCurrentUserId, operationEnvironment } = useUser();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <ShieldCheck className="w-3 h-3" />
            Admin
          </span>
        );
      case 'operator':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
            <UserIcon className="w-3 h-3" />
            Operador
          </span>
        );
      case 'developer':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <Wrench className="w-3 h-3" />
            Dev
          </span>
        );
    }
  };

  const getRoleDesc = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return 'Acesso gerencial, histórico completo e painel de produção da loja.';
      case 'operator':
        return 'Operações de balcão (consulta e cadastro). Visualiza sua produção.';
      case 'developer':
        return 'Manutenção técnica e ferramentas mock. Operações isoladas da produção.';
    }
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Botão de identificação no Header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        id="btn-user-switcher-toggle"
        className="flex items-center gap-2 p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg bg-blue-700/80 hover:bg-blue-800 border border-blue-500/50 text-white text-xs transition-all cursor-pointer shadow-2xs group"
        title="Alternar perfil de usuário (Simulação de Teste)"
      >
        <div
          className={`w-6 h-6 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-xs ${
            currentUser.role === 'admin'
              ? 'bg-emerald-500'
              : currentUser.role === 'developer'
              ? 'bg-amber-500'
              : 'bg-blue-400'
          }`}
        >
          {currentUser.name.charAt(0)}
        </div>

        <div className="hidden sm:flex flex-col items-start text-left leading-tight min-w-0 max-w-[120px]">
          <span className="font-bold text-white text-xs truncate w-full">
            {currentUser.name}
          </span>
          <span className="text-[10px] text-blue-200 capitalize">
            {currentUser.role === 'admin'
              ? 'Administrador'
              : currentUser.role === 'operator'
              ? 'Operador'
              : 'Desenvolvimento'}
          </span>
        </div>

        <ChevronDown className="w-3.5 h-3.5 text-blue-200 group-hover:text-white transition-transform duration-200" />
      </button>

      {/* Dropdown Menu Modal */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 sm:w-80 rounded-xl bg-white text-slate-800 shadow-xl border border-slate-200 z-50 animate-fade-in overflow-hidden">
          {/* Header do Menu */}
          <div className="bg-slate-900 text-white p-3 px-4 flex items-center justify-between border-b border-slate-800">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                Simulação de Usuário
              </span>
              <span className="text-[10px] text-slate-400">
                Camada provisória de perfis e auditoria
              </span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-400/30 font-semibold">
              Protótipo
            </span>
          </div>

          {/* Usuário Atual */}
          <div className="p-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500">Usuário ativo no momento:</span>
            <span className="font-bold text-slate-900 flex items-center gap-1.5">
              {currentUser.name}
              {getRoleBadge(currentUser.role)}
            </span>
          </div>

          {/* Ambiente operacional ativo */}
          <div
            className={`p-2.5 px-4 text-[11px] border-b flex items-start gap-2 ${
              operationEnvironment === 'development'
                ? 'bg-amber-50/80 border-amber-200 text-amber-900'
                : 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold">
                Ambiente de Auditoria:{' '}
                {operationEnvironment === 'development' ? 'Desenvolvimento/Teste' : 'Produção'}
              </span>
              <p className="text-[10px] opacity-90 mt-0.5">
                {operationEnvironment === 'development'
                  ? 'Ações deste perfil NÃO alteram as métricas de produção da loja.'
                  : 'Ações deste perfil alimentam o painel de produção da loja.'}
              </p>
            </div>
          </div>

          {/* Lista de Usuários para alternar com 1 clique */}
          <div className="p-2 space-y-1">
            <span className="px-2 pt-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Alternar usuário de teste:
            </span>

            {users.map((user) => {
              const isSelected = user.id === currentUser.id;
              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => {
                    setCurrentUserId(user.id);
                    setIsOpen(false);
                  }}
                  id={`btn-select-user-${user.role}`}
                  className={`w-full text-left p-2.5 rounded-lg transition-all flex items-start justify-between gap-3 cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50 border border-blue-200 text-blue-950 font-medium'
                      : 'hover:bg-slate-50 border border-transparent text-slate-700'
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 mt-0.5 ${
                        user.role === 'admin'
                          ? 'bg-emerald-600'
                          : user.role === 'developer'
                          ? 'bg-amber-600'
                          : 'bg-blue-600'
                      }`}
                    >
                      {user.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-xs text-slate-900">{user.name}</span>
                        {getRoleBadge(user.role)}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5 leading-snug line-clamp-2">
                        {getRoleDesc(user.role)}
                      </p>
                    </div>
                  </div>

                  {isSelected && (
                    <Check className="w-4 h-4 text-blue-600 shrink-0 mt-1" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Rodapé informativo */}
          <div className="p-2.5 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-500 text-center">
            Pronto para substituição futura por Supabase Auth sem alterar as regras de negócio.
          </div>
        </div>
      )}
    </div>
  );
}
