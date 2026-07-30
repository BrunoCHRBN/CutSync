import { createClient } from '@supabase/supabase-js';
import type { Database } from '@cutsync/database';

function sanitizeEnvironmentValue(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return raw.trim().split(/\s+/).find(Boolean);
}

const url = sanitizeEnvironmentValue(process.env.EXPO_PUBLIC_SUPABASE_URL);
const publishableKey = sanitizeEnvironmentValue(
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

if (!url || !publishableKey) {
  throw new Error(
    'Configure EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.',
  );
}

export const supabase = createClient<Database>(url, publishableKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});
