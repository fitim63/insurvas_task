import { decryptBytes, decryptJSON, encryptBytes, encryptJSON, randomKey } from './symmetric';
import { openSealed, sealToPublicKey } from './share';
import type { UnlockedKeys } from './keys';
import type { VaultItemData } from '../types';

/**
 * Per-item envelope encryption. Each credential has its own random item key. The
 * payload is encrypted once with it, and the item key is then wrapped separately for
 * every principal that may read it (owner's vault key, a recipient's public key, or a
 * collection key). That way an Editor's change is visible to every grantee.
 */
const itemAd = (itemId: string) => `item:${itemId}`;
const itemKeyAd = (itemId: string) => `item-key:${itemId}`;
const collectionKeyAd = (collectionId: string) => `collection-key:${collectionId}`;
const collectionNameAd = (collectionId: string) => `collection-name:${collectionId}`;

export type KeyWrap = 'user_key' | 'public_key';

export function newItemKey(): Uint8Array {
  return randomKey();
}

export function encryptItem(itemId: string, itemKey: Uint8Array, data: VaultItemData): string {
  return encryptJSON(itemKey, data, itemAd(itemId));
}

export function decryptItem(itemId: string, itemKey: Uint8Array, blob: string): VaultItemData {
  return decryptJSON<VaultItemData>(itemKey, blob, itemAd(itemId));
}

/** Wrap an item key with a symmetric key (owner's user key, or a collection key). */
export function wrapItemKey(itemId: string, itemKey: Uint8Array, wrappingKey: Uint8Array): string {
  return encryptBytes(wrappingKey, itemKey, itemKeyAd(itemId));
}

export function unwrapItemKey(itemId: string, blob: string, wrappingKey: Uint8Array): Uint8Array {
  return decryptBytes(wrappingKey, blob, itemKeyAd(itemId));
}

/** Collection key wrapped for its creator's own vault key. */
export function wrapCollectionKey(collectionId: string, collectionKey: Uint8Array, userKey: Uint8Array): string {
  return encryptBytes(userKey, collectionKey, collectionKeyAd(collectionId));
}

export function encryptCollectionName(collectionId: string, collectionKey: Uint8Array, name: string): string {
  return encryptJSON(collectionKey, { name }, collectionNameAd(collectionId));
}

export function decryptCollectionName(collectionId: string, collectionKey: Uint8Array, blob: string): string {
  return decryptJSON<{ name: string }>(collectionKey, blob, collectionNameAd(collectionId)).name;
}

/**
 * Unwrap a key from an item_access / collection_members row addressed to the current
 * user. Rows created by the user themselves use their vault key; rows created by
 * someone else sharing with them are sealed to their public key.
 */
export function unwrapForMe(
  wrap: KeyWrap,
  blob: string,
  keys: UnlockedKeys,
  target: { kind: 'item' | 'collection'; id: string },
): Uint8Array {
  if (wrap === 'public_key') return openSealed(blob, keys);
  return target.kind === 'item'
    ? unwrapItemKey(target.id, blob, keys.userKey)
    : decryptBytes(keys.userKey, blob, collectionKeyAd(target.id));
}

/** Seal any key (item or collection) to another user's public key. */
export function sealKeyFor(key: Uint8Array, recipientPublicKey: string): string {
  return sealToPublicKey(key, recipientPublicKey);
}
