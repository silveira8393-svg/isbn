/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { imageIdentity, imageReferences, isImageReference, isStoredBookImage, openStoredBookImage, prepareLocalBookImage, uploadLocalBookImage, type LocalBookImage } from '../../utils/imageUrls';
import { RegistrationDraft, User } from '../../types';
import { supabase, supabaseUrl } from '../../lib/supabase';
import {
  ImageIcon,
  Plus,
  Trash2,
  Star,
  ExternalLink,
  BookOpen,
} from 'lucide-react';

interface ImagesSectionProps {
  draft: RegistrationDraft;
  onChange: (updates: Partial<RegistrationDraft>) => void;
  user?: User;
  onUploadBusyChange?: (busy: boolean) => void;
}

export default function ImagesSection({
  draft,
  onChange,
  user,
  onUploadBusyChange,
}: ImagesSectionProps) {
  const [newImageUrl, setNewImageUrl] = useState('');
  const [showAddInput, setShowAddInput] = useState(false);
  const [failedUrls, setFailedUrls] = useState<Set<string>>(new Set());
  const [loadedUrls, setLoadedUrls] = useState<Set<string>>(new Set());
  const [urlError, setUrlError] = useState('');
  const [pendingPhotos, setPendingPhotos] = useState<(LocalBookImage & { preview: string; error?: string })[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const [storedSources, setStoredSources] = useState<Record<string, string | null>>({});
  const [sourceRevision, setSourceRevision] = useState(0);
  const latest = useRef({ draft, user, onChange, onUploadBusyChange });
  latest.current = { draft, user, onChange, onUploadBusyChange };
  const queued = useRef(pendingPhotos), busy = useRef(false), mounted = useRef(true);
  const downloads = useRef(new Map<string, { controller: AbortController; release?: () => void }>());
  const access = `${user?.id || ''}:${user?.storeId || ''}:${user?.active || false}`;
  const previousAccess = useRef(access);
  const selection = imageReferences([draft.mainImageUrl, ...draft.additionalImageUrls]);
  const privateKey = JSON.stringify(selection.filter(isStoredBookImage));
  useEffect(() => {
    if (previousAccess.current !== access) {
      previousAccess.current = access;
      downloads.current.forEach(entry => { entry.controller.abort(); entry.release?.(); }); downloads.current.clear();
      setStoredSources({});
      queued.current.forEach(photo => URL.revokeObjectURL(photo.preview)); queued.current = []; setPendingPhotos([]);
    }
    const selected: string[] = JSON.parse(privateKey);
    for (const [url, entry] of downloads.current) if (!selected.includes(url)) {
      entry.controller.abort(); entry.release?.(); downloads.current.delete(url);
      setStoredSources(previous => { const next = { ...previous }; delete next[url]; return next; });
    }
    for (const url of selected) {
      if (downloads.current.has(url)) continue;
      const entry = { controller: new AbortController(), release: undefined as (() => void) | undefined };
      downloads.current.set(url, entry);
      void openStoredBookImage(url, { client: supabase, projectUrl: supabaseUrl }, entry.controller.signal).then(opened => {
        if (!mounted.current || downloads.current.get(url) !== entry) { opened.release(); return; }
        entry.release = opened.release; setStoredSources(previous => ({ ...previous, [url]: opened.url }));
      }).catch(() => {
        if (mounted.current && downloads.current.get(url) === entry) setStoredSources(previous => ({ ...previous, [url]: null }));
      });
    }
  }, [privateKey, access, sourceRevision]);
  useEffect(() => {
    mounted.current = true;
    const warn = (event: BeforeUnloadEvent) => { if (busy.current) { event.preventDefault(); event.returnValue = ''; } };
    if (typeof window !== 'undefined') window.addEventListener('beforeunload', warn);
    return () => {
      mounted.current = false;
      queued.current.forEach(photo => URL.revokeObjectURL(photo.preview));
      downloads.current.forEach(entry => { entry.controller.abort(); entry.release?.(); }); downloads.current.clear();
      latest.current.onUploadBusyChange?.(false);
      if (typeof window !== 'undefined') window.removeEventListener('beforeunload', warn);
    };
  }, []);
  const sourceFor = (url: string) => isStoredBookImage(url) ? (previousAccess.current === access ? storedSources[url] : undefined) : url;
  const available = (url: string) => isImageReference(url) && !failedUrls.has(url) && sourceFor(url) !== null;
  const apply = (updates: Partial<RegistrationDraft>) => {
    latest.current.draft = { ...latest.current.draft, ...updates }; latest.current.onChange(updates);
  };
  const changeQueue = (photos: typeof pendingPhotos) => { queued.current = photos; setPendingPhotos(photos); };
  const changeBusy = (value: boolean) => { busy.current = value; setUploadBusy(value); latest.current.onUploadBusyChange?.(value); };
  const choosePhotos = async (files: File[]) => {
    if (busy.current || !files.length) return;
    const actor = latest.current.user;
    if (!actor?.active) return;
    changeBusy(true); setUploadMessage(''); const messages: string[] = [];
    try {
      for (const file of files) {
        try {
          const photo = await prepareLocalBookImage(file);
          if (!mounted.current || latest.current.user?.id !== actor.id || latest.current.user?.storeId !== actor.storeId || !latest.current.user.active) return;
          const existing = imageReferences([latest.current.draft.mainImageUrl, ...latest.current.draft.additionalImageUrls]);
          if (queued.current.some(item => item.hash === photo.hash) || existing.some(url => isStoredBookImage(url) && url.includes(`/${photo.hash}.`))) {
            messages.push('Uma foto repetida foi ignorada.'); continue;
          }
          changeQueue([...queued.current, { ...photo, preview: URL.createObjectURL(file) }]);
        } catch (error) { messages.push(error instanceof Error ? error.message : 'Arquivo de imagem inválido.'); }
      }
    } finally { if (mounted.current) { setUploadMessage(messages.join(' ')); changeBusy(false); } }
  };
  const removePreview = (hash: string) => {
    const photo = queued.current.find(item => item.hash === hash); if (photo) URL.revokeObjectURL(photo.preview);
    changeQueue(queued.current.filter(item => item.hash !== hash));
  };
  const confirmPhotos = async () => {
    const actor = latest.current.user;
    if (busy.current || !actor || !queued.current.length) return;
    changeBusy(true); setUploadMessage('');
    try {
      for (const photo of [...queued.current]) {
        try {
          const url = await uploadLocalBookImage(photo, actor, { client: supabase, projectUrl: supabaseUrl });
          if (!mounted.current || latest.current.user?.id !== actor.id || latest.current.user?.storeId !== actor.storeId || !latest.current.user.active) return;
          const current = latest.current.draft;
          const images = imageReferences([current.mainImageUrl, ...current.additionalImageUrls, url]);
          apply({ mainImageUrl: current.mainImageUrl || images[0], additionalImageUrls: images.filter(image => image !== (current.mainImageUrl || images[0])),
            ...(!current.mainImageUrl ? { imageSelectionManual: true } : {}) });
          removePreview(photo.hash);
        } catch {
          if (mounted.current) changeQueue(queued.current.map(item => item.hash === photo.hash ? { ...item, error: 'Não foi possível enviar. O cadastro e as outras fotos foram preservados.' } : item));
        }
      }
    } finally { if (mounted.current) changeBusy(false); }
  };
  useEffect(() => {
    if (draft.imageSelectionManual) return;
    if (isImageReference(draft.mainImageUrl) && !failedUrls.has(draft.mainImageUrl)) return;
    const fallback = draft.additionalImageUrls.find(url => isImageReference(url) && loadedUrls.has(url) && !failedUrls.has(url));
    if (fallback) onChange({ mainImageUrl: fallback, additionalImageUrls: draft.additionalImageUrls.filter(url => url !== fallback) });
  }, [draft.mainImageUrl, draft.additionalImageUrls, draft.imageSelectionManual, failedUrls, loadedUrls, onChange]);
  const handleImageLoad = (url: string) => setLoadedUrls(previous => previous.has(url) ? previous : new Set([...previous, url]));

  const handleImageError = (url: string) => {
    setFailedUrls((prev) => {
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  };

  const handleSetMain = (url: string) => {
    const currentMain = draft.mainImageUrl;
    const newAdditionals = imageReferences([url, currentMain, ...draft.additionalImageUrls]).slice(1);
    apply({
      mainImageUrl: url,
      additionalImageUrls: newAdditionals,
      imageSelectionManual: true,
    });
  };

  const handleRemoveImage = (url: string, isMain: boolean) => {
    setFailedUrls(previous => { const next = new Set(previous); next.delete(url); return next; });
    setLoadedUrls(previous => { const next = new Set(previous); next.delete(url); return next; });
    if (isMain) {
      const remaining = draft.additionalImageUrls;
      const nextMain = remaining[0] || undefined;
      const nextAdditionals = remaining.slice(1);
      apply({
        mainImageUrl: nextMain,
        additionalImageUrls: nextAdditionals,
        imageSelectionManual: true,
      });
    } else {
      apply({
        additionalImageUrls: draft.additionalImageUrls.filter((u) => u !== url),
      });
    }
  };

  const handleAddManualImage = () => {
    const trimmed = newImageUrl.trim();
    if (!trimmed) return;
    if (!isImageReference(trimmed) || new URL(trimmed).search || new URL(trimmed).hash) { setUrlError('Informe uma URL HTTP/HTTPS de imagem, sem parâmetros, fragmento, diretório ou página HTML.'); return; }
    setUrlError('');
    if (!draft.mainImageUrl) {
      apply({ mainImageUrl: new URL(trimmed).href, imageSelectionManual: true });
    } else if (!imageReferences([draft.mainImageUrl, ...draft.additionalImageUrls]).some(url => imageIdentity(url) === imageIdentity(trimmed))) {
      apply({ additionalImageUrls: imageReferences([...draft.additionalImageUrls, trimmed]) });
    }
    setNewImageUrl('');
    setShowAddInput(false);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-5">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-sm">
            6
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900">
              Galeria de Imagens do Produto
            </h3>
            <p className="text-xs text-slate-500">
              Capa e fotos do exemplar no cadastro simulado; sem publicação de imagens
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowAddInput(!showAddInput)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Adicionar URL</span>
        </button>
      </div>

      {/* Input para adicionar nova imagem por URL */}
      {showAddInput && (
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex gap-2">
          <input
            type="url"
            value={newImageUrl}
            onChange={(e) => setNewImageUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddManualImage();
              }
            }}
            placeholder="Cole o link da imagem (ex: https://.../capa.jpg)"
            className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-600"
          />
          <button
            type="button"
            onClick={handleAddManualImage}
            className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
          >
            Adicionar
          </button>
        </div>
      )}

      <div className="space-y-3">
        <label className="inline-flex cursor-pointer items-center rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold">
          Selecionar fotos
          <input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={uploadBusy || !user?.active}
            aria-label="Selecionar fotografias locais" className="sr-only"
            onChange={event => { const files = Array.from<File>(event.target.files || []); event.target.value = ''; return choosePhotos(files); }} />
        </label>
        <p className="text-xs text-slate-500">JPEG, PNG ou WebP, até 5 MiB por foto. Confira a prévia e confirme para adicionar.</p>
        {uploadMessage && <p role="status" className="text-xs text-amber-800">{uploadMessage}</p>}
        {pendingPhotos.length > 0 && <div className="space-y-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{pendingPhotos.map(photo => <div key={photo.hash} className="space-y-1 rounded border border-slate-200 p-2">
            <img src={photo.preview} alt={`Prévia de ${photo.file.name}`} className="h-28 w-full object-contain" />
            <p className="break-all text-xs">{photo.file.name}</p>
            {photo.error && <p role="alert" className="text-xs text-rose-700">{photo.error}</p>}
            <button type="button" disabled={uploadBusy} onClick={() => removePreview(photo.hash)} className="text-xs text-red-700 underline">Remover prévia</button>
          </div>)}</div>
          <button type="button" disabled={uploadBusy} onClick={() => confirmPhotos()} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60">{uploadBusy ? 'Processando fotos...' : 'Confirmar fotos selecionadas'}</button>
        </div>}
      </div>

      {/* Visualização de Imagens */}
      {urlError && <p role="alert" className="text-xs text-rose-700">{urlError}</p>}
      {(selection.some(url => failedUrls.has(url) || sourceFor(url) === null)) && <div className="text-xs text-amber-800" role="status">Uma imagem não carregou. Você pode removê-la ou tentar novamente; sua escolha de capa será preservada.
        <button type="button" onClick={() => {
          for (const [url, entry] of downloads.current) if (storedSources[url] === null || failedUrls.has(url)) {
            entry.controller.abort(); entry.release?.(); downloads.current.delete(url);
            setStoredSources(previous => { const next = { ...previous }; delete next[url]; return next; });
          }
          setFailedUrls(new Set()); setLoadedUrls(new Set()); setSourceRevision(value => value + 1);
        }} className="ml-2 cursor-pointer rounded underline">Tentar carregar imagens novamente</button>
      </div>}
      {!draft.additionalImageUrls.length && !draft.mainImageUrl ? (
        <div className="border border-dashed border-slate-300 rounded-xl p-8 text-center flex flex-col items-center justify-center bg-slate-50/50">
          <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mb-2">
            <BookOpen className="w-6 h-6 stroke-[1.4]" />
          </div>
          <p className="text-sm font-semibold text-slate-700">Sem fotos no momento</p>
          <p className="text-xs text-slate-500 max-w-sm mt-0.5">
            A pesquisa não encontrou imagens digitais para este ISBN. Você pode inserir um link ou o produto será cadastrado com capa padrão.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-start">
          {/* Imagem Principal em Destaque */}
          <div className="sm:col-span-5 flex flex-col items-center">
            <span className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5 self-start">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
              <span>Capa Principal</span>
            </span>

            <div className="w-full max-w-[220px] aspect-[3/4] rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shadow-sm relative group">
              {draft.mainImageUrl && available(draft.mainImageUrl) && sourceFor(draft.mainImageUrl) ? (
                <>
                  <img
                    src={sourceFor(draft.mainImageUrl)!}
                    alt="Capa principal"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    onLoad={() => handleImageLoad(draft.mainImageUrl!)}
                    onError={() => handleImageError(draft.mainImageUrl!)}
                  />
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center text-slate-400">
                  <ImageIcon className="w-10 h-10 text-slate-300 mb-1" />
                  <span className="text-xs font-mono">Sem capa principal</span>
                </div>
              )}
              {draft.mainImageUrl && <button type="button" onClick={() => handleRemoveImage(draft.mainImageUrl!, true)} title="Remover capa principal" className="absolute right-2 top-2 rounded bg-red-600 p-1.5 text-white"><Trash2 className="h-4 w-4" /></button>}
            </div>
          </div>

          {/* Miniaturas Adicionais */}
          <div className="sm:col-span-7">
            <span className="text-xs font-bold text-slate-700 mb-2 block">
              Fotos Adicionais ({draft.additionalImageUrls.length})
            </span>

            {draft.additionalImageUrls.length === 0 ? (
              <p className="text-xs text-slate-400 italic bg-slate-50 p-4 rounded-lg border border-slate-100">
                Nenhuma foto adicional no momento. O produto usará apenas a capa principal.
              </p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {draft.additionalImageUrls.map((imgUrl, idx) => (
                  <div
                    key={`${imgUrl}-${idx}`}
                    className="group relative aspect-[3/4] rounded-lg border border-slate-200 bg-slate-100 overflow-hidden shadow-2xs"
                  >
                    {available(imgUrl) && sourceFor(imgUrl) ? (
                      <>
                        <img
                          src={sourceFor(imgUrl)!}
                          alt=""
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                          onLoad={() => handleImageLoad(imgUrl)}
                          onError={() => handleImageError(imgUrl)}
                        />
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400">
                        Indisponível
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 flex justify-between gap-1 bg-black/40 p-1.5">
                      {available(imgUrl) && sourceFor(imgUrl) && <button type="button" onClick={() => handleSetMain(imgUrl)} title="Tornar capa principal" className="rounded bg-white p-1 text-slate-800"><Star className="h-3 w-3" /></button>}
                      <button type="button" onClick={() => handleRemoveImage(imgUrl, false)} title="Remover foto" className="rounded bg-red-600 p-1 text-white"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
