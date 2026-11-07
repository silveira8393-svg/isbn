import { createMagazordProductsFunction } from '../../server/magazordProducts.js';
export const config = { maxDuration: 30 };
export default { fetch: createMagazordProductsFunction() };
