import type { Database } from '@cutsync/database';
import type { ClientAppointmentBlockReason, ClientAppointmentStatus } from '@cutsync/domain';

import { supabase } from '@/lib/supabase';

type ClientAppointmentRow = Database['public']['Functions']['get_client_appointments']['Returns'][number];

export interface ClientAppointment {
  id: string;
  status: ClientAppointmentStatus;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  rescheduleCount: number;
  originalStartsAt: string | null;
  cancellationReason: string | null;
  cancelledByRole: string | null;
  establishment: {
    id: string;
    name: string;
    slug: string;
    address: string | null;
    phone: string | null;
    timezone: string;
    currency: string;
    minCancellationHours: number;
    instantBookingEnabled: boolean;
  };
  service: { id: string; name: string };
  professional: { id: string; name: string; avatarUrl: string | null };
  cancellationDeadline: string;
  canCancel: boolean;
  canReschedule: boolean;
  cancelBlockReason: ClientAppointmentBlockReason | null;
  rescheduleBlockReason: ClientAppointmentBlockReason | null;
}

const asStatus = (status: string): ClientAppointmentStatus => {
  if (status === 'confirmed' || status === 'cancelled' || status === 'completed') return status;
  return 'pending';
};

const asBlockReason = (reason: string | null): ClientAppointmentBlockReason | null => {
  if (
    reason === 'appointment_status_immutable'
    || reason === 'appointment_already_started'
    || reason === 'cancellation_window_closed'
    || reason === 'reschedule_limit_reached'
    || reason === 'establishment_unavailable'
  ) return reason;
  return null;
};

const mapClientAppointment = (row: ClientAppointmentRow): ClientAppointment => ({
  id: row.appointment_id,
  status: asStatus(row.appointment_status),
  startsAt: row.starts_at,
  endsAt: row.ends_at,
  durationMinutes: Number(row.duration_minutes),
  rescheduleCount: Number(row.reschedule_count),
  originalStartsAt: row.original_starts_at,
  cancellationReason: row.cancellation_reason,
  cancelledByRole: row.cancelled_by_role,
  establishment: {
    id: row.establishment_id,
    name: row.establishment_name,
    slug: row.establishment_slug,
    address: row.establishment_address,
    phone: row.establishment_phone,
    timezone: row.establishment_timezone,
    currency: row.establishment_currency,
    minCancellationHours: Number(row.min_cancellation_hours),
    instantBookingEnabled: row.instant_booking_enabled,
  },
  service: { id: row.service_id, name: row.service_name },
  professional: {
    id: row.professional_id,
    name: row.professional_name,
    avatarUrl: row.professional_avatar_url,
  },
  cancellationDeadline: row.cancellation_deadline,
  canCancel: row.can_cancel,
  canReschedule: row.can_reschedule,
  cancelBlockReason: asBlockReason(row.cancel_block_reason),
  rescheduleBlockReason: asBlockReason(row.reschedule_block_reason),
});

const requireClient = () => {
  if (!supabase) throw new Error('O aplicativo ainda não está conectado ao CutSync.');
  return supabase;
};

const appointmentLoadMessage = (error: unknown) => {
  const value = error as { code?: string; message?: string; details?: string };
  const text = [value?.code, value?.message, value?.details].filter(Boolean).join(' ').toLowerCase();
  if (text.includes('pgrst202') || text.includes('get_client_appointment')) {
    return 'A agenda do Client ainda precisa da atualização mais recente do CutSync.';
  }
  if (text.includes('network') || text.includes('fetch')) {
    return 'Não foi possível conectar. Verifique sua internet e tente novamente.';
  }
  return 'Não foi possível carregar seus agendamentos.';
};

export const listClientAppointments = async () => {
  try {
    const { data, error } = await requireClient().rpc('get_client_appointments');
    if (error) throw error;
    return (data ?? []).map(mapClientAppointment);
  } catch (error) {
    throw new Error(appointmentLoadMessage(error));
  }
};

export const loadClientAppointment = async (appointmentId: string) => {
  try {
    const { data, error } = await requireClient()
      .rpc('get_client_appointment', { target_appointment_id: appointmentId })
      .maybeSingle();
    if (error) throw error;
    return data ? mapClientAppointment(data) : null;
  } catch (error) {
    throw new Error(appointmentLoadMessage(error));
  }
};
