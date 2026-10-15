import {
  initCrypto,
  logIn,
  logOut,
  signUp,
  unlockWithPassword,
  VaultService,
  wipe,
  type Collection,
  type UnlockedKeys,
  type VaultItem,
} from '@vault/core';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

export type Status = 'booting' | 'signedOut' | 'locked' | 'unlocked';

interface VaultContextValue {
  status: Status;
  email: string | null;
  keys: UnlockedKeys | null;
  service: VaultService | null;
  items: VaultItem[];
  collections: Collection[];
  loading: boolean;
  signUp(email: string, password: string): Promise<{ needsEmailConfirmation: boolean }>;
  logIn(email: string, password: string): Promise<void>;
  unlock(password: string): Promise<void>;
  lock(): void;
  logOut(): Promise<void>;
  refresh(): Promise<void>;
  autoLockMinutes: number;
  setAutoLockMinutes(m: number): void;
}

const VaultContext = createContext<VaultContextValue | null>(null);

const AUTOLOCK_KEY = 'secure-vault:autolock-minutes';
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

export function VaultProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('booting');
  const [email, setEmail] = useState<string | null>(null);
  const [keys, setKeys] = useState<UnlockedKeys | null>(null);
  const [items, setItems] = useState<VaultItem[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoLockMinutes, setAutoLockState] = useState(() => Number(localStorage.getItem(AUTOLOCK_KEY) ?? 15));
  const lastActivity = useRef(Date.now());

  const service = useMemo(() => (keys ? new VaultService(supabase, keys) : null), [keys]);

  /** Drops every decrypted secret from memory. */
  const clearSecrets = useCallback(() => {
    setKeys((k) => {
      if (k) wipe(k.userKey, k.privateKey);
      return null;
    });
    setItems((prev) => {
      for (const i of prev) wipe(i.itemKey);
      return [];
    });
    setCollections([]);
  }, []);

  // Boot: initialise libsodium, then decide whether we're signed out or just locked.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await initCrypto();
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setEmail(data.session?.user.email ?? null);
      setStatus(data.session ? 'locked' : 'signedOut');
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        clearSecrets();
        setEmail(null);
        setStatus('signedOut');
      } else if (session?.user.email) {
        setEmail(session.user.email);
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [clearSecrets]);

  const refresh = useCallback(async () => {
    if (!service) return;
    setLoading(true);
    try {
      const snap = await service.load();
      setItems(snap.items);
      setCollections(snap.collections);
      if (snap.failed) toast.warning(`${snap.failed} entr${snap.failed === 1 ? 'y' : 'ies'} could not be decrypted`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load vault');
    } finally {
      setLoading(false);
    }
  }, [service]);

  useEffect(() => {
    if (service) void refresh();
  }, [service, refresh]);

  const becomeUnlocked = useCallback((k: UnlockedKeys) => {
    lastActivity.current = Date.now();
    setKeys(k);
    setEmail(k.email);
    setStatus('unlocked');
  }, []);

  const lock = useCallback(() => {
    clearSecrets();
    setStatus((s) => (s === 'unlocked' ? 'locked' : s));
  }, [clearSecrets]);

  // Auto-lock after N minutes without user activity.
  useEffect(() => {
    if (status !== 'unlocked' || autoLockMinutes <= 0) return;
    const onActivity = () => (lastActivity.current = Date.now());
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    const timer = setInterval(() => {
      if (Date.now() - lastActivity.current > autoLockMinutes * 60_000) {
        lock();
        toast.info('Vault locked after inactivity');
      }
    }, 10_000);
    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      clearInterval(timer);
    };
  }, [status, autoLockMinutes, lock]);

  const value: VaultContextValue = {
    status,
    email,
    keys,
    service,
    items,
    collections,
    loading,
    autoLockMinutes,
    setAutoLockMinutes: (m) => {
      localStorage.setItem(AUTOLOCK_KEY, String(m));
      setAutoLockState(m);
    },
    async signUp(e, pw) {
      const res = await signUp(supabase, e, pw);
      if (res.keys) becomeUnlocked(res.keys);
      return { needsEmailConfirmation: res.needsEmailConfirmation };
    },
    async logIn(e, pw) {
      becomeUnlocked(await logIn(supabase, e, pw));
    },
    async unlock(pw) {
      becomeUnlocked(await unlockWithPassword(supabase, pw));
    },
    lock,
    async logOut() {
      clearSecrets();
      await logOut(supabase);
    },
    refresh,
  };

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault(): VaultContextValue {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error('useVault must be used inside <VaultProvider>');
  return ctx;
}

/** Narrowed accessor for pages that only render while unlocked. */
export function useUnlockedVault() {
  const v = useVault();
  if (!v.service || !v.keys) throw new Error('Vault is locked');
  return { ...v, service: v.service, keys: v.keys };
}
