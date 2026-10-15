import { beforeAll, describe, expect, it } from 'vitest';
import {
  createAccountKeys,
  decryptCollectionName,
  decryptItem,
  deriveKeys,
  deserializeKeys,
  emptyItem,
  encryptBytes,
  decryptBytes,
  encryptCollectionName,
  encryptItem,
  fingerprint,
  initCrypto,
  newItemKey,
  protectWithPin,
  randomKey,
  rewrapUserKey,
  sealKeyFor,
  serializeKeys,
  toB64,
  unlockAccountKeys,
  unprotectWithPin,
  unwrapForMe,
  unwrapItemKey,
  utf8,
  wrapCollectionKey,
  wrapItemKey,
  type UnlockedKeys,
} from '../src';

beforeAll(async () => {
  await initCrypto();
});

function makeUser(email: string, password: string): { keys: UnlockedKeys; material: ReturnType<typeof createAccountKeys>['material'] } {
  const { stretchedKey } = deriveKeys(password, email);
  const acct = createAccountKeys(stretchedKey);
  return {
    material: acct.material,
    keys: unlockAccountKeys(stretchedKey, acct.material, { userId: email, email }),
  };
}

describe('key derivation', () => {
  it('is deterministic and normalises email', () => {
    const a = deriveKeys('correct horse battery staple', 'Alice@Example.com ');
    const b = deriveKeys('correct horse battery staple', 'alice@example.com');
    expect(a.authPassword).toBe(b.authPassword);
    expect(toB64(a.stretchedKey)).toBe(toB64(b.stretchedKey));
  });

  it('separates the auth password from the encryption key', () => {
    const { authPassword, stretchedKey } = deriveKeys('pw', 'a@b.c');
    expect(authPassword).toHaveLength(64);
    expect(authPassword).not.toContain(Buffer.from(stretchedKey).toString('hex'));
  });

  it('differs per email (salt) and per password', () => {
    const base = deriveKeys('pw', 'a@b.c').authPassword;
    expect(deriveKeys('pw', 'x@b.c').authPassword).not.toBe(base);
    expect(deriveKeys('pw2', 'a@b.c').authPassword).not.toBe(base);
  });
});

describe('account keys', () => {
  it('unlocks with the right password and rejects the wrong one', () => {
    const { material } = makeUser('a@x.io', 'right');
    const wrong = deriveKeys('wrong', 'a@x.io').stretchedKey;
    expect(() => unlockAccountKeys(wrong, material, { userId: '1', email: 'a@x.io' })).toThrow();
  });

  it('survives a master password change via re-wrap', () => {
    const { keys, material } = makeUser('a@x.io', 'old');
    const next = deriveKeys('new', 'a@x.io').stretchedKey;
    const rewrapped = { ...material, encryptedUserKey: rewrapUserKey(keys.userKey, next) };
    const unlocked = unlockAccountKeys(next, rewrapped, keys);
    expect(toB64(unlocked.userKey)).toBe(toB64(keys.userKey));
    expect(toB64(unlocked.privateKey)).toBe(toB64(keys.privateKey));
  });

  it('serialises for chrome.storage.session', () => {
    const { keys } = makeUser('a@x.io', 'pw');
    const back = deserializeKeys(serializeKeys(keys));
    expect(toB64(back.privateKey)).toBe(toB64(keys.privateKey));
  });
});

describe('symmetric AEAD', () => {
  it('detects tampering and wrong associated data', () => {
    const key = randomKey();
    const blob = encryptBytes(key, utf8('secret'), 'item:1');
    expect(new TextDecoder().decode(decryptBytes(key, blob, 'item:1'))).toBe('secret');
    expect(() => decryptBytes(key, blob, 'item:2')).toThrow();
    const raw = Buffer.from(blob, 'base64url');
    raw[raw.length - 1]! ^= 1;
    expect(() => decryptBytes(key, raw.toString('base64url'), 'item:1')).toThrow();
  });

  it('uses a fresh nonce every time', () => {
    const key = randomKey();
    expect(encryptBytes(key, utf8('x'))).not.toBe(encryptBytes(key, utf8('x')));
  });
});

describe('items and sharing', () => {
  const data = { ...emptyItem(), title: 'GitHub', username: 'alice', password: 'hunter2', url: 'https://github.com' };

  it('round-trips an item and binds it to its id', () => {
    const key = newItemKey();
    const blob = encryptItem('id-1', key, data);
    expect(blob).not.toContain('hunter2');
    expect(decryptItem('id-1', key, blob)).toEqual(data);
    expect(() => decryptItem('id-2', key, blob)).toThrow();
  });

  it('A shares with B via B public key; C cannot open it', () => {
    const alice = makeUser('alice@x.io', 'a').keys;
    const bob = makeUser('bob@x.io', 'b').keys;
    const carol = makeUser('carol@x.io', 'c').keys;

    const itemKey = newItemKey();
    const blob = encryptItem('item-9', itemKey, data);
    const ownerRow = wrapItemKey('item-9', itemKey, alice.userKey);

    // 1. Alice decrypts locally  2. seals to Bob's public key  3. stores
    const aliceKey = unwrapForMe('user_key', ownerRow, alice, { kind: 'item', id: 'item-9' });
    const bobRow = sealKeyFor(aliceKey, toB64(bob.publicKey));

    // 4. Bob decrypts with his private key
    const bobKey = unwrapForMe('public_key', bobRow, bob, { kind: 'item', id: 'item-9' });
    expect(decryptItem('item-9', bobKey, blob).password).toBe('hunter2');

    expect(() => unwrapForMe('public_key', bobRow, carol, { kind: 'item', id: 'item-9' })).toThrow();
  });

  it('collection members reach items through the collection key', () => {
    const owner = makeUser('o@x.io', 'o').keys;
    const member = makeUser('m@x.io', 'm').keys;
    const collKey = randomKey();
    const ownerRow = wrapCollectionKey('c1', collKey, owner.userKey);
    const memberRow = sealKeyFor(collKey, toB64(member.publicKey));
    const name = encryptCollectionName('c1', collKey, 'Family');

    const itemKey = newItemKey();
    const blob = encryptItem('i1', itemKey, data);
    const collItemKey = wrapItemKey('i1', itemKey, collKey);

    for (const [who, row, wrap] of [
      [owner, ownerRow, 'user_key'],
      [member, memberRow, 'public_key'],
    ] as const) {
      const ck = unwrapForMe(wrap, row, who, { kind: 'collection', id: 'c1' });
      expect(decryptCollectionName('c1', ck, name)).toBe('Family');
      expect(decryptItem('i1', unwrapItemKey('i1', collItemKey, ck), blob).title).toBe('GitHub');
    }
  });

  it('produces a stable fingerprint', () => {
    const { keys } = makeUser('f@x.io', 'f');
    expect(fingerprint(keys.publicKey)).toMatch(/^[0-9a-f]{4}(-[0-9a-f]{4}){4}$/);
    expect(fingerprint(keys.publicKey)).toBe(fingerprint(toB64(keys.publicKey)));
  });
});

describe('PIN envelope', () => {
  it('opens only with the right PIN', () => {
    const secret = randomKey();
    const env = protectWithPin('1234', secret);
    expect(toB64(unprotectWithPin('1234', env))).toBe(toB64(secret));
    expect(() => unprotectWithPin('4321', env)).toThrow();
  });
});
