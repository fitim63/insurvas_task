import { sodium, utf8 } from './sodium';

/**
 * Argon2id parameters (libsodium "interactive" profile: 64 MiB, 3 passes).
 * Versioned so they can be raised later without breaking existing accounts.
 */
export const KDF_V1 = { opslimit: 3, memlimit: 64 * 1024 * 1024 } as const;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Deterministic per-user salt derived from the email, so the client can derive keys
 * before it has authenticated (the auth password itself comes from the master key).
 */
export function saltForEmail(email: string): Uint8Array {
  const s = sodium();
  return s.crypto_generichash(
    s.crypto_pwhash_SALTBYTES,
    utf8(`secure-vault:v1:${normalizeEmail(email)}`),
    null,
  );
}

/** Master Password -> master key. Runs locally only; the password never leaves the device. */
export function deriveMasterKey(masterPassword: string, email: string): Uint8Array {
  const s = sodium();
  return s.crypto_pwhash(
    32,
    utf8(masterPassword.normalize('NFKC')),
    saltForEmail(email),
    KDF_V1.opslimit,
    KDF_V1.memlimit,
    s.crypto_pwhash_ALG_ARGON2ID13,
  );
}

export interface DerivedKeys {
  /** Sent to Supabase Auth as the account password. Reveals nothing about K_sym. */
  authPassword: string;
  /** K_sym: wraps the user's vault key. Never leaves the client. */
  stretchedKey: Uint8Array;
}

const CTX = 'svault01'; // libsodium KDF context: exactly 8 bytes

export function splitMasterKey(masterKey: Uint8Array): DerivedKeys {
  const s = sodium();
  const auth = s.crypto_kdf_derive_from_key(32, 1, CTX, masterKey);
  const enc = s.crypto_kdf_derive_from_key(32, 2, CTX, masterKey);
  return { authPassword: s.to_hex(auth), stretchedKey: enc };
}

export function deriveKeys(masterPassword: string, email: string): DerivedKeys {
  const mk = deriveMasterKey(masterPassword, email);
  try {
    return splitMasterKey(mk);
  } finally {
    sodium().memzero(mk);
  }
}
