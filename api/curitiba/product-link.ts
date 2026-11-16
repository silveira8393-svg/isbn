import { createCuritibaProductLinkFunction } from '../../server/curitibaProductLinkFunction.js';
import { withMfa } from '../../server/mfaAuthorization.js';
export const config = { maxDuration: 10 };
export default { fetch: withMfa(createCuritibaProductLinkFunction()) };
