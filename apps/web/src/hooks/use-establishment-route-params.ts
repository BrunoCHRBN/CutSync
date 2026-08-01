import { useLocalSearchParams } from 'expo-router';

export interface EstablishmentRouteParams {
  by: 'id' | 'slug';
  identifier?: string;
  slug?: string;
  barbershopId?: string;
  rescheduleId?: string;
  initialProfessionalId?: string;
  initialServiceId?: string;
}

export function useEstablishmentRouteParams(): EstablishmentRouteParams {
  const params = useLocalSearchParams<{
    barbershopId?: string | string[];
    slug?: string | string[];
    reschedule_id?: string | string[];
    professionalId?: string | string[];
    serviceId?: string | string[];
  }>();

  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const barbershopId = Array.isArray(params.barbershopId) ? params.barbershopId[0] : params.barbershopId;
  const rescheduleId = Array.isArray(params.reschedule_id) ? params.reschedule_id[0] : params.reschedule_id;
  const initialProfessionalId = Array.isArray(params.professionalId) ? params.professionalId[0] : params.professionalId;
  const initialServiceId = Array.isArray(params.serviceId) ? params.serviceId[0] : params.serviceId;

  if (slug) {
    return { by: 'slug', identifier: slug, slug, barbershopId, rescheduleId, initialProfessionalId, initialServiceId };
  }

  return { by: 'id', identifier: barbershopId, slug, barbershopId, rescheduleId, initialProfessionalId, initialServiceId };
}
