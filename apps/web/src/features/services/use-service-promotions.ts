import { useCallback, useEffect, useState } from 'react';
import { mapServicePromotion, ServicePromotionRecord } from '@cutsync/database';
import { supabase } from '../../services/supabase';

export function useServicePromotions(establishmentId?: string | null) {
  const [promotions, setPromotions] = useState<ServicePromotionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!establishmentId) {
      setPromotions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('service_promotions')
        .select('id, establishment_id, service_id, days_of_week, discount_type, value, starts_at, ends_at, is_active')
        .eq('establishment_id', establishmentId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setPromotions((data || []).map(mapServicePromotion));
    } catch (error) {
      console.error('[useServicePromotions]', error);
      setPromotions([]);
    } finally {
      setLoading(false);
    }
  }, [establishmentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { promotions, loading, refresh };
}
