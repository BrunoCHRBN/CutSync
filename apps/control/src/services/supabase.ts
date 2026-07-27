import { createClient } from '@supabase/supabase-js';

function sanitizeEnvironmentValue(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return raw.trim().split(/\s+/).find(Boolean);
}

const url = sanitizeEnvironmentValue(process.env.EXPO_PUBLIC_SUPABASE_URL);
const anonKey = sanitizeEnvironmentValue(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

if (!url || !anonKey) {
  throw new Error('Configure EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY.');
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});
