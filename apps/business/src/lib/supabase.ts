import 'react-native-url-polyfill/auto';
import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@cutsync/database';
import { Platform } from 'react-native';
import { secureSessionStorage } from './secure-storage';

const clean = (value?: string) => value?.trim().split(/[\r\n\t]+/).find(Boolean);
const url = clean(process.env.EXPO_PUBLIC_SUPABASE_URL);
const key = clean(process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

export const isSupabaseConfigured = Boolean(url && key);
export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(url!, key!, {
      auth: {
        storage: secureSessionStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        lock: processLock,
      },
    })
  : null;

export const shouldAutoRefresh = Platform.OS !== 'web';
