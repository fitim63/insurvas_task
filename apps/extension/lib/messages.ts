import { browser } from 'wxt/browser';
import type { Role, VaultItemData } from '@vault/core';

/**
 * Message protocol between extension contexts.
 *
 *  popup  ──(trusted)──▶  background  ◀──(untrusted)──  content script
 *
 * Content scripts live inside arbitrary web pages, so the background never trusts
 * a URL they claim: it uses `sender.url` / `sender.tab` from Chrome instead, and
 * only reveals a password for an item whose domain matches the requesting frame.
 */

export type VaultStatus = 'signedOut' | 'locked' | 'unlocked';

export interface PopupState {
  status: VaultStatus;
  email: string | null;
  hasPin: boolean;
  pinAttemptsLeft: number;
  autoLockMinutes: number;
  webUrl: string;
}

/** Item as handed to the popup (a trusted extension page). */
export interface PopupItem {
  id: string;
  data: VaultItemData;
  role: Role;
  source: 'own' | 'shared' | 'collection';
  ownerEmail?: string;
  /** Matches the active tab's site. */
  match: 'exact' | 'domain' | null;
}

/** Minimal info handed to a content script: never a password. */
export interface MatchSummary {
  id: string;
  title: string;
  username: string;
  shared: boolean;
}

export interface FillPayload {
  username: string;
  password: string;
}

export interface CapturePrompt {
  kind: 'save' | 'update';
  username: string;
  host: string;
  /** For updates: the title of the item being updated. */
  itemTitle?: string;
}

export type PopupRequest =
  | { type: 'popup:getState' }
  | { type: 'popup:login'; email: string; password: string }
  | { type: 'popup:unlock'; password: string }
  | { type: 'popup:unlockPin'; pin: string }
  | { type: 'popup:setPin'; pin: string }
  | { type: 'popup:clearPin' }
  | { type: 'popup:lock' }
  | { type: 'popup:logout' }
  | { type: 'popup:listItems'; tabUrl?: string; refresh?: boolean }
  | { type: 'popup:fill'; itemId: string; tabId: number }
  | { type: 'popup:setAutoLock'; minutes: number }
  | { type: 'popup:copied'; secret: boolean };

export type ContentRequest =
  | { type: 'cs:getMatches' }
  | { type: 'cs:fill'; itemId: string }
  | { type: 'cs:capture'; username: string; password: string }
  | { type: 'cs:noteUsername'; username: string }
  | { type: 'cs:getPrompt' }
  | { type: 'cs:promptAction'; action: 'save' | 'update' | 'never' | 'dismiss' }
  | { type: 'cs:openPopup' };

/** Background -> content script. */
export type TabMessage = { type: 'bg:fill'; payload: FillPayload };

export type Request = PopupRequest | ContentRequest;

export type Response<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

export async function send<T>(msg: Request): Promise<T> {
  const res = (await browser.runtime.sendMessage(msg)) as Response<T> | undefined;
  if (!res) throw new Error('No response from background');
  if (!res.ok) throw new Error(res.error);
  return res.data;
}
