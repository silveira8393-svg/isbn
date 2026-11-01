import { createSpapiHandler } from '../../../server/spapi/handler.js';
export const config = { maxDuration: 60 };
export default { fetch: createSpapiHandler('login') };
