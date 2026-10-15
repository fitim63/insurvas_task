/**
 * End-to-end check of the permission matrix against a real Supabase (local stack).
 * Run with:  SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=... pnpm --filter @vault/core test:integration
 */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createVaultClient,
  emptyItem,
  initCrypto,
  logIn,
  signUp,
  VaultService,
  type VaultClient,
  type VaultItem,
} from '../../src';

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const run = url && anonKey ? describe : describe.skip;

interface Actor {
  email: string;
  db: VaultClient;
  vault: VaultService;
}

const memoryStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

async function makeActor(name: string): Promise<Actor> {
  const email = `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.local`;
  const db = createVaultClient({ url: url!, anonKey: anonKey!, storage: memoryStorage() });
  const res = await signUp(db, email, `pw-${name}-correct-horse`);
  const keys = res.keys ?? (await logIn(db, email, `pw-${name}-correct-horse`));
  return { email, db, vault: new VaultService(db, keys) };
}

const find = async (a: Actor, title: string): Promise<VaultItem | undefined> =>
  (await a.vault.load()).items.find((i) => i.data.title === title);

run('RLS permission matrix (live database)', () => {
  let alice: Actor, bob: Actor, carol: Actor;

  beforeAll(async () => {
    await initCrypto();
    [alice, bob, carol] = await Promise.all([makeActor('alice'), makeActor('bob'), makeActor('carol')]);
    await alice.vault.createItems([{ ...emptyItem(), title: 'GitHub', url: 'github.com', username: 'alice', password: 's3cret' }]);
  }, 60_000);

  it('stores only ciphertext', async () => {
    const { data } = await alice.db.from('items').select('encrypted_data');
    expect(data).toHaveLength(1);
    expect(JSON.stringify(data)).not.toMatch(/s3cret|GitHub|github/);
  });

  it('others cannot see an unshared item', async () => {
    expect(await find(bob, 'GitHub')).toBeUndefined();
    const { data } = await bob.db.from('items').select('id');
    expect(data).toEqual([]);
  });

  it('viewer can read but not edit or re-share', async () => {
    const item = (await find(alice, 'GitHub'))!;
    await alice.vault.shareItem(item, bob.email, 'viewer');

    const asBob = (await find(bob, 'GitHub'))!;
    expect(asBob.data.password).toBe('s3cret');
    expect(asBob.role).toBe('viewer');
    expect(asBob.source).toBe('shared');
    expect(asBob.ownerEmail).toBe(alice.email);

    await expect(bob.vault.updateItem(asBob, { ...asBob.data, password: 'hacked' })).rejects.toThrow();
    await expect(bob.vault.shareItem(asBob, carol.email, 'viewer')).rejects.toThrow(/permission/i);
    expect((await find(alice, 'GitHub'))!.data.password).toBe('s3cret');
  });

  it('editor can edit (visible to everyone) but not re-share', async () => {
    const item = (await find(alice, 'GitHub'))!;
    await alice.vault.setItemGranteeRole(item.id, bob.vault.userId, 'editor');

    const asBob = (await find(bob, 'GitHub'))!;
    await bob.vault.updateItem(asBob, { ...asBob.data, password: 'rotated' });
    expect((await find(alice, 'GitHub'))!.data.password).toBe('rotated');

    await expect(bob.vault.shareItem((await find(bob, 'GitHub'))!, carol.email, 'viewer')).rejects.toThrow(/permission/i);
    // ...and cannot delete or promote themselves
    await expect(bob.vault.deleteItem(asBob.id)).rejects.toThrow();
    await expect(bob.vault.setItemGranteeRole(asBob.id, bob.vault.userId, 'admin')).rejects.toThrow();
  });

  it('stale writes are rejected (optimistic concurrency)', async () => {
    const stale = (await find(alice, 'GitHub'))!;
    await alice.vault.updateItem(stale, { ...stale.data, notes: 'v1' });
    await expect(alice.vault.updateItem(stale, { ...stale.data, notes: 'v2' })).rejects.toThrow(/changed/);
  });

  it('admin can re-share; revoking removes access', async () => {
    const item = (await find(alice, 'GitHub'))!;
    await alice.vault.setItemGranteeRole(item.id, bob.vault.userId, 'admin');
    await bob.vault.shareItem((await find(bob, 'GitHub'))!, carol.email, 'viewer');
    expect((await find(carol, 'GitHub'))?.data.title).toBe('GitHub');

    const grantees = await alice.vault.listItemGrantees(item.id);
    expect(grantees.map((g) => g.email).sort()).toEqual([alice.email, bob.email, carol.email].sort());

    await alice.vault.revokeItemGrantee(item.id, carol.vault.userId);
    expect(await find(carol, 'GitHub')).toBeUndefined();
  });

  it('collections grant access to a whole group', async () => {
    await alice.vault.createCollection('Family');
    const fam = (await alice.vault.load()).collections.find((c) => c.name === 'Family')!;
    await alice.vault.createItems([{ ...emptyItem(), title: 'Netflix', url: 'netflix.com', username: 'fam', password: 'nf' }], fam);
    await alice.vault.addMember(fam, carol.email, 'viewer');

    const carolView = await carol.vault.load();
    expect(carolView.collections.map((c) => c.name)).toContain('Family');
    const nf = carolView.items.find((i) => i.data.title === 'Netflix')!;
    expect(nf.source).toBe('collection');
    expect(nf.role).toBe('viewer');
    await expect(carol.vault.updateItem(nf, { ...nf.data, password: 'x' })).rejects.toThrow();

    // carol (viewer) cannot add members or items
    const famAsCarol = carolView.collections.find((c) => c.id === fam.id)!;
    await expect(carol.vault.addMember(famAsCarol, bob.email, 'viewer')).rejects.toThrow(/permission/i);
    await expect(carol.vault.createItems([{ ...emptyItem(), title: 'x', password: 'y' }], famAsCarol)).rejects.toThrow();

    // promote to editor -> can edit collection items
    await alice.vault.setMemberRole(fam.id, carol.vault.userId, 'editor');
    const nf2 = (await find(carol, 'Netflix'))!;
    await carol.vault.updateItem(nf2, { ...nf2.data, password: 'nf2' });
    expect((await find(alice, 'Netflix'))!.data.password).toBe('nf2');

    // editor cannot move items out of the collection
    await expect(carol.vault.moveItem(nf2, null)).rejects.toThrow();
  });

  it('deleting a collection returns items to their owners', async () => {
    const fam = (await alice.vault.load()).collections.find((c) => c.name === 'Family')!;
    await alice.vault.deleteCollection(fam.id);
    expect(await find(carol, 'Netflix')).toBeUndefined();
    const nf = (await find(alice, 'Netflix'))!;
    expect(nf.collectionId).toBeNull();
    expect(nf.data.password).toBe('nf2');
  });

  it('profiles are not enumerable; lookup is exact-match only', async () => {
    const { data } = await bob.db.from('profiles').select('email');
    expect(data).toHaveLength(1);
    await expect(bob.vault.lookupUser('%@test.local')).rejects.toThrow(/No account/);
  });

  it('wrong master password cannot log in', async () => {
    const db = createVaultClient({ url: url!, anonKey: anonKey!, storage: memoryStorage() });
    await expect(logIn(db, alice.email, 'wrong password')).rejects.toThrow(/Wrong email or master password/);
  });
});
