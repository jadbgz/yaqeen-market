import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { secureAuthStorage } from '@/lib/secure-auth-storage';

let singleton: SupabaseClient | null | undefined;

export function getMobileSupabase() {
  if (singleton !== undefined) return singleton;
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return (singleton = null);
  try {
    new URL(url);
  } catch {
    return (singleton = null);
  }
  singleton = createClient(url, publishableKey, {
    auth: {
      storage: secureAuthStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  return singleton;
}
