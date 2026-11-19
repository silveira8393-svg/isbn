import { createMagazordPriceFunction } from '../../server/magazordPrice.js';
export const config = { maxDuration: 30 };
export default { fetch: createMagazordPriceFunction() };
