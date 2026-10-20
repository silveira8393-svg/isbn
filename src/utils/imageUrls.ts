/** Check the reference only; image decoding remains the browser's job. No extra requests. */
export function isImageReference(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      && !url.pathname.endsWith('/') && !/\.html?$/i.test(url.pathname);
  } catch { return false; }
}

export function imageReferences(values: unknown[]): string[] {
  return [...new Set(values.filter(isImageReference))];
}
