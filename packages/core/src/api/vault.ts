import { check, friendlyError, type VaultClient } from './client';
import {
  decryptCollectionName,
  decryptItem,
  encryptCollectionName,
  encryptItem,
  newItemKey,
  randomKey,
  sealKeyFor,
  unwrapForMe,
  unwrapItemKey,
  wrapCollectionKey,
  wrapItemKey,
  type KeyWrap,
  type UnlockedKeys,
} from '../crypto';
import { maxRole } from '../permissions';
import type { Collection, Grantee, Role, VaultItem, VaultItemData } from '../types';

interface ItemRow {
  id: string;
  owner_id: string;
  collection_id: string | null;
  collection_item_key: string | null;
  encrypted_data: string;
  revision: number;
  updated_at: string;
}
interface AccessRow {
  item_id: string;
  role: Role;
  encrypted_item_key: string;
  key_wrap: KeyWrap;
}
interface MemberRow {
  collection_id: string;
  role: Role;
  encrypted_collection_key: string;
  key_wrap: KeyWrap;
}
interface CollectionRow {
  id: string;
  owner_id: string;
  encrypted_name: string;
}

export interface VaultSnapshot {
  items: VaultItem[];
  collections: Collection[];
  /** Rows that could not be decrypted (e.g. a share sealed to an old key). */
  failed: number;
}

const PAGE = 1000;

/** PostgREST caps responses, so page through large vaults. */
async function fetchAll<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const rows = check(await query(from, from + PAGE - 1)) ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

/**
 * All vault operations. Every secret is encrypted / decrypted here, on the client.
 * Shared by the web app and the extension's service worker.
 */
export class VaultService {
  private emailCache = new Map<string, string>();

  constructor(
    private readonly db: VaultClient,
    private readonly keys: UnlockedKeys,
  ) {
    this.emailCache.set(keys.userId, keys.email);
  }

  get userId() {
    return this.keys.userId;
  }

  // ---------------------------------------------------------------- load

  async load(): Promise<VaultSnapshot> {
    const uid = this.keys.userId;
    const [items, access, members, collectionRows] = await Promise.all([
      fetchAll<ItemRow>((a, b) =>
        this.db
          .from('items')
          .select('id, owner_id, collection_id, collection_item_key, encrypted_data, revision, updated_at')
          .order('id')
          .range(a, b),
      ),
      fetchAll<AccessRow>((a, b) =>
        this.db
          .from('item_access')
          .select('item_id, role, encrypted_item_key, key_wrap')
          .eq('user_id', uid)
          .order('item_id')
          .range(a, b),
      ),
      fetchAll<MemberRow>((a, b) =>
        this.db
          .from('collection_members')
          .select('collection_id, role, encrypted_collection_key, key_wrap')
          .eq('user_id', uid)
          .range(a, b),
      ),
      fetchAll<CollectionRow>((a, b) => this.db.from('collections').select('id, owner_id, encrypted_name').range(a, b)),
    ]);

    let failed = 0;
    const collections: Collection[] = [];
    const memberByCollection = new Map(members.map((m) => [m.collection_id, m]));
    for (const c of collectionRows) {
      const m = memberByCollection.get(c.id);
      if (!m) continue;
      try {
        const collectionKey = unwrapForMe(m.key_wrap, m.encrypted_collection_key, this.keys, {
          kind: 'collection',
          id: c.id,
        });
        collections.push({
          id: c.id,
          ownerId: c.owner_id,
          role: m.role,
          collectionKey,
          name: decryptCollectionName(c.id, collectionKey, c.encrypted_name),
        });
      } catch {
        failed++;
      }
    }
    const collectionById = new Map(collections.map((c) => [c.id, c]));
    const accessByItem = new Map(access.map((a) => [a.item_id, a]));

    const out: VaultItem[] = [];
    for (const row of items) {
      try {
        const direct = accessByItem.get(row.id);
        const coll = row.collection_id ? collectionById.get(row.collection_id) : undefined;
        let itemKey: Uint8Array | null = null;
        if (direct) {
          itemKey = unwrapForMe(direct.key_wrap, direct.encrypted_item_key, this.keys, { kind: 'item', id: row.id });
        } else if (coll && row.collection_item_key) {
          itemKey = unwrapItemKey(row.id, row.collection_item_key, coll.collectionKey);
        }
        if (!itemKey) throw new Error('no key');
        const collRole: Role | null = coll ? (coll.role === 'owner' ? 'admin' : coll.role) : null;
        const role = maxRole(row.owner_id === uid ? 'owner' : null, direct?.role, collRole) ?? 'viewer';
        out.push({
          id: row.id,
          ownerId: row.owner_id,
          collectionId: row.collection_id,
          role,
          source: row.owner_id === uid ? 'own' : coll ? 'collection' : 'shared',
          data: decryptItem(row.id, itemKey, row.encrypted_data),
          revision: row.revision,
          updatedAt: row.updated_at,
          itemKey,
        });
      } catch {
        failed++;
      }
    }

    await this.resolveEmails(out.map((i) => i.ownerId));
    for (const i of out) i.ownerEmail = this.emailCache.get(i.ownerId);
    return { items: out, collections, failed };
  }

  // ---------------------------------------------------------------- items

  /** Encrypts and stores new credentials (one or many, e.g. bulk import). */
  async createItems(
    datas: VaultItemData[],
    collection?: Collection | null,
    onProgress?: (done: number) => void,
  ): Promise<number> {
    const CHUNK = 100;
    let done = 0;
    for (let i = 0; i < datas.length; i += CHUNK) {
      const payload = datas.slice(i, i + CHUNK).map((data) => {
        const id = crypto.randomUUID();
        const itemKey = newItemKey();
        return {
          id,
          encrypted_data: encryptItem(id, itemKey, data),
          owner_item_key: wrapItemKey(id, itemKey, this.keys.userKey),
          collection_id: collection?.id ?? null,
          collection_item_key: collection ? wrapItemKey(id, itemKey, collection.collectionKey) : null,
        };
      });
      check(await this.db.rpc('create_items', { p_items: payload }));
      done += payload.length;
      onProgress?.(done);
    }
    return done;
  }

  /** Optimistic concurrency: fails if someone else saved a newer revision. */
  async updateItem(item: VaultItem, data: VaultItemData): Promise<void> {
    const res = await this.db
      .from('items')
      .update({ encrypted_data: encryptItem(item.id, item.itemKey, data) })
      .eq('id', item.id)
      .eq('revision', item.revision)
      .select('id');
    const rows = check(res);
    if (!rows || rows.length === 0) {
      throw new Error('This item was changed by someone else, or you no longer have edit rights. Reload and try again.');
    }
  }

  async deleteItem(itemId: string): Promise<void> {
    const rows = check(await this.db.from('items').delete().eq('id', itemId).select('id'));
    if (!rows?.length) throw new Error('Only the owner can delete this item.');
  }

  /** Move into a collection (wrap the item key with the collection key) or back out. */
  async moveItem(item: VaultItem, collection: Collection | null): Promise<void> {
    check(
      await this.db
        .from('items')
        .update({
          collection_id: collection?.id ?? null,
          collection_item_key: collection ? wrapItemKey(item.id, item.itemKey, collection.collectionKey) : null,
        })
        .eq('id', item.id),
    );
  }

  // ---------------------------------------------------------------- direct sharing

  async lookupUser(email: string): Promise<{ id: string; email: string; public_key: string }> {
    const rows = check(await this.db.rpc('lookup_user', { p_email: email })) as
      | { id: string; email: string; public_key: string }[]
      | null;
    const user = rows?.[0];
    if (!user) throw new Error(`No account found for ${email}. Ask them to sign up first.`);
    if (user.id === this.keys.userId) throw new Error("You can't share with yourself.");
    this.emailCache.set(user.id, user.email);
    return user;
  }

  /**
   * PRD §2 sharing protocol: the item key (which we already hold, decrypted) is sealed
   * to the recipient's public key. Only the recipient's private key can open it.
   */
  async shareItem(item: VaultItem, email: string, role: Role): Promise<void> {
    const user = await this.lookupUser(email);
    const { error } = await this.db.from('item_access').insert({
      item_id: item.id,
      user_id: user.id,
      role,
      encrypted_item_key: sealKeyFor(item.itemKey, user.public_key),
      key_wrap: 'public_key',
      granted_by: this.keys.userId,
    });
    if (error && (error as { code?: string }).code === '23505') {
      throw new Error(`${user.email} already has access. Change their role in the list below.`);
    }
    if (error) throw friendlyError(error);
  }

  async listItemGrantees(itemId: string): Promise<Grantee[]> {
    const rows = check(await this.db.from('item_access').select('user_id, role').eq('item_id', itemId)) as {
      user_id: string;
      role: Role;
    }[];
    await this.resolveEmails(rows.map((r) => r.user_id));
    return rows.map((r) => ({ userId: r.user_id, role: r.role, email: this.emailCache.get(r.user_id) ?? 'unknown' }));
  }

  async setItemGranteeRole(itemId: string, userId: string, role: Role): Promise<void> {
    const rows = check(
      await this.db.from('item_access').update({ role }).eq('item_id', itemId).eq('user_id', userId).select('item_id'),
    );
    if (!rows?.length) throw new Error("You don't have permission to do that.");
  }

  /** Revoke someone's access, or leave a share yourself (userId = me). */
  async revokeItemGrantee(itemId: string, userId: string): Promise<void> {
    const rows = check(
      await this.db.from('item_access').delete().eq('item_id', itemId).eq('user_id', userId).select('item_id'),
    );
    if (!rows?.length) throw new Error("You don't have permission to do that.");
  }

  // ---------------------------------------------------------------- collections

  async createCollection(name: string): Promise<void> {
    const id = crypto.randomUUID();
    const key = randomKey();
    check(
      await this.db.rpc('create_collection', {
        p_id: id,
        p_encrypted_name: encryptCollectionName(id, key, name),
        p_owner_key: wrapCollectionKey(id, key, this.keys.userKey),
      }),
    );
  }

  async renameCollection(collection: Collection, name: string): Promise<void> {
    check(
      await this.db
        .from('collections')
        .update({ encrypted_name: encryptCollectionName(collection.id, collection.collectionKey, name) })
        .eq('id', collection.id),
    );
  }

  /** Items fall back to their owners' personal vaults (FK ON DELETE SET NULL). */
  async deleteCollection(collectionId: string): Promise<void> {
    const rows = check(await this.db.from('collections').delete().eq('id', collectionId).select('id'));
    if (!rows?.length) throw new Error('Only the collection owner can delete it.');
  }

  async listMembers(collectionId: string): Promise<Grantee[]> {
    const rows = check(
      await this.db.from('collection_members').select('user_id, role').eq('collection_id', collectionId),
    ) as { user_id: string; role: Role }[];
    await this.resolveEmails(rows.map((r) => r.user_id));
    return rows.map((r) => ({ userId: r.user_id, role: r.role, email: this.emailCache.get(r.user_id) ?? 'unknown' }));
  }

  /** Grants a whole group access: the collection key is sealed to the new member. */
  async addMember(collection: Collection, email: string, role: Role): Promise<void> {
    const user = await this.lookupUser(email);
    const { error } = await this.db.from('collection_members').insert({
      collection_id: collection.id,
      user_id: user.id,
      role,
      encrypted_collection_key: sealKeyFor(collection.collectionKey, user.public_key),
      key_wrap: 'public_key',
      granted_by: this.keys.userId,
    });
    if (error && (error as { code?: string }).code === '23505') throw new Error(`${user.email} is already a member.`);
    if (error) throw friendlyError(error);
  }

  async setMemberRole(collectionId: string, userId: string, role: Role): Promise<void> {
    const rows = check(
      await this.db
        .from('collection_members')
        .update({ role })
        .eq('collection_id', collectionId)
        .eq('user_id', userId)
        .select('user_id'),
    );
    if (!rows?.length) throw new Error("You don't have permission to do that.");
  }

  async removeMember(collectionId: string, userId: string): Promise<void> {
    const rows = check(
      await this.db
        .from('collection_members')
        .delete()
        .eq('collection_id', collectionId)
        .eq('user_id', userId)
        .select('user_id'),
    );
    if (!rows?.length) throw new Error("You don't have permission to do that.");
  }

  // ---------------------------------------------------------------- helpers

  private async resolveEmails(ids: string[]): Promise<void> {
    const missing = [...new Set(ids)].filter((id) => !this.emailCache.has(id));
    if (!missing.length) return;
    const rows = check(await this.db.rpc('get_emails', { p_ids: missing })) as { id: string; email: string }[] | null;
    for (const r of rows ?? []) this.emailCache.set(r.id, r.email);
  }
}
