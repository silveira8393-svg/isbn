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
  const seen = new Set<string>();
  return values.filter(isImageReference).map(value => new URL(value).href).filter(value => {
    const identity = imageIdentity(value);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

/** Collapse only identifiable Amazon CDN resizes. Other URLs retain their complete identity. */
export function imageIdentity(value: string): string {
  const url = new URL(value);
  if (['m.media-amazon.com', 'images-na.ssl-images-amazon.com', 'images-eu.ssl-images-amazon.com'].includes(url.hostname)
    && !url.port && !url.search && !url.hash) {
    const asset = /^\/images\/I\/([A-Za-z0-9+_-]+?)(?:\._[A-Za-z0-9_,+\-]+_)?\.(jpg|jpeg|png|webp)$/i.exec(url.pathname);
    if (asset) return `amazon-image:${asset[1]}.${asset[2].toLowerCase()}`;
  }
  return url.href;
}
