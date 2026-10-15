import { fromB64, sodium, toB64 } from './sodium';
import type { UnlockedKeys } from './keys';

/**
 * Asymmetric sharing (PRD §2): encrypt to a recipient's X25519 public key with an
 * anonymous sealed box. Only the holder of the matching private key can open it.
 */
export function sealToPublicKey(plaintext: Uint8Array, recipientPublicKey: string | Uint8Array): string {
  const pk = typeof recipientPublicKey === 'string' ? fromB64(recipientPublicKey) : recipientPublicKey;
  return toB64(sodium().crypto_box_seal(plaintext, pk));
}

export function openSealed(blob: string, keys: Pick<UnlockedKeys, 'publicKey' | 'privateKey'>): Uint8Array {
  try {
    return sodium().crypto_box_seal_open(fromB64(blob), keys.publicKey, keys.privateKey);
  } catch {
    throw new Error('Could not open shared key: not addressed to this account');
  }
}

/** Short human-checkable fingerprint of a public key (for out-of-band verification). */
export function fingerprint(publicKey: string | Uint8Array): string {
  const pk = typeof publicKey === 'string' ? fromB64(publicKey) : publicKey;
  const h = sodium().to_hex(sodium().crypto_generichash(10, pk, null));
  return h.match(/.{4}/g)!.join('-');
}
