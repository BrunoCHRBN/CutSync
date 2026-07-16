import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { Establishment, mapEstablishment } from '../types/database';

export function useEstablishment(identifier?: string | null, mode: 'id' | 'slug' = 'id') {
  const [establishment, setEstablishment] = useState<Establishment | null>(null);
  const [loading, setLoading] = useState(Boolean(identifier));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!identifier) { setEstablishment(null); setLoading(false); return null; }
    setLoading(true);
    const { data, error: queryError } = await supabase.from('establishments').select('*').eq(mode, identifier).maybeSingle();
    setError(queryError?.message || null);
    const mapped = data ? mapEstablishment(data) : null;
    setEstablishment(mapped);
    setLoading(false);
    return mapped;
  }, [identifier, mode]);

  useEffect(() => {
    void refresh();
    if (!identifier) return;
    const filter = mode === 'id' ? `id=eq.${identifier}` : `slug=eq.${identifier}`;
    const channel = supabase.channel(`establishment-${mode}-${identifier}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'establishments', filter }, refresh)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [identifier, mode, refresh]);

  return { establishment, loading, error, refresh };
}