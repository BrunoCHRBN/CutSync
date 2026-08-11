import type { BusinessAgendaStatus, BusinessOperationalRole } from '@cutsync/database';

export type ReassignmentResponsibility =
  | 'professional'
  | 'reception'
  | 'manager'
  | 'admin'
  | 'owner';

export type AppointmentReassignmentAvailability =
  | { available: true; dueAt: string; message: null }
  | { available: false; dueAt: null; message: string };

const MINUTE_MS = 60_000;

export const resolveReassignmentResponsibility = (
  role: BusinessOperationalRole,
): ReassignmentResponsibility | null => {
  if (
    role === 'professional'
    || role === 'reception'
    || role === 'manager'
    || role === 'admin'
    || role === 'owner'
  ) return role;
  return null;
};

export const getReassignmentDeadline = (
  startsAt: string,
  nowMs = Date.now(),
): string | null => {
  const startsAtMs = Date.parse(startsAt);
  if (!Number.isFinite(startsAtMs) || startsAtMs - nowMs <= 2 * MINUTE_MS) return null;

  const preferredDeadline = startsAtMs - 60 * MINUTE_MS;
  const earliestDeadline = nowMs + 5 * MINUTE_MS;
  const latestDeadline = startsAtMs - MINUTE_MS;
  return new Date(Math.min(latestDeadline, Math.max(earliestDeadline, preferredDeadline))).toISOString();
};

export const canRequestAppointmentReassignment = (input: {
  status: BusinessAgendaStatus;
  startsAt: string;
  accessMode: 'full' | 'read_only' | 'blocked';
  hasCapability: boolean;
  responsibility: ReassignmentResponsibility | null;
  nowMs?: number;
}) => getAppointmentReassignmentAvailability(input).available;

export const getAppointmentReassignmentAvailability = (input: {
  status: BusinessAgendaStatus;
  startsAt: string;
  accessMode: 'full' | 'read_only' | 'blocked';
  hasCapability: boolean;
  responsibility: ReassignmentResponsibility | null;
  nowMs?: number;
}): AppointmentReassignmentAvailability => {
  if (input.responsibility === null) {
    return {
      available: false,
      dueAt: null,
      message: 'Seu papel operacional não pode iniciar uma reatribuição.',
    };
  }
  if (input.accessMode !== 'full') {
    return {
      available: false,
      dueAt: null,
      message: 'A reatribuição exige acesso operacional completo nesta unidade.',
    };
  }
  if (!input.hasCapability) {
    return {
      available: false,
      dueAt: null,
      message: 'Seu acesso atual não inclui solicitar reatribuição.',
    };
  }
  if (input.status !== 'pending' && input.status !== 'confirmed') {
    return {
      available: false,
      dueAt: null,
      message: 'Somente agendamentos pendentes ou confirmados podem ser reatribuídos.',
    };
  }

  const dueAt = getReassignmentDeadline(input.startsAt, input.nowMs);
  if (!dueAt) {
    return {
      available: false,
      dueAt: null,
      message: 'O atendimento já começou ou está próximo demais para iniciar a reatribuição pelo aplicativo.',
    };
  }

  return { available: true, dueAt, message: null };
};
