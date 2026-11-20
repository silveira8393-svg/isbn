/**
 * Pure Magazord media wire-format helpers.
 * No remote calls or production access. Used only after a verified registration.
 */
export const MAGAZORD_MEDIA_MAX_BYTES = 5 * 1024 * 1024;
export type MediaImageFormat = 'jpg' | 'png' | 'webp';
export type MediaImage = { bytes: Uint8Array; format: MediaImageFormat; name: string };
export type MediaUploadResponse = { status: 'success'; data: { id: string | number } };

const mediaId = (id: unknown): number | undefined => {
  const number = typeof id === 'string' && /^[1-9][0-9]*$/.test(id) ? Number(id) : id;
  return Number.isSafeInteger(number) && Number(number) > 0 ? Number(number) : undefined;
};
const nonEmptyCode = (code: string): boolean => typeof code === 'string'
  && /^[\p{L}\p{N}][\p{L}\p{N}._ -]{0,24}$/u.test(code) && code.trim() === code;

export function validatedMagazordMediaId(response: unknown): number {
  if (!response || typeof response !== 'object' || (response as any).status !== 'success') throw new Error('invalid_media_response');
  const id = mediaId((response as any).data?.id);
  if (!id) throw new Error('invalid_media_id');
  return id;
}

export function buildMagazordImageUpload(image: MediaImage) {
  if (!(image.bytes instanceof Uint8Array) || image.bytes.byteLength < 12
    || image.bytes.byteLength > MAGAZORD_MEDIA_MAX_BYTES) throw new Error('invalid_media_size');
  const bytes = image.bytes;
  const format = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? 'jpg'
    : bytes.slice(0,8).join(',') === '137,80,78,71,13,10,26,10' ? 'png'
    : String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP' ? 'webp' : undefined;
  if (format !== image.format || !/^[a-zA-Z0-9._-]{1,100}$/.test(image.name)
    || !image.name.toLowerCase().endsWith('.'+image.format)) throw new Error('invalid_media_image');
  return {
    tipo: 6, // Magazord: 6 = derivação
    plataforma: 1, // Todas as plataformas
    tipoMidia: 1, // Imagem
    midiaFile: Buffer.from(bytes).toString('base64'),
    nomeArquivo: image.name,
  };
}

export function buildMagazordMediaRelation(parentCode: string, childCode: string, ids: unknown[]) {
  if (!nonEmptyCode(parentCode) || !nonEmptyCode(childCode) || parentCode === childCode
    || !Array.isArray(ids) || ids.length < 1 || ids.length > 20) throw new Error('invalid_media_relation');
  const validated = ids.map(mediaId);
  if (validated.some(id=>!id) || new Set(validated).size !== validated.length) throw new Error('invalid_media_ids');
  return {
    path: '/v2/site/produto/'+encodeURIComponent(parentCode)+'/derivacao/'+encodeURIComponent(childCode)+'/midia',
    method: 'POST' as const,
    body: {midiaId: validated as number[]}
  };
}
