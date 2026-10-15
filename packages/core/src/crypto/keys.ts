import { decryptBytes, encryptBytes, randomKey } from './symmetric';
import { fromB64, sodium, toB64 } from './sodium';

/** Keys held in memory while the vault is unlocked. */
export interface UnlockedKeys {
  userId: string;
  email: string;
  /** Random 256-bit vault key, wrapped server-side by K_sym. */
  userKey: Uint8Array;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

/** What the server stores per account (all opaque to it except the public key). */
export interface AccountKeyMaterial {
  publicKey: string;
  encryptedPrivateKey: string;
  encryptedUserKey: string;
}

const AD_USER_KEY = 'user-key';
const AD_PRIVATE_KEY = 'private-key';

/** Generates a fresh vault key + X25519 keypair for a new account. */
export function createAccountKeys(stretchedKey: Uint8Array): {
  material: AccountKeyMaterial;
  userKey: Uint8Array;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
} {
  const s = sodium();
  const userKey = randomKey();
  const kp = s.crypto_box_keypair();
  return {
    userKey,
    publicKey: kp.publicKey,
    privateKey: kp.privateKey,
    material: {
      publicKey: toB64(kp.publicKey),
      encryptedUserKey: encryptBytes(stretchedKey, userKey, AD_USER_KEY),
      encryptedPrivateKey: encryptBytes(userKey, kp.privateKey, AD_PRIVATE_KEY),
    },
  };
}

/** Throws if the master password (-> stretchedKey) is wrong. */
export function unlockAccountKeys(
  stretchedKey: Uint8Array,
  material: AccountKeyMaterial,
  identity: { userId: string; email: string },
): UnlockedKeys {
  const userKey = decryptBytes(stretchedKey, material.encryptedUserKey, AD_USER_KEY);
  const privateKey = decryptBytes(userKey, material.encryptedPrivateKey, AD_PRIVATE_KEY);
  return { ...identity, userKey, privateKey, publicKey: fromB64(material.publicKey) };
}

/** Master-password change: only the small user-key wrapper is re-encrypted. */
export function rewrapUserKey(userKey: Uint8Array, newStretchedKey: Uint8Array): string {
  return encryptBytes(newStretchedKey, userKey, AD_USER_KEY);
}

/** Serialisable form, used to park unlocked keys in chrome.storage.session. */
export interface SerializedKeys {
  userId: string;
  email: string;
  userKey: string;
  publicKey: string;
  privateKey: string;
}

export function serializeKeys(k: UnlockedKeys): SerializedKeys {
  return {
    userId: k.userId,
    email: k.email,
    userKey: toB64(k.userKey),
    publicKey: toB64(k.publicKey),
    privateKey: toB64(k.privateKey),
  };
}

export function deserializeKeys(k: SerializedKeys): UnlockedKeys {
  return {
    userId: k.userId,
    email: k.email,
    userKey: fromB64(k.userKey),
    publicKey: fromB64(k.publicKey),
    privateKey: fromB64(k.privateKey),
  };
}
