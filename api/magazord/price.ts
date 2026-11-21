import { createMagazordPriceFunction } from '../../server/magazordPrice.js';
import { createMagazordStockFunction } from '../../server/magazordStock.js';
import { createMagazordMediaFunction } from '../../server/magazordMedia.js';
import { createMagazordSeoLookup } from '../../server/magazordSeo.js';
export const config = { maxDuration: 30 };
// Share the existing Vercel slot (Hobby limit). Dispatch by an exact query only.
const price = createMagazordPriceFunction();
const stock = createMagazordStockFunction();
const media = createMagazordMediaFunction();
const seo = createMagazordSeoLookup();
export default {
  fetch: (request: Request) => {
    const query = new URL(request.url).search;
    return query === '?stock=1' ? stock(request) : query === '?media=1' ? media(request)
      : query === '?seo=1' ? seo(request) : price(request);
  }
};
