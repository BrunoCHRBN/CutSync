import { supabase } from './supabase';
import { parseSchedule, ScheduleDay } from '../utils/schedule';

export interface AvailabilityRpcRow {
  starts_at: string | null;
  local_time: string | null;
  duration_minutes: number;
  available: boolean;
  unavailable_reason: string | null;
}

interface LegacyAvailabilityParams {
  establishmentId: string;
  professionalId: string;
  serviceId: string;
  localDate: string;
  appointmentId?: string | null;
}

const MISSING_AVAILABILITY_RPC_CODE = 'PGRST202';

export const isAvailabilityRpcMissing = (error: { code?: string; message?: string } | null) => (
  error?.code === MISSING_AVAILABILITY_RPC_CODE
  && Boolean(error.message?.includes('get_available_slots'))
);

const parseConfiguredSchedule = (value?: string | null) => {
  if (!value?.trim()) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    throw new Error('invalid_schedule_configuration');
  }
  if (!Array.isArray(raw)) throw new Error('invalid_schedule_configuration');
  const parsed = parseSchedule(value);
  if (parsed.length !== raw.length) throw new Error('invalid_schedule_configuration');
  return parsed;
};

const minutesFromTime = (value: string) => {
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error('invalid_schedule_configuration');
  }
  return (hours * 60) + minutes;
};

const timeFromMinutes = (value: number) => (
  `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
);

const daySchedule = (schedule: ScheduleDay[], day: number) => {
  if (schedule.length === 0) return null;
  const configured = schedule.find((item) => item.day === day);
  if (!configured?.isOpen) return undefined;
  return {
    open: minutesFromTime(configured.open),
    close: minutesFromTime(configured.close),
  };
};

const datePartsInTimeZone = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
};

const zonedDateTimeToDate = (localDate: string, localTime: string, timeZone: string) => {
  const [year, month, day] = localDate.split('-').map(Number);
  const [hour, minute] = localTime.split(':').map(Number);
  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let candidate = new Date(desiredUtc);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const represented = datePartsInTimeZone(candidate, timeZone);
    const representedUtc = Date.UTC(
      represented.year,
      represented.month - 1,
      represented.day,
      represented.hour,
      represented.minute,
      represented.second,
    );
    candidate = new Date(candidate.getTime() + (desiredUtc - representedUtc));
  }

  return candidate;
};

const addLocalDays = (localDate: string, days: number) => {
  const [year, month, day] = localDate.split('-').map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return `${result.getUTCFullYear()}-${String(result.getUTCMonth() + 1).padStart(2, '0')}-${String(result.getUTCDate()).padStart(2, '0')}`;
};

const stateRow = (durationMinutes: number, reason: string): AvailabilityRpcRow[] => [{
  starts_at: null,
  local_time: null,
  duration_minutes: durationMinutes,
  available: false,
  unavailable_reason: reason,
}];

export const fetchLegacyAvailableSlots = async ({
  establishmentId,
  professionalId,
  serviceId,
  localDate,
  appointmentId,
}: LegacyAvailabilityParams): Promise<AvailabilityRpcRow[]> => {
  const [establishmentResult, serviceResult, teamResult, professionalServiceResult] = await Promise.all([
    supabase.from('establishments').select('opening_hours, timezone').eq('id', establishmentId).single(),
    supabase.from('services').select('duration_minutes, is_active, deleted_at').eq('id', serviceId).eq('establishment_id', establishmentId).single(),
    supabase.rpc('get_public_team', { target_establishment_id: establishmentId }),
    supabase.from('professional_services')
      .select('duration_minutes, is_active')
      .eq('establishment_id', establishmentId)
      .eq('professional_id', professionalId)
      .eq('service_id', serviceId)
      .maybeSingle(),
  ]);

  if (establishmentResult.error || !establishmentResult.data) throw establishmentResult.error || new Error('establishment_not_found');
  if (serviceResult.error || !serviceResult.data || !serviceResult.data.is_active || serviceResult.data.deleted_at) {
    throw serviceResult.error || new Error('service_unavailable');
  }
  if (teamResult.error) throw teamResult.error;
  const professional = (teamResult.data || []).find((item) => item.id === professionalId);
  if (!professional) throw new Error('professional_unavailable');
  if (professionalServiceResult.error) throw professionalServiceResult.error;
  if (professionalServiceResult.data?.is_active === false) throw new Error('service_unavailable_for_professional');

  const durationMinutes = Number(
    professionalServiceResult.data?.duration_minutes
    ?? serviceResult.data.duration_minutes,
  );
  const establishmentSchedule = parseConfiguredSchedule(establishmentResult.data.opening_hours);
  const professionalSchedule = parseConfiguredSchedule(professional.work_hours);
  if (establishmentSchedule.length === 0 && professionalSchedule.length === 0) {
    return stateRow(durationMinutes, 'schedule_not_configured');
  }

  const targetDay = new Date(`${localDate}T12:00:00Z`).getUTCDay();
  const establishmentDay = daySchedule(establishmentSchedule, targetDay);
  const professionalDay = daySchedule(professionalSchedule, targetDay);
  if (establishmentDay === undefined || professionalDay === undefined) return stateRow(durationMinutes, 'closed');

  const effectiveOpen = Math.max(establishmentDay?.open ?? 0, professionalDay?.open ?? 0);
  const effectiveClose = Math.min(establishmentDay?.close ?? (24 * 60), professionalDay?.close ?? (24 * 60));
  if (effectiveOpen >= effectiveClose) return stateRow(durationMinutes, 'closed');
  const latestStart = effectiveClose - durationMinutes;
  if (latestStart < effectiveOpen) return stateRow(durationMinutes, 'service_exceeds_workday');

  const timeZone = establishmentResult.data.timezone || 'America/Sao_Paulo';
  const rangeStart = zonedDateTimeToDate(localDate, '00:00', timeZone);
  const rangeEnd = zonedDateTimeToDate(addLocalDays(localDate, 1), '00:00', timeZone);
  const [busyResult, ignoredAppointmentResult] = await Promise.all([
    supabase.rpc('get_public_busy_slots', {
      target_professional_id: professionalId,
      range_start: rangeStart.toISOString(),
      range_end: rangeEnd.toISOString(),
    }),
    appointmentId
      ? supabase.from('appointments').select('date_time, duration_minutes').eq('id', appointmentId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (busyResult.error) throw busyResult.error;
  if (ignoredAppointmentResult.error) throw ignoredAppointmentResult.error;

  const ignoredStart = ignoredAppointmentResult.data?.date_time
    ? new Date(ignoredAppointmentResult.data.date_time).getTime()
    : null;
  const busySegments = (busyResult.data || [])
    .map((item) => ({
      start: new Date(item.date_time).getTime(),
      end: new Date(item.date_time).getTime() + (Number(item.duration_minutes) * 60_000),
    }))
    .filter((segment) => segment.start !== ignoredStart);

  const slots: AvailabilityRpcRow[] = [];
  for (let startMinutes = effectiveOpen; startMinutes <= latestStart; startMinutes += 30) {
    const localTime = timeFromMinutes(startMinutes);
    const startsAt = zonedDateTimeToDate(localDate, localTime, timeZone);
    const start = startsAt.getTime();
    const end = start + (durationMinutes * 60_000);
    const isPast = start <= Date.now();
    const isBusy = busySegments.some((segment) => start < segment.end && end > segment.start);
    slots.push({
      starts_at: startsAt.toISOString(),
      local_time: localTime,
      duration_minutes: durationMinutes,
      available: !isPast && !isBusy,
      unavailable_reason: isPast ? 'past' : isBusy ? 'busy' : null,
    });
  }
  return slots;
};
