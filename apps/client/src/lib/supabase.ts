import 'react-native-url-polyfill/auto';

import type { Database } from '@cutsync/database';
import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { secureSessionStorage } from './secure-session-storage';

const sanitizePublicValue = (raw: string | undefined) => {
  if (!raw) return undefined;
  return raw.trim().split(/[\r\n\t]+/).map((part) => part.trim()).find(Boolean);
};

const supabaseUrl = sanitizePublicValue(process.env.EXPO_PUBLIC_SUPABASE_URL);
const supabasePublicKey = sanitizePublicValue(
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
);

const memoryValues = new Map<string, string>();
const memoryStorage = {
  getItem: async (key: string) => memoryValues.get(key) ?? null,
  setItem: async (key: string, value: string) => { memoryValues.set(key, value); },
  removeItem: async (key: string) => { memoryValues.delete(key); },
};

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublicKey);

export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl as string, supabasePublicKey as string, {
      auth: {
        storage: Platform.OS === 'web' ? memoryStorage : secureSessionStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        lock: processLock,
      },
    })
  : null;
