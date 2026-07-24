import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';

export interface AdminReportFilterOption {
  id: string;
  name: string;
}

export function useAdminReportFilterOptions(establishmentId?: string | null) {
  const [professionals, setProfessionals] = useState<AdminReportFilterOption[]>([]);
  const [services, setServices] = useState<AdminReportFilterOption[]>([]);

  const refresh = useCallback(async () => {
    if (!establishmentId) {
      setProfessionals([]);
      setServices([]);
      return;
    }
    const [{ data: serviceRows }, { data: membershipRows }] = await Promise.all([
      supabase.from('services').select('id,name').eq('establishment_id', establishmentId).order('name'),
      supabase.from('memberships').select('profile_id,profiles!memberships_profile_id_fkey(name)')
        .eq('establishment_id', establishmentId).eq('status', 'active').in('role', ['professional', 'admin']),
    ]);
    setServices((serviceRows || []).map((item: any) => ({ id: item.id, name: item.name })));
    setProfessionals((membershipRows || []).map((item: any) => ({
      id: item.profile_id,
      name: item.profiles?.name || 'Profissional',
    })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
  }, [establishmentId]);

  useEffect(() => { void refresh(); }, [refresh]);
  return { professionals, services, refresh };
}
