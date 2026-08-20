import type { MobileSyncStatus } from './appointment-reassignment';

const OUTBOX_VERSION = 1;
const MAX_ENTRIES = 20;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type BusinessDecisionOutboxAction = 'validate' | 'propose' | 'apply' | 'withdraw';
export type BusinessDecisionPersistedSyncStatus = Extract<
  MobileSyncStatus,
  'syncing' | 'offline_pending' | 'manual_review'
>;

export interface BusinessDecisionOutboxEntry {
  version: 1;
  userId: string;
  establishmentId: string;
  reassignmentRequestId: string;
  action: BusinessDecisionOutboxAction;
  professionalId: string | null;
  reason: string | null;
  expectedVersion: number;
  requestId: string;
  correlationId: string;
  status: BusinessDecisionPersistedSyncStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
}

export const businessDecisionOutboxKey = (userId: string) => (
  `cutsync.business.decision-outbox.v1.${userId}`
);

const isIsoTimestamp = (value: unknown): value is string => (
  typeof value === 'string' && Number.isFinite(Date.parse(value))
);

const hasValidActionPayload = (entry: Partial<BusinessDecisionOutboxEntry>) => {
  if (entry.action === 'propose') {
    return UUID_PATTERN.test(entry.professionalId ?? '') && entry.reason === null;
  }
  if (entry.action === 'withdraw') {
    return entry.professionalId === null
      && typeof entry.reason === 'string'
      && entry.reason.trim().length >= 3
      && entry.reason.length <= 500;
  }
  return (entry.action === 'validate' || entry.action === 'apply')
    && entry.professionalId === null
    && entry.reason === null;
};

const isEntry = (
  value: unknown,
  userId: string,
  now: number,
): value is BusinessDecisionOutboxEntry => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Partial<BusinessDecisionOutboxEntry>;
  const statuses: BusinessDecisionPersistedSyncStatus[] = [
    'syncing', 'offline_pending', 'manual_review',
  ];
  return entry.version === OUTBOX_VERSION
    && entry.userId === userId
    && UUID_PATTERN.test(entry.establishmentId ?? '')
    && UUID_PATTERN.test(entry.reassignmentRequestId ?? '')
    && hasValidActionPayload(entry)
    && Number.isInteger(entry.expectedVersion) && Number(entry.expectedVersion) > 0
    && UUID_PATTERN.test(entry.requestId ?? '')
    && UUID_PATTERN.test(entry.correlationId ?? '')
    && statuses.some((status) => status === entry.status)
    && Number.isInteger(entry.attempts) && Number(entry.attempts) >= 0
    && isIsoTimestamp(entry.createdAt)
    && isIsoTimestamp(entry.updatedAt)
    && now - Date.parse(entry.createdAt) <= MAX_AGE_MS
    && (entry.lastError === null || typeof entry.lastError === 'string');
};

export const decodeBusinessDecisionOutbox = (
  raw: string,
  userId: string,
  now = Date.now(),
): BusinessDecisionOutboxEntry[] | null => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((entry): entry is BusinessDecisionOutboxEntry => (
      isEntry(entry, userId, now)
    )).slice(-MAX_ENTRIES);
  } catch {
    return null;
  }
};

export const encodeBusinessDecisionOutbox = (
  entries: BusinessDecisionOutboxEntry[],
) => JSON.stringify(entries.slice(-MAX_ENTRIES));
