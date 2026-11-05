import { createCuritibaGalleryFunction } from '../../server/curitibaGalleryFunction.js';

export const config = { maxDuration: 10 };
export default { fetch: createCuritibaGalleryFunction() };
