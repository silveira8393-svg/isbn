/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { BarcodeFormat, BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { Camera, X, AlertCircle } from 'lucide-react';
import { cleanIsbn, isValidIsbnFormat } from '../utils/isbn';

interface CameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (isbn: string) => void;
}

export default function CameraScannerModal({ isOpen, onClose, onScan }: CameraScannerModalProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);
  const scanLockedRef = useRef(false);

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

  useEffect(() => {
    if (!isOpen) {
      cleanupCamera();
      setCameraError(null);
      return;
    }

    let isMounted = true;

    const startCamera = async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (isMounted) setCameraError('Seu navegador não oferece suporte para acesso à câmera.');
        return;
      }

      setCameraError(null);
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

        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const reader = new BrowserMultiFormatReader();
        reader.possibleFormats = [BarcodeFormat.EAN_13];
        readerRef.current = reader;

        if (!videoRef.current) return;

        scannerControlsRef.current = await reader.decodeFromStream(
          stream,
          videoRef.current,
          (result, error) => {
            if (error && error.name !== 'NotFoundException') {
              console.debug('[ISBN scanner] ZXing:', error.name);
            }

            if (scanLockedRef.current || !result) return;

            const rawValue = result.getText();
            const decoded = cleanIsbn(rawValue);

            if (!decoded || !isValidIsbnFormat(decoded)) {
              setCameraError('Código detectado não corresponde a um ISBN válido (10 ou 13 dígitos).');
              return;
            }

            scanLockedRef.current = true;
            cleanupCamera();
            onScan(decoded);
            onClose();
          }
        );
      } catch (err: any) {
        if (!isMounted) return;
        console.error('Camera failed:', err);
        if (err?.name === 'NotAllowedError') {
          setCameraError('Permissão para uso da câmera foi recusada.');
        } else if (err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError') {
          setCameraError('Nenhuma câmera compatível encontrada no dispositivo.');
        } else {
          setCameraError('Não foi possível inicializar a câmera do leitor.');
        }
        setIsScanning(false);
      }
    };

    void startCamera();

    return () => {
      isMounted = false;
      cleanupCamera();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Leitura de Código de Barras</h3>
              <p className="text-xs text-slate-500">Aponte para o ISBN no verso do livro</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewport */}
        <div className="p-5">
          <div className="relative overflow-hidden rounded-xl bg-slate-950 aspect-video flex items-center justify-center border border-slate-200">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
            {/* Guide frame */}
            <div className="absolute inset-x-8 inset-y-6 border-2 border-blue-500/80 rounded-lg pointer-events-none flex items-center justify-center">
              <div className="w-full h-0.5 bg-blue-500/50 shadow-[0_0_8px_rgba(59,130,246,0.8)] animate-pulse" />
            </div>

            <div className="absolute bottom-2 left-2 right-2 flex justify-between items-center text-[11px] font-mono text-white/90 bg-black/60 px-2.5 py-1 rounded-md">
              <span>{isScanning ? 'Lendo código...' : 'Aguardando câmera'}</span>
              <span className="text-blue-300">EAN-13 / ISBN</span>
            </div>
          </div>

          {cameraError && (
            <div className="mt-3.5 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
              <span>{cameraError}</span>
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
