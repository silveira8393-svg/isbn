import { createMagazordPriceFunction } from '../../server/magazordPrice.js';
import { createMagazordStockFunction } from '../../server/magazordStock.js';
export const config = { maxDuration: 30 };
// Same Vercel function, separate stock implementation. No additional serverless slot.
const price = createMagazordPriceFunction();
const stock = createMagazordStockFunction();
export default { fetch: (request: Request) => new URL(request.url).search === '?stock=1' ? stock(request) : price(request) };
