import { useState } from 'react';
import type { LabResult } from '../services/amazonLabClient';
import { isImageReference } from '../utils/imageUrls';
import BookImageGallery from './BookImageGallery';

type LabImages = NonNullable<LabResult['imagens']>;

function safeReference(url?: string): url is string {
  if (!isImageReference(url)) return false;
  const parsed = new URL(url);
  return parsed.protocol === 'https:' && !parsed.search && !parsed.hash;
}

export default function AmazonLabImageGallery({ images, title }: { images: LabImages; title: string }) {
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const eligible = images.itens.filter(item => safeReference(item.referencia));
  const main = eligible.find(item => item.papel === 'principal');
  const thumbnail = main && safeReference(main.miniatura) && !failed.has(main.miniatura)
    ? main.miniatura : undefined;
  const mainImage = main && !failed.has(main.referencia) ? main.referencia : thumbnail;
  const additional = [...new Set(eligible.filter(item => item.papel === 'adicional').map(item => item.referencia))]
    .filter(url => url !== main?.referencia && url !== thumbnail && !failed.has(url));
  const visible = [mainImage, ...additional].filter((url): url is string => !!url);
  const current = selected && visible.includes(selected) ? selected : mainImage;

  if (!eligible.length) return <p className="text-xs text-slate-600">
    Nenhuma referência de imagem válida para exibição. Consulte o diagnóstico.
  </p>;

  return <div className="w-fit max-w-full rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
    <BookImageGallery title={title} currentImage={current} mainImage={mainImage} mainThumbnail={thumbnail}
      additionalImages={additional} onSelect={setSelected}
      onImageError={url => setFailed(previous => new Set([...previous, url]))} />
    {failed.size > 0 && <p role="status" className="mt-3 text-xs text-slate-500">
      Não foi possível exibir uma ou mais imagens. As referências e origens permanecem no diagnóstico.
    </p>}
  </div>;
}
