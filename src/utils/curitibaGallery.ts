export const GALLERY_ORIGIN = 'https://conteudo.livrariascuritiba.com.br';
export const GALLERY_MAX_BYTES = 64 * 1024;
export const GALLERY_MAX_IMAGES = 32;
export const GALLERY_TIMEOUT_MS = 4000;
export type GalleryDiagnostic = { state: 'loaded' | 'empty' | 'unavailable' | 'not_applicable'; images: number; status?: number | 'NETWORK_OR_CORS' | 'TIMEOUT' | 'LIMIT' | 'INVALID_RESPONSE' | 'BLOCKED' };
export interface CuritibaGalleryRequest { product: string; index: string }

function productImageCode(value: unknown): string | undefined {
  const code = (typeof value === 'string' || typeof value === 'number' ? String(value).trim().toLowerCase() : undefined);
  return code && /^(?:lv)?[0-9]{1,12}$/.test(code) ? `lv${code.replace(/^lv/, '')}` : undefined;
}

/** Only the product directory explicitly supplied by this product's detail is eligible. */
export function galleryLocation(detail: Record<string, unknown>, selected: Record<string, unknown>): URL | undefined {
  const code = productImageCode(selected.cdProduto);
  if (!code || productImageCode(detail.cdProduto) !== code || typeof detail.urlFoto !== 'string') return;
  try {
    const url = new URL(detail.urlFoto);
    if (url.origin === GALLERY_ORIGIN && !url.username && !url.password && !url.search && !url.hash
      && url.pathname === `/images/lv/lvndd/${code}/`) return url;
  } catch { /* Retain direct image references when the directory is not eligible. */ }
}

export function galleryImage(value: string, directory: URL): string | undefined {
  if (/[\\%]/.test(value)) return;
  try {
    const url = new URL(value, directory);
    const code = directory.pathname.split('/').filter(Boolean).at(-1)!;
    const filename = url.pathname.slice(directory.pathname.length);
    if (url.origin === directory.origin && !url.username && !url.password && !url.search && !url.hash
      && url.pathname.startsWith(directory.pathname)
      && new RegExp(`^${code}(?:[_-][a-z0-9_-]+)?\\.(?:jpe?g|png|webp)$`, 'i').test(filename)) return url.href;
  } catch { /* Links outside the exact product directory are never followed. */ }
}

function decodeIndexAttribute(value: string): string {
  return value.replace(/&(?:amp|quot|apos|#(\d+)|#x([a-f0-9]+));/gi, (entity, decimal, hex) => {
    if (decimal || hex) {
      const point = parseInt(decimal || hex, hex ? 16 : 10);
      return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : '';
    }
    return ({ '&amp;': '&', '&quot;': '"', '&apos;': "'" } as Record<string, string>)[entity.toLowerCase()] || entity;
  });
}

/** Read attributes only: no DOM insertion, script evaluation, resource loads or filename probing. */
export function imagesFromIndex(html: string, directory: URL): string[] {
  const inert = html.replace(/<!--[\s\S]*?(?:-->|$)|<(script|style)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '');
  const images = new Set<string>();
  const tags = /<(a|img)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  for (const tag of inert.matchAll(tags)) {
    const wanted = tag[1].toLowerCase() === 'a' ? 'href' : 'src';
    for (const attr of tag[2].matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      if (attr[1].toLowerCase() !== wanted) continue;
      const image = galleryImage(decodeIndexAttribute(attr[2] ?? attr[3] ?? attr[4] ?? ''), directory);
      if (image) images.add(image);
      if (images.size >= GALLERY_MAX_IMAGES) return [...images];
    }
  }
  return [...images];
}
