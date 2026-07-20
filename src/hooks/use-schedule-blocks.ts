import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { supabase } from '../services/supabase';

export interface ScheduleBlock {
  id: string;
  establishmentId: string;
  professionalId: string;
  startsAt: Date;
  endsAt: Date;
  kind: 'break' | 'time_off' | 'blocked';
  reason: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface UseScheduleBlocksOptions {
  establishmentId?: string | null;
  professionalId?: string | null;
  rangeStart?: Date | null;
  rangeEnd?: Date | null;
  enabled?: boolean;
}

const errorMessage = (message: string) => {
  if (message.includes('forbidden')) return 'Você não tem permissão para consultar estes bloqueios.';
  if (message.includes('invalid_schedule_block_range')) return 'O intervalo de bloqueios é inválido.';
  return 'Não foi possível carregar os bloqueios da agenda.';
};

export function useScheduleBlocks({
  establishmentId,
  professionalId,
  rangeStart,
  rangeEnd,
  enabled = true,
}: UseScheduleBlocksOptions) {
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const requestId = useRef(0);
  const instanceId = useId().replace(/:/g, '');
  const rangeStartIso = rangeStart?.toISOString() || null;
  const rangeEndIso = rangeEnd?.toISOString() || null;

  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current;
    if (!enabled || !establishmentId || !rangeStartIso || !rangeEndIso) {
      setBlocks([]);
      setError(null);
      setLoading(false);
      return [];
    }

    setLoading(true);
    const { data, error: queryError } = await supabase.rpc('get_schedule_blocks', {
      target_establishment_id: establishmentId,
      target_professional_id: professionalId || null,
      range_start: rangeStartIso,
      range_end: rangeEndIso,
    });
    if (currentRequest !== requestId.current) return null;

    if (queryError) {
      const rpcMissing = queryError.code === 'PGRST202'
        || queryError.message.includes('get_schedule_blocks') && queryError.message.includes('schema cache');
      if (rpcMissing) {
        setBlocks([]);
        setError(null);
        setSupported(false);
        setLoading(false);
        return [];
      }
      console.error('[useScheduleBlocks] Falha ao consultar bloqueios:', queryError);
      setBlocks([]);
      setError(errorMessage(queryError.message));
      setLoading(false);
      return null;
    }

    const mapped = (data || []).map((block) => ({
      id: block.id,
      establishmentId: block.establishment_id,
      professionalId: block.professional_id,
      startsAt: new Date(block.starts_at),
      endsAt: new Date(block.ends_at),
      kind: block.kind as ScheduleBlock['kind'],
      reason: block.reason,
      createdBy: block.created_by,
      createdAt: new Date(block.created_at),
      updatedAt: new Date(block.updated_at),
    }));
    setBlocks(mapped);
    setError(null);
    setSupported(true);
    setLoading(false);
    return mapped;
  }, [enabled, establishmentId, professionalId, rangeEndIso, rangeStartIso]);

  useEffect(() => {
    void refresh();
    if (!enabled || !establishmentId || !rangeStartIso || !rangeEndIso) {
      return () => { requestId.current += 1; };
    }

    const channel = supabase
      .channel(`schedule-blocks-${establishmentId}-${professionalId || 'team'}-${instanceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'schedule_blocks', filter: `establishment_id=eq.${establishmentId}` },
        () => { void refresh(); },
      )
      .subscribe();

    return () => {
      requestId.current += 1;
      void supabase.removeChannel(channel);
    };
  }, [enabled, establishmentId, instanceId, professionalId, rangeEndIso, rangeStartIso, refresh]);

  return { blocks, loading, error, supported, refresh };
}
