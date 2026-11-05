import { galleryLocation, type CuritibaGalleryRequest } from '../src/utils/curitibaGallery.js';
import { readProductGallery } from './curitibaGalleryReader.js';
import { fetchCuritibaIndex } from './curitibaGalleryTransport.js';

/** Public product-image references only. No Auth, database, storage, arbitrary URL proxy or image bytes. */
export function createCuritibaGalleryFunction(options: { fetcher?: typeof fetch; log?: (message:string)=>void } = {}) {
  let busy = false; // Per-instance exclusion, not a distributed rate limit or queue.
  return async (request: Request): Promise<Response> => {
    const start = performance.now();
    const reply = (status:number, images:string[] = [], state = 'unavailable', sourceStatus?: number | string) => {
      (options.log || console.info)(JSON.stringify({event:'curitiba_gallery',status,state,images:images.length,
        sourceStatus,durationMs:Math.round(performance.now()-start)}));
      return Response.json(images,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
        'X-ISBN-Gallery-State':state,...(sourceStatus ? {'X-ISBN-Source-Status':String(sourceStatus)} : {}),
        ...(status===405 ? {Allow:'GET'} : {})}});
    };
    try {
      const url = new URL(request.url);
      if (url.pathname !== '/api/curitiba/gallery') return reply(404,[],'invalid_request');
      if (request.method !== 'GET') return reply(405,[],'invalid_request');
      if (request.headers.get('sec-fetch-site') === 'cross-site'
        || (request.headers.get('origin') && request.headers.get('origin') !== url.origin)) return reply(403,[],'origin_denied');
      if (request.url.length > 1024 || [...url.searchParams.keys()].some(key=>!['product','index'].includes(key))
        || ['product','index'].some(key=>url.searchParams.getAll(key).length!==1)) return reply(400,[],'invalid_request');
      const query: CuritibaGalleryRequest = {product:url.searchParams.get('product')!,index:url.searchParams.get('index')!};
      const directory = galleryLocation({cdProduto:query.product,urlFoto:query.index},{cdProduto:query.product});
      if (!directory) return reply(400,[],'invalid_request');
      if (busy) return reply(429,[],'busy');
      busy = true;
      try {
        const result = await readProductGallery(directory,options.fetcher || fetchCuritibaIndex);
        const diagnostic = result.diagnostic;
        const status = diagnostic.state === 'loaded' || diagnostic.state === 'empty' ? 200
          : typeof diagnostic.status === 'number' && [403,404,429,503].includes(diagnostic.status) ? diagnostic.status
          : diagnostic.status === 'TIMEOUT' ? 504 : 502;
        return reply(status,result.images,diagnostic.state,diagnostic.status);
      } finally { busy = false; }
    } catch { return reply(502,[],'unavailable'); }
  };
}
