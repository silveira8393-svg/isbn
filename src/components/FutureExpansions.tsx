/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { BarcodeFormat, BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { Barcode, DollarSign, Sparkles, RefreshCw, Smartphone, Camera, X } from 'lucide-react';
import { cleanIsbn, isValidIsbnFormat } from '../utils/isbn';

interface FutureExpansionsProps {
  onSelectPresetIsbn: (isbn: string) => void;
  onScanIsbn: (isbn: string) => void;
}

export default function FutureExpansions({ onSelectPresetIsbn, onScanIsbn }: FutureExpansionsProps) {
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);
  const scanLockedRef = useRef(false);

  const presets = [
    { name: 'O Alquimista (Paulo Coelho)', isbn: '9788575427583' },
    { name: 'Blue Lock (Mangá - Fallback CBL)', isbn: '9786559824793' },
    { name: 'Sapiens (Yuval Noah Harari)', isbn: '9788525060792' },
    { name: '1984 (George Orwell)', isbn: '9788535914849' },
    { name: 'A Hora da Estrela (Clarice Lispector)', isbn: '9788532531582' },
  ];

  const cleanupCamera = () => {
    scanLockedRef.current = false;

    if (scannerControlsRef.current) {
      scannerControlsRef.current.stop();
      scannerControlsRef.current = null;
    }

    if (readerRef.current) {
      try {
        readerRef.current.reset();
      } catch (error) {
        console.warn('Failed to reset barcode reader:', error);
      }
      readerRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsScanning(false);
  };

  const closeCamera = () => {
    cleanupCamera();
    setIsCameraOpen(false);
    setCameraError(null);
  };

  const startCamera = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Seu navegador não oferece suporte para câmera.');
      return;
    }

    setCameraError(null);
    setIsCameraOpen(true);
    setIsScanning(true);
    scanLockedRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const reader = new BrowserMultiFormatReader();
      reader.possibleFormats = [BarcodeFormat.EAN_13];
      readerRef.current = reader;

      if (!videoRef.current) {
        throw new Error('Video element is unavailable.');
      }

      scannerControlsRef.current = await reader.decodeFromStream(stream, videoRef.current, (result, error) => {
        if (error && error.name !== 'NotFoundException') {
          console.debug('[ISBN scanner] ZXing error:', error.name);
        }

        if (scanLockedRef.current || !result) {
          return;
        }

        const rawValue = result.getText();
        const decoded = cleanIsbn(rawValue);
        console.debug('[ISBN scanner] result:', {
          format: result.getBarcodeFormat(),
          rawValue,
          cleanedValue: decoded,
          validIsbn: isValidIsbnFormat(decoded),
        });

        if (!decoded || !isValidIsbnFormat(decoded)) {
          setCameraError('Código detectado não corresponde a um ISBN válido.');
          return;
        }

        scanLockedRef.current = true;
        closeCamera();
        onScanIsbn(decoded);
      });
    } catch (error: any) {
      console.error('Camera initialization failed:', error);

      if (error?.name === 'NotAllowedError') {
        setCameraError('Permissão de câmera negada.');
      } else if (error?.name === 'NotFoundError' || error?.name === 'OverconstrainedError') {
        setCameraError('Nenhuma câmera disponível ou compatível com este dispositivo.');
      } else {
        setCameraError('Não foi possível iniciar a câmera.');
      }

      closeCamera();
    }
  };

  useEffect(() => {
    return () => {
      cleanupCamera();
    };
  }, []);

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

      {/* Camera Barcode Scanner */}
      <div className="bg-[#E5DACE]/15 border border-natural-border/80 rounded-2xl p-4 shadow-2xs relative overflow-hidden">
        <div className="absolute top-2 right-2 bg-natural-badge/80 text-natural-accent text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wider border border-natural-border/40">
          {isCameraOpen ? 'Ativo' : 'Pronto'}
        </div>

        <div className="flex items-start gap-3">
          <div className="p-2 bg-white/70 rounded-xl text-natural-accent shrink-0 border border-natural-border/20">
            <Smartphone className="w-5 h-5 stroke-[1.8]" />
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="text-xs font-semibold text-natural-title flex items-center gap-2">
              Leitura de Código pela Câmera
            </h3>

            {isCameraOpen ? (
              <div className="mt-3 space-y-3">
                <div className="relative overflow-hidden rounded-xl border border-natural-border bg-black">
                  <video ref={videoRef} autoPlay muted playsInline className="w-full h-56 object-cover" />
                  <div className="absolute inset-0 border-2 border-natural-accent/80 pointer-events-none" />
                  <div className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] font-mono px-2 py-1 rounded-md">
                    {isScanning ? 'Procurando ISBN...' : 'Câmera pronta'}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={closeCamera}
                  className="w-full px-3 py-2 bg-white border border-natural-border rounded-lg text-natural-title text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer hover:bg-natural-badge/40 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancelar leitura
                </button>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <p className="text-xs text-natural-subtitle leading-relaxed">
                  Use a câmera do dispositivo para identificar um código de barras ISBN e enviar o resultado direto para a consulta já existente.
                </p>

                <button
                  type="button"
                  onClick={startCamera}
                  className="w-full px-3 py-2 bg-natural-accent text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer hover:bg-natural-accent-hover transition-colors"
                >
                  <Camera className="w-3.5 h-3.5" />
                  Ler ISBN pela câmera
                </button>
              </div>
            )}

            {cameraError && (
              <p className="mt-3 text-[10px] text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">
                {cameraError}
              </p>
            )}
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
