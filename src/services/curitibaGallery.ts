import type { BookInfo, RegistrationDraft } from '../types';
import { galleryImage, galleryLocation, GALLERY_MAX_IMAGES, type CuritibaGalleryRequest } from '../utils/curitibaGallery';
import { imageReferences } from '../utils/imageUrls';

export async function loadCuritibaGallery(query: CuritibaGalleryRequest, signal: AbortSignal): Promise<string[]> {
  const directory = galleryLocation({cdProduto:query.product,urlFoto:query.index},{cdProduto:query.product});
  if (!directory || signal.aborted) return [];
  try {
    const response = await fetch(`/api/curitiba/gallery?${new URLSearchParams({product:query.product,index:directory.href})}`,{
      method:'GET',credentials:'same-origin',redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(6500)]),
      headers:{Accept:'application/json'},cache:'no-store',
    });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return [];
    // Small JSON contract; bound actual bytes even for malformed infrastructure responses.
    if (!response.body) return [];
    const reader=response.body.getReader(),decoder=new TextDecoder();let bytes=0,json='';
    try {
      while(true){const chunk=await reader.read();if(chunk.done)break;
        bytes+=chunk.value.byteLength;if(bytes>16*1024)return [];json+=decoder.decode(chunk.value,{stream:true});}
      json+=decoder.decode();
    } finally { void reader.cancel().catch(()=>{}); }
    const values: unknown=JSON.parse(json);
    if (!Array.isArray(values) || values.length>GALLERY_MAX_IMAGES) return [];
    return imageReferences(values.filter((value):value is string=>typeof value==='string').map(value=>galleryImage(value,directory)));
  } catch { return []; }
}

export function appendCuritibaGallery(book: BookInfo, images: string[]): BookInfo {
  const all=imageReferences([book.coverUrl,book.thumbnailUrl,...(book.additionalImages||[]),...images]);
  if (!all.length) return book;
  const cover=all[0],thumbnail=imageReferences([book.thumbnailUrl])[0] || cover;
  return {...book,coverUrl:cover,thumbnailUrl:thumbnail,additionalImages:all.filter(url=>url!==cover&&url!==thumbnail)};
}

export function appendCuritibaGalleryToDraft(draft: RegistrationDraft, images: string[]): RegistrationDraft {
  // Intentional selections/removals and copy photographs always win over a late source response.
  if (draft.imageSelectionManual) return draft;
  const all=imageReferences([draft.mainImageUrl,...draft.additionalImageUrls,...images]);
  return all.length ? {...draft,mainImageUrl:all[0],additionalImageUrls:all.slice(1)} : draft;
}
