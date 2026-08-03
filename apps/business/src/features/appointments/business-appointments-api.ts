import {
  mapBusinessAppointmentDetail,
  type BusinessAgendaStatus,
  type BusinessAppointmentDetail,
} from '@cutsync/database';
import { normalizeOpaqueAppointmentId } from '@cutsync/domain';

import {
  assertIsoTimestamp,
  assertUuid,
  BusinessFeatureError,
  callBusinessRpc,
  isRpcRecord,
} from '@/features/connectivity/business-rpc';

export type BusinessAppointmentCommand =
  | 'confirm'
  | 'complete'
  | 'cancel'
  | 'no_show';

export interface AppointmentCommandResult {
  appointmentId: string;
  status: BusinessAgendaStatus;
  startsAt?: string;
  endsAt?: string;
}

export interface RescheduleBusinessAppointmentInput {
  establishmentId: string;
  appointmentId: string;
  startsAt: string;
  professionalId: string;
  serviceId: string;
  requestId: string;
}

export interface CreateBusinessAppointmentInput {
  establishmentId: string;
  professionalId: string;
  serviceId: string;
  startsAt: string;
  requestId: string;
  establishmentClientId?: string | null;
  clientName?: string | null;
  clientPhone?: string | null;
  clientEmail?: string | null;
  notes?: string | null;
}

export interface BusinessAvailableSlot {
  startsAt: string;
  localTime: string;
  durationMinutes: number;
}

const status = (value: unknown): BusinessAgendaStatus | null => (
  value === 'pending'
  || value === 'confirmed'
  || value === 'cancelled'
  || value === 'completed'
  || value === 'no_show'
    ? value
    : null
);

const oneObject = (value: unknown) => {
  if (isRpcRecord(value)) return value;
  if (Array.isArray(value) && value.length === 1 && isRpcRecord(value[0])) return value[0];
  return null;
};

const commandResult = (value: unknown): AppointmentCommandResult => {
  const row = oneObject(value);
  const appointmentId = row && typeof (row.appointmentId ?? row.appointment_id) === 'string'
    ? String(row.appointmentId ?? row.appointment_id)
    : null;
  const appointmentStatus = row ? status(row.status ?? row.appointmentStatus) : null;
  if (!appointmentId || !appointmentStatus) throw new BusinessFeatureError('invalid_response');
  const startsAt = typeof row?.startsAt === 'string' ? row.startsAt : undefined;
  const endsAt = typeof row?.endsAt === 'string' ? row.endsAt : undefined;
  return { appointmentId, status: appointmentStatus, startsAt, endsAt };
};

const cleanOptional = (value?: string | null) => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

const assertAppointmentId = (value: unknown) => {
  const appointmentId = normalizeOpaqueAppointmentId(value);
  if (!appointmentId) throw new BusinessFeatureError('invalid_request');
  return appointmentId;
};

export const businessAppointmentsApi = {
  async getAvailableSlots(input: {
    establishmentId: string;
    professionalId: string;
    serviceId: string;
    localDate: string;
  }): Promise<{ slots: BusinessAvailableSlot[]; unavailableReason: string | null }> {
    const data = await callBusinessRpc('get_available_slots', {
      target_establishment_id: assertUuid(input.establishmentId),
      target_professional_id: assertUuid(input.professionalId),
      target_service_id: input.serviceId.trim(),
      target_local_date: input.localDate,
    });
    if (!Array.isArray(data)) throw new BusinessFeatureError('invalid_response');
    let unavailableReason: string | null = null;
    const slots = data.flatMap((row) => {
      if (!isRpcRecord(row)) throw new BusinessFeatureError('invalid_response');
      if (!row.available) {
        if (typeof row.unavailable_reason === 'string') unavailableReason ??= row.unavailable_reason;
        return [];
      }
      const startsAt = row.starts_at;
      const localTime = row.local_time;
      const durationMinutes = Number(row.duration_minutes);
      if (
        typeof startsAt !== 'string'
        || typeof localTime !== 'string'
        || !Number.isFinite(Date.parse(startsAt))
        || !Number.isInteger(durationMinutes)
      ) throw new BusinessFeatureError('invalid_response');
      return [{ startsAt, localTime, durationMinutes }];
    });
    return { slots, unavailableReason };
  },

  async getDetail(
    establishmentId: string,
    appointmentId: string,
  ): Promise<BusinessAppointmentDetail> {
    const normalizedAppointmentId = assertAppointmentId(appointmentId);
    const data = await callBusinessRpc('get_business_appointment_detail', {
      target_establishment_id: assertUuid(establishmentId),
      target_appointment_id: normalizedAppointmentId,
    });
    const detail = mapBusinessAppointmentDetail(oneObject(data));
    if (
      !detail
      || detail.establishmentId !== establishmentId
      || detail.id !== normalizedAppointmentId
    ) {
      throw new BusinessFeatureError('invalid_response');
    }
    return detail;
  },

  async runCommand(input: {
    establishmentId: string;
    appointmentId: string;
    requestId: string;
    command: BusinessAppointmentCommand;
    reason?: string | null;
  }) {
    assertUuid(input.establishmentId);
    assertUuid(input.requestId);
    const appointmentId = assertAppointmentId(input.appointmentId);
    const name = {
      confirm: 'confirm_business_appointment',
      complete: 'complete_business_appointment',
      cancel: 'cancel_business_appointment',
      no_show: 'mark_business_appointment_no_show',
    } as const;
    const data = await callBusinessRpc(name[input.command], {
      target_establishment_id: input.establishmentId,
      target_appointment_id: appointmentId,
      target_request_id: input.requestId,
      ...(input.command === 'cancel' ? { target_reason: cleanOptional(input.reason) } : {}),
    });
    return commandResult(data);
  },

  async reschedule(input: RescheduleBusinessAppointmentInput) {
    const appointmentId = assertAppointmentId(input.appointmentId);
    const data = await callBusinessRpc('reschedule_business_appointment', {
      target_establishment_id: assertUuid(input.establishmentId),
      target_appointment_id: appointmentId,
      target_date_time: assertIsoTimestamp(input.startsAt),
      target_professional_id: assertUuid(input.professionalId),
      target_service_id: input.serviceId.trim(),
      target_request_id: assertUuid(input.requestId),
    });
    return commandResult(data);
  },

  async create(input: CreateBusinessAppointmentInput) {
    if (!input.establishmentClientId && !cleanOptional(input.clientName)) {
      throw new BusinessFeatureError('invalid_request');
    }
    const data = await callBusinessRpc('create_business_appointment', {
      target_establishment_id: assertUuid(input.establishmentId),
      target_professional_id: assertUuid(input.professionalId),
      target_service_id: input.serviceId.trim(),
      target_date_time: assertIsoTimestamp(input.startsAt),
      target_request_id: assertUuid(input.requestId),
      target_establishment_client_id: input.establishmentClientId
        ? assertUuid(input.establishmentClientId)
        : null,
      target_client_name: cleanOptional(input.clientName),
      target_client_phone: cleanOptional(input.clientPhone),
      target_client_email: cleanOptional(input.clientEmail)?.toLowerCase() ?? null,
      target_notes: cleanOptional(input.notes),
    });
    return commandResult(data);
  },
};
