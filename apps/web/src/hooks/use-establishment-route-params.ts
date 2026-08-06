import { useLocalSearchParams } from 'expo-router';

export interface EstablishmentRouteParams {
  by: 'id' | 'slug';
  identifier?: string;
  slug?: string;
  /** Canonical query param for Client authenticated detail/booking. */
  establishmentId?: string;
  /**
   * @deprecated Prefer `establishmentId`. Kept as a temporary alias for deep links
   * and in-flight navigation that still use `barbershopId`.
   */
  barbershopId?: string;
  rescheduleId?: string;
  initialProfessionalId?: string;
  initialProfessionalSlug?: string;
  initialServiceId?: string;
}

const first = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);

export function useEstablishmentRouteParams(): EstablishmentRouteParams {
  const params = useLocalSearchParams<{
    establishmentId?: string | string[];
    barbershopId?: string | string[];
    slug?: string | string[];
    reschedule_id?: string | string[];
    professionalId?: string | string[];
    professional_id?: string | string[];
    professionalSlug?: string | string[];
    professional_slug?: string | string[];
    serviceId?: string | string[];
  }>();

  const slug = first(params.slug);
  const establishmentId = first(params.establishmentId) || first(params.barbershopId);
  const barbershopId = first(params.barbershopId);
  const rescheduleId = first(params.reschedule_id);
  const initialProfessionalId = first(params.professionalId) || first(params.professional_id);
  const initialProfessionalSlug = first(params.professionalSlug) || first(params.professional_slug);
  const initialServiceId = first(params.serviceId);

  if (slug) {
    return {
      by: 'slug',
      identifier: slug,
      slug,
      establishmentId,
      barbershopId,
      rescheduleId,
      initialProfessionalId,
      initialProfessionalSlug,
      initialServiceId,
    };
  }

  return {
    by: 'id',
    identifier: establishmentId,
    slug,
    establishmentId,
    barbershopId,
    rescheduleId,
    initialProfessionalId,
    initialProfessionalSlug,
    initialServiceId,
  };
}
