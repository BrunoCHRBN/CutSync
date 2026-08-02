import { createClient } from '@supabase/supabase-js';
import type { Database } from '@cutsync/database';

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

const urlKey = ['EXPO', 'PUBLIC', 'SUPABASE', 'URL'].join('_');
const keyKey = ['EXPO', 'PUBLIC', 'SUPABASE', 'PUBLISHABLE', 'KEY'].join('_');

const configuredUrl = sanitizeEnvironmentValue(process.env[urlKey]);
const configuredKey = sanitizeEnvironmentValue(process.env[keyKey]);

export const isSupabaseConfigured = Boolean(isHttpUrl(configuredUrl) && configuredKey);

/** Public project host baked into the bundle — useful to confirm Homolog vs wrong env. */
export const supabaseProjectHost = isHttpUrl(configuredUrl)
  ? new URL(configuredUrl).host
  : null;

if (!isSupabaseConfigured) {
  console.warn(
    `Configure ${urlKey} e ${keyKey} com valores HTTP válidos no build da Vercel (Preview/Production).`,
  );
}

// Placeholder keeps static export bootable when secrets are absent.
// Auth UI must check isSupabaseConfigured before attempting sign-in.
const url: string = isHttpUrl(configuredUrl) ? configuredUrl : 'https://example.supabase.co';
const publishableKey: string = configuredKey && isSupabaseConfigured
  ? configuredKey
  : ['sb', 'publishable', 'missing', 'configuration'].join('_');

export const supabase = createClient<Database>(url, publishableKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});
