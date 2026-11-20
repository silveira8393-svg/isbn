import { readFileSync } from 'node:fs';
// Complete synthetic 2x2 System.Drawing JPEG/PNG and a 1x1 WebP fixture. No external downloads.
export const mediaImages = Object.fromEntries(['jpg','png','webp'].map(format=>[
  format,new Uint8Array(readFileSync(new URL('../fixtures/media/cover.'+format,import.meta.url)))
]));
