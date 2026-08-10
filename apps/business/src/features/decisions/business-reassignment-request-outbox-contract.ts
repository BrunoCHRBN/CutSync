import type { MobileSyncStatus } from '@cutsync/database';

import type { ReassignmentResponsibility } from './appointment-reassignment-request';

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const REASON_CODES = ['professional_absence', 'operational_change'] as const;
const RESPONSIBILITIES: ReassignmentResponsibility[] = [
  'professional', 'reception', 'manager', 'admin', 'owner',
];
export type BusinessReassignmentRequestPersistedStatus = Extract<
  MobileSyncStatus,
  'syncing' | 'offline_pending' | 'manual_review'
>;

export interface BusinessReassignmentRequestOutboxEntry {
  version: 1;
  userId: string;
  establishmentId: string;
  appointmentId: string;
  reasonCode: typeof REASON_CODES[number];
  responsibility: ReassignmentResponsibility;
  dueAt: string;
  expectedAppointmentUpdatedAt: string;
  requestId: string;
  correlationId: string;
  status: BusinessReassignmentRequestPersistedStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
}

export const businessReassignmentRequestOutboxKey = (userId: string) => (
  `cutsync.business.reassignment-request-outbox.v1.${userId}`
);

const isTimestamp = (value: unknown): value is string => (
  typeof value === 'string' && Number.isFinite(Date.parse(value))
);

const isEntry = (
  value: unknown,
  userId: string,
  now: number,
): value is BusinessReassignmentRequestOutboxEntry => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Partial<BusinessReassignmentRequestOutboxEntry>;
  return entry.version === 1
    && entry.userId === userId
    && UUID_PATTERN.test(entry.establishmentId ?? '')
    && typeof entry.appointmentId === 'string'
    && entry.appointmentId.trim().length > 0
    && entry.appointmentId.length <= 160
    && REASON_CODES.some((reasonCode) => reasonCode === entry.reasonCode)
    && RESPONSIBILITIES.some((responsibility) => responsibility === entry.responsibility)
    && isTimestamp(entry.dueAt)
    && isTimestamp(entry.expectedAppointmentUpdatedAt)
    && UUID_PATTERN.test(entry.requestId ?? '')
    && UUID_PATTERN.test(entry.correlationId ?? '')
    && ['syncing', 'offline_pending', 'manual_review'].includes(entry.status ?? '')
    && Number.isInteger(entry.attempts)
    && Number(entry.attempts) >= 0
    && isTimestamp(entry.createdAt)
    && isTimestamp(entry.updatedAt)
    && now - Date.parse(entry.createdAt) <= MAX_AGE_MS
    && (entry.lastError === null || typeof entry.lastError === 'string');
};

export const decodeBusinessReassignmentRequestOutbox = (
  raw: string,
  userId: string,
  now = Date.now(),
): BusinessReassignmentRequestOutboxEntry[] | null => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((entry): entry is BusinessReassignmentRequestOutboxEntry => (
      isEntry(entry, userId, now)
    )).slice(-20);
  } catch {
    return null;
  }
};

export const encodeBusinessReassignmentRequestOutbox = (
  entries: BusinessReassignmentRequestOutboxEntry[],
) => JSON.stringify(entries.slice(-20));
