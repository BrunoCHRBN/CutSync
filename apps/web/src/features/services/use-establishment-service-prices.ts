import { useCallback, useEffect, useState } from 'react';
import { formatCalendarDate } from '@cutsync/domain';
import { supabase } from '../../services/supabase';

export interface EstablishmentServicePrice {
  serviceId: string;
  kind: 'single' | 'combo';
  name: string;
  listPrice: number;
  effectivePrice: number;
  durationMinutes: number;
  discountType: 'percent' | 'fixed_price' | null;
  discountValue: number | null;
  promotionId: string | null;
  savings: number;
  membersTotal: number | null;
  isActive: boolean;
  sortOrder: number;
}

export function useEstablishmentServicePrices(
  establishmentId?: string | null,
  date: Date = new Date(),
) {
  const [prices, setPrices] = useState<EstablishmentServicePrice[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!establishmentId) {
      setPrices([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('list_establishment_service_prices', {
        target_establishment_id: establishmentId,
        target_local_date: formatCalendarDate(date),
      });
      if (error) throw error;
      setPrices((data || []).map((row) => ({
        serviceId: row.service_id,
        kind: row.kind === 'combo' ? 'combo' : 'single',
        name: row.name,
        listPrice: Number(row.list_price),
        effectivePrice: Number(row.effective_price),
        durationMinutes: Number(row.duration_minutes),
        discountType: row.discount_type === 'fixed_price' || row.discount_type === 'percent'
          ? row.discount_type
          : null,
        discountValue: row.discount_value == null ? null : Number(row.discount_value),
        promotionId: row.promotion_id,
        savings: Number(row.savings || 0),
        membersTotal: row.members_total == null ? null : Number(row.members_total),
        isActive: Boolean(row.is_active),
        sortOrder: Number(row.sort_order || 0),
      })));
    } catch (error) {
      console.error('[useEstablishmentServicePrices]', error);
      setPrices([]);
    } finally {
      setLoading(false);
    }
  }, [date, establishmentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { prices, loading, refresh };
}
