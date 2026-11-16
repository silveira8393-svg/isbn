import { createCuritibaGalleryFunction } from '../../server/curitibaGalleryFunction.js';
import { withMfa } from '../../server/mfaAuthorization.js';

export const config = { maxDuration: 10 };
export default { fetch: withMfa(createCuritibaGalleryFunction()) };
