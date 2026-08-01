import { useLocalSearchParams } from 'expo-router';

export interface EstablishmentRouteParams {
  by: 'id' | 'slug';
  identifier?: string;
  slug?: string;
  barbershopId?: string;
  rescheduleId?: string;
}

export function useEstablishmentRouteParams(): EstablishmentRouteParams {
  const params = useLocalSearchParams<{
    barbershopId?: string | string[];
    slug?: string | string[];
    reschedule_id?: string | string[];
  }>();

  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const barbershopId = Array.isArray(params.barbershopId) ? params.barbershopId[0] : params.barbershopId;
  const rescheduleId = Array.isArray(params.reschedule_id) ? params.reschedule_id[0] : params.reschedule_id;

  if (slug) {
    return { by: 'slug', identifier: slug, slug, barbershopId, rescheduleId };
  }

  return { by: 'id', identifier: barbershopId, slug, barbershopId, rescheduleId };
}
