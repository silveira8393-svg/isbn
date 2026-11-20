import { createMagazordStockFunction } from '../../server/magazordStock.js';
export const config = { maxDuration: 30 };
export default { fetch: createMagazordStockFunction() };
