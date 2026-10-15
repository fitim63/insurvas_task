import { browser } from 'wxt/browser';
import type { PinEnvelope, SerializedKeys, SupportedStorage } from '@vault/core';

/**
 * chrome.storage.local: survives restarts, so it only ever holds non-secret data
 *   (Supabase auth tokens, settings). Never keys or plaintext.
 * chrome.storage.session: in memory only, wiped when the browser closes, and
 *   restricted to trusted extension contexts (content scripts cannot read it).
 *   It holds the unlocked keys so the MV3 service worker can be suspended
 *   without locking the vault.
 */

export interface PendingCapture {
  tabId: number;
  url: string;
  username: string;
  password: string;
  createdAt: number;
}

interface SessionShape {
  keys?: SerializedKeys;
  lastActivity?: number;
  pin?: PinEnvelope & { attempts: number };
  /** Keyed by tab id. */
  captures?: Record<string, PendingCapture>;
  /** Username typed on step 1 of a two-step login, keyed by tab id. */
  usernames?: Record<string, { username: string; url: string; at: number }>;
}

interface LocalShape {
  autoLockMinutes?: number;
  neverSave?: string[];
}

export const session = {
  async get<K extends keyof SessionShape>(key: K): Promise<SessionShape[K]> {
    return (await browser.storage.session.get(key))[key] as SessionShape[K];
  },
  async set<K extends keyof SessionShape>(key: K, value: SessionShape[K]): Promise<void> {
    await browser.storage.session.set({ [key]: value });
  },
  async remove(...keys: (keyof SessionShape)[]): Promise<void> {
    await browser.storage.session.remove(keys);
  },
};

export const local = {
  async get<K extends keyof LocalShape>(key: K): Promise<LocalShape[K]> {
    return (await browser.storage.local.get(key))[key] as LocalShape[K];
  },
  async set<K extends keyof LocalShape>(key: K, value: LocalShape[K]): Promise<void> {
    await browser.storage.local.set({ [key]: value });
  },
};

/** Supabase auth session persistence for the service worker (no localStorage there). */
export const supabaseStorage: SupportedStorage = {
  async getItem(key) {
    return ((await browser.storage.local.get(key))[key] as string | undefined) ?? null;
  },
  async setItem(key, value) {
    await browser.storage.local.set({ [key]: value });
  },
  async removeItem(key) {
    await browser.storage.local.remove(key);
  },
};
