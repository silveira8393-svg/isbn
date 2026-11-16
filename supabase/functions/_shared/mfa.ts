/** Read claims ONLY after Auth has validated this exact token. This does not verify a signature. */
export function hasAal2ForUser(token: string, verifiedUserId: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || token.length > 8192) return false;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.sub === verifiedUserId && payload.aal === 'aal2';
  } catch { return false; }
}
