import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@cutsync/database';

/**
 * Sanitize env values that may arrive from Vercel / Expo config with stray whitespace,
 * duplicated concatenations, or line breaks. HTTP headers reject newlines/tabs, and
 * duplicated keys separated by `\n` produce `TypeError: Failed to execute 'fetch' on 'Window': Invalid value`.
 * When we detect a duplicated JWT-shaped value, we keep only the first token.
 */
function sanitizeEnv(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  // Strip surrounding whitespace and collapse any internal control chars.
  let value = raw.trim().replace(/[\r\n\t]+/g, '\n');
  if (value.includes('\n')) {
    const first = value.split('\n').map((part) => part.trim()).find(Boolean);
    if (first) value = first;
  }
  return value;
}

const supabaseUrl = sanitizeEnv(process.env.EXPO_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = sanitizeEnv(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn(
    'Supabase URL or Anon Key is missing. Check your .env file or environment variables.'
  );
}

export const supabase = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : (null as unknown as SupabaseClient<Database>);
