export const CATEGORIES = ['work', 'personal', 'social', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  work: 'Work',
  personal: 'Personal',
  social: 'Social',
  other: 'Other',
};

/** The plaintext of a credential. Only ever exists on the client. */
export interface VaultItemData {
  title: string;
  username: string;
  password: string;
  url: string;
  category: Category;
  notes: string;
  /** otpauth:// URI or bare base32 secret. */
  totp: string;
}

export const emptyItem = (): VaultItemData => ({
  title: '',
  username: '',
  password: '',
  url: '',
  category: 'personal',
  notes: '',
  totp: '',
});

/** Ordered lowest -> highest, mirroring the Postgres enum. */
export const ROLES = ['viewer', 'editor', 'admin', 'owner'] as const;
export type Role = (typeof ROLES)[number];

export type ItemSource = 'own' | 'shared' | 'collection';

/** A decrypted vault entry plus the metadata the UI needs. */
export interface VaultItem {
  id: string;
  ownerId: string;
  ownerEmail?: string;
  collectionId: string | null;
  /** Effective role: max(direct share, collection membership). */
  role: Role;
  source: ItemSource;
  data: VaultItemData;
  revision: number;
  updatedAt: string;
  /** Item key, kept in memory to allow edits / re-sharing without another unwrap. */
  itemKey: Uint8Array;
}

export interface Collection {
  id: string;
  name: string;
  ownerId: string;
  role: Role;
  collectionKey: Uint8Array;
}

export interface Grantee {
  userId: string;
  email: string;
  role: Role;
}
