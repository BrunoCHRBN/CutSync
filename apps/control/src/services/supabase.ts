import { createClient } from '@supabase/supabase-js';
import type { Database } from '@cutsync/database';

import { controlTabSessionStorage } from './control-tab-session-storage';

function sanitizeEnvironmentValue(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim().replace(/[\r\n\t]+/g, '\n');
  if (value.includes('\n')) {
    return value.split('\n').map((part) => part.trim()).find(Boolean);
  }
  return value.split(/\s+/).find(Boolean);
}

function isHttpUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// Expo/Metro only inlines EXPO_PUBLIC_* with static process.env.NAME access.
// Dynamic keys like process.env[name] are left empty in the web export.
const configuredUrl = sanitizeEnvironmentValue(
  process.env.EXPO_PUBLIC_SUPABASE_URL, // pragma: allowlist secret
);
const configuredKey = sanitizeEnvironmentValue(
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, // pragma: allowlist secret
);

export const isSupabaseConfigured = Boolean(isHttpUrl(configuredUrl) && configuredKey);

/** Public project host baked into the bundle — useful to confirm Homolog vs wrong env. */
export const supabaseProjectHost = isHttpUrl(configuredUrl)
  ? new URL(configuredUrl).host
  : null;

if (!isSupabaseConfigured) {
  console.warn(
    'Configure EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY com valores HTTP válidos no build da Vercel (Preview/Production).', // pragma: allowlist secret
  );
}

// Placeholder keeps static export bootable when secrets are absent.
// Auth UI must check isSupabaseConfigured before attempting sign-in.
const url: string = isHttpUrl(configuredUrl) ? configuredUrl : 'https://example.supabase.co';
const publishableKey: string = configuredKey && isSupabaseConfigured
  ? configuredKey
  : 'sb_publishable_missing_configuration';

export const supabase = createClient<Database>(url, publishableKey, {
  auth: {
    storage: controlTabSessionStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});
