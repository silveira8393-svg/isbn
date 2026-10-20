import { useRef, useState } from 'react';
import { isImageReference } from '../../utils/imageUrls';

export default function RegistrationImage({ url, label }: { url: string; label: string }) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [expanded, setExpanded] = useState(false);
  const previewRef = useRef<HTMLDialogElement>(null);
  let secure = false;
  try {
    const parsed = new URL(url);
    secure = parsed.protocol === 'https:' && !parsed.username && !parsed.password;
  } catch { /* Invalid addresses remain plain text. */ }
  const canPreview = secure && isImageReference(url);
  const closePreview = () => { previewRef.current?.close(); setExpanded(false); };
  const unavailable = <p className="text-xs text-slate-500">Não foi possível exibir a imagem. O endereço permanece disponível.</p>;

  return <div className="min-w-0 space-y-2">
    {canPreview && status !== 'error' ? <button type="button" disabled={status !== 'loaded'}
      aria-label={`Ampliar ${label.toLocaleLowerCase('pt-BR')}`} aria-haspopup="dialog"
      onClick={() => { if (status === 'loaded') { setExpanded(true); previewRef.current?.showModal(); } }}
      className="relative flex h-36 w-28 items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-500 enabled:cursor-zoom-in focus-visible:outline-blue-600">
      <img src={url} alt={label} loading="lazy" decoding="async" referrerPolicy="no-referrer"
        onLoad={() => setStatus('loaded')} onError={() => setStatus('error')}
        className={`h-full w-full object-contain ${status === 'loaded' ? '' : 'opacity-0'}`} />
      {status === 'loading' && <span className="absolute inset-0 flex items-center justify-center p-2">Carregando imagem…</span>}
    </button> : unavailable}
    {secure ? <a href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
      className="block break-all text-blue-700 underline focus-visible:outline-blue-600">{url}</a>
      : <span className="block break-all">{url}</span>}
    {canPreview && <dialog ref={previewRef} aria-label={`${label} ampliada`} aria-modal="true"
      onCancel={event => { event.preventDefault(); event.stopPropagation(); closePreview(); }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-4xl overflow-hidden rounded-lg border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/60 open:flex open:flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 p-4">
        <h4 className="font-semibold text-slate-900">{label}</h4>
        <button type="button" autoFocus onClick={closePreview}
          className="shrink-0 cursor-pointer rounded text-sm text-blue-700 underline focus-visible:outline-blue-600">Fechar imagem</button>
      </div>
      <div className="min-h-0 overflow-y-auto overscroll-contain p-4">
        {expanded && (status === 'error' ? unavailable : <img src={url} alt={`${label} ampliada`} decoding="async" referrerPolicy="no-referrer"
          onError={() => setStatus('error')} className="mx-auto h-[70dvh] w-full object-contain" />)}
      </div>
    </dialog>}
  </div>;
}
