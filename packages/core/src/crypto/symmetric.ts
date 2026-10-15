import { fromB64, sodium, toB64, utf8 } from './sodium';

/**
 * Authenticated encryption with XChaCha20-Poly1305.
 * Wire format: base64url( version(1) || nonce(24) || ciphertext+tag ).
 * `ad` (associated data) binds a ciphertext to its context (e.g. an item id) so the
 * server cannot swap ciphertexts between rows without detection.
 */
const VERSION = 1;

export function encryptBytes(key: Uint8Array, plaintext: Uint8Array, ad?: string): string {
  const s = sodium();
  const nonce = s.randombytes_buf(s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const ct = s.crypto_aead_xchacha20poly1305_ietf_encrypt(
    plaintext,
    ad ? utf8(ad) : null,
    null,
    nonce,
    key,
  );
  const out = new Uint8Array(1 + nonce.length + ct.length);
  out[0] = VERSION;
  out.set(nonce, 1);
  out.set(ct, 1 + nonce.length);
  return toB64(out);
}

export function decryptBytes(key: Uint8Array, blob: string, ad?: string): Uint8Array {
  const s = sodium();
  const raw = fromB64(blob);
  if (raw[0] !== VERSION) throw new Error('Unsupported ciphertext version');
  const n = s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES;
  const nonce = raw.subarray(1, 1 + n);
  const ct = raw.subarray(1 + n);
  try {
    return s.crypto_aead_xchacha20poly1305_ietf_decrypt(null, ct, ad ? utf8(ad) : null, nonce, key);
  } catch {
    throw new Error('Decryption failed: wrong key or tampered data');
  }
}

export function encryptJSON(key: Uint8Array, value: unknown, ad?: string): string {
  return encryptBytes(key, utf8(JSON.stringify(value)), ad);
}

export function decryptJSON<T>(key: Uint8Array, blob: string, ad?: string): T {
  return JSON.parse(new TextDecoder().decode(decryptBytes(key, blob, ad))) as T;
}

export function randomKey(): Uint8Array {
  return sodium().crypto_aead_xchacha20poly1305_ietf_keygen();
}
