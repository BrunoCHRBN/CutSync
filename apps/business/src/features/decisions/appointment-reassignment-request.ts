import type { BusinessAgendaStatus, BusinessOperationalRole } from '@cutsync/database';

export type ReassignmentResponsibility =
  | 'professional'
  | 'reception'
  | 'manager'
  | 'admin'
  | 'owner';

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
}) => (
  input.accessMode === 'full'
  && input.hasCapability
  && input.responsibility !== null
  && (input.status === 'pending' || input.status === 'confirmed')
  && getReassignmentDeadline(input.startsAt, input.nowMs) !== null
);
