import { createClient, type SupabaseClient, type SupportedStorage } from '@supabase/supabase-js';

export type VaultClient = SupabaseClient;
export type { SupportedStorage };

export interface ClientConfig {
  url: string;
  anonKey: string;
  /** Custom session storage (the extension service worker has no localStorage). */
  storage?: SupportedStorage;
  storageKey?: string;
}

export function createVaultClient(config: ClientConfig): VaultClient {
  const { anonKey, storageKey } = config;
  // Accept the dashboard's REST endpoint too (https://<ref>.supabase.co/rest/v1/).
  const url = config.url?.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
  if (!url || !anonKey) throw new Error('Supabase URL / anon key missing: check your .env file');
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storage: config.storage,
      storageKey: storageKey ?? 'secure-vault-auth',
    },
  });
}

/** Turns PostgREST / auth errors into user-facing messages. */
export function friendlyError(err: unknown): Error {
  const e = err as { message?: string; code?: string };
  const msg = e?.message ?? String(err);
  if (e?.code === '42501' || /row-level security|permission denied/i.test(msg)) {
    return new Error("You don't have permission to do that.");
  }
  if (e?.code === '23505') return new Error('That already exists.');
  if (/invalid login credentials/i.test(msg)) return new Error('Wrong email or master password.');
  if (/user already registered/i.test(msg)) return new Error('An account with this email already exists.');
  if (/failed to fetch|networkerror/i.test(msg)) return new Error('Cannot reach the server. Check your connection.');
  return err instanceof Error ? err : new Error(msg);
}

export function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw friendlyError(res.error);
  return res.data;
}
