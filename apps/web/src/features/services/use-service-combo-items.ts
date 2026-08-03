import { useCallback, useEffect, useState } from 'react';
import { mapServiceComboItem, ServiceComboItemRecord } from '@cutsync/database';
import { supabase } from '../../services/supabase';

export function useServiceComboItems(establishmentId?: string | null) {
  const [items, setItems] = useState<ServiceComboItemRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!establishmentId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: services, error: servicesError } = await supabase
        .from('services')
        .select('id')
        .eq('establishment_id', establishmentId)
        .eq('kind', 'combo')
        .is('deleted_at', null);
      if (servicesError) throw servicesError;
      const comboIds = (services || []).map((row) => row.id);
      if (!comboIds.length) {
        setItems([]);
        return;
      }
      const { data, error } = await supabase
        .from('service_combo_items')
        .select('id, combo_id, service_id, sort_order')
        .in('combo_id', comboIds)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      setItems((data || []).map(mapServiceComboItem));
    } catch (error) {
      console.error('[useServiceComboItems]', error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [establishmentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { items, loading, refresh };
}
