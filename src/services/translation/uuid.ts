// src/services/translation/uuid.ts
// RFC 4122 v4 UUID. Crypto.getRandomValues is available in React Native
// ( expo/polyfills ship a Web Crypto implementation ); the fallback covers
// pure-node test environments.

const hex = (value: Uint8Array): string =>
  Array.from(value, b => b.toString(16).padStart(2, '0')).join('');

export const uuid = (): string => {
  try {
    const cryptoObj: Crypto | undefined =
      typeof globalThis !== 'undefined'
        ? (globalThis as { crypto?: Crypto }).crypto
        : undefined;
    if (cryptoObj?.getRandomValues) {
      const bytes = new Uint8Array(16);
      cryptoObj.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const h = hex(bytes);
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(
        16,
        20,
      )}-${h.slice(20)}`;
    }
  } catch {
    // fall through to Math.random
  }
  let h = '';
  for (let i = 0; i < 32; i++) {
    h += Math.floor(Math.random() * 16).toString(16);
  }
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(
    16,
    20,
  )}-${h.slice(20)}`;
};
