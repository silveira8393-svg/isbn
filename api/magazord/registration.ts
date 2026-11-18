import { createMagazordRegistrationFunction } from '../../server/magazordRegistration.js';
export const config = { maxDuration: 60 };
export default { fetch: createMagazordRegistrationFunction() };
