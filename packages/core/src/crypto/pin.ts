import { decryptBytes, encryptBytes } from './symmetric';
import { fromB64, sodium, toB64, utf8 } from './sodium';

/**
 * PIN unlock for the extension. The unlocked key bundle is encrypted with a key
 * derived from the PIN (Argon2id, random salt). The envelope is only ever kept in
 * chrome.storage.session (memory, wiped on browser restart), and the caller enforces
 * an attempt limit, so a short PIN is an acceptable convenience trade-off.
 */
export interface PinEnvelope {
  salt: string;
  blob: string;
}

function pinKey(pin: string, salt: Uint8Array): Uint8Array {
  const s = sodium();
  return s.crypto_pwhash(32, utf8(pin), salt, 2, 32 * 1024 * 1024, s.crypto_pwhash_ALG_ARGON2ID13);
}

export function protectWithPin(pin: string, secret: Uint8Array): PinEnvelope {
  const salt = sodium().randombytes_buf(sodium().crypto_pwhash_SALTBYTES);
  return { salt: toB64(salt), blob: encryptBytes(pinKey(pin, salt), secret, 'pin') };
}

/** Throws on a wrong PIN. */
export function unprotectWithPin(pin: string, env: PinEnvelope): Uint8Array {
  return decryptBytes(pinKey(pin, fromB64(env.salt)), env.blob, 'pin');
}
