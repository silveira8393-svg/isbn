/** NCM syntax only: eight ASCII digits, or the conventional NNNN.NN.NN mask. */
export function normalizeNcm(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  // Preserve the existing optional-field contract; an empty NCM is omitted from the remote payload.
  if (value === '' || (value.length === 8 && /^[0-9]{8}$/.test(value))) return value;
  if (value.length === 10 && /^[0-9]{4}\.[0-9]{2}\.[0-9]{2}$/.test(value)) return value.replace(/\./g, '');
  return;
}
