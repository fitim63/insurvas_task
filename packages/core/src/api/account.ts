import { check, friendlyError, type VaultClient } from './client';
import {
  createAccountKeys,
  deriveKeys,
  normalizeEmail,
  rewrapUserKey,
  unlockAccountKeys,
  wipe,
  type AccountKeyMaterial,
  type UnlockedKeys,
} from '../crypto';

/** Lets the browser paint a spinner before the (blocking) Argon2id run. */
const yieldToUi = () => new Promise((r) => setTimeout(r, 30));

interface ProfileRow {
  id: string;
  email: string;
  public_key: string;
  encrypted_private_key: string;
  encrypted_user_key: string;
}

async function fetchProfile(db: VaultClient, userId: string): Promise<ProfileRow> {
  return check(
    await db
      .from('profiles')
      .select('id, email, public_key, encrypted_private_key, encrypted_user_key')
      .eq('id', userId)
      .single(),
  ) as ProfileRow;
}

const material = (p: ProfileRow): AccountKeyMaterial => ({
  publicKey: p.public_key,
  encryptedPrivateKey: p.encrypted_private_key,
  encryptedUserKey: p.encrypted_user_key,
});

/**
 * Registration. Keys are generated locally. Only the derived auth password and
 * wrapped key material are sent; the profile row is created by a DB trigger.
 */
export async function signUp(
  db: VaultClient,
  emailInput: string,
  masterPassword: string,
): Promise<{ keys: UnlockedKeys | null; needsEmailConfirmation: boolean }> {
  const email = normalizeEmail(emailInput);
  await yieldToUi();
  const { authPassword, stretchedKey } = deriveKeys(masterPassword, email);
  const acct = createAccountKeys(stretchedKey);
  wipe(stretchedKey);
  const { data, error } = await db.auth.signUp({
    email,
    password: authPassword,
    options: {
      data: {
        public_key: acct.material.publicKey,
        encrypted_private_key: acct.material.encryptedPrivateKey,
        encrypted_user_key: acct.material.encryptedUserKey,
      },
    },
  });
  if (error) throw friendlyError(error);
  if (!data.session || !data.user) return { keys: null, needsEmailConfirmation: true };
  return {
    needsEmailConfirmation: false,
    keys: {
      userId: data.user.id,
      email,
      userKey: acct.userKey,
      publicKey: acct.publicKey,
      privateKey: acct.privateKey,
    },
  };
}

/** Full login: authenticate with the derived auth password, then unwrap keys. */
export async function logIn(db: VaultClient, emailInput: string, masterPassword: string): Promise<UnlockedKeys> {
  const email = normalizeEmail(emailInput);
  await yieldToUi();
  const { authPassword, stretchedKey } = deriveKeys(masterPassword, email);
  try {
    const { data, error } = await db.auth.signInWithPassword({ email, password: authPassword });
    if (error) throw friendlyError(error);
    const profile = await fetchProfile(db, data.user.id);
    return unlockAccountKeys(stretchedKey, material(profile), { userId: profile.id, email: profile.email });
  } finally {
    wipe(stretchedKey);
  }
}

/** Unlock a locked vault while the auth session is still valid (no re-login needed). */
export async function unlockWithPassword(db: VaultClient, masterPassword: string): Promise<UnlockedKeys> {
  const { data } = await db.auth.getUser();
  if (!data.user?.email) throw new Error('Session expired. Please log in again.');
  const profile = await fetchProfile(db, data.user.id);
  await yieldToUi();
  const { stretchedKey } = deriveKeys(masterPassword, profile.email);
  try {
    return unlockAccountKeys(stretchedKey, material(profile), { userId: profile.id, email: profile.email });
  } catch {
    throw new Error('Wrong master password.');
  } finally {
    wipe(stretchedKey);
  }
}

/**
 * Change the master password: re-wrap the vault key under the new K_sym and rotate
 * the auth password. Vault items are untouched because they're wrapped by the vault key.
 */
export async function changeMasterPassword(
  db: VaultClient,
  keys: UnlockedKeys,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await yieldToUi();
  const current = deriveKeys(currentPassword, keys.email);
  const profile = await fetchProfile(db, keys.userId);
  try {
    unlockAccountKeys(current.stretchedKey, material(profile), keys);
  } catch {
    throw new Error('Current master password is wrong.');
  } finally {
    wipe(current.stretchedKey);
  }
  const next = deriveKeys(newPassword, keys.email);
  const encryptedUserKey = rewrapUserKey(keys.userKey, next.stretchedKey);
  wipe(next.stretchedKey);
  check(await db.from('profiles').update({ encrypted_user_key: encryptedUserKey }).eq('id', keys.userId));
  const { error } = await db.auth.updateUser({ password: next.authPassword });
  if (error) {
    // Roll back the wrapper so the old password keeps working.
    await db.from('profiles').update({ encrypted_user_key: profile.encrypted_user_key }).eq('id', keys.userId);
    throw friendlyError(error);
  }
}

export async function logOut(db: VaultClient): Promise<void> {
  await db.auth.signOut();
}
