import { createMagazordCategoriesFunction } from '../../server/magazordCategories.js';
export const config = { maxDuration: 30 };
export default { fetch: createMagazordCategoriesFunction() };
