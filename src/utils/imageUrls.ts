import type { User } from '../types';
import type { SupabaseClient } from '@supabase/supabase-js';

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


export const BOOK_IMAGE_BUCKET = 'isbn-registration-images';
export const BOOK_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const STORAGE_ORIGIN = 'https://jcxdkrpmrfbrhzwbzhph.supabase.co';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STORED_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f]{64}\.(jpg|png|webp)$/;
export type LocalBookImage = { file: File; hash: string; extension: 'jpg' | 'png' | 'webp' };
type BookImageStorage = { client: Pick<SupabaseClient, 'auth' | 'storage'>; projectUrl: string };

function storedImagePath(reference: string): string | undefined {
  try {
    const url = new URL(reference), prefix = `/storage/v1/object/authenticated/${BOOK_IMAGE_BUCKET}/`;
    const path = url.pathname.slice(prefix.length);
    if (url.origin === STORAGE_ORIGIN && url.pathname.startsWith(prefix) && !url.search && !url.hash && STORED_PATH.test(path)) return path;
  } catch { /* Other sources continue using their existing public URLs. */ }
}
export const isStoredBookImage = (reference: string) => storedImagePath(reference) !== undefined;

const digest = async (data: ArrayBuffer) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))]
  .map(byte => byte.toString(16).padStart(2, '0')).join('');

async function storageDeadline<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Tempo de envio excedido. O cadastro foi preservado.')), 30000);
    })]);
  } finally { clearTimeout(timer!); }
}

/** Validate the file itself, not its extension. Preview/file bytes remain in memory. */
export async function prepareLocalBookImage(file: File): Promise<LocalBookImage> {
  if (!file.size || file.size > BOOK_IMAGE_MAX_BYTES) throw new Error('Cada foto deve ter conteúdo e no máximo 5 MiB.');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Selecione fotos JPEG, PNG ou WebP.');
  const data = await file.arrayBuffer(), bytes = new Uint8Array(data);
  const extension = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? 'jpg'
    : bytes.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10' ? 'png'
    : String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP' ? 'webp' : undefined;
  if (!extension || file.type !== ({ jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[extension])) throw new Error('O conteúdo do arquivo não corresponde a uma foto JPEG, PNG ou WebP.');
  try {
    if (typeof createImageBitmap === 'function') {
      const image = await createImageBitmap(file);
      try { if (!image.width || !image.height) throw new Error(); } finally { image.close(); }
    } else {
      const preview = URL.createObjectURL(file), image = new Image();
      try { image.src = preview; await image.decode(); if (!image.naturalWidth || !image.naturalHeight) throw new Error(); }
      finally { image.src = ''; URL.revokeObjectURL(preview); }
    }
  } catch { throw new Error('Não foi possível abrir esta foto. Escolha um arquivo de imagem válido.'); }
  return { file, hash: await digest(data), extension };
}

/** Upload only to the existing ISBN project, under the caller's store/user and a content hash. */
export async function uploadLocalBookImage(image: LocalBookImage, user: Pick<User, 'id' | 'storeId' | 'active'>, storage: BookImageStorage): Promise<string> {
  if (!user.active || !UUID.test(user.id) || !UUID.test(user.storeId || '') || !/^[a-f0-9]{64}$/.test(image.hash)) throw new Error('Entre novamente na loja para enviar fotos.');
  const { client: supabase, projectUrl: supabaseUrl } = storage;
  if (![STORAGE_ORIGIN, STORAGE_ORIGIN + '/'].includes(supabaseUrl)) throw new Error('O armazenamento de fotos não está configurado para o projeto ISBN.');
  const { data, error } = await supabase.auth.getSession();
  if (error || data.session?.user.id !== user.id) throw new Error('Sua sessão mudou. Entre novamente antes de enviar fotos.');
  const path = `${user.storeId}/${user.id}/${image.hash}.${image.extension}`, bucket = supabase.storage.from(BOOK_IMAGE_BUCKET);
  const result = await storageDeadline(bucket.upload(path, image.file, { contentType: image.file.type, upsert: false, cacheControl: '3600' }));
  if (result.error) {
    const duplicate = String(result.error.statusCode) === '409'
      || (String(result.error.statusCode) === '400' && /already exists/i.test(result.error.message));
    if (!duplicate) throw new Error('Não foi possível enviar a foto. Confira a disponibilidade e as permissões do armazenamento; o cadastro foi preservado.');
    const existing = await bucket.download(path, {}, { signal: AbortSignal.timeout(30000) });
    if (existing.error || !existing.data || await digest(await existing.data.arrayBuffer()) !== image.hash) throw new Error('Não foi possível confirmar a foto já armazenada. Nenhum arquivo foi substituído.');
  }
  return `${STORAGE_ORIGIN}/storage/v1/object/authenticated/${BOOK_IMAGE_BUCKET}/${path}`;
}

/** Private references are persisted; authenticated blob URLs exist only while being displayed. */
export async function openStoredBookImage(reference: string, storage: BookImageStorage, signal?: AbortSignal): Promise<{ url: string; release: () => void }> {
  const path = storedImagePath(reference);
  if (!path) throw new Error('Referência de armazenamento inválida.');
  const { client: supabase, projectUrl: supabaseUrl } = storage;
  if (![STORAGE_ORIGIN, STORAGE_ORIGIN + '/'].includes(supabaseUrl)) throw new Error('Armazenamento indisponível.');
  const { data, error } = await supabase.storage.from(BOOK_IMAGE_BUCKET).download(path, {}, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000) });
  if (error || !data) throw new Error('Não foi possível carregar a foto armazenada.');
  const url = URL.createObjectURL(data);
  return { url, release: () => URL.revokeObjectURL(url) };
}
