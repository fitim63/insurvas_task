import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import {
  can,
  createVaultClient,
  deserializeKeys,
  emptyItem,
  fromUtf8,
  hostnameOf,
  initCrypto,
  isFillableUrl,
  logIn,
  logOut,
  matchItems,
  matchUrl,
  protectWithPin,
  registrableDomain,
  serializeKeys,
  unlockWithPassword,
  unprotectWithPin,
  utf8,
  VaultService,
  wipe,
  type UnlockedKeys,
  type VaultClient,
  type VaultItem,
} from '@vault/core';
import type { Browser } from 'wxt/browser';
import type {
  CapturePrompt,
  ContentRequest,
  FillPayload,
  MatchSummary,
  PopupItem,
  PopupRequest,
  PopupState,
  Request,
  TabMessage,
  VaultStatus,
} from '@/lib/messages';
import { local, session, supabaseStorage } from '@/lib/storage';

type Sender = Browser.runtime.MessageSender;

const WEB_URL = import.meta.env.VITE_WEB_URL ?? 'http://localhost:5173';
const DEFAULT_AUTOLOCK_MIN = 15;
const PIN_MAX_ATTEMPTS = 5;
const CAPTURE_TTL_MS = 3 * 60_000;
const VAULT_CACHE_MS = 60_000;

export default defineBackground({
  type: 'module',
  main() {
    const db: VaultClient = createVaultClient({
      url: import.meta.env.VITE_SUPABASE_URL,
      anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      storage: supabaseStorage,
      storageKey: 'secure-vault-ext-auth',
    });
    const ready = initCrypto();

    // ------------------------------------------------------------ key + vault cache
    // In-memory caches vanish whenever Chrome suspends the service worker; the keys
    // are then restored from chrome.storage.session (memory-only, trusted contexts).

    let keys: UnlockedKeys | null = null;
    let service: VaultService | null = null;
    let items: VaultItem[] | null = null;
    let loadedAt = 0;
    let loading: Promise<VaultItem[]> | null = null;

    void browser.storage.session.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' });

    async function getKeys(): Promise<UnlockedKeys | null> {
      if (keys) return keys;
      const stored = await session.get('keys');
      if (!stored) return null;
      keys = deserializeKeys(stored);
      service = new VaultService(db, keys);
      return keys;
    }

    async function setUnlocked(k: UnlockedKeys) {
      keys = k;
      service = new VaultService(db, k);
      items = null;
      await session.set('keys', serializeKeys(k));
      await touch();
    }

    async function lock() {
      if (keys) wipe(keys.userKey, keys.privateKey);
      for (const i of items ?? []) wipe(i.itemKey);
      keys = null;
      service = null;
      items = null;
      await session.remove('keys');
    }

    async function status(): Promise<VaultStatus> {
      if (await getKeys()) return 'unlocked';
      const { data } = await db.auth.getSession();
      return data.session ? 'locked' : 'signedOut';
    }

    async function requireService(): Promise<VaultService> {
      await getKeys();
      if (!service) throw new Error('Vault is locked');
      return service;
    }

    async function getItems(maxAgeMs = VAULT_CACHE_MS): Promise<VaultItem[]> {
      const svc = await requireService();
      if (items && Date.now() - loadedAt < maxAgeMs) return items;
      loading ??= svc
        .load()
        .then((snap) => {
          items = snap.items;
          loadedAt = Date.now();
          return snap.items;
        })
        .finally(() => (loading = null));
      return loading;
    }

    const touch = () => session.set('lastActivity', Date.now());

    // ------------------------------------------------------------ auto-lock

    async function checkAutoLock() {
      if (!(await session.get('keys'))) return;
      const minutes = (await local.get('autoLockMinutes')) ?? DEFAULT_AUTOLOCK_MIN;
      const last = (await session.get('lastActivity')) ?? 0;
      if (Date.now() - last > minutes * 60_000) await lock();
    }

    browser.alarms.create('autolock', { periodInMinutes: 0.5 });
    browser.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === 'autolock') void checkAutoLock();
      if (alarm.name === 'clear-clipboard') void clearClipboard();
    });
    // Lock immediately when the OS screen locks.
    browser.idle.onStateChanged.addListener((state) => {
      if (state === 'locked') void lock();
    });
    browser.tabs.onRemoved.addListener((tabId) => void dropTabState(tabId));

    // ------------------------------------------------------------ clipboard clearing

    async function clearClipboard() {
      try {
        const contexts = await browser.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT' as Browser.runtime.ContextType] });
        if (!contexts.length) {
          await browser.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['CLIPBOARD' as Browser.offscreen.Reason],
            justification: 'Clear a copied password from the clipboard',
          });
        }
        await browser.runtime.sendMessage({ type: 'offscreen:clearClipboard' });
      } catch (e) {
        console.warn('clipboard clear failed', e);
      }
    }

    // ------------------------------------------------------------ PIN

    async function pinState() {
      const pin = await session.get('pin');
      return { hasPin: !!pin, attemptsLeft: pin ? PIN_MAX_ATTEMPTS - pin.attempts : 0 };
    }

    async function unlockWithPin(pin: string) {
      const env = await session.get('pin');
      if (!env) throw new Error('PIN unlock is not available. Use your master password.');
      try {
        const k = deserializeKeys(JSON.parse(fromUtf8(unprotectWithPin(pin, env))));
        await session.set('pin', { ...env, attempts: 0 });
        await setUnlocked(k);
      } catch {
        const attempts = env.attempts + 1;
        if (attempts >= PIN_MAX_ATTEMPTS) {
          await session.remove('pin');
          throw new Error('Too many wrong PINs. Unlock with your master password.');
        }
        await session.set('pin', { ...env, attempts });
        throw new Error(`Wrong PIN (${PIN_MAX_ATTEMPTS - attempts} attempts left)`);
      }
    }

    // ------------------------------------------------------------ capture (save / update prompts)

    async function dropTabState(tabId: number) {
      const captures = (await session.get('captures')) ?? {};
      const usernames = (await session.get('usernames')) ?? {};
      delete captures[tabId];
      delete usernames[tabId];
      await session.set('captures', captures);
      await session.set('usernames', usernames);
    }

    async function capture(sender: Sender, username: string, password: string) {
      const tabId = sender.tab?.id;
      const url = sender.url;
      if (tabId === undefined || !isFillableUrl(url) || !password) return;
      const site = registrableDomain(url);
      if (site && ((await local.get('neverSave')) ?? []).includes(site)) return;
      if (!username) {
        // Two-step login: username was entered on a previous page of the same site.
        const prev = (await session.get('usernames'))?.[tabId];
        if (prev && registrableDomain(prev.url) === site && Date.now() - prev.at < CAPTURE_TTL_MS) username = prev.username;
      }
      const captures = (await session.get('captures')) ?? {};
      captures[tabId] = { tabId, url, username, password, createdAt: Date.now() };
      await session.set('captures', captures);
    }

    async function noteUsername(sender: Sender, username: string) {
      const tabId = sender.tab?.id;
      if (tabId === undefined || !isFillableUrl(sender.url) || !username) return;
      const usernames = (await session.get('usernames')) ?? {};
      usernames[tabId] = { username, url: sender.url, at: Date.now() };
      await session.set('usernames', usernames);
    }

    /** Finds the vault item a capture would update (same site + same username). */
    function findExisting(all: VaultItem[], url: string, username: string) {
      return matchItems(all, url, (i) => i.data.url).find((i) => i.data.username.toLowerCase() === username.toLowerCase());
    }

    async function getPrompt(sender: Sender): Promise<(CapturePrompt & { locked: boolean }) | null> {
      const tabId = sender.tab?.id;
      if (tabId === undefined || sender.frameId !== 0 || !isFillableUrl(sender.url)) return null;
      const cap = (await session.get('captures'))?.[tabId];
      if (!cap) return null;
      if (Date.now() - cap.createdAt > CAPTURE_TTL_MS || registrableDomain(cap.url) !== registrableDomain(sender.url)) {
        await dropTabState(tabId);
        return null;
      }
      const host = hostnameOf(cap.url) ?? '';
      if ((await status()) !== 'unlocked') return { kind: 'save', username: cap.username, host, locked: true };

      const existing = findExisting(await getItems(), cap.url, cap.username);
      if (!existing) return { kind: 'save', username: cap.username, host, locked: false };
      if (existing.data.password === cap.password || !can.edit(existing.role)) {
        await dropTabState(tabId); // nothing to do (or not allowed to update)
        return null;
      }
      return { kind: 'update', username: cap.username, host, itemTitle: existing.data.title, locked: false };
    }

    async function promptAction(sender: Sender, action: 'save' | 'update' | 'never' | 'dismiss') {
      const tabId = sender.tab?.id;
      if (tabId === undefined) return;
      const cap = (await session.get('captures'))?.[tabId];
      if (!cap) return;
      if (action === 'never') {
        const site = registrableDomain(cap.url);
        const list = (await local.get('neverSave')) ?? [];
        if (site && !list.includes(site)) await local.set('neverSave', [...list, site]);
      } else if (action === 'save') {
        const svc = await requireService();
        const host = hostnameOf(cap.url) ?? cap.url;
        await svc.createItems([
          { ...emptyItem(), title: host.replace(/^www\./, ''), url: new URL(cap.url).origin, username: cap.username, password: cap.password },
        ]);
        items = null;
      } else if (action === 'update') {
        const svc = await requireService();
        const existing = findExisting(await getItems(0), cap.url, cap.username);
        if (!existing) throw new Error('The item no longer exists');
        await svc.updateItem(existing, { ...existing.data, password: cap.password });
        items = null;
      }
      await touch();
      await dropTabState(tabId);
    }

    // ------------------------------------------------------------ autofill

    async function getMatches(sender: Sender): Promise<{ locked: boolean; matches: MatchSummary[] }> {
      if (!isFillableUrl(sender.url)) return { locked: false, matches: [] };
      if ((await status()) !== 'unlocked') return { locked: true, matches: [] };
      await touch();
      // Match against the *frame's* URL (from Chrome, not the page), so a third-party
      // iframe never sees credentials for the site that embeds it.
      const matches = matchItems(await getItems(), sender.url, (i) => i.data.url);
      return {
        locked: false,
        matches: matches.map((i) => ({ id: i.id, title: i.data.title, username: i.data.username, shared: i.source !== 'own' })),
      };
    }

    async function fillFor(itemId: string, url: string | undefined): Promise<FillPayload> {
      const item = (await getItems()).find((i) => i.id === itemId);
      if (!item) throw new Error('Item not found');
      if (!url || !isFillableUrl(url) || !matchUrl(item.data.url, url)) {
        throw new Error(`This login is for ${hostnameOf(item.data.url) ?? 'another site'}. It won't be filled here.`);
      }
      await touch();
      return { username: item.data.username, password: item.data.password };
    }

    async function popupFill(itemId: string, tabId: number) {
      const tab = await browser.tabs.get(tabId);
      const payload = await fillFor(itemId, tab.url);
      const msg: TabMessage = { type: 'bg:fill', payload };
      // Top frame only: never broadcast a password to (possibly cross-origin) iframes.
      try {
        await browser.tabs.sendMessage(tabId, msg, { frameId: 0 });
      } catch {
        // Tab was open before the extension was installed: inject, then retry.
        await browser.scripting.executeScript({ target: { tabId, frameIds: [0] }, files: ['/content-scripts/content.js'] });
        await browser.tabs.sendMessage(tabId, msg, { frameId: 0 });
      }
    }

    // ------------------------------------------------------------ popup

    async function popupState(): Promise<PopupState> {
      const st = await status();
      const pin = await pinState();
      const { data } = await db.auth.getSession();
      return {
        status: st,
        email: keys?.email ?? data.session?.user.email ?? null,
        hasPin: pin.hasPin,
        pinAttemptsLeft: pin.attemptsLeft,
        autoLockMinutes: (await local.get('autoLockMinutes')) ?? DEFAULT_AUTOLOCK_MIN,
        webUrl: WEB_URL,
      };
    }

    async function listItems(tabUrl: string | undefined, refresh: boolean): Promise<PopupItem[]> {
      const all = await getItems(refresh ? 0 : VAULT_CACHE_MS);
      await touch();
      return all.map((i) => ({
        id: i.id,
        data: i.data,
        role: i.role,
        source: i.source,
        ownerEmail: i.ownerEmail,
        match: tabUrl && isFillableUrl(tabUrl) ? matchUrl(i.data.url, tabUrl) : null,
      }));
    }

    async function handlePopup(msg: PopupRequest): Promise<unknown> {
      switch (msg.type) {
        case 'popup:getState':
          return popupState();
        case 'popup:login':
          await setUnlocked(await logIn(db, msg.email, msg.password));
          return popupState();
        case 'popup:unlock':
          await setUnlocked(await unlockWithPassword(db, msg.password));
          return popupState();
        case 'popup:unlockPin':
          if ((await status()) === 'signedOut') throw new Error('Session expired. Log in again.');
          await unlockWithPin(msg.pin);
          return popupState();
        case 'popup:setPin': {
          const k = await getKeys();
          if (!k) throw new Error('Unlock first');
          if (!/^\d{4,8}$/.test(msg.pin)) throw new Error('PIN must be 4–8 digits');
          await session.set('pin', { ...protectWithPin(msg.pin, utf8(JSON.stringify(serializeKeys(k)))), attempts: 0 });
          return popupState();
        }
        case 'popup:clearPin':
          await session.remove('pin');
          return popupState();
        case 'popup:lock':
          await lock();
          return popupState();
        case 'popup:logout':
          await lock();
          await session.remove('pin', 'captures', 'usernames');
          await logOut(db);
          return popupState();
        case 'popup:listItems':
          return listItems(msg.tabUrl, !!msg.refresh);
        case 'popup:fill':
          return popupFill(msg.itemId, msg.tabId);
        case 'popup:setAutoLock':
          await local.set('autoLockMinutes', msg.minutes);
          return popupState();
        case 'popup:copied':
          await touch();
          if (msg.secret) browser.alarms.create('clear-clipboard', { when: Date.now() + 30_000 });
          return null;
      }
    }

    async function handleContent(msg: ContentRequest, sender: Sender): Promise<unknown> {
      switch (msg.type) {
        case 'cs:getMatches':
          return getMatches(sender);
        case 'cs:fill':
          return fillFor(msg.itemId, sender.url);
        case 'cs:capture':
          return capture(sender, msg.username, msg.password);
        case 'cs:noteUsername':
          return noteUsername(sender, msg.username);
        case 'cs:getPrompt':
          return getPrompt(sender);
        case 'cs:promptAction':
          return promptAction(sender, msg.action);
        case 'cs:openPopup':
          // Requires a user gesture in some Chrome versions; ignore failures.
          return browser.action.openPopup().catch(() => null);
      }
    }

    // ------------------------------------------------------------ router

    const extensionOrigin = browser.runtime.getURL('');

    browser.runtime.onMessage.addListener((raw, sender, sendResponse) => {
      const msg = raw as Request;
      if (typeof msg?.type !== 'string' || sender.id !== browser.runtime.id) return false;
      // Content scripts always report the host page's URL, so the sender origin is
      // what separates our own pages (popup, even when opened in a tab) from them.
      const fromExtensionPage = !!sender.url?.startsWith(extensionOrigin);
      let handler: Promise<unknown>;
      if (msg.type.startsWith('popup:')) {
        if (!fromExtensionPage) return false; // content scripts may not use popup APIs
        handler = ready.then(() => handlePopup(msg as PopupRequest));
      } else if (msg.type.startsWith('cs:')) {
        if (!sender.tab || fromExtensionPage) return false;
        handler = ready.then(() => handleContent(msg as ContentRequest, sender));
      } else {
        return false;
      }
      handler.then(
        (data) => sendResponse({ ok: true, data: data ?? null }),
        (err: unknown) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      );
      return true;
    });
  },
});
