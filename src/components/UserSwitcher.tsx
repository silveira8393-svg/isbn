/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, LogOut } from 'lucide-react';
import { useUser } from '../contexts/UserContext';

export default function UserSwitcher() {
  const { currentUser, signOut, operationEnvironment } = useUser();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const roleLabel = { admin: 'Administrador', operator: 'Operador', developer: 'Desenvolvimento' }[currentUser.role];
  const avatarColor = { admin: 'bg-emerald-500', operator: 'bg-blue-400', developer: 'bg-amber-500' }[currentUser.role];
  useEffect(() => {
    if (!isOpen) { setPosition(null); return; }
    const place = () => {
      const anchor = buttonRef.current?.getBoundingClientRect(), menu = menuRef.current;
      if (!anchor || !menu) return;
      const gap = 8, width = Math.min(window.innerWidth >= 768 ? 194 : 288, window.innerWidth - 16);
      const above = anchor.top - gap - 8, below = window.innerHeight - anchor.bottom - gap - 8;
      const openAbove = below < Math.min(menu.scrollHeight, 280) && above > below;
      const maxHeight = Math.max(48, Math.min(window.innerHeight - 16, openAbove ? above : below));
      const height = Math.min(menu.scrollHeight, maxHeight);
      setPosition({ width, maxHeight, left: Math.max(8, Math.min(anchor.right - width, window.innerWidth - width - 8)),
        top: Math.max(8, Math.min(openAbove ? anchor.top - gap - height : anchor.bottom + gap, window.innerHeight - height - 8)) });
    };
    place(); window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [isOpen]);
  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutside);
      document.addEventListener('keydown', handleKey);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);
  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button ref={buttonRef} type="button" id="btn-user-switcher-toggle" onClick={() => setIsOpen(!isOpen)} aria-expanded={isOpen} aria-controls="user-account-menu" title="Conta autenticada"
        className="flex items-center gap-2 p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg bg-blue-700/80 hover:bg-blue-800 border border-blue-500/50 text-white text-xs transition-all cursor-pointer shadow-2xs group">
        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-xs ${avatarColor}`}>{currentUser.name.charAt(0).toUpperCase()}</span>
        <span className="hidden sm:flex flex-col items-start text-left leading-tight min-w-0 max-w-[120px]">
          <span className="font-bold text-white text-xs truncate w-full">{currentUser.name}</span>
          <span className="text-[10px] text-blue-200">{roleLabel}</span>
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-blue-200" />
      </button>
      {isOpen && (
        <div ref={menuRef} id="user-account-menu" style={{ position: 'fixed', ...position, bottom: 'auto', right: 'auto', marginTop: 0, overflowY: 'auto', visibility: position ? 'visible' : 'hidden' }} className="rounded-xl bg-white text-slate-800 shadow-xl border border-slate-200 z-50">
          <div className="bg-slate-900 text-white p-3 px-4 border-b border-slate-800">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Conta autenticada</span>
          </div>
          <div className="p-3 bg-slate-50 border-b border-slate-100 space-y-1 text-xs">
            <p className="font-bold text-slate-900">{currentUser.name}</p>
            <p>{roleLabel} ({currentUser.role})</p>
            <p className="text-slate-500">{currentUser.storeName}</p>
          </div>
          {operationEnvironment === 'development' && <p className="px-4 py-3 text-xs bg-amber-50 text-amber-900 border-b border-amber-200">Ambiente: Desenvolvimento/Teste</p>}
          <div className="p-2">
            <button type="button" onClick={() => { void signOut(); }} className="w-full flex items-center gap-2 p-2.5 rounded-lg hover:bg-slate-50 text-sm font-semibold cursor-pointer"><LogOut className="w-4 h-4" /> Sair</button>
          </div>
        </div>
      )}
    </div>
  );
}
