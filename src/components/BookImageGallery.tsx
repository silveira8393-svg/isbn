import { BookOpen } from 'lucide-react';

interface BookImageGalleryProps {
  title: string;
  currentImage?: string;
  mainImage?: string;
  mainThumbnail?: string;
  additionalImages: string[];
  onSelect: (url: string) => void;
  onImageError: (url: string) => void;
}

/** Apresentação compartilhada; cada consumidor decide quais URLs podem ser carregadas. */
export default function BookImageGallery({ title, currentImage, mainImage, mainThumbnail,
  additionalImages, onSelect, onImageError }: BookImageGalleryProps) {
  return <div className="w-full md:w-52 shrink-0 flex flex-col items-center">
    <div className="relative group w-44 md:w-48 aspect-[3/4] bg-slate-100 rounded-xl overflow-hidden border border-slate-200 shadow-sm flex items-center justify-center">
      {currentImage ? <img src={currentImage} alt={`${currentImage === mainImage ? 'Capa' : 'Imagem'} do livro ${title}`}
        className="w-full h-full object-cover select-none" referrerPolicy="no-referrer"
        onError={() => onImageError(currentImage)} /> :
        <div className="flex flex-col items-center justify-center p-4 text-center text-slate-400">
          <BookOpen className="w-12 h-12 stroke-[1.2] text-slate-300 mb-2" />
          <span className="text-xs font-mono font-medium">Sem capa digital</span>
        </div>}
    </div>
    {additionalImages.length > 0 && <div className="mt-3 flex flex-wrap gap-2 justify-center max-w-[200px]" aria-label="Miniaturas do livro">
      {mainImage && <button type="button" onClick={() => onSelect(mainImage)}
        className={`w-10 h-14 rounded-md border overflow-hidden transition-all cursor-pointer focus-visible:outline-blue-600 ${
          currentImage === mainImage ? 'border-blue-600 ring-2 ring-blue-500/20 shadow-xs' : 'border-slate-200 opacity-70 hover:opacity-100'}`}
        title="Capa principal" aria-label="Capa principal" aria-pressed={currentImage === mainImage}>
        <img src={mainThumbnail || mainImage} alt="Capa principal" className="w-full h-full object-cover"
          referrerPolicy="no-referrer" onError={() => onImageError(mainThumbnail || mainImage)} />
      </button>}
      {additionalImages.map((url, index) => <button key={url} type="button" onClick={() => onSelect(url)}
        className={`w-10 h-14 rounded-md border overflow-hidden transition-all cursor-pointer focus-visible:outline-blue-600 ${
          currentImage === url ? 'border-blue-600 ring-2 ring-blue-500/20 shadow-xs' : 'border-slate-200 opacity-70 hover:opacity-100'}`}
        title={`Imagem adicional ${index + 1}`} aria-label={`Imagem adicional ${index + 1}`} aria-pressed={currentImage === url}>
        <img src={url} alt={`Miniatura adicional ${index + 1}`} className="w-full h-full object-cover"
          referrerPolicy="no-referrer" loading="lazy" onError={() => onImageError(url)} />
      </button>)}
    </div>}
  </div>;
}
