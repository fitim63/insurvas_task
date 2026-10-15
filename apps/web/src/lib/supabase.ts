import { createVaultClient } from '@vault/core';

export const supabase = createVaultClient({
  url: import.meta.env.VITE_SUPABASE_URL,
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
});
