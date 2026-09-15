/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Barcode, DollarSign, Sparkles, RefreshCw, Smartphone } from 'lucide-react';

interface FutureExpansionsProps {
  onSelectPresetIsbn: (isbn: string) => void;
}

export default function FutureExpansions({ onSelectPresetIsbn }: FutureExpansionsProps) {
  // Useful presets for easy testing
  const presets = [
    { name: 'O Alquimista (Paulo Coelho)', isbn: '9788575427583' },
    { name: 'Blue Lock (Mangá - Fallback CBL)', isbn: '9786559824793' },
    { name: 'Sapiens (Yuval Noah Harari)', isbn: '9788525060792' },
    { name: '1984 (George Orwell)', isbn: '9788535914849' },
    { name: 'A Hora da Estrela (Clarice Lispector)', isbn: '9788532531582' },
  ];

  return (
    <div className="space-y-6">
      {/* Test Presets Panel */}
      <div className="bg-white/80 border border-natural-border rounded-2xl p-5 shadow-xs">
        <div className="flex items-center gap-2 mb-3.5">
          <Sparkles className="w-4 h-4 text-natural-accent" />
          <h2 className="text-sm font-semibold text-natural-title font-serif">Simular Consulta (Presets)</h2>
        </div>
        <p className="text-xs text-natural-subtitle mb-3">
          Clique em um livro abaixo para colar e consultar seu ISBN original instantaneamente:
        </p>
        <div className="flex flex-wrap gap-2 text-xs">
          {presets.map((p) => (
            <button
              key={p.isbn}
              onClick={() => onSelectPresetIsbn(p.isbn)}
              id={`preset-btn-${p.isbn}`}
              className="px-3 py-2 bg-white hover:bg-natural-badge/40 border border-natural-border hover:border-natural-accent text-natural-text hover:text-natural-accent rounded-lg transition-all text-left cursor-pointer flex items-center gap-2 font-medium shadow-3xs"
            >
              <Barcode className="w-3.5 h-3.5 text-natural-subtitle shrink-0" />
              <span>{p.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Camera Barcode Scanner Architecture Placeholder */}
      <div className="bg-[#E5DACE]/15 border border-natural-border/80 rounded-2xl p-4 shadow-2xs relative overflow-hidden">
        <div className="absolute top-2 right-2 bg-natural-badge/80 text-natural-accent text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wider border border-natural-border/40">
          Estrutura Preparada
        </div>
        
        <div className="flex items-start gap-3">
          <div className="p-2 bg-white/70 rounded-xl text-natural-accent shrink-0 border border-natural-border/20">
            <Smartphone className="w-5 h-5 stroke-[1.8]" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-semibold text-natural-title flex items-center gap-2">
              Leitura de Código pela Câmera
            </h3>
            <p className="text-xs text-natural-subtitle mt-1 leading-relaxed">
              Pronto para ativar via stream de vídeo do dispositivo. O escopo de câmera usará a permissão já pré-autorizada na infraestrutura para decodificar códigos Tipo EAN/ISBN usando a webcam ou smartphone do balcão.
            </p>
            <div className="mt-2 text-[10px] text-natural-accent/80 font-mono flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 bg-natural-accent/60 rounded-full animate-pulse"></span>
              <span>Hooks & Permissões Câmera Autorizados</span>
            </div>
          </div>
        </div>
      </div>

      {/* Price Comparison Architecture Placeholder */}
      <div className="bg-[#E5DACE]/15 border border-natural-border/80 rounded-2xl p-4 shadow-2xs relative overflow-hidden">
        <div className="absolute top-2 right-2 bg-natural-badge/80 text-natural-accent text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wider border border-natural-border/40">
          Estrutura Preparada
        </div>

        <div className="flex items-start gap-3">
          <div className="p-2 bg-white/70 rounded-xl text-natural-accent shrink-0 border border-natural-border/20">
            <DollarSign className="w-5 h-5 stroke-[1.8]" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-semibold text-natural-title">
              Comparação Rápida de Preços
            </h3>
            <p className="text-xs text-natural-subtitle mt-1 leading-relaxed">
              Módulo planejado para orçamentação em tempo real. Permitirá ver em lote os valores sugeridos para compras de sebos virtuais parceiros baseando-se em margem de conservação declarada.
            </p>
            <div className="mt-2 text-[10px] text-natural-subtitle font-mono flex items-center gap-1.5">
              <RefreshCw className="w-3 h-3 text-natural-accent animate-spin" style={{ animationDuration: '4s' }} />
              <span>Rotas de API com Scrapers de Atacado</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
