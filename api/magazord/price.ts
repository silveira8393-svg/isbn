import { createMagazordPriceFunction } from '../../server/magazordPrice.js';
import { createMagazordStockFunction } from '../../server/magazordStock.js';
import { createMagazordMediaFunction } from '../../server/magazordMedia.js';
export const config = { maxDuration: 30 };
// Share the existing Vercel slot (Hobby limit). Dispatch by an exact query only.
const price = createMagazordPriceFunction();
const stock = createMagazordStockFunction();
const media = createMagazordMediaFunction();
export default {
  fetch: (request: Request) => {
    const query = new URL(request.url).search;
    return query === '?stock=1' ? stock(request) : query === '?media=1' ? media(request) : price(request);
  }
};
