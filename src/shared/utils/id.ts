/** crypto.getRandomValues instead of crypto.randomUUID (missing on iOS 14.5). */
export function newId(prefix = 'id'): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) out += byte.toString(36).padStart(2, '0');
  return `${prefix}_${Date.now().toString(36)}${out}`;
}
