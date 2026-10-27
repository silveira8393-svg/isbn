import { createAmazonFunction } from '../server/amazonFunction.js';

export const config = { maxDuration: 45 };
// Web Standard handler nativo da Vercel em Node.js, sem listen() ou subprocessos.
export default { fetch: createAmazonFunction() };
