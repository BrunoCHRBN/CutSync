import type { Database, Json } from '@cutsync/database';
import { resolveBookingOffer } from '@cutsync/domain';

import { supabase } from '@/lib/supabase';

type BookingOptionsRow = Database['public']['Functions']['get_client_booking_options']['Returns'][number];

export interface ClientBookingService {
  id: string;
  name: string;
  price: number;
  durationMinutes: number;
}

export interface ClientBookingProfessional {
  id: string;
  name: string;
  avatarUrl: string | null;
  title: string | null;
  specialties: string | null;
}

export interface ClientProfessionalService {
  professionalId: string;
  serviceId: string;
  price: number;
  durationMinutes: number;
  isActive: boolean;
}

export interface ClientBookingOptions {
  establishmentId: string;
  establishmentSlug: string;
  establishmentName: string;
  establishmentAddress: string | null;
  timezone: string;
  currency: string;
  instantBookingEnabled: boolean;
  services: ClientBookingService[];
  professionals: ClientBookingProfessional[];
  professionalServices: ClientProfessionalService[];
}

export interface ClientAvailableSlot {
  startsAt: string;
  localTime: string;
  durationMinutes: number;
  professionalId: string;
}

export interface ClientAvailabilityResult {
  slots: ClientAvailableSlot[];
  emptyMessage: string;
}

export interface ClientBookingResult {
  appointmentId: string;
  status: 'pending' | 'confirmed';
}

const isObject = (value: Json): value is { [key: string]: Json | undefined } => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const asString = (value: Json | undefined) => typeof value === 'string' ? value : null;
const asNumber = (value: Json | undefined) => typeof value === 'number' ? value : Number(value ?? 0);

const mapServices = (value: Json): ClientBookingService[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isObject(item)) return [];
    const id = asString(item.id);
    const name = asString(item.name);
    if (!id || !name) return [];
    return [{
      id,
      name,
      price: asNumber(item.price),
      durationMinutes: asNumber(item.duration_minutes),
    }];
  });
};

const mapProfessionals = (value: Json): ClientBookingProfessional[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isObject(item)) return [];
    const id = asString(item.id);
    const name = asString(item.name);
    if (!id || !name) return [];
    return [{
      id,
      name,
      avatarUrl: asString(item.avatar_url),
      title: asString(item.titulo_profissional),
      specialties: asString(item.specialties),
    }];
  });
};

const mapProfessionalServices = (value: Json): ClientProfessionalService[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isObject(item)) return [];
    const professionalId = asString(item.professional_id);
    const serviceId = asString(item.service_id);
    if (!professionalId || !serviceId) return [];
    return [{
      professionalId,
      serviceId,
      price: asNumber(item.price),
      durationMinutes: asNumber(item.duration_minutes),
      isActive: item.is_active === true,
    }];
  });
};

const mapBookingOptions = (row: BookingOptionsRow): ClientBookingOptions => ({
  establishmentId: row.establishment_id,
  establishmentSlug: row.establishment_slug,
  establishmentName: row.establishment_name,
  establishmentAddress: row.establishment_address,
  timezone: row.establishment_timezone,
  currency: row.establishment_currency,
  instantBookingEnabled: row.instant_booking_enabled,
  services: mapServices(row.services),
  professionals: mapProfessionals(row.professionals),
  professionalServices: mapProfessionalServices(row.professional_services),
});

const requireClient = () => {
  if (!supabase) throw new Error('O aplicativo ainda não está conectado ao CutSync.');
  return supabase;
};

const errorText = (error: unknown) => {
  const value = error as { code?: string; message?: string; details?: string };
  return [value?.code, value?.message, value?.details].filter(Boolean).join(' ').toLowerCase();
};

const bookingErrorMessage = (error: unknown, fallback: string) => {
  const message = errorText(error);
  if (message.includes('pgrst202') || message.includes('client_booking')) {
    return 'O agendamento mobile ainda precisa da atualização mais recente do CutSync.';
  }
  if (message.includes('appointment_conflict')) return 'Este horário acabou de ser reservado. Escolha outro horário.';
  if (message.includes('appointment_outside_availability')) return 'Este horário não está mais disponível.';
  if (message.includes('professional_unavailable')) return 'Este profissional não está disponível nesta unidade.';
  if (message.includes('service_unavailable_for_professional')) return 'Este serviço não está disponível com o profissional selecionado.';
  if (message.includes('service_unavailable')) return 'Este serviço não está mais disponível.';
  if (message.includes('establishment_unavailable')) return 'Este estabelecimento não está disponível para reservas.';
  if (message.includes('invalid_availability_date')) return 'Escolha uma data dentro dos próximos 31 dias.';
  if (message.includes('invalid_schedule_configuration')) return 'A agenda deste estabelecimento precisa ser corrigida.';
  if (message.includes('network') || message.includes('fetch')) {
    return 'Não foi possível conectar. Verifique sua internet e tente novamente.';
  }
  return fallback;
};

const emptyReasonMessages: Record<string, string> = {
  closed: 'Não há expediente nesta data.',
  blocked: 'Os horários desta data estão bloqueados.',
  schedule_not_configured: 'A jornada ainda não foi configurada para esta data.',
  service_exceeds_workday: 'Este serviço não cabe no expediente desta data.',
};

export const resolveClientBookingOffer = (
  options: ClientBookingOptions,
  serviceId: string,
  professionalId: string,
) => resolveBookingOffer(
  options.services,
  options.professionals,
  options.professionalServices,
  serviceId,
  professionalId,
);

export const loadClientBookingOptions = async (slug: string) => {
  try {
    const { data, error } = await requireClient()
      .rpc('get_client_booking_options', { target_slug: slug })
      .maybeSingle();
    if (error) throw error;
    return data ? mapBookingOptions(data) : null;
  } catch (error) {
    throw new Error(bookingErrorMessage(error, 'Não foi possível preparar este agendamento.'));
  }
};

export const loadClientAvailableSlots = async ({
  establishmentId,
  professionalId,
  serviceId,
  localDate,
  appointmentId,
}: {
  establishmentId: string;
  professionalId: string;
  serviceId: string;
  localDate: string;
  appointmentId?: string | null;
}): Promise<ClientAvailabilityResult> => {
  try {
    const { data, error } = await requireClient().rpc('get_available_slots', {
      target_establishment_id: establishmentId,
      target_professional_id: professionalId,
      target_service_id: serviceId,
      target_local_date: localDate,
      target_appointment_id: appointmentId ?? undefined,
    });
    if (error) throw error;

    const rows = data ?? [];
    const slots = rows.flatMap((row) => (
      row.starts_at && row.local_time && row.available
        ? [{
            startsAt: row.starts_at,
            localTime: row.local_time,
            durationMinutes: Number(row.duration_minutes),
            professionalId,
          }]
        : []
    ));
    const stateReason = rows.find((row) => !row.starts_at)?.unavailable_reason;
    const allPast = rows.length > 0 && rows.every((row) => row.unavailable_reason === 'past');
    const allUnavailable = rows.length > 0 && rows.every((row) => !row.available);
    const emptyMessage = slots.length > 0
      ? ''
      : emptyReasonMessages[stateReason || '']
        || (allPast ? 'O expediente desta data já encerrou.' : '')
        || (allUnavailable ? 'A agenda está lotada nesta data.' : '')
        || 'Nenhum horário disponível nesta data.';
    return { slots, emptyMessage };
  } catch (error) {
    throw new Error(bookingErrorMessage(error, 'Não foi possível consultar os horários. Tente novamente.'));
  }
};

// Backs the "Qualquer profissional" option: each professional keeps their own
// agenda in the backend, so the app merges the eligible agendas and books the
// first professional able to serve the chosen time.
export const MERGED_AVAILABILITY_PROFESSIONAL_LIMIT = 8;

export const loadClientAvailability = async ({
  establishmentId,
  professionalIds,
  serviceId,
  localDate,
  appointmentId,
}: {
  establishmentId: string;
  professionalIds: string[];
  serviceId: string;
  localDate: string;
  appointmentId?: string | null;
}): Promise<ClientAvailabilityResult> => {
  const targets = professionalIds.slice(0, MERGED_AVAILABILITY_PROFESSIONAL_LIMIT);
  if (targets.length === 0) return { slots: [], emptyMessage: '' };
  if (targets.length === 1) {
    return loadClientAvailableSlots({
      establishmentId,
      professionalId: targets[0],
      serviceId,
      localDate,
      appointmentId,
    });
  }

  const settled = await Promise.all(targets.map(async (professionalId) => {
    try {
      return await loadClientAvailableSlots({
        establishmentId,
        professionalId,
        serviceId,
        localDate,
        appointmentId,
      });
    } catch (error) {
      return error instanceof Error ? error : new Error('Não foi possível consultar os horários.');
    }
  }));

  const results = settled.filter((entry): entry is ClientAvailabilityResult => !(entry instanceof Error));
  if (results.length === 0) throw settled[0];

  // Professionals are merged in eligibility order, so the earliest one in the
  // list wins a time that more than one of them can serve.
  const byStartsAt = new Map<string, ClientAvailableSlot>();
  for (const result of results) {
    for (const slot of result.slots) {
      if (!byStartsAt.has(slot.startsAt)) byStartsAt.set(slot.startsAt, slot);
    }
  }
  const slots = [...byStartsAt.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return {
    slots,
    emptyMessage: slots.length > 0
      ? ''
      : results.find((result) => result.emptyMessage)?.emptyMessage
        || 'Nenhum horário disponível nesta data.',
  };
};

export const createClientAppointment = async ({
  establishmentId,
  professionalId,
  serviceId,
  startsAt,
}: {
  establishmentId: string;
  professionalId: string;
  serviceId: string;
  startsAt: string;
}): Promise<ClientBookingResult> => {
  try {
    const { data, error } = await requireClient().rpc('create_client_appointment', {
      target_establishment_id: establishmentId,
      target_professional_id: professionalId,
      target_service_id: serviceId,
      target_date_time: startsAt,
    }).single();
    if (error) throw error;
    return {
      appointmentId: data.appointment_id,
      status: data.appointment_status === 'confirmed' ? 'confirmed' : 'pending',
    };
  } catch (error) {
    throw new Error(bookingErrorMessage(error, 'Não foi possível concluir o agendamento. Tente novamente.'));
  }
};
