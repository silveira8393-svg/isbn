import { GALLERY_MAX_BYTES, GALLERY_TIMEOUT_MS, imagesFromIndex, type GalleryDiagnostic } from '../src/utils/curitibaGallery.js';

export async function readProductGallery(directory?: URL, fetcher: typeof fetch = fetch): Promise<{ images: string[]; diagnostic: GalleryDiagnostic }> {
  if (!directory) return { images: [], diagnostic: { state: 'not_applicable', images: 0 } };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GALLERY_TIMEOUT_MS);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    // Server-only public index read. No credentials, redirects, image downloads or retries.
    const response = await fetcher(directory.href, { method: 'GET', credentials: 'omit', redirect: 'error',
      referrerPolicy: 'no-referrer', headers: { Accept: 'text/html' }, signal: controller.signal });
    if (!response.ok) return { images: [], diagnostic: { state: 'unavailable', images: 0, status: response.status } };
    if (response.redirected || response.type === 'opaque' || response.type === 'opaqueredirect'
      || (response.url && response.url !== directory.href) || !/^text\/html(?:;|$)/i.test(response.headers.get('content-type') || '')
      || !response.body) return { images: [], diagnostic: { state: 'unavailable', images: 0, status: 'INVALID_RESPONSE' } };
    if (Number(response.headers.get('content-length')) > GALLERY_MAX_BYTES)
      return { images: [], diagnostic: { state: 'unavailable', images: 0, status: 'LIMIT' } };
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0, html = '';
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > GALLERY_MAX_BYTES) return { images: [], diagnostic: { state: 'unavailable', images: 0, status: 'LIMIT' } };
      html += decoder.decode(chunk.value, { stream: true });
    }
    html += decoder.decode();
    if (!/<(?:!doctype\s+html|html|body|a|img)\b/i.test(html) || /captcha|access\s+denied|verify\s+(?:you\s+are|that\s+you)|robot\s+check/i.test(html))
      return { images: [], diagnostic: { state: 'unavailable', images: 0, status: 'BLOCKED' } };
    const images = imagesFromIndex(html, directory);
    return { images, diagnostic: { state: images.length ? 'loaded' : 'empty', images: images.length, status: response.status } };
  } catch {
    return { images: [], diagnostic: { state: 'unavailable', images: 0, status: controller.signal.aborted ? 'TIMEOUT' : 'NETWORK_OR_CORS' } };
  } finally {
    clearTimeout(timer);
    if (reader) void reader.cancel().catch(() => {});
    else controller.abort();
  }
}
