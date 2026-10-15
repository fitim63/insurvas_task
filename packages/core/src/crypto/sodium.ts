import _sodium from 'libsodium-wrappers-sumo';

let ready = false;

/** Must be awaited once (app boot / service worker start) before any other crypto call. */
export async function initCrypto(): Promise<void> {
  await _sodium.ready;
  ready = true;
}

export function sodium(): typeof _sodium {
  if (!ready) throw new Error('Crypto not initialised: await initCrypto() first');
  return _sodium;
}

export const toB64 = (b: Uint8Array): string =>
  sodium().to_base64(b, sodium().base64_variants.URLSAFE_NO_PADDING);
export const fromB64 = (s: string): Uint8Array =>
  sodium().from_base64(s, sodium().base64_variants.URLSAFE_NO_PADDING);
export const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);
export const fromUtf8 = (b: Uint8Array): string => new TextDecoder().decode(b);

/** Best-effort wipe of key material held in a typed array. */
export function wipe(...bufs: (Uint8Array | null | undefined)[]): void {
  for (const b of bufs) if (b) sodium().memzero(b);
}
