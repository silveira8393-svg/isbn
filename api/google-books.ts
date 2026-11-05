import { createGoogleBooksFunction } from '../server/googleBooksFunction.js';
export const config = { maxDuration: 10 };
export default { fetch: createGoogleBooksFunction() };
