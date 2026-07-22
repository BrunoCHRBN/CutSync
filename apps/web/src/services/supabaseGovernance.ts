import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@cutsync/database';

function sanitizeEnv(raw: string | undefined): string | undefined {
  if (!raw) return raw;
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

export const supabaseGovernance = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {
        persistSession: false, // Sessão volátil mantida apenas em memória RAM
        autoRefreshToken: true,
        detectSessionInUrl: true, // Permite capturar e-mail confirm/magic links se necessário
      },
    })
  : (null as unknown as SupabaseClient<Database>);
