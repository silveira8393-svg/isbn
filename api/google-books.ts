import { createGoogleBooksFunction } from '../server/googleBooksFunction.js';
import { withMfa } from '../server/mfaAuthorization.js';
export const config = { maxDuration: 10 };
export default { fetch: withMfa(createGoogleBooksFunction()) };
