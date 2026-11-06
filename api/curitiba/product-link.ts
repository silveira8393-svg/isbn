import { createCuritibaProductLinkFunction } from '../../server/curitibaProductLinkFunction.js';
export const config = { maxDuration: 10 };
export default { fetch: createCuritibaProductLinkFunction() };
